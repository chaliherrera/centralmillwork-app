-- 114_estimados_dolares_por_dia.sql
-- La regla "cierto monto de producto se instala en un día" pasa a ser una
-- perilla, y deja de estar escrita en el código.
--
-- POR QUÉ: el monto estaba como constante en el motor de costeo. Dos problemas.
-- Uno, cambiarlo obligaba a tocar código y volver a deployar, cuando es una
-- decisión de negocio que puede cambiar en cualquier momento. Dos, este repo es
-- público y ese número dice cuánto cobramos de instalación.
--
-- Como el resto de los valores (migración 104), acá viaja sólo la perilla; el
-- monto se carga aparte, desde datos que no están en el repo. Es `requerido`:
-- sin cargar, la regla no propone días —en vez de inventarlos— y el estimado
-- avisa que falta. Los días que el estimador fijó a mano no se tocan nunca.
-- Idempotente.

INSERT INTO est_parametros_default
  (clave, etiqueta, ayuda, unidad, tipo, grupo, orden, por_proyecto, requerido)
VALUES
  ('dolares_por_dia_instalacion','Producto por día de instalación',
   'La regla de la casa: cuánto producto se instala en un día de trabajo. De acá salen los días que se proponen por ítem.',
   'USD','moneda','instalacion',5,FALSE,TRUE)
ON CONFLICT (clave) DO UPDATE SET
  etiqueta     = EXCLUDED.etiqueta,
  ayuda        = EXCLUDED.ayuda,
  unidad       = EXCLUDED.unidad,
  tipo         = EXCLUDED.tipo,
  grupo        = EXCLUDED.grupo,
  orden        = EXCLUDED.orden,
  por_proyecto = EXCLUDED.por_proyecto,
  requerido    = EXCLUDED.requerido;
  -- `valor` NO se pisa: es el default de la casa, cargado aparte.

COMMENT ON COLUMN est_estimado_items.dias_instalacion_manual IS
  'false = sigue la regla de la casa (perilla dolares_por_dia_instalacion) y se recalcula solo; true = lo fijó el estimador.';
