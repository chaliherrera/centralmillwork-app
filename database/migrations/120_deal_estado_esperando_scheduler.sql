-- ─────────────────────────────────────────────────────────────────────────────
-- 120 — Nuevo estado del deal: 'esperando_scheduler'
-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-11-25: proceso simplificado (Fase 2). Mueve la factibilidad + armado del
-- plan de Estimados al Scheduler.
--
-- Nuevo primer estado del ciclo: al crear el take-off (prospecto con fecha
-- solicitada), el deal queda 'esperando_scheduler' = esperando que el Scheduler
-- arme el plan. Luego sigue el ciclo existente:
--   esperando_scheduler → (Scheduler arma: generar+reservar) → esperando_pm
--     → (Scheduler devuelve a Estimados: confirmar) → plan_propuesto
--     → (Estimados envía) → esperando_cliente → (cliente aprueba) → aprobado
--     → (Scheduler activa) → proyecto 'activo'.
--
-- Solo extiende el CHECK de la 088 (agrega el valor nuevo). Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE proyectos DROP CONSTRAINT IF EXISTS proyectos_deal_estado_check;
ALTER TABLE proyectos ADD CONSTRAINT proyectos_deal_estado_check
  CHECK (deal_estado IS NULL OR deal_estado IN
    ('borrador', 'esperando_scheduler', 'esperando_pm', 'plan_propuesto', 'esperando_cliente', 'aprobado'));
