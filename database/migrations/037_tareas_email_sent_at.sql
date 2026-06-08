-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 037 — email_sent_at en tareas (Muestras F7)
-- ─────────────────────────────────────────────────────────────────────────────
-- Tracking de emails enviados para evitar duplicados cuando:
--   - El cron de tareas-sistema re-corre y la tarea sigue pendiente
--   - La tarea se reactiva tras un cierre manual del user (Fix b/closed_by_user_at)
--   - Un deploy nuevo dispara el sync ad-hoc
--
-- Si email_sent_at IS NOT NULL, NO se manda email (idempotencia).
-- Solo se setea cuando sendEmail() devuelve { ok: true } (incluye passthrough).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE tareas
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN tareas.email_sent_at IS
  'Timestamp del ultimo email enviado por esta tarea. NULL = nunca se envio. Se setea solo cuando sendEmail() devuelve ok=true. Idempotencia para evitar duplicados.';

-- Índice parcial para queries "tareas pendientes que NO mandaron email aún"
-- — usado por el job de notificaciones para escanear rápido.
CREATE INDEX IF NOT EXISTS idx_tareas_email_pending
  ON tareas(area, source_ref)
  WHERE email_sent_at IS NULL
    AND origen = 'sistema'
    AND estado IN ('pendiente', 'en_progreso');

COMMIT;
