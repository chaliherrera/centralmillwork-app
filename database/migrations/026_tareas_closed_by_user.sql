-- 026_tareas_closed_by_user.sql
-- Distingue cierres manuales (user) de auto-cierres (sistema) para que el job
-- de sistema no reactive tareas que el user cerró a propósito.
--
-- Bug previo: el UPSERT con reactivación introducido en migration 025 (para
-- arreglar ghost tasks) reactivaba TODA tarea cerrada cuya condición seguía
-- activa, incluso si el user la había cerrado a mano. Resultado: las tareas
-- "volvían" cada 30 min.
--
-- Fix: timestamp closed_by_user_at. Set por el PATCH endpoint cuando el user
-- pasa a estado completada/descartada. El sync respeta ese flag y no reactiva.
--
-- Comportamiento resultante:
--   - User cierra → sticky (no se regenera mientras flag está seteada)
--   - User reabre (PATCH a pendiente/en_progreso) → flag se limpia, comportamiento normal
--   - Sistema auto-cierra por resolución → flag queda NULL, futuro cycling reactivaria normal
--
-- Fecha aplicación: 2026-05-27

BEGIN;

ALTER TABLE tareas ADD COLUMN IF NOT EXISTS closed_by_user_at TIMESTAMPTZ;

-- Backfill: las sistema completadas/descartadas actuales se asumen user-closed
-- (el user vino frustrado a la UI = estuvo cerrándolas a mano). Si alguna fue
-- autoclose por sistema, no harm: solo significa que no se regenera si la
-- condición vuelve, lo cual es aceptable (la regla considera que ya se atendió).
UPDATE tareas
SET closed_by_user_at = COALESCE(completed_at, NOW())
WHERE origen = 'sistema'
  AND estado IN ('completada', 'descartada')
  AND closed_by_user_at IS NULL;

DO $$
DECLARE n_backfilled int;
DECLARE n_total int;
BEGIN
  SELECT COUNT(*) INTO n_backfilled FROM tareas WHERE closed_by_user_at IS NOT NULL;
  SELECT COUNT(*) INTO n_total FROM tareas;
  RAISE NOTICE '[026] closed_by_user_at agregada. Backfill: % rows (total tareas: %)', n_backfilled, n_total;
END $$;

COMMIT;
