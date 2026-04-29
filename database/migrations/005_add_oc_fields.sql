-- Fecha MTO: fecha de importación del MTO al que corresponde esta OC
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS fecha_mto DATE;

-- Categoría: tipo de material de la OC (HARDWARE, MILLWORK, PAINT, etc.)
ALTER TABLE ordenes_compra ADD COLUMN IF NOT EXISTS categoria VARCHAR(100) DEFAULT '';
