-- ─────────────────────────────────────────────────────────────────────────────
-- 096 — Idempotencia para la cola offline del móvil (Field / obra)
-- ─────────────────────────────────────────────────────────────────────────────
-- La app móvil encola escrituras de obra sin señal y las reenvía al reconectar.
-- Un reenvío puede llegar dos veces (timeout + retry) → sin protección, se
-- duplicarían punch items, fotos de check-in, etc.
--
-- `client_id` es un UUID que genera el teléfono para CADA acción encolada (la
-- "idempotency key"). El backend hace ON CONFLICT (client_id) DO NOTHING/UPDATE,
-- así el segundo intento no duplica. Es NULL para las escrituras hechas desde la
-- web (que no usan cola), por eso el índice único es parcial (WHERE NOT NULL).
--
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

-- Punch items creados desde la obra.
ALTER TABLE schedule_punch_items ADD COLUMN IF NOT EXISTS client_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_punch_client_id
  ON schedule_punch_items (client_id) WHERE client_id IS NOT NULL;

-- Archivos de hito (check-in I-04 / avance I-05 suben foto por este camino).
ALTER TABLE schedule_hito_archivos ADD COLUMN IF NOT EXISTS client_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hito_archivo_client_id
  ON schedule_hito_archivos (client_id) WHERE client_id IS NOT NULL;

COMMIT;
