-- 103_estimados_estimado.sql
-- Bloque 2 del motor de costeo: el ESTIMADO de un proyecto.
--
-- Hoy esto es la hoja "Price Model" (100 bloques de 28 filas, de los que se usan
-- 3) más "Item Matrix", "CALCULATORS" y "Estimate". Acá pasa a ser data.
--
-- DECISIÓN A (Chali, 2026-10-01) — congelado vs recálculo:
--   · 'borrador'            → lee el catálogo VIVO y se recalcula solo. Un cambio
--                             de costo se refleja sin tocar nada. Es lo que Chali
--                             pidió.
--   · 'enviado' | 'aceptado' → CONGELADO. Guarda sus propios precios unitarios, su
--                             tarifa y su versión de catálogo. Un precio ya
--                             prometido a un GC no se puede mover solo.
--   · 'perdido'             → congelado igual, para poder analizarlo después.
-- Y un "¿qué saldría hoy?" se responde comparando los congelados contra la vista
-- del catálogo vivo, sin tocar el original.
--
-- LO QUE SE AGREGA Y HOY NO EXISTE: la trazabilidad de la medida. En el Excel la
-- cantidad se tipea como aritmética suelta dentro de la celda —=(4.17*2*2)+(3.25*2)—
-- y no queda rastro de contra qué se midió. Acá la cantidad guarda su expresión,
-- de dónde salió y en qué hoja del plano. Idempotente.

