-- Migración 020: tiempo estimado por estación dentro de la orden
--
-- Hasta ahora `ordenes_produccion.tiempo_estimado_horas` era un único número
-- para toda la orden. Esta migración permite que el SHOP_MANAGER especifique
-- un estimado POR estación, lo que habilita la vista de Evolución a comparar
-- tiempo real vs estimado en cada paso del flujo.
--
-- Si la columna queda NULL para una estación, el frontend distribuye
-- `tiempo_estimado_horas` de la orden equitativamente entre las estaciones
-- como fallback.

ALTER TABLE orden_procesos
  ADD COLUMN IF NOT EXISTS tiempo_estimado_minutos INTEGER;

COMMENT ON COLUMN orden_procesos.tiempo_estimado_minutos IS
  'Estimación específica para esta estación dentro de esta orden. Opcional. '
  'Si null, el frontend distribuye ordenes_produccion.tiempo_estimado_horas '
  'equitativamente entre las estaciones de la ruta.';
