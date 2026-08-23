-- ─────────────────────────────────────────────────────────────────────────────
-- 056 — Reserva de capacidad de Ingeniería (paso 5 del upgrade de Estimados)
-- ─────────────────────────────────────────────────────────────────────────────
-- La reserva = tareas provisionales en ing_tareas con origen='reserva'. Estimados
-- las crea cuando el proyecto es factible; consumen capacidad (para que la próxima
-- cotización cuente con eso). El PM las CONFIRMA y le asigna el ingeniero real.
-- Se liberan (DELETE) si el proyecto se rechaza y no fueron confirmadas.
--
-- Agrega la confirmación del PM. El valor 'reserva' de `origen` no necesita cambio
-- de tipo (origen es TEXT libre).
--
-- Reversa: DROP COLUMN reserva_confirmada_at, reserva_confirmada_por.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ing_tareas
  ADD COLUMN IF NOT EXISTS reserva_confirmada_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reserva_confirmada_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;
