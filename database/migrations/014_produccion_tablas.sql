-- ============================================================================
-- Módulo de Producción — tablas core
-- ============================================================================
-- Órdenes de producción, procesos, historial, inspecciones de QC, configuración
-- de estaciones del taller y matriz de distancias entre estaciones.
--
-- NOTA: las tablas de personal (`personal_taller`, `personal_estaciones`) viven
-- en la migración 015 — esta migración no las referencia con FK porque se
-- aplica primero. Las FKs hacia personal_taller se agregan al final de 015.
-- ============================================================================

-- 1. Órdenes de Producción
CREATE TABLE IF NOT EXISTS ordenes_produccion (
  id                       SERIAL PRIMARY KEY,
  numero_orden             TEXT UNIQUE NOT NULL,
  proyecto_id              INT REFERENCES proyectos(id) ON DELETE RESTRICT,
  item_nombre              TEXT NOT NULL,
  cantidad                 INT  NOT NULL CHECK (cantidad > 0),
  unidad                   TEXT DEFAULT 'Piezas',
  especificaciones         TEXT,
  material_requerido       JSONB,
  prioridad                TEXT CHECK (prioridad IN ('Alta','Media','Baja')) DEFAULT 'Media',
  fecha_entrega            DATE,
  tiempo_estimado_horas    DECIMAL(6,2),
  status                   TEXT NOT NULL DEFAULT 'Pendiente'
                           CHECK (status IN ('Pendiente','En Proceso','Pausada','Completada','Cancelada')),
  estacion_actual          TEXT,
  personal_asignado_id     INT,  -- FK agregada en migración 015
  ruta_calculada           JSONB,
  distancia_total_metros   DECIMAL(7,2),
  notas                    TEXT,
  fecha_inicio             TIMESTAMPTZ,
  fecha_completada         TIMESTAMPTZ,
  created_by               INT REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ordprod_status     ON ordenes_produccion(status);
CREATE INDEX IF NOT EXISTS idx_ordprod_estacion   ON ordenes_produccion(estacion_actual);
CREATE INDEX IF NOT EXISTS idx_ordprod_prioridad  ON ordenes_produccion(prioridad);
CREATE INDEX IF NOT EXISTS idx_ordprod_proyecto   ON ordenes_produccion(proyecto_id);

-- 2. Procesos de la orden (un row por estación que la orden debe atravesar)
CREATE TABLE IF NOT EXISTS orden_procesos (
  id                  SERIAL PRIMARY KEY,
  orden_id            INT NOT NULL REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
  estacion            TEXT NOT NULL,
  secuencia           INT  NOT NULL,
  requerido           BOOLEAN DEFAULT true,
  completado          BOOLEAN DEFAULT false,
  fecha_inicio        TIMESTAMPTZ,
  fecha_fin           TIMESTAMPTZ,
  tiempo_real_minutos INT,
  operador_id         INT,  -- FK a personal_taller, agregada en 015
  notas               TEXT,
  UNIQUE(orden_id, estacion)
);

CREATE INDEX IF NOT EXISTS idx_procesos_orden ON orden_procesos(orden_id);

-- 3. Historial de movimientos / acciones sobre la orden
-- Registra QUIÉN hizo QUÉ y CUÁNDO. El actor puede ser un usuario del sistema
-- (SHOP_MANAGER asignando) o un operario del taller (operador completando).
-- Solo uno de los dos campos *_id estará poblado por evento.
CREATE TABLE IF NOT EXISTS orden_historial (
  id                   SERIAL PRIMARY KEY,
  orden_id             INT NOT NULL REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
  estacion_origen      TEXT,
  estacion_destino     TEXT NOT NULL,
  personal_origen_id   INT,  -- FK a personal_taller en 015
  personal_destino_id  INT,  -- FK a personal_taller en 015
  accion               TEXT NOT NULL,  -- 'crear','mover','asignar','pausar','completar','rechazar', etc.
  motivo               TEXT,
  usuario_id           INT REFERENCES usuarios(id) ON DELETE SET NULL,
  kiosk_personal_id    INT,  -- FK a personal_taller en 015 (cuando la acción la hace un operario)
  dispositivo          TEXT, -- ej: 'tablet-cnc-01' (nullable si la acción la hace un usuario web)
  timestamp            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_histprod_orden     ON orden_historial(orden_id);
CREATE INDEX IF NOT EXISTS idx_histprod_timestamp ON orden_historial(timestamp);

-- 4. Inspecciones de QC (una por evento de inspección)
CREATE TABLE IF NOT EXISTS qc_inspecciones (
  id                  SERIAL PRIMARY KEY,
  orden_id            INT NOT NULL REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
  estacion            TEXT NOT NULL,
  inspector_id        INT,  -- FK a personal_taller en 015
  decision            TEXT CHECK (decision IN ('Aprobar','Reprocesar','Scrap')),
  estacion_reproceso  TEXT,
  notas               TEXT,
  fecha_inspeccion    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qc_orden ON qc_inspecciones(orden_id);

-- 5. Items del checklist de QC (uno por punto del checklist en la inspección)
CREATE TABLE IF NOT EXISTS qc_checklist_items (
  id            SERIAL PRIMARY KEY,
  inspeccion_id INT NOT NULL REFERENCES qc_inspecciones(id) ON DELETE CASCADE,
  descripcion   TEXT NOT NULL,
  aprobado      BOOLEAN,
  notas         TEXT
);

CREATE INDEX IF NOT EXISTS idx_qc_items_inspeccion ON qc_checklist_items(inspeccion_id);

-- 6. Defectos registrados (uno por defecto observado en la inspección)
-- foto_url apunta a Supabase Storage en producción, o /uploads/<file> en dev.
CREATE TABLE IF NOT EXISTS qc_defectos (
  id            SERIAL PRIMARY KEY,
  inspeccion_id INT NOT NULL REFERENCES qc_inspecciones(id) ON DELETE CASCADE,
  tipo_defecto  TEXT NOT NULL,
  descripcion   TEXT NOT NULL,
  severidad     TEXT CHECK (severidad IN ('Menor','Moderado','Mayor')),
  foto_url      TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qc_defectos_inspeccion ON qc_defectos(inspeccion_id);

-- 7. Configuración de estaciones del taller (catálogo + posiciones del mapa)
CREATE TABLE IF NOT EXISTS estaciones_config (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT UNIQUE NOT NULL,
  tipo          TEXT,        -- maquinado | acabado | qc | ensamblaje | logistica
  posicion_x    INT,
  posicion_y    INT,
  capacidad_max INT,
  activa        BOOLEAN DEFAULT true
);

-- 8. Matriz de distancias entre estaciones (dirigida: A→B puede diferir de B→A)
CREATE TABLE IF NOT EXISTS estaciones_distancias (
  id                  SERIAL PRIMARY KEY,
  estacion_origen     TEXT NOT NULL,
  estacion_destino    TEXT NOT NULL,
  distancia_metros    DECIMAL(5,2) NOT NULL,
  tiempo_estimado_seg INT,
  es_estimado         BOOLEAN DEFAULT true,
  UNIQUE(estacion_origen, estacion_destino)
);

COMMENT ON COLUMN estaciones_distancias.es_estimado
  IS 'true = distancia aproximada/estimada inicial; false = medida real en piso';
