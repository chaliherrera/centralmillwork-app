-- Migración 021: renombrar ordenes_produccion.item_nombre → numero_item
--
-- Contexto: el "item" de una orden de producción es SIEMPRE un número (el
-- número de item del MTO importado del Excel), nunca un texto descriptivo.
-- La columna se llamaba `item_nombre` por un diseño inicial que asumía nombres
-- libres ("Puerta 36x80"), pero en la práctica del taller el item es el
-- identificador numérico que matchea con materiales_mto.item.
--
-- Renombrar a `numero_item` deja el nombre alineado con su contenido real y
-- habilita el match directo con el endpoint /api/proyectos/:id/items-readiness
-- (que agrupa materiales por materiales_mto.item).
--
-- Para referencias descriptivas adicionales se usa el campo `especificaciones`.
--
-- NOTA: este módulo (Producción) todavía no está en main ni en Railway prod,
-- así que el rename no afecta ningún ambiente productivo.

ALTER TABLE ordenes_produccion
  RENAME COLUMN item_nombre TO numero_item;

COMMENT ON COLUMN ordenes_produccion.numero_item IS
  'Número de item del MTO al que corresponde esta orden (ej. "1", "2"). '
  'Matchea con materiales_mto.item para resolver readiness de materiales. '
  'Siempre numérico (change orders / samples se abordarán por separado).';
