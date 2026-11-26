-- 121 — Proceso simplificado (Scheduler): marca si la propuesta del plan ya fue
-- "generada" por el Scheduler. En el borrador recién armado queda false (el Gantt y
-- los totales Entrega estimada/Termina/Holgura están vacíos hasta que el Scheduler
-- termine de poner las fechas y apriete "Generar plan propuesto"). Default true para
-- que los proyectos ya existentes (importados / activos) sigan mostrando sus totales.
ALTER TABLE ing_proyectos
  ADD COLUMN IF NOT EXISTS propuesta_generada boolean NOT NULL DEFAULT true;
