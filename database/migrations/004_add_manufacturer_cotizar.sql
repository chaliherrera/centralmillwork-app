-- Manufacturer: campo de texto libre para el fabricante del material
ALTER TABLE materiales_mto ADD COLUMN IF NOT EXISTS manufacturer TEXT DEFAULT '';

-- Cotizar S/N: reemplaza mill_made como indicador de si el material debe cotizarse
ALTER TABLE materiales_mto ADD COLUMN IF NOT EXISTS cotizar TEXT DEFAULT 'NO';

-- Migrar mill_made='SI' a cotizar='SI' para datos existentes.
--
-- IF EXISTS check: la columna mill_made existe en DBs viejas (era parte del
-- schema inicial original, antes de ser reemplazada conceptualmente por
-- `cotizar`) pero NO se crea en ninguna migración del repo. Por eso fresh
-- installs (dev nuevo, staging desde cero, CI) fallaban acá con
-- "column mill_made does not exist".
--
-- Solución idempotente: si la columna existe (DBs históricas) corre el
-- UPDATE; si no (fresh install), lo saltea sin error. En ambos casos el
-- resultado funcional es el mismo: los materiales con mill_made='SI' quedan
-- como cotizar='SI', y los demás siguen con su valor por defecto.
--
-- Limpieza profunda (eliminar columna mill_made + sus 11 referencias en el
-- código) queda como deuda menor — no urgente, la data actual ya es 100%
-- 'NO' (campo funcionalmente muerto).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'materiales_mto' AND column_name = 'mill_made'
  ) THEN
    UPDATE materiales_mto SET cotizar = 'SI' WHERE mill_made = 'SI' AND cotizar = 'NO';
  END IF;
END $$;
