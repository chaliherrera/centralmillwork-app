-- ─────────────────────────────────────────────────────────────────────────────
-- 041 — Ampliar CHECK constraint tareas.area para incluir 'shop_manager'
-- ─────────────────────────────────────────────────────────────────────────────
-- Bug detectado 2026-06-17 en arranque take-off Muestras:
-- El hook cerrarProcurementYCrearShopManager (modules/muestras/domain/ocsStatus.ts)
-- inserta tareas con area='shop_manager' al recepcionar una OC asociada a una
-- muestra. Pero el CHECK constraint tareas_area_check solo permite los 4
-- valores originales (procurement, despachos, recepcion, administracion),
-- lo que rompe la transacción de recepción con
-- "violates check constraint tareas_area_check" → ROLLBACK completo →
-- el usuario ve "Error al registrar la recepción".
--
-- Esta migración amplía el CHECK para incluir 'shop_manager'.
-- Cambios de código asociados (zod schemas en webhooksController, tareasController,
-- mapping en notifyTarea) se hacen en un commit aparte tras el take-off.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tareas DROP CONSTRAINT IF EXISTS tareas_area_check;

ALTER TABLE tareas ADD CONSTRAINT tareas_area_check
  CHECK (area = ANY (ARRAY[
    'procurement'::text,
    'despachos'::text,
    'recepcion'::text,
    'administracion'::text,
    'shop_manager'::text
  ]));
