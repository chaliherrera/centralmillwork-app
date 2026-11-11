-- 105_estimados_propuesta.sql
-- Lo que falta para poder EMITIR la propuesta que recibe el GC.
--
-- El modelo se armó leyendo el Excel; esta migración se armó leyendo el PDF que
-- se manda de verdad. El documento define qué
-- datos hacen falta, y había seis huecos. Idempotente.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. El encabezado de la propuesta
-- "Proposal based on:" es TEXTO, no una fecha: una propuesta dice "Permit Set
-- Dated <fecha>" y otra "Progress Print Set Dated <fecha> | As Per Client's
-- Request". Se agrega el texto y se deja la fecha para ordenar.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE est_estimados ADD COLUMN IF NOT EXISTS print_set            TEXT;
ALTER TABLE est_estimados ADD COLUMN IF NOT EXISTS gc_email             TEXT;
ALTER TABLE est_estimados ADD COLUMN IF NOT EXISTS gc_telefono          TEXT;
ALTER TABLE est_estimados ADD COLUMN IF NOT EXISTS estimador_email      TEXT;
ALTER TABLE est_estimados ADD COLUMN IF NOT EXISTS estimador_telefono   TEXT;
ALTER TABLE est_estimados ADD COLUMN IF NOT EXISTS estimador_directo    TEXT;

-- La versión de los T&C con la que SALIÓ la propuesta. Importa legalmente: el
-- texto cambia y hay que poder probar cuál aceptó el GC. Se clava al enviar.
ALTER TABLE est_estimados ADD COLUMN IF NOT EXISTS tyc_version          TEXT;

COMMENT ON COLUMN est_estimados.print_set IS
  'Texto del "Proposal based on:" tal como va en la propuesta.';
COMMENT ON COLUMN est_estimados.tyc_version IS
  'Versión de los Términos y Condiciones con la que se envió. Se clava al congelar.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. "Approx. Size" del ítem
-- El bloque de cada ítem en la propuesta tiene CINCO líneas (Description,
-- Approx. Size, Finishes, Hardware, Exclusions) y el modelo tenía cuatro.
-- Approx. Size son las cantidades: "Lower Cabinets=7.3 LF; Countertop=19.24 SF".
-- Hoy se tipean a mano aunque ya están en los componentes — es la doble carga
-- que veníamos arrastrando. Acá se GENERA desde los componentes; esta columna
-- sólo guarda el texto cuando alguien lo quiere escribir distinto.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE est_estimado_items ADD COLUMN IF NOT EXISTS tamanos TEXT;
COMMENT ON COLUMN est_estimado_items.tamanos IS
  'Override del "Approx. Size". NULL = se genera solo desde los componentes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Nombre corto de la receta
-- En la propuesta las cantidades se nombran en cristiano ("Lower Cabinets",
-- "Countertop"), no con el nombre largo del catálogo
-- ('Melamine Interior + Plam Doors "Lower Mid"'). Ese nombre corto no existía.
-- Sirve para dos cosas: armar el Approx. Size y buscar más rápido en la pantalla.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE est_recetas ADD COLUMN IF NOT EXISTS alias TEXT;
COMMENT ON COLUMN est_recetas.alias IS
  'Nombre corto para la propuesta y para buscar. NULL = se usa la descripción.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Las etiquetas de los renglones cambian por proyecto
--   con solid surface: "Millwork & Solid Surface Installation" · "Solid Surface Base Bid"
--   con piedra:        "Millwork Installation"      · "Stone Base Bid Includes Installation"
-- El sistema calcula una etiqueta razonable según lo que tenga el estimado
-- (stone, solid surface, viajes); acá se guarda sólo cuando se quiere otra.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS est_estimado_renglones (
  estimado_id INT  NOT NULL REFERENCES est_estimados(id) ON DELETE CASCADE,
  renglon     INT  NOT NULL CHECK (renglon BETWEEN 1 AND 7),
  etiqueta    TEXT NOT NULL,
  PRIMARY KEY (estimado_id, renglon)
);
COMMENT ON TABLE est_estimado_renglones IS
  'Override de la etiqueta de un renglón. Sin fila, se usa la calculada.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Términos y Condiciones versionados
-- La página 2 de la propuesta dice "Terms and Conditions Version 04/11/2025".
-- El TEXTO no viaja en esta migración: el repo es público y es un documento
-- legal de la empresa. Se carga aparte (tools/estimados/cargar_tyc.py).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS est_tyc_versiones (
  version       TEXT PRIMARY KEY,              -- '04/11/2025', como figura en la hoja
  vigente_desde DATE NOT NULL,
  contenido     TEXT,                          -- se carga fuera del repo
  vigente       BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS est_tyc_vigente_uq
  ON est_tyc_versiones ((TRUE)) WHERE vigente;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Sales tax
-- El estimado que se usó para portar el motor tenía resale certificate y daba
-- cero, así que el renglón nunca se portó. Otra propuesta sí lo cobra.
--
-- LA REGLA NO ES OBVIA: el impuesto NO se cobra sobre los Fabrication Documents.
-- Aplicando la tasa a los 7 renglones el número no da; excluyendo ese renglón
-- cierra al centavo contra la propuesta emitida.
-- Queda como parámetro para no enterrar la regla en el código.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO est_parametros_default
  (clave, etiqueta, ayuda, unidad, tipo, grupo, orden, por_proyecto, requerido, valor)
VALUES
  ('resale_certificate','¿El GC presentó resale certificate?',
   'Con certificado no se cobra sales tax: la hoja dice "RESALE TAX PROVIDED".',
   NULL,'si_no','impuestos',15,TRUE,FALSE,'NO'),
  ('renglones_sin_impuesto','Renglones exentos de sales tax',
   'Números de renglón que no pagan impuesto. Los planos de taller son un servicio.',
   NULL,'numero','impuestos',30,FALSE,FALSE,'6')
ON CONFLICT (clave) DO UPDATE SET
  etiqueta = EXCLUDED.etiqueta, ayuda = EXCLUDED.ayuda, tipo = EXCLUDED.tipo,
  grupo = EXCLUDED.grupo, orden = EXCLUDED.orden,
  por_proyecto = EXCLUDED.por_proyecto, requerido = EXCLUDED.requerido,
  valor = COALESCE(est_parametros_default.valor, EXCLUDED.valor);
