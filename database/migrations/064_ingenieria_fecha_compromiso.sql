-- ─────────────────────────────────────────────────────────────────────────────
-- 064 — Ingeniería: fecha comprometida (patrón "comprometida + cumplida")
-- ─────────────────────────────────────────────────────────────────────────────
-- Paso #10 Field Measurements (y cualquier tarea que necesite agenda previa): el
-- responsable PROGRAMA una fecha de compromiso ("lo hago el día X") y luego registra
-- la fecha REAL de cumplimiento. El gap entre ambas — y contra la fecha del plan (CPM) —
-- es la señal para el PM.
--
-- fecha_compromiso = NUEVA (cuándo se hará, promesa del responsable).
-- fecha_fin_real   = YA EXISTE en ing_tareas (migr. 054) pero estaba DORMIDA; se activa
--                    como la fecha de cumplimiento real. No se agrega, solo se empieza a usar.
--
-- Patrón reusable: no es exclusivo de field measurements. Aditivo/idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ing_tareas ADD COLUMN IF NOT EXISTS fecha_compromiso DATE;
