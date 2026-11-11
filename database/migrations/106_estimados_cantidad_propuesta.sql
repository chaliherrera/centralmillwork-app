-- 106_estimados_cantidad_propuesta.sql
-- La cantidad que ve el CLIENTE puede no ser la que se usa para costear.
--
-- Caso real: una línea de estantes se cotiza por los pies de ESTANTE (11,6 pies
-- de corrida × 2 estantes = 23,18 LF) pero en la propuesta siempre se escribió
-- la corrida: "Shelves=11.6 LF". El precio está bien; lo que cambia es cómo se
-- describe el alcance.
--
-- DECISIÓN DE CHALI (2026-10-26): al GC se le muestran los PIES DE CORRIDA.
-- Para casi todas las recetas la cantidad de costeo YA es la corrida (un pie
-- lineal de bajo mesada es un pie de corrida), así que el default sirve; la
-- excepción son los estantes, donde hace falta decirlo.
--
-- ⚠ Chali pidió dejarlo anotado por si en el futuro se decide mostrar la
-- cantidad de costeo: alcanza con ignorar esta columna en tamanosSugeridos().
-- Idempotente.

ALTER TABLE est_estimado_componentes
  ADD COLUMN IF NOT EXISTS cantidad_propuesta NUMERIC(16,6)
    CHECK (cantidad_propuesta IS NULL OR cantidad_propuesta >= 0);

COMMENT ON COLUMN est_estimado_componentes.cantidad_propuesta IS
  'Cantidad que ve el cliente en el "Approx. Size". NULL = la misma que se cotiza. Se usa cuando difieren, como en los estantes (corrida vs. pies de estante).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Los términos de pago del encabezado (50% de depósito, progress payments el 20,
-- saldo antes del envío, validez 30 días). Chali confirmó que son SIEMPRE LOS
-- MISMOS, así que no son un dato del proyecto: viajan con la versión de los T&C,
-- que es el otro texto contractual de la hoja. Se cargan con cargar_tyc.py desde
-- una propuesta emitida — el repo es público y esto es texto de contrato.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE est_tyc_versiones ADD COLUMN IF NOT EXISTS terminos_pago TEXT;
COMMENT ON COLUMN est_tyc_versiones.terminos_pago IS
  'Los puntos del bloque TERMS del encabezado, uno por línea. Mismos para todos los proyectos.';
