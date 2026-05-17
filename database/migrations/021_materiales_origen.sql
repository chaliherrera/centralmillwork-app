-- 021_materiales_origen.sql
-- Agrega `origen` a materiales_mto para diferenciar compras MTO de DIRECTA / URGENTE.
--
-- Valores:
--   - MTO       : default — material importado desde el Excel del MTO (flujo planificado)
--   - DIRECTA   : compra puntual no planificada (fuera del MTO, rutinaria)
--   - URGENTE   : compra crítica (rotura en obra, cliente parado, etc.)
--
-- Cada compra DIRECTA o URGENTE genera SU PROPIA OC nueva (no se adjunta a OCs MTO).
--
-- Fecha de aplicación: 2026-05-16

BEGIN;

-- 1) Columna nueva con default 'MTO' y CHECK constraint
ALTER TABLE materiales_mto
  ADD COLUMN IF NOT EXISTS origen VARCHAR(20) NOT NULL DEFAULT 'MTO';

-- 2) CHECK constraint (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'materiales_mto_origen_check'
  ) THEN
    ALTER TABLE materiales_mto
      ADD CONSTRAINT materiales_mto_origen_check
      CHECK (origen IN ('MTO', 'DIRECTA', 'URGENTE'));
  END IF;
END $$;

-- 3) Índice compuesto para filtros frecuentes (proyecto_id + origen)
CREATE INDEX IF NOT EXISTS idx_materiales_origen
  ON materiales_mto(proyecto_id, origen);

-- 4) Verificación: todos los actuales quedan como 'MTO' (backfill por default)
DO $$
DECLARE
  n_mto INT; n_dir INT; n_urg INT;
BEGIN
  SELECT COUNT(*) INTO n_mto FROM materiales_mto WHERE origen = 'MTO';
  SELECT COUNT(*) INTO n_dir FROM materiales_mto WHERE origen = 'DIRECTA';
  SELECT COUNT(*) INTO n_urg FROM materiales_mto WHERE origen = 'URGENTE';
  RAISE NOTICE '[021] origen distribution: MTO=% DIRECTA=% URGENTE=%', n_mto, n_dir, n_urg;
END $$;

COMMIT;
