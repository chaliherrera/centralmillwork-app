-- 023_compras_operativas.sql
-- Agrega 'OPERATIVA' como cuarto valor válido para origen.
--
-- Las compras OPERATIVAS son gastos del taller que NO están atados a un proyecto:
-- insumos, limpieza, café, combustible, herramientas chicas, etc.
--
-- Diferencias clave con DIRECTA/URGENTE:
--   - proyecto_id es siempre NULL
--   - No tienen flujo cotización → orden → recepción: se registran como
--     'recibida' directamente (ya están compradas al momento de registrar)
--   - Solo ADMIN puede crearlas (control de gasto operativo)
--   - Tienen su propia lista de categorías (INSUMOS_TALLER, LIMPIEZA, OFICINA,
--     ALIMENTACION, COMBUSTIBLE, MANTENIMIENTO, HERRAMIENTAS, OTROS)
--
-- Fecha de aplicación: 2026-05-17

BEGIN;

-- ── materiales_mto: extender CHECK ──────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materiales_mto_origen_check') THEN
    ALTER TABLE materiales_mto DROP CONSTRAINT materiales_mto_origen_check;
  END IF;
END $$;

ALTER TABLE materiales_mto
  ADD CONSTRAINT materiales_mto_origen_check
  CHECK (origen IN ('MTO', 'DIRECTA', 'URGENTE', 'OPERATIVA'));

-- ── ordenes_compra: extender CHECK ──────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_compra_origen_check') THEN
    ALTER TABLE ordenes_compra DROP CONSTRAINT ordenes_compra_origen_check;
  END IF;
END $$;

ALTER TABLE ordenes_compra
  ADD CONSTRAINT ordenes_compra_origen_check
  CHECK (origen IN ('MTO', 'DIRECTA', 'URGENTE', 'OPERATIVA'));

-- Resumen post-migration
DO $$
DECLARE n_op_mat int; n_op_oc int;
BEGIN
  SELECT COUNT(*) INTO n_op_mat FROM materiales_mto WHERE origen = 'OPERATIVA';
  SELECT COUNT(*) INTO n_op_oc  FROM ordenes_compra WHERE origen = 'OPERATIVA';
  RAISE NOTICE '[023] OPERATIVA actualmente: materiales=% ocs=%', n_op_mat, n_op_oc;
  RAISE NOTICE '[023] CHECK constraint actualizado para aceptar MTO|DIRECTA|URGENTE|OPERATIVA';
END $$;

COMMIT;
