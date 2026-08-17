-- ─────────────────────────────────────────────────────────────────────────────
-- 050 — Punch list de instalación (Life of a Deal, Etapa: Field / Install)
-- ─────────────────────────────────────────────────────────────────────────────
-- Los pendientes de obra que el Field Specialist releva desde el móvil. Cada
-- ítem tiene una foto del problema y, al resolverse, una foto de resuelto.
-- Cuando TODOS los ítems están resueltos (y hay al menos uno), el hito I-06
-- "Punch list cerrado" se completa solo. Evidencia real (P2).
--
-- Fotos en Supabase bucket 'oc-imagenes' path 'punch/{uuid}'.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schedule_punch_items (
  id             SERIAL PRIMARY KEY,
  proyecto_id    INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  descripcion    TEXT NOT NULL,
  area           TEXT,
  estado         TEXT NOT NULL DEFAULT 'abierto',   -- abierto | resuelto
  foto_problema  TEXT,                               -- path Supabase
  foto_resuelto  TEXT,
  created_by     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  resolved_by    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_schedule_punch_proyecto ON schedule_punch_items (proyecto_id, estado);

COMMENT ON TABLE schedule_punch_items IS
  'Punch list de instalacion (Life of a Deal). Relevado desde el movil por el Field Specialist. Cuando todos los items estan resueltos, completa I-06.';
