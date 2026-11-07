-- 112_recepcion_cantidades.sql
-- F0 del plan "recepción por CANTIDADES".
-- Columnas ADITIVAS a recepcion_materiales (la tabla viva, booleana). 100% idempotente.
--
-- Regla de diseño: cero riesgo para lo probado.
--   * cantidad_recibida / cantidad_ordenada = NULL  ->  fila LEGADA: se sigue leyendo por
--     el booleano `recibido` (ningún consumidor actual cambia su comportamiento).
--   * Cuando la fila lleva cantidad, el backend calcula el booleano `recibido` con el
--     "puente booleano" (ver utils/recepcionCantidades.ts), así `recibido` conserva su
--     significado histórico ("quedó completo en esta entrega").
--   * SIN backfill: no se parsean notas ni se inventan cantidades para lo viejo.
--
-- Tipo numeric(12,3): mismo que items_orden_compra.cantidad y materiales_mto.qty.

ALTER TABLE recepcion_materiales ADD COLUMN IF NOT EXISTS cantidad_recibida numeric(12,3);
ALTER TABLE recepcion_materiales ADD COLUMN IF NOT EXISTS cantidad_ordenada numeric(12,3);

-- Cantidades nunca negativas (NULL permitido = legado).
ALTER TABLE recepcion_materiales DROP CONSTRAINT IF EXISTS rm_cantidad_recibida_no_negativa;
ALTER TABLE recepcion_materiales ADD CONSTRAINT rm_cantidad_recibida_no_negativa
  CHECK (cantidad_recibida IS NULL OR cantidad_recibida >= 0);

ALTER TABLE recepcion_materiales DROP CONSTRAINT IF EXISTS rm_cantidad_ordenada_no_negativa;
ALTER TABLE recepcion_materiales ADD CONSTRAINT rm_cantidad_ordenada_no_negativa
  CHECK (cantidad_ordenada IS NULL OR cantidad_ordenada >= 0);

-- Índice que hoy NO existe (solo está idx_..._recepcion por id_recepcion) y que necesitan
-- "Por lote", la línea de tiempo y el cálculo del acumulado recibido por material.
CREATE INDEX IF NOT EXISTS idx_recepcion_materiales_material ON recepcion_materiales(id_material);
