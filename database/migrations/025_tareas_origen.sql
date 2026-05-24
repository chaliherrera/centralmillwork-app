-- 025_tareas_origen.sql
-- Extiende tabla tareas con un segundo origen: tareas auto-generadas desde la DB
-- (vs email-derived que es lo que existe hoy).
--
-- Modelo:
--   origen='email'    -> source_email_id es la dedup key (existente)
--   origen='sistema'  -> source_ref es la dedup key. Format: 'rule:entity_id'
--                       Ejemplos: 'quote-stale:567', 'eta-today:1234',
--                                 'eta-overdue:1234', 'partial-stale:89'
--
-- El job que pobla esto vive en backend/src/jobs/tareasFromSystem.ts.
--
-- Fecha de aplicación: 2026-05-24

BEGIN;

ALTER TABLE tareas
  ADD COLUMN IF NOT EXISTS origen     TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tareas_origen_check') THEN
    ALTER TABLE tareas ADD CONSTRAINT tareas_origen_check
      CHECK (origen IN ('email', 'sistema'));
  END IF;
END $$;

-- Unique parcial: dedup por source_ref solo cuando es tarea de sistema.
-- Permite que el job re-corra sin duplicar, pero NO interfiere con email.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tareas_system_dedup
  ON tareas(source_ref)
  WHERE origen = 'sistema' AND source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tareas_origen ON tareas(origen);

DO $$
DECLARE n_email int; n_sistema int;
BEGIN
  SELECT COUNT(*) INTO n_email   FROM tareas WHERE origen = 'email';
  SELECT COUNT(*) INTO n_sistema FROM tareas WHERE origen = 'sistema';
  RAISE NOTICE '[025] columnas origen+source_ref agregadas. email=% sistema=%', n_email, n_sistema;
END $$;

COMMIT;
