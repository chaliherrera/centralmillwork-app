-- 019_backup_pre_ordenado_recibido.sql
-- Backup safety net antes de introducir estados ORDENADO y RECIBIDO en materiales_mto.
--
-- Esta migration NO modifica datos. Solo crea tablas de respaldo (copias completas)
-- de las tablas críticas que la migration 020 va a tocar.
--
-- Si la migration 020 (backfill) o el código nuevo causa problemas, podemos restaurar
-- con los queries documentados al pie.
--
-- Fecha de aplicación: 2026-05-11
-- Aplica antes de: 020_add_ordenado_recibido_states.sql

BEGIN;

-- Snapshot de materiales_mto (estado_cotiz va a cambiar para los que estén en OCs activas)
DROP TABLE IF EXISTS materiales_mto_backup_2026_05_11;
CREATE TABLE materiales_mto_backup_2026_05_11 AS
  SELECT * FROM materiales_mto;

-- Snapshot por las dudas de ordenes_compra (lectura no destructiva, pero útil para audit)
DROP TABLE IF EXISTS ordenes_compra_backup_2026_05_11;
CREATE TABLE ordenes_compra_backup_2026_05_11 AS
  SELECT * FROM ordenes_compra;

-- Snapshot de items_orden_compra (referencias material_id → orden_compra_id)
DROP TABLE IF EXISTS items_orden_compra_backup_2026_05_11;
CREATE TABLE items_orden_compra_backup_2026_05_11 AS
  SELECT * FROM items_orden_compra;

-- Metadata: cuántas filas tiene cada backup, para verificación rápida
DO $$
DECLARE
  n_mat int;
  n_oc  int;
  n_ioc int;
BEGIN
  SELECT COUNT(*) INTO n_mat FROM materiales_mto_backup_2026_05_11;
  SELECT COUNT(*) INTO n_oc  FROM ordenes_compra_backup_2026_05_11;
  SELECT COUNT(*) INTO n_ioc FROM items_orden_compra_backup_2026_05_11;
  RAISE NOTICE '[backup 019] materiales_mto_backup_2026_05_11: % filas', n_mat;
  RAISE NOTICE '[backup 019] ordenes_compra_backup_2026_05_11: % filas', n_oc;
  RAISE NOTICE '[backup 019] items_orden_compra_backup_2026_05_11: % filas', n_ioc;
END $$;

COMMIT;


-- ============================================================================
-- INSTRUCCIONES DE ROLLBACK (en caso de emergencia)
-- ============================================================================
--
-- 1) Para restaurar SOLO los estado_cotiz de materiales a como estaban antes:
--
--    BEGIN;
--    UPDATE materiales_mto m
--    SET estado_cotiz = b.estado_cotiz
--    FROM materiales_mto_backup_2026_05_11 b
--    WHERE m.id = b.id
--      AND m.estado_cotiz IS DISTINCT FROM b.estado_cotiz;
--    -- Verificar que el count tiene sentido antes de hacer COMMIT
--    COMMIT;
--
-- 2) Para restaurar completamente materiales_mto al estado del 2026-05-11:
--
--    BEGIN;
--    TRUNCATE materiales_mto CASCADE;
--    INSERT INTO materiales_mto SELECT * FROM materiales_mto_backup_2026_05_11;
--    -- ATENCIÓN: esto borra registros nuevos creados después del backup. No usar
--    -- esta opción salvo emergencia real.
--    COMMIT;
--
-- 3) Cuando ya esté todo estable (ej. 30 días después) y querramos liberar espacio:
--
--    DROP TABLE materiales_mto_backup_2026_05_11;
--    DROP TABLE ordenes_compra_backup_2026_05_11;
--    DROP TABLE items_orden_compra_backup_2026_05_11;
--
-- ============================================================================
