-- ─────────────────────────────────────────────────────────────────────────────
-- Central Millwork — Esquema inicial
-- ─────────────────────────────────────────────────────────────────────────────

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Tipos ENUM ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE estado_proyecto AS ENUM ('cotizacion','activo','en_pausa','completado','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_orden AS ENUM ('borrador','enviada','confirmada','parcial','recibida','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_cotizacion AS ENUM ('pendiente','enviada','recibida','aprobada','rechazada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_recepcion AS ENUM ('pendiente','completa','con_diferencias');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Proveedores ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proveedores (
  id         SERIAL PRIMARY KEY,
  nombre     VARCHAR(200) NOT NULL,
  contacto   VARCHAR(150),
  email      VARCHAR(150),
  telefono   VARCHAR(30),
  rfc        VARCHAR(20),
  direccion  TEXT,
  activo     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Proyectos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proyectos (
  id                   SERIAL PRIMARY KEY,
  codigo               VARCHAR(30) UNIQUE NOT NULL,
  nombre               VARCHAR(300) NOT NULL,
  cliente              VARCHAR(200) NOT NULL,
  descripcion          TEXT,
  estado               estado_proyecto DEFAULT 'cotizacion',
  fecha_inicio         DATE,
  fecha_fin_estimada   DATE,
  fecha_fin_real       DATE,
  presupuesto          NUMERIC(14,2) DEFAULT 0,
  responsable          VARCHAR(150),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Materiales MTO ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materiales_mto (
  id               SERIAL PRIMARY KEY,
  codigo           VARCHAR(50) UNIQUE NOT NULL,
  descripcion      VARCHAR(300) NOT NULL,
  unidad           VARCHAR(20) NOT NULL,
  categoria        VARCHAR(100),
  precio_referencia NUMERIC(12,2) DEFAULT 0,
  stock_minimo     NUMERIC(10,2) DEFAULT 0,
  activo           BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Órdenes de Compra ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ordenes_compra (
  id                      SERIAL PRIMARY KEY,
  numero                  VARCHAR(30) UNIQUE NOT NULL,
  proyecto_id             INT REFERENCES proyectos(id) ON DELETE RESTRICT,
  proveedor_id            INT REFERENCES proveedores(id) ON DELETE RESTRICT,
  estado                  estado_orden DEFAULT 'borrador',
  fecha_emision           DATE DEFAULT CURRENT_DATE,
  fecha_entrega_estimada  DATE,
  fecha_entrega_real      DATE,
  subtotal                NUMERIC(14,2) DEFAULT 0,
  iva                     NUMERIC(14,2) DEFAULT 0,
  total                   NUMERIC(14,2) DEFAULT 0,
  notas                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Items de Orden de Compra ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items_orden_compra (
  id               SERIAL PRIMARY KEY,
  orden_compra_id  INT REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  material_id      INT REFERENCES materiales_mto(id) ON DELETE RESTRICT,
  descripcion      VARCHAR(300) NOT NULL,
  unidad           VARCHAR(20),
  cantidad         NUMERIC(12,3) NOT NULL,
  precio_unitario  NUMERIC(12,2) NOT NULL,
  subtotal         NUMERIC(14,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);

-- ─── Recepciones ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recepciones (
  id               SERIAL PRIMARY KEY,
  folio            VARCHAR(30) UNIQUE NOT NULL,
  orden_compra_id  INT REFERENCES ordenes_compra(id) ON DELETE RESTRICT,
  estado           estado_recepcion DEFAULT 'pendiente',
  fecha_recepcion  DATE DEFAULT CURRENT_DATE,
  recibio          VARCHAR(150),
  notas            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Items de Recepción ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items_recepcion (
  id                SERIAL PRIMARY KEY,
  recepcion_id      INT REFERENCES recepciones(id) ON DELETE CASCADE,
  item_orden_id     INT REFERENCES items_orden_compra(id) ON DELETE RESTRICT,
  cantidad_ordenada NUMERIC(12,3) NOT NULL,
  cantidad_recibida NUMERIC(12,3) NOT NULL,
  diferencia        NUMERIC(12,3) GENERATED ALWAYS AS (cantidad_recibida - cantidad_ordenada) STORED,
  observaciones     TEXT
);

-- ─── Solicitudes de Cotización ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS solicitudes_cotizacion (
  id              SERIAL PRIMARY KEY,
  folio           VARCHAR(30) UNIQUE NOT NULL,
  proyecto_id     INT REFERENCES proyectos(id) ON DELETE RESTRICT,
  proveedor_id    INT REFERENCES proveedores(id) ON DELETE RESTRICT,
  estado          estado_cotizacion DEFAULT 'pendiente',
  fecha_solicitud DATE DEFAULT CURRENT_DATE,
  fecha_respuesta DATE,
  monto_cotizado  NUMERIC(14,2),
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Usuarios del sistema ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id             SERIAL PRIMARY KEY,
  nombre         VARCHAR(150) NOT NULL,
  email          VARCHAR(150) UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  rol            VARCHAR(30) DEFAULT 'usuario',
  activo         BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_proyectos_estado      ON proyectos(estado);
CREATE INDEX IF NOT EXISTS idx_ordenes_proyecto      ON ordenes_compra(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_proveedor     ON ordenes_compra(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_estado        ON ordenes_compra(estado);
CREATE INDEX IF NOT EXISTS idx_recepciones_orden     ON recepciones(orden_compra_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_proyecto ON solicitudes_cotizacion(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_proveedor ON solicitudes_cotizacion(proveedor_id);