-- ─────────────────────────────────────────────────────────────────────────────
-- Cabecera del estimado. Un proyecto puede tener varios drafts.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS est_estimados (
  id                  SERIAL PRIMARY KEY,
  codigo              TEXT NOT NULL,                 -- el código del proyecto
  nombre              TEXT NOT NULL,                 -- el nombre del proyecto
  ubicacion           TEXT,
  gc                  TEXT,                          -- general contractor
  gc_contacto         TEXT,
  estimador           TEXT,
  proyecto_id         INT,                           -- FK blanda a proyectos

  draft               INT NOT NULL DEFAULT 1,
  estado              TEXT NOT NULL DEFAULT 'borrador'
                        CHECK (estado IN ('borrador','enviado','aceptado','perdido')),

  print_set_fecha     DATE,                          -- el set de planos sobre el que se cotizó
  presentado_en       DATE,

  -- Congelados al salir de 'borrador' (ver vista est_estimado_componente_calc)
  catalogo_version_id INT REFERENCES est_catalogo_versiones(id),
  tarifa_taller       NUMERIC(12,4),
  congelado_en        TIMESTAMPTZ,
  total               NUMERIC(14,2),
  cogs_total          NUMERIC(14,2),
  horas_taller        NUMERIC(12,2),

  nota                TEXT,
  creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (codigo, draft),

  -- Un estimado fuera de borrador tiene que tener sus números clavados.
  CONSTRAINT est_estimados_congelado_completo
    CHECK (estado = 'borrador' OR (congelado_en IS NOT NULL AND tarifa_taller IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS est_estimados_codigo_idx ON est_estimados (codigo);
CREATE INDEX IF NOT EXISTS est_estimados_estado_idx ON est_estimados (estado);

-- ─────────────────────────────────────────────────────────────────────────────
-- Los ítems: lo que el cliente reconoce ("Kitchen Island"). Las cinco líneas de
-- narrativa son las que hoy se tipean a mano en la hoja Estimate y pueden
-- desincronizarse del modelo; acá las cantidades NO se repiten en texto, se
-- derivan de los componentes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS est_estimado_items (
  id            SERIAL PRIMARY KEY,
  estimado_id   INT NOT NULL REFERENCES est_estimados(id) ON DELETE CASCADE,
  n             INT NOT NULL,                   -- número de ítem en la propuesta
  nombre        TEXT NOT NULL,
  ref_plano     TEXT,                           -- '6,7/A04.01'
  unidades      INT  NOT NULL DEFAULT 1 CHECK (unidades >= 0),  -- 0 = removido del alcance

  descripcion   TEXT,
  acabados      TEXT,
  herrajes      TEXT,
  exclusiones   TEXT,

  -- Días de instalación. La regla implícita es cierto monto de producto por día
  -- (el monto es una perilla, no vive en el repo: ver migración 114).
  -- Se guarda lo SUGERIDO y lo PUESTO para que el override quede visible: en el
  -- un proyecto real el estimador pisó la regla y eso movió el 6% del total.
  dias_instalacion           NUMERIC(8,2) NOT NULL DEFAULT 0,
  dias_instalacion_sugerido  NUMERIC(8,2),
  dias_instalacion_motivo    TEXT,

  orden         INT,
  UNIQUE (estimado_id, n)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Los componentes: receta + cantidad. Es el único lugar donde entra el plano.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS est_estimado_componentes (
  id               SERIAL PRIMARY KEY,
  item_id          INT NOT NULL REFERENCES est_estimado_items(id) ON DELETE CASCADE,
  receta_id        INT NOT NULL REFERENCES est_recetas(id),
  cantidad_unidad  NUMERIC(16,6) NOT NULL CHECK (cantidad_unidad >= 0),
  cantidad_expr    TEXT,                        -- '(4.17*2*2)+(3.25*2)' tal como se tipeó
  margen_override  NUMERIC(6,4) CHECK (margen_override IS NULL
                                       OR (margen_override >= 0 AND margen_override < 1)),

  -- Trazabilidad de la medida (lo que hoy se pierde)
  origen_medida    TEXT CHECK (origen_medida IN ('cota_plano','medido','bluebeam','manual','supuesto')),
  hoja_plano       TEXT,
  referencia       TEXT,
  nota             TEXT,

  -- Congelados al salir de 'borrador'
  cogs_unidad      NUMERIC(16,6),
  precio_unidad    NUMERIC(16,6),

  orden            INT
);
CREATE INDEX IF NOT EXISTS est_componentes_item_idx   ON est_estimado_componentes (item_id);
CREATE INDEX IF NOT EXISTS est_componentes_receta_idx ON est_estimado_componentes (receta_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Las perillas del proyecto: los 7 calculadores del Excel (instalación, embalaje,
-- flete, planos de taller, verificación en obra, impuesto, flete de material).
-- Clave/valor porque son ~30 y cambian de proyecto a proyecto.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS est_estimado_parametros (
  estimado_id INT  NOT NULL REFERENCES est_estimados(id) ON DELETE CASCADE,
  clave       TEXT NOT NULL,
  valor       TEXT NOT NULL,
  PRIMARY KEY (estimado_id, clave)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- La vista que implementa la DECISIÓN A en un solo lugar: un borrador lee el
-- catálogo vivo, un estimado congelado lee sus propios números. El resto del
-- sistema consulta acá y no se entera de la diferencia.
--
-- `precio_unidad_hoy` siempre trae lo que daría el catálogo actual, así el
-- "¿qué saldría hoy?" es una resta y no hay que recalcular nada aparte.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW est_estimado_componente_calc AS
SELECT
  c.id,
  c.item_id,
  i.estimado_id,
  i.n                AS item_n,
  i.nombre           AS item_nombre,
  i.unidades,
  c.receta_id,
  rp.descripcion     AS receta,
  rp.grupo,
  rp.unidad,
  c.cantidad_unidad,
  c.cantidad_unidad * i.unidades AS cantidad_total,
  e.estado,

  -- Precio unitario efectivo: congelado si el estimado ya salió de borrador.
  CASE WHEN e.estado = 'borrador'
       THEN CASE WHEN c.margen_override IS NOT NULL
                 THEN rp.cogs_unidad / (1 - c.margen_override)
                 ELSE rp.precio_unidad END
       ELSE c.precio_unidad
  END AS precio_unidad_efectivo,

  CASE WHEN e.estado = 'borrador' THEN rp.cogs_unidad ELSE c.cogs_unidad END
       AS cogs_unidad_efectivo,

  -- Lo que daría el catálogo vivo, siempre. Para el "¿qué saldría hoy?".
  CASE WHEN c.margen_override IS NOT NULL
       THEN rp.cogs_unidad / (1 - c.margen_override)
       ELSE rp.precio_unidad
  END AS precio_unidad_hoy,

  rp.horas_unidad,
  rp.horas_unidad * c.cantidad_unidad * i.unidades AS horas_total,
  rp.fuente_costo,
  c.origen_medida,
  c.hoja_plano
FROM est_estimado_componentes c
JOIN est_estimado_items i ON i.id = c.item_id
JOIN est_estimados      e ON e.id = i.estimado_id
JOIN est_receta_precio  rp ON rp.id = c.receta_id;

COMMENT ON VIEW est_estimado_componente_calc IS
  'Decisión A: un borrador lee el catálogo vivo y se recalcula solo; uno enviado o aceptado lee sus números congelados. precio_unidad_hoy siempre trae el catálogo actual para el "¿qué saldría hoy?".';
COMMENT ON COLUMN est_estimado_componentes.cantidad_expr IS
  'La aritmética tal como la tipeó el estimador, para poder reconstruir de dónde salió la cantidad.';
COMMENT ON COLUMN est_estimado_items.dias_instalacion_sugerido IS
  'Lo que propone la regla de la casa de producto por día. Si difiere de dias_instalacion, hubo una decisión del estimador.';
