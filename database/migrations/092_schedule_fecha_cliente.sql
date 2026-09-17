-- 092_schedule_fecha_cliente.sql (Fase 2 · 2.2 — mover fecha de entrega)
-- Separa la fecha de entrega en DOS:
--   · schedule_planes.fecha_objetivo  = fecha INTERNA de trabajo del PM. El PM la mueve
--     libremente (mover fecha de entrega → recalcula el plan). Es la que se ve internamente
--     (hero del schedule, holgura, semáforo).
--   · schedule_planes.fecha_cliente   = la fecha que VE EL CLIENTE en el portal. NO se mueve
--     cuando el PM ajusta la interna: el cliente no recibe ruido. Sólo cambia cuando se le
--     (re)comunica al cliente (al mandarle el schedule, o cuando Estimados renegocia).
-- El portal lee COALESCE(fecha_cliente, fecha_objetivo): si nunca se comunicó, cae en la interna.
-- Idempotente. Backfill: los planes existentes arrancan con fecha_cliente = fecha_objetivo
-- (así los portales ya compartidos siguen mostrando exactamente lo mismo que hoy).
ALTER TABLE schedule_planes ADD COLUMN IF NOT EXISTS fecha_cliente DATE;

UPDATE schedule_planes
   SET fecha_cliente = fecha_objetivo
 WHERE fecha_cliente IS NULL AND scope = 'proyecto' AND fecha_objetivo IS NOT NULL;
