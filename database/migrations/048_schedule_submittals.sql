-- ─────────────────────────────────────────────────────────────────────────────
-- 048 — Submittals de planos (Life of a Deal, Etapa 3: Ingeniería)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cada vez que Ingeniería emite los shop drawings al cliente sube un submittal
-- (Rev A, Rev B…). El primer submittal completa E-06 (planos emitidos); las
-- revisiones completan E-08 (revisiones incorporadas / resubmittal). El cliente
-- ve el PDF real en el portal y aprueba/rechaza sobre él (E-07).
--
-- Storage físico del PDF: Supabase Storage bucket 'oc-imagenes' path
-- 'submittals/{uuid}.pdf' (mismo patrón que planos).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schedule_submittals (
  id                  SERIAL PRIMARY KEY,
  proyecto_id         INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  version_numero      INTEGER NOT NULL,               -- 1 = Rev A, 2 = Rev B…
  filename            TEXT NOT NULL,                   -- path en Supabase
  original_name       TEXT,
  size_bytes          INTEGER,
  estado              TEXT NOT NULL DEFAULT 'emitido', -- emitido|aprobado|aprobado_con_comentarios|rechazado
  comentarios_cliente TEXT,
  emitido_por         UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  respondido_at       TIMESTAMPTZ,
  UNIQUE (proyecto_id, version_numero)
);
CREATE INDEX IF NOT EXISTS idx_schedule_submittals_proyecto ON schedule_submittals (proyecto_id, version_numero DESC);

COMMENT ON TABLE schedule_submittals IS
  'Submittals de shop drawings por proyecto (Life of a Deal / Ingenieria). Rev A/B… El PDF vive en Supabase. Rev 1 completa E-06, revisiones E-08; el cliente aprueba E-07 sobre el documento.';
