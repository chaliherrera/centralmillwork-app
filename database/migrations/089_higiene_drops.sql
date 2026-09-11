-- 089_higiene_drops.sql (Fase D, 2026-09-10)
-- Higiene: elimina remanente muerto verificado.
--   · ing_tareas.reserva_confirmada_at/_por (migr. 056): 100% NULL, sin refs en código
--     (el flujo de aceptación del PM evolucionó a regenerar con origen='app').
--   · Tablas *_backup_2026_05_11: snapshots congelados en el baseline, sin refs en código.
-- Idempotente (IF EXISTS). No toca datos vivos.
ALTER TABLE ing_tareas DROP COLUMN IF EXISTS reserva_confirmada_at;
ALTER TABLE ing_tareas DROP COLUMN IF EXISTS reserva_confirmada_por;

DROP TABLE IF EXISTS items_orden_compra_backup_2026_05_11;
DROP TABLE IF EXISTS ordenes_compra_backup_2026_05_11;
DROP TABLE IF EXISTS materiales_mto_backup_2026_05_11;
