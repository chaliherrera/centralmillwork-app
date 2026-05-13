-- 020_add_ordenado_recibido_states.sql
-- Introduce dos estados nuevos en materiales_mto.estado_cotiz:
--   - ORDENADO: material está en al menos una OC activa (no cancelada, no recibida)
--   - RECIBIDO: material está en al menos una OC con estado='recibida'
--
-- estado_cotiz es TEXT (no ENUM), así que no hace falta ALTER TYPE.
--
-- Este script hace BACKFILL one-shot sobre datos existentes. A partir de acá,
-- el backend mantiene los estados en sincronía vía generarOCs, updateEstadoOrden
-- y deleteOrdenCompra.
--
-- Prerequisito: aplicar 019_backup_pre_ordenado_recibido.sql antes (crea
-- tablas de respaldo por si hay que rollback).
--
-- Fecha de aplicación: 2026-05-11

BEGIN;

-- Verificación previa: el backup tiene que existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'materiales_mto_backup_2026_05_11'
  ) THEN
    RAISE EXCEPTION 'FALTA BACKUP: aplicar 019_backup_pre_ordenado_recibido.sql primero.';
  END IF;
END $$;

-- 1) Materials currently in a 'recibida' OC → RECIBIDO
--    (gana RECIBIDO sobre ORDENADO si está en ambos casos)
UPDATE materiales_mto m
SET estado_cotiz = 'RECIBIDO', updated_at = NOW()
WHERE m.estado_cotiz = 'COTIZADO'
  AND EXISTS (
    SELECT 1 FROM items_orden_compra ioc
    JOIN ordenes_compra oc ON oc.id = ioc.orden_compra_id
    WHERE ioc.material_id = m.id AND oc.estado = 'recibida'
  );

-- 2) Materials currently in an active OC (not cancelled, not received) → ORDENADO
--    Excluye los que ya fueron actualizados a RECIBIDO arriba.
UPDATE materiales_mto m
SET estado_cotiz = 'ORDENADO', updated_at = NOW()
WHERE m.estado_cotiz = 'COTIZADO'
  AND EXISTS (
    SELECT 1 FROM items_orden_compra ioc
    JOIN ordenes_compra oc ON oc.id = ioc.orden_compra_id
    WHERE ioc.material_id = m.id
      AND oc.estado NOT IN ('cancelada', 'recibida')
  );

-- Resumen post-backfill
DO $$
DECLARE
  n_pend int; n_cot int; n_ord int; n_rec int; n_stk int;
BEGIN
  SELECT COUNT(*) INTO n_pend FROM materiales_mto WHERE estado_cotiz = 'PENDIENTE';
  SELECT COUNT(*) INTO n_cot  FROM materiales_mto WHERE estado_cotiz = 'COTIZADO';
  SELECT COUNT(*) INTO n_ord  FROM materiales_mto WHERE estado_cotiz = 'ORDENADO';
  SELECT COUNT(*) INTO n_rec  FROM materiales_mto WHERE estado_cotiz = 'RECIBIDO';
  SELECT COUNT(*) INTO n_stk  FROM materiales_mto WHERE estado_cotiz = 'EN_STOCK';
  RAISE NOTICE '[020 backfill] estado_cotiz distribution:';
  RAISE NOTICE '  PENDIENTE: %', n_pend;
  RAISE NOTICE '  COTIZADO:  %', n_cot;
  RAISE NOTICE '  ORDENADO:  %', n_ord;
  RAISE NOTICE '  RECIBIDO:  %', n_rec;
  RAISE NOTICE '  EN_STOCK:  %', n_stk;
END $$;

COMMIT;
