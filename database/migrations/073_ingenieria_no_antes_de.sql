-- ─────────────────────────────────────────────────────────────────────────────
-- 073 — ing_tareas.no_antes_de: piso "no antes de" explícito por tarea
-- ─────────────────────────────────────────────────────────────────────────────
-- El planificador (cola serial) ancla las tareas de ingeniería en la fecha en que
-- el ingeniero se libera. Se guarda como un PISO por tarea (no en fecha_inicio del
-- proyecto) para que el re-anclaje del contrato a la firma NO borre la ubicación en
-- la cola. El motor CPM ya sabe combinar pisos (holgura.ts, noAntesDe).
--
-- Aditiva y NULL por defecto = SIN EFECTO hasta que el generador la escriba.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ing_tareas ADD COLUMN IF NOT EXISTS no_antes_de DATE;

COMMENT ON COLUMN ing_tareas.no_antes_de IS
  'Piso "no antes de" explícito (planificador: disponibilidad del ingeniero en su cola). El PM lo puede ajustar. NULL = sin piso.';
