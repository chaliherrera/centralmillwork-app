-- 088_check_origen_deal_estado.sql (Fase D, 2026-09-10)
-- CHECK en dos campos que GOBIERNAN visibilidad/flujo pero hoy no tienen constraint:
-- un typo pasa sin error y la fila desaparece del escritorio / rompe el flujo del deal.
-- Valores verificados contra el código (sólo estos se escriben) y contra los datos de
-- staging (sin filas fuera de dominio). Idempotente (drop-if-exists → add).
--
--   ing_tareas.origen: 'app' (plan aceptado) · 'import_excel' (Excel) · 'manual' (crearTarea)
--                      · 'sugerencia' (plan propuesto, transitorio). NO 'reserva' (muerto),
--                      NO 'sistema' (ese es de la tabla `tareas`, no de ing_tareas).
--   proyectos.deal_estado: NULL (sin deal) o la máquina de estados de Estimados→PM→cliente.
ALTER TABLE ing_tareas DROP CONSTRAINT IF EXISTS ing_tareas_origen_check;
ALTER TABLE ing_tareas ADD CONSTRAINT ing_tareas_origen_check
  CHECK (origen IN ('app', 'import_excel', 'manual', 'sugerencia'));

ALTER TABLE proyectos DROP CONSTRAINT IF EXISTS proyectos_deal_estado_check;
ALTER TABLE proyectos ADD CONSTRAINT proyectos_deal_estado_check
  CHECK (deal_estado IS NULL OR deal_estado IN
    ('borrador', 'esperando_pm', 'plan_propuesto', 'esperando_cliente', 'aprobado'));
