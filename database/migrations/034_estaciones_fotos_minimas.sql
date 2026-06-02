-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 034 — fotos_minimas por estación
-- ─────────────────────────────────────────────────────────────────────────────
-- Antes: foto_obligatoria controlaba si la estación requería >=1 foto.
-- Ahora: foto_obligatoria sigue siendo el toggle on/off, pero fotos_minimas
-- define cuántas fotos requiere (default 3). Se puede ajustar por estación
-- si alguna necesita más (ej: assembly podría requerir 5) o menos.
--
-- Backend valida `count(orden_avance_fotos) >= fotos_minimas`. Frontend
-- consulta /api/kiosk/estaciones-config y muestra contador "X de Y" en
-- el modal de cámara.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE estaciones_config
  ADD COLUMN IF NOT EXISTS fotos_minimas INTEGER NOT NULL DEFAULT 3
    CHECK (fotos_minimas >= 0);

COMMENT ON COLUMN estaciones_config.fotos_minimas IS
  'Cantidad mínima de fotos de avance requeridas antes de poder completar el proceso en esta estación. Se usa SOLO si foto_obligatoria=true. Default 3.';

COMMIT;
