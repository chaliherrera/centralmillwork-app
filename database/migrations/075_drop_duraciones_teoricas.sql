-- ─────────────────────────────────────────────────────────────────────────────
-- 075 — Limpieza: elimina las duraciones teóricas del Life of a Deal.
-- ─────────────────────────────────────────────────────────────────────────────
-- El motor teórico (motor.ts) fue eliminado en el corte a fuente única (el journey
-- toma sus fechas del Gantt). Las columnas dur_dias_default/min/max de la plantilla
-- de hitos ya no las lee nadie. Se dropean para que no quede rastro de los tiempos
-- teóricos y nadie vuelva a apoyarse en ellos.
-- Idempotente. Se aplica DIRECTO (esta base no usa el runner de migraciones).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE schedule_plantilla_hitos
  DROP COLUMN IF EXISTS dur_dias_default,
  DROP COLUMN IF EXISTS dur_dias_min,
  DROP COLUMN IF EXISTS dur_dias_max;
