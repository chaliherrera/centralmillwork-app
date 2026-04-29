-- Fecha de importación explícita por material (indica el lote al que pertenece)
ALTER TABLE materiales_mto ADD COLUMN IF NOT EXISTS fecha_importacion DATE;

-- Backfill con la fecha de creación para registros existentes
UPDATE materiales_mto SET fecha_importacion = created_at::date WHERE fecha_importacion IS NULL;
