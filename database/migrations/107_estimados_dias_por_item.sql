-- 107_estimados_dias_por_item.sql
-- Los días de instalación son POR ÍTEM y se suman, como en el Excel.
--
-- EL PROBLEMA QUE ARREGLA: el modelo tenía los días en DOS lados —un parámetro
-- del proyecto y un campo por ítem— y sólo el del proyecto alimentaba el
-- cálculo. Editar los días de un ítem no hacía absolutamente nada.
-- Y como el default de la casa había quedado en 2,5 (heredado de un proyecto
-- puntual), un estimado NUEVO y vacío ya cotizaba miles de dólares de instalación.
--
-- DECISIÓN DE CHALI (2026-10-30): por ítem.
-- Así la regla de "cierto monto de producto = 1 día" tiene sentido ítem por ítem, y
-- un estimado vacío cotiza CERO de instalación, que es lo correcto.
--
-- Cada ítem sigue la regla hasta que alguien escribe un número a mano. A partir
-- de ahí queda fijo y se marca, para que se vea que hubo una decisión — que es
-- justo lo que el Excel no deja ver. Idempotente.

ALTER TABLE est_estimado_items
  ADD COLUMN IF NOT EXISTS dias_instalacion_manual BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN est_estimado_items.dias_instalacion_manual IS
  'false = sigue la regla de la casa de producto por día y se recalcula solo; true = lo fijó el estimador.';
COMMENT ON COLUMN est_estimado_items.dias_instalacion IS
  'Días de instalación de ESTE ítem. El total del proyecto es la suma. Si dias_instalacion_manual es false, lo calcula la regla.';

-- Los días dejan de ser una perilla del proyecto: ahora se derivan de los ítems.
DELETE FROM est_estimado_parametros WHERE clave = 'dias_instalacion';
DELETE FROM est_parametros_default  WHERE clave = 'dias_instalacion';
