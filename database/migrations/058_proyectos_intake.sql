-- ─────────────────────────────────────────────────────────────────────────────
-- 058 — Estimados: campos de la hoja de intake en el alta del proyecto
-- ─────────────────────────────────────────────────────────────────────────────
-- La hoja de intake que llena Estimados (ej. "Courtyard by Marriott – Prattville")
-- trae datos que alimentan la duración de Ingeniería y el seguimiento del deal:
--   • Project Total  -> ya existe como proyectos.presupuesto
--   • Millwork Total -> monto de carpintería
--   • Stone          -> monto de piedra / countertops
--   • Items Qty      -> cantidad de ítems (regla shop drawings ≈ 1 día por ítem)
--   • Millwork Date  -> DECISIÓN de Chali: es la MISMA fecha que pide el cliente
--                       = proyectos.fecha_entrega_solicitada (055, hoy sin uso).
--                       No se agrega columna nueva; se cablea esa.
--   • Comments       -> lead times y notas (campo propio, para poder minarlo luego)
--
-- Todo ADITIVO y nullable → cero riesgo con los datos existentes.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS millwork_total  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS stone_total     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS items_qty       INT,
  ADD COLUMN IF NOT EXISTS intake_comments TEXT;

COMMENT ON COLUMN proyectos.millwork_total  IS 'Intake: monto de carpintería (Millwork Total, USD)';
COMMENT ON COLUMN proyectos.stone_total     IS 'Intake: monto de piedra/countertops (Stone, USD)';
COMMENT ON COLUMN proyectos.items_qty       IS 'Intake: cantidad de ítems (alimenta la regla día-por-ítem de shop drawings)';
COMMENT ON COLUMN proyectos.intake_comments IS 'Intake: comentarios / lead times de la hoja de Estimados';
