-- ─────────────────────────────────────────────────────────────────────────────
-- 066 — Ingeniería: motivo del pedido de reprogramación (#2, reusable)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cuando el ingeniero pide reprogramación al PM (reprogramacion_pedida), ahora puede
-- decir POR QUÉ y cuándo podría. El PM necesita ese contexto para reprogramar bien.
-- Texto libre, opcional. Se limpia cuando el PM marca el pedido como atendido.
-- Aditivo/idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ing_tareas ADD COLUMN IF NOT EXISTS reprogramacion_motivo TEXT;
