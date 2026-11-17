-- 118_ing_tareas_avance.sql
-- % de avance (progress) MANUAL de una tarea de Ingeniería.
--
-- Guarda el % que el scheduler carga a mano (0..1) en los pasos de diseño donde
-- nadie más lo sabe (shop drawings, CNC, etc). Los pasos "automáticos" (Compras
-- recibidos/total, Instalación por ítems, hitos hechos) NO usan esta columna: su
-- avance se calcula en vivo desde los módulos. Proceso MIXTO (decisión Chali).
--
-- SEGURO/ADITIVO: solo agrega una columna anulable. No toca nada en uso.

ALTER TABLE ing_tareas ADD COLUMN IF NOT EXISTS avance_pct NUMERIC(5,2);

COMMENT ON COLUMN ing_tareas.avance_pct IS
  '% de avance MANUAL (0..1) para pasos de diseño. Los pasos automáticos lo calculan desde su módulo.';
