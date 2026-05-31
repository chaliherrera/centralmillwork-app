-- Migración 030: Módulo de Muestras (samples)
--
-- Sistema de gestión del ciclo de vida de muestras para clientes.
-- Spec acordado 2026-05-30 (ver memory: project_muestras_spec_2026_05_30.md).
--
-- Decisiones de diseño:
--   - Volumen real: 1-10 muestras/mes → modelo simple, sin over-engineering
--   - Facturación: siempre cortesía → cero tracking de costos/billing
--   - Aprobación: envío físico al cliente → estado ENVIADA explícito
--   - Materiales: reusar Compras Directas existentes vía nueva columna
--     ordenes_compra.muestra_id (sin sistema nuevo de materiales)
--   - Producción: reusar módulo Producción existente vía nueva columna
--     ordenes_produccion.tipo ('PRODUCCION' | 'MUESTRA')
--   - Crea: nuevo rol ENGINEERING para que ingeniería tenga acceso

-- ─── Nuevo rol ENGINEERING ──────────────────────────────────────────────────
-- Ingeniería es el creador natural de muestras. Lectura sobre proyectos y
-- materiales (igual que SHOP_MANAGER). No toca OCs ni Producción directamente.
-- Idempotente: ADD VALUE IF NOT EXISTS no existe en PG <12, usamos el truco
-- de catalog + condicional.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'ENGINEERING'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_rol')
  ) THEN
    ALTER TYPE user_rol ADD VALUE 'ENGINEERING';
  END IF;
END $$;

-- ─── ENUMs específicos del módulo de muestras ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'muestra_estado') THEN
    CREATE TYPE muestra_estado AS ENUM (
      'SOLICITADA',      -- Engineering creó, esperando materiales / aprobación
      'EN_FABRICACION',  -- OP creada, en producción
      'EN_QC',           -- OP completa, SHOP_MANAGER inspecciona
      'ENVIADA',         -- ADMIN registró envío físico al cliente
      'APROBADA',        -- Cliente confirmó OK
      'RECHAZADA',       -- Cliente pidió cambios (crea V2)
      'ARCHIVADA'        -- Cerrada, en histórico
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'muestra_tipo') THEN
    CREATE TYPE muestra_tipo AS ENUM (
      'PUERTA', 'ACABADO', 'HARDWARE', 'CABINET', 'OTRO'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'muestra_prioridad') THEN
    CREATE TYPE muestra_prioridad AS ENUM ('ALTA', 'MEDIA', 'BAJA');
  END IF;
END $$;

