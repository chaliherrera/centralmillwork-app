-- ─────────────────────────────────────────────────────────────────────────────
-- 078 — Guardar crítico + holgura por tarea (contexto del escritorio)
-- ─────────────────────────────────────────────────────────────────────────────
-- El CPM (holgura.ts) calcula, por tarea, si está en el camino crítico y cuántos
-- días de holgura tiene. Hoy eso se computa al vuelo en getPlanProyecto pero NO se
-- guarda. Para que el escritorio muestre "crítico / +Nd holgura" sin recomputar el
-- CPM en cada carga (cross-project), lo persistimos al recalcular (recomputarYGuardar).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE ing_tareas ADD COLUMN IF NOT EXISTS es_critico   BOOLEAN;
ALTER TABLE ing_tareas ADD COLUMN IF NOT EXISTS holgura_dias INTEGER;

COMMIT;
