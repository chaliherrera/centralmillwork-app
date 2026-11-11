-- 115_informes_compartir.sql
-- Compartir un informe afuera con un link público de SOLO LECTURA (Fase 4).
--
--   · token            → código largo e impredecible del link público.
--   · compartir_activo → si está en false, el link no funciona aunque exista
--                        el token (permite apagar/encender el link sin perderlo).
--
-- El endpoint público (sin login) sirve el informe solo si token coincide Y
-- compartir_activo = true.

ALTER TABLE informes ADD COLUMN IF NOT EXISTS token TEXT;
ALTER TABLE informes ADD COLUMN IF NOT EXISTS compartir_activo BOOLEAN NOT NULL DEFAULT false;

-- token único cuando existe (varios NULL permitidos).
CREATE UNIQUE INDEX IF NOT EXISTS idx_informes_token
  ON informes (token) WHERE token IS NOT NULL;
