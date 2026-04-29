-- Add notas column to materiales_mto for per-material notes
ALTER TABLE materiales_mto ADD COLUMN IF NOT EXISTS notas TEXT;
