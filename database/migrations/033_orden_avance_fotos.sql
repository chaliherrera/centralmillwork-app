-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 033 — Fotos de avance del kiosko
-- ─────────────────────────────────────────────────────────────────────────────
-- Permite al operario, desde el iPad / kiosko, adjuntar una foto de evidencia
-- antes de confirmar "Completar proceso". Sirve como prueba de avance para
-- mostrar al cliente.
--
-- Reglas de negocio:
--   1. Solo el operario asignado al proceso activo puede subir foto para
--      esa orden + estación (validación en backend, no en SQL).
--   2. La foto es OBLIGATORIA antes de completar el proceso si la estación
--      tiene foto_obligatoria=true (default true).
--   3. visible_cliente=true por default → la foto puede usarse en futuros
--      reportes / portal cliente. Admin puede togglearla a false si es interna.
--   4. Si se borra la orden → ON DELETE CASCADE limpia las fotos.
--   5. Si se borra el proceso o el personal → SET NULL (preservar el row para
--      auditoría aunque no apunte a nada).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- A. Tabla principal
CREATE TABLE IF NOT EXISTS orden_avance_fotos (
  id              SERIAL PRIMARY KEY,
  orden_id        INTEGER NOT NULL REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
  proceso_id      INTEGER REFERENCES orden_procesos(id) ON DELETE SET NULL,
  estacion        TEXT,                                  -- snapshot por si el proceso se borra
  personal_id     INTEGER REFERENCES personal_taller(id) ON DELETE SET NULL,
  usuario_id      UUID REFERENCES usuarios(id) ON DELETE SET NULL,  -- por si la sube admin desde sistema
  filename        TEXT NOT NULL,                         -- path en Supabase o local
  original_name   TEXT,                                  -- nombre que mandó el cliente
  mime_type       TEXT,
  size_bytes      INTEGER,
  url             TEXT,                                  -- URL pública Supabase (cacheada)
  comentario      TEXT,                                  -- nota opcional del operario
  visible_cliente BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices: lookup por orden, por orden+estacion, y por proceso (para validar
-- en completar-proceso si existe foto del proceso actual).
CREATE INDEX IF NOT EXISTS idx_avance_fotos_orden        ON orden_avance_fotos(orden_id);
CREATE INDEX IF NOT EXISTS idx_avance_fotos_orden_est    ON orden_avance_fotos(orden_id, estacion);
CREATE INDEX IF NOT EXISTS idx_avance_fotos_proceso      ON orden_avance_fotos(proceso_id) WHERE proceso_id IS NOT NULL;

-- B. Toggle de obligatoriedad por estación
-- Default true: TODAS las estaciones pasan a requerir foto. Si querés
-- saltarte una específica (ej. "Shipping" si solo es traspaso interno),
-- vas a estaciones_config y la pasás a false manualmente.
ALTER TABLE estaciones_config
  ADD COLUMN IF NOT EXISTS foto_obligatoria BOOLEAN NOT NULL DEFAULT true;

COMMENT ON TABLE  orden_avance_fotos IS
  'Fotos subidas desde el kiosko como evidencia de avance del proceso. Validadas como obligatorias por estaciones_config.foto_obligatoria.';
COMMENT ON COLUMN orden_avance_fotos.visible_cliente IS
  'Si true, la foto es candidata para reportes/portales hacia el cliente. Admin puede ocultarla.';
COMMENT ON COLUMN estaciones_config.foto_obligatoria IS
  'Si true, el operario no puede completar el proceso en esta estación sin subir foto antes.';

COMMIT;