-- ─── Tabla principal: muestras ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS muestras (
  id                       SERIAL PRIMARY KEY,
  codigo                   VARCHAR(30) UNIQUE NOT NULL,       -- ej: SMP-2026-001
  proyecto_id              INTEGER NOT NULL REFERENCES proyectos(id),
  descripcion              TEXT NOT NULL,
  tipo                     muestra_tipo NOT NULL DEFAULT 'OTRO',
  prioridad                muestra_prioridad NOT NULL DEFAULT 'MEDIA',
  owner_id                 UUID REFERENCES usuarios(id),       -- responsable único accountable
  estado                   muestra_estado NOT NULL DEFAULT 'SOLICITADA',
  version_actual           INTEGER NOT NULL DEFAULT 1,
  fecha_solicitud          DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_compromiso         DATE,                              -- deadline para el cliente
  fecha_aprobacion_cliente DATE,                              -- nullable hasta que cliente apruebe
  notas                    TEXT,
  created_by               UUID REFERENCES usuarios(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_muestras_proyecto ON muestras(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_muestras_estado   ON muestras(estado) WHERE estado != 'ARCHIVADA';
CREATE INDEX IF NOT EXISTS idx_muestras_owner    ON muestras(owner_id);

-- ─── Versiones de la muestra (V1, V2, V3...) ────────────────────────────────
-- Cada vez que el cliente rechaza, se crea una nueva versión que vuelve a
-- producción. Esto deja el histórico completo: especificaciones de cada
-- versión, OP que la produjo, razón del rechazo.
CREATE TABLE IF NOT EXISTS muestras_versiones (
  id                  SERIAL PRIMARY KEY,
  muestra_id          INTEGER NOT NULL REFERENCES muestras(id) ON DELETE CASCADE,
  version_numero      INTEGER NOT NULL,                       -- 1, 2, 3, ...
  especificaciones    TEXT,                                   -- texto libre con detalles técnicos
  razon_de_revision   TEXT,                                   -- qué pidió cambiar el cliente (NULL en V1)
  comentarios_cliente TEXT,                                   -- feedback del cliente sobre esta versión
  op_id               INTEGER REFERENCES ordenes_produccion(id),  -- OP que produjo esta versión (NULL hasta EN_FABRICACION)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(muestra_id, version_numero)
);

CREATE INDEX IF NOT EXISTS idx_muestras_versiones_muestra ON muestras_versiones(muestra_id);

-- ─── Timeline de eventos ────────────────────────────────────────────────────
-- Auditoría completa de cada acción sobre la muestra. Análogo al
-- orden_historial pero con tipos específicos de muestras.
CREATE TABLE IF NOT EXISTS muestras_eventos (
  id              SERIAL PRIMARY KEY,
  muestra_id      INTEGER NOT NULL REFERENCES muestras(id) ON DELETE CASCADE,
  version_numero  INTEGER NOT NULL DEFAULT 1,                 -- a qué versión refiere el evento
  tipo            VARCHAR(40) NOT NULL,                       -- 'creada' | 'en_fabricacion' | 'qc_pass' | 'qc_fail' | 'enviada' | 'aprobada' | 'rechazada' | 'comentario' | 'archivada'
  detalle         TEXT,
  usuario_id      UUID REFERENCES usuarios(id),
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_muestras_eventos_muestra ON muestras_eventos(muestra_id, timestamp DESC);

-- ─── Envíos al cliente ──────────────────────────────────────────────────────
-- Tracking del envío físico de cada versión enviada. Si una muestra se rechaza
-- y se manda V2, va a tener 2 rows en envios (una por versión).
CREATE TABLE IF NOT EXISTS muestras_envios (
  id                         SERIAL PRIMARY KEY,
  muestra_id                 INTEGER NOT NULL REFERENCES muestras(id) ON DELETE CASCADE,
  version_numero             INTEGER NOT NULL,
  fecha_envio                DATE NOT NULL DEFAULT CURRENT_DATE,
  destinatario               TEXT NOT NULL,                   -- nombre del receptor
  direccion                  TEXT,
  tracking_carrier           VARCHAR(50),                     -- FedEx, UPS, DHL, Manual, etc.
  tracking_number            VARCHAR(100),
  fecha_recepcion_confirmada DATE,                            -- nullable hasta que el cliente confirme recepción
  notas                      TEXT,
  created_by                 UUID REFERENCES usuarios(id),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_muestras_envios_muestra ON muestras_envios(muestra_id);

-- ─── Archivos adjuntos (fotos, PDFs) ────────────────────────────────────────
-- Reusamos el patrón de orden_documentos: guardamos filename, mime_type,
-- size_bytes y url. Los archivos vivirán en Supabase Storage (bucket
-- 'oc-imagenes' o uno dedicado 'muestras-archivos').
-- NOTA: el upload de archivos NO entra en el MVP de hoy. La tabla se crea
-- para que en la próxima sesión se conecte el endpoint.
CREATE TABLE IF NOT EXISTS muestras_archivos (
  id             SERIAL PRIMARY KEY,
  muestra_id     INTEGER NOT NULL REFERENCES muestras(id) ON DELETE CASCADE,
  version_numero INTEGER NOT NULL DEFAULT 1,
  tipo           VARCHAR(20) NOT NULL,                        -- 'foto' | 'pdf' | 'dwg' | 'otro'
  nombre         TEXT NOT NULL,                               -- nombre original del archivo
  filename       TEXT NOT NULL,                               -- nombre en storage (hash + ext)
  mime_type      VARCHAR(100),
  size_bytes     INTEGER,
  url            TEXT,                                        -- URL pública (Supabase) o '/uploads/...' local
  subido_por     UUID REFERENCES usuarios(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_muestras_archivos_muestra ON muestras_archivos(muestra_id);

-- ─── Asociar Compras Directas con muestras ─────────────────────────────────
-- Cuando una muestra necesita materiales propios, PROCUREMENT crea una OC
-- directa con muestra_id apuntando a la muestra. La OC sigue su flujo normal
-- (cotización, recepción, etc.) pero queda trazable como compra para esa
-- muestra específica.
ALTER TABLE ordenes_compra
  ADD COLUMN IF NOT EXISTS muestra_id INTEGER REFERENCES muestras(id);

CREATE INDEX IF NOT EXISTS idx_ordenes_compra_muestra ON ordenes_compra(muestra_id)
  WHERE muestra_id IS NOT NULL;

-- ─── Tipo de OP: PRODUCCION vs MUESTRA ─────────────────────────────────────
-- Las OPs de muestra usan el mismo flujo (kiosko, estaciones, time tracking)
-- que las OPs normales, pero el frontend las distingue visualmente con un
-- badge "MUESTRA". El campo es default 'PRODUCCION' para no romper datos
-- existentes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'op_tipo') THEN
    CREATE TYPE op_tipo AS ENUM ('PRODUCCION', 'MUESTRA');
  END IF;
END $$;

ALTER TABLE ordenes_produccion
  ADD COLUMN IF NOT EXISTS tipo op_tipo NOT NULL DEFAULT 'PRODUCCION';

-- Opcional pero útil: índice parcial para encontrar OPs de muestras rápido
CREATE INDEX IF NOT EXISTS idx_ordenes_produccion_muestra
  ON ordenes_produccion(tipo) WHERE tipo = 'MUESTRA';

-- ─── Trigger para updated_at en muestras ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_muestras_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_muestras_updated_at ON muestras;
CREATE TRIGGER trg_muestras_updated_at
  BEFORE UPDATE ON muestras
  FOR EACH ROW
  EXECUTE FUNCTION update_muestras_updated_at();

COMMENT ON TABLE muestras IS 'Sistema de gestión de muestras para clientes. Una muestra siempre pertenece a un proyecto. Reusa OCs directas (muestra_id) y OPs de Producción (tipo=MUESTRA).';
COMMENT ON COLUMN muestras.owner_id IS 'Persona única accountable por la muestra. Quien rinde cuentas si se atrasa.';
COMMENT ON COLUMN muestras.version_actual IS 'Empieza en 1. Sube a 2/3/... cada vez que el cliente rechaza y se rehace.';
COMMENT ON COLUMN ordenes_compra.muestra_id IS 'Si != NULL, esta OC fue creada para abastecer materiales de una muestra específica. NULL para OCs normales (MTO, operativas, etc.).';
COMMENT ON COLUMN ordenes_produccion.tipo IS 'PRODUCCION = OP normal. MUESTRA = OP creada desde el módulo de muestras, conectada a muestras_versiones.op_id.';
