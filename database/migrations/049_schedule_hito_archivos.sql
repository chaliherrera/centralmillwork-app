-- ─────────────────────────────────────────────────────────────────────────────
-- 049 — Archivos por hito (Life of a Deal, Ingeniería): CNC, etc.
-- ─────────────────────────────────────────────────────────────────────────────
-- Adjuntos genéricos asociados a un hito del schedule. Primer uso: los archivos
-- CNC que Ingeniería entrega (E-11). Subir el primer archivo completa el hito
-- (evidencia real, P2). Reutilizable para otros hitos con entregables.
--
-- Storage físico en Supabase bucket 'oc-imagenes' path 'hito-archivos/{uuid}'.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schedule_hito_archivos (
  id             SERIAL PRIMARY KEY,
  proyecto_id    INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  hito_codigo    TEXT NOT NULL,
  filename       TEXT NOT NULL,          -- path en Supabase
  original_name  TEXT,
  size_bytes     INTEGER,
  subido_por     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedule_hito_archivos ON schedule_hito_archivos (proyecto_id, hito_codigo);

COMMENT ON TABLE schedule_hito_archivos IS
  'Adjuntos por hito del schedule (ej. archivos CNC de E-11). Subir el primer archivo completa el hito. PDF/otros en Supabase.';
