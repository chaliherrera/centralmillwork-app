-- 086_catalogo_cierre_sync.sql (Fase 0 saneamiento, 2026-09-10)
-- Alinea la columna ing_tarea_tipos.cierre con la realidad del reconciliador.
-- NOTA: hoy `cierre` es metadata informativa — el frontend decide los botones por
-- `entregable`, no por `cierre` (verificado). Este UPDATE no cambia comportamiento;
-- corrige la fuente de verdad para futuros devs / futura UI que lea `cierre`.
--
--   material_proc: el ingeniero importa el MTO (entregable='mto', handoff a Compras),
--                  pero el CIERRE final lo deriva Compras (comprasCompleto) → 'derivado'.
--   installation:  no se auto-deriva; la cierra el PM en su widget (handoff 3 etapas
--                  PM→Campo→PM). Es una acción humana → 'manual' (no 'derivado').
UPDATE ing_tarea_tipos SET cierre = 'derivado' WHERE clave = 'material_proc';
UPDATE ing_tarea_tipos SET cierre = 'manual'   WHERE clave = 'installation';
