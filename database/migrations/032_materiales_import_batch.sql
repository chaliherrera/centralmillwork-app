-- Migración 032: import_batch_id en materiales_mto
--
-- Contexto (Chali 2026-06-01): hoy si se importan 2 MTOs el mismo día al
-- mismo proyecto, el sistema los agrupa como UN solo lote (porque agrupamos
-- por proyecto_id + fecha_importacion + origen). Esto pierde la noción de
-- "qué materiales vinieron en qué subida".
--
-- Fix: cada llamada a POST /api/materiales/importar genera un UUID nuevo y
-- lo asigna a todos los materiales de esa subida. Las vistas de actividad,
-- calendario, etc. agrupan por import_batch_id en vez de fecha+origen.
--
-- Materiales existentes (legacy) quedan con import_batch_id NULL. El
-- código de agrupación tiene un fallback para legacy: si batch_id es NULL,
-- agrupa por fecha+origen (comportamiento actual).

ALTER TABLE materiales_mto
  ADD COLUMN IF NOT EXISTS import_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_materiales_mto_import_batch
  ON materiales_mto(import_batch_id) WHERE import_batch_id IS NOT NULL;

COMMENT ON COLUMN materiales_mto.import_batch_id IS
  'UUID generado por cada llamada al endpoint de importación de MTO. '
  'Todos los materiales de la misma subida comparten el mismo batch_id. '
  'Permite distinguir múltiples MTOs el mismo día. NULL = legacy (importado '
  'antes de la migración 032), se agrupa por fecha+origen como fallback.';
