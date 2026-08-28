-- ─────────────────────────────────────────────────────────────────────────────
-- 060 — Proyecto: estado 'prospecto' + máquina de estados del deal (deal_estado)
-- ─────────────────────────────────────────────────────────────────────────────
-- Rediseño Estimados→PM→Cliente (decisiones de Chali):
--  · Un proyecto nace como PROSPECTO cuando lo crea Estimados (invisible para
--    Compras/Producción/móvil, que solo miran 'activo'), y pasa a 'activo' cuando
--    el CLIENTE APRUEBA el schedule. 'prospecto' es un valor NUEVO del enum
--    estado_proyecto (NO se reusa 'cotizacion', que es del mundo de compras).
--  · deal_estado sigue el detalle del deal pre-firma sin ensuciar el estado
--    operativo: borrador → esperando_pm → plan_propuesto → esperando_cliente → aprobado.
-- Todo ADITIVO. Mismo patrón de enum que la 043 (rol VIEWER).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
     WHERE enumlabel = 'prospecto'
       AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'estado_proyecto')
  ) THEN
    ALTER TYPE estado_proyecto ADD VALUE 'prospecto';
  END IF;
END $$;

ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS deal_estado TEXT;
COMMENT ON COLUMN proyectos.deal_estado IS
  'Máquina de estados del deal pre-firma: borrador/esperando_pm/plan_propuesto/esperando_cliente/aprobado. NULL para proyectos que no nacieron del flujo de Estimados.';
