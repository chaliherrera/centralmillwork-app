-- Manufacturer: campo de texto libre para el fabricante del material
ALTER TABLE materiales_mto ADD COLUMN IF NOT EXISTS manufacturer TEXT DEFAULT '';

-- Cotizar S/N: reemplaza mill_made como indicador de si el material debe cotizarse
ALTER TABLE materiales_mto ADD COLUMN IF NOT EXISTS cotizar TEXT DEFAULT 'NO';

-- Migrar mill_made='SI' a cotizar='SI' para datos existentes
UPDATE materiales_mto SET cotizar = 'SI' WHERE mill_made = 'SI' AND cotizar = 'NO';
