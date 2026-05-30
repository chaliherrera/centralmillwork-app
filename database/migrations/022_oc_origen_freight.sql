-- 022_oc_origen_freight.sql
-- Agrega `origen` y `freight` a ordenes_compra:
--   - origen: tipo de la OC (MTO | DIRECTA | URGENTE) — espejo del de materiales_mto
--             pero a nivel OC para queries rápidas y visualización en cards/panels.
--   - freight: costo de flete asociado a la OC. Las compras SIN-MTO (DIRECTA / URGENTE)
--             tienen freight alto y se carga directo en la OC (no vía mto_freight).
--             Para las MTO, sigue calculándose vía mto_freight (proyecto_id + vendor).
--
-- Las nuevas SIN-MTO usan: total = subtotal + freight (sin IVA, ya que opera en USD).
--
-- Fecha de aplicación: 2026-05-16

BEGIN;

ALTER TABLE ordenes_compra
  ADD COLUMN IF NOT EXISTS origen  VARCHAR(20)    NOT NULL DEFAULT 'MTO',
  ADD COLUMN IF NOT EXISTS freight NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- CHECK constraint (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_compra_origen_check'
  ) THEN
    ALTER TABLE ordenes_compra
      ADD CONSTRAINT ordenes_compra_origen_check
      CHECK (origen IN ('MTO', 'DIRECTA', 'URGENTE'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_oc_origen ON ordenes_compra(origen);

-- Backfill: si una OC tiene materiales con origen != 'MTO', heredarlo
-- (cubre la única OC SIN-MTO creada durante testing local hoy)
UPDATE ordenes_compra oc
SET origen = sub.origen
FROM (
  SELECT ioc.orden_compra_id, MIN(m.origen) AS origen
  FROM items_orden_compra ioc
  JOIN materiales_mto m ON m.id = ioc.material_id
  WHERE m.origen IN ('DIRECTA', 'URGENTE')
  GROUP BY ioc.orden_compra_id
) sub
WHERE oc.id = sub.orden_compra_id
  AND oc.origen = 'MTO';

DO $$
DECLARE n_mto INT; n_dir INT; n_urg INT;
BEGIN
  SELECT COUNT(*) INTO n_mto FROM ordenes_compra WHERE origen = 'MTO';
  SELECT COUNT(*) INTO n_dir FROM ordenes_compra WHERE origen = 'DIRECTA';
  SELECT COUNT(*) INTO n_urg FROM ordenes_compra WHERE origen = 'URGENTE';
  RAISE NOTICE '[022] OCs por origen: MTO=% DIRECTA=% URGENTE=%', n_mto, n_dir, n_urg;
END $$;

COMMIT;
