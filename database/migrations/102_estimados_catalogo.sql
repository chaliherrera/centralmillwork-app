-- 102_estimados_catalogo.sql
-- Bloque 1 del motor de costeo de Estimados: la BIBLIOTECA.
--
-- Hoy todo esto vive dentro del Excel de cada proyecto (hoja "Materials Pricing
-- Jun-25 Rev28"), así que cada estimado viaja con su propia copia de los precios
-- y un cambio de costo obliga a tocar archivo por archivo. Acá pasa a ser una
-- fuente única.
--
-- LA REGLA MADRE (es todo el Excel, 45.726 fórmulas, reducido a dos líneas):
--     cogs_unidad   = costo_material + horas_unidad * tarifa_taller
--     precio_unidad = cogs_unidad / (1 - margen_del_grupo)
--
-- MODO HÍBRIDO (decisión de Chali, 2026-10-01). `costo_material` sale de uno de
-- dos lados según `fuente_costo`:
--   · 'directo'   → el número cargado a mano. Es lo que hace el Excel hoy y lleva
--                   el colchón adentro (los precios están inflados a propósito
--                   para que un cambio de costo no obligue a recotizar).
--   · 'calculado' → la suma de su composición en est_receta_materiales. Cambiás
--                   el costo de una placa en un solo lugar y se mueven todas las
--                   recetas que la usan.
-- Las dos conviven. Se migra receta por receta, por plata, y el sistema funciona
-- todo el tiempo. De las 150 recetas con precio del catálogo actual, 75 se compran
-- tal cual (hardware, placas, laminados: la receta ES un material) y 75 llevan
-- mano de obra y hay que despiezarlas.
--
-- EL COLCHÓN queda medible sin que nada cambie de precio: si una receta tiene
-- composición cargada PERO sigue cotizando en 'directo', la vista expone la
-- diferencia entre los dos costos. Recién cuando alguien la pasa a 'calculado'
-- el precio se mueve. Idempotente.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tarifas. Un solo lugar: si sube la hora de taller, se mueve todo el catálogo.
-- (En el Excel la tarifa NO movía nada: el COGS estaba escrito a mano y la tarifa
--  sólo servía para despejar el material hacia atrás.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS est_tarifas (
  id             SERIAL PRIMARY KEY,
  clave          TEXT        NOT NULL,          -- 'taller' | 'instalacion'
  valor          NUMERIC(12,4) NOT NULL CHECK (valor >= 0),
  vigente_desde  DATE        NOT NULL,
  vigente_hasta  DATE,                          -- NULL = vigente hoy
  nota           TEXT,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS est_tarifas_vigente_uq
  ON est_tarifas (clave) WHERE vigente_hasta IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grupos de margen. El margen se aplica como DIVISOR, no como recargo:
-- /(1-m) da m real sobre venta; *(1+m) daría menos. El Excel lo hace bien.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS est_grupos (
  id      SERIAL PRIMARY KEY,
  nombre  TEXT NOT NULL UNIQUE,
  margen  NUMERIC(6,4) NOT NULL CHECK (margen >= 0 AND margen < 1),
  activo  BOOLEAN NOT NULL DEFAULT TRUE,
  orden   INT
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Materiales: los insumos que realmente se compran. HOY NO EXISTEN como entidad
-- (el Excel sólo tiene el costo agregado de la receta). Es la tabla que habilita
-- "cambio el precio de la placa en un lugar y se mueve todo".
-- `costo_origen` deja ver si el número es del catálogo del proveedor, de una
-- cotización, o del costo REAL de una OC/recepción — que es lo que después mide
-- el colchón contra la realidad.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS est_materiales (
  id            SERIAL PRIMARY KEY,
  codigo        TEXT UNIQUE,
  descripcion   TEXT NOT NULL,
  unidad        TEXT NOT NULL,                  -- EA / SF / LF / BF / GL
  -- No todo lo que entra en una receta se le compra a un proveedor: "Linear
  -- Cutting Cost" es una tarifa de máquina y "Miscelanous Materials" un cajón
  -- de sastre. Sólo los de tipo 'material' se cruzan contra OCs y recepciones.
  tipo          TEXT NOT NULL DEFAULT 'material'
                  CHECK (tipo IN ('material','proceso','varios')),
  costo         NUMERIC(14,6) NOT NULL CHECK (costo >= 0),
  costo_fecha   DATE,
  costo_origen  TEXT CHECK (costo_origen IN ('catalogo','cotizacion','oc','recepcion')),
  proveedor_id  INT,                            -- FK blanda a proveedores
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS est_materiales_desc_idx ON est_materiales (lower(descripcion));

-- ─────────────────────────────────────────────────────────────────────────────
-- Recetas: el catálogo. Cada línea NO es un precio, es una receta — tanto material
-- más tantas horas de taller. Por eso el estimado puede decir "este proyecto son
-- 99,64 horas de fabricación" sin que nadie lo calcule aparte.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS est_recetas (
  id                SERIAL PRIMARY KEY,
  descripcion       TEXT NOT NULL UNIQUE,
  unidad            TEXT,                        -- LF / SF / EA
  grupo_id          INT REFERENCES est_grupos(id),
  -- 8 decimales a propósito: hay recetas con horas periódicas (0,5555… hr/SF).
  -- Con 4 decimales el porteo del proyecto de referencia se iba unos centavos.
  horas_unidad      NUMERIC(14,8) NOT NULL DEFAULT 0 CHECK (horas_unidad >= 0),

  fuente_costo      TEXT NOT NULL DEFAULT 'directo'
                      CHECK (fuente_costo IN ('directo','calculado')),
  costo_directo     NUMERIC(14,6),               -- material con colchón adentro

  -- Casi todas las recetas usan la tarifa de taller vigente. Algunas operaciones
  -- se costean a otra tarifa (ej. "Solid Surface Fabrication Cost" es mano de obra
  -- pura a otra tarifa). Si está cargada, manda sobre est_tarifas para esa receta.
  tarifa_override   NUMERIC(12,4) CHECK (tarifa_override IS NULL OR tarifa_override >= 0),

  material_estandar BOOLEAN NOT NULL DEFAULT FALSE,  -- entra al flete del 8%
  fees_extra        NUMERIC(12,4) NOT NULL DEFAULT 0, -- ship/handling/tax de la línea
  comentario        TEXT,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Una receta que cotiza en 'directo' necesita su número cargado.
  CONSTRAINT est_recetas_directo_con_costo
    CHECK (fuente_costo <> 'directo' OR costo_directo IS NOT NULL)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- La composición. Esta es la tabla que Chali pidió: el dato que hoy NO EXISTE
-- en ningún lado (vive en la cabeza de quien armó el catálogo).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS est_receta_materiales (
  id          SERIAL PRIMARY KEY,
  receta_id   INT NOT NULL REFERENCES est_recetas(id)    ON DELETE CASCADE,
  material_id INT NOT NULL REFERENCES est_materiales(id) ON DELETE RESTRICT,
  cantidad    NUMERIC(14,6) NOT NULL CHECK (cantidad > 0),
  nota        TEXT,
  UNIQUE (receta_id, material_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Versiones del catálogo. Un estimado enviado queda clavado a la versión con la
-- que se armó, para poder responder "¿con qué costos cotizamos esto?".
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS est_catalogo_versiones (
  id        SERIAL PRIMARY KEY,
  nombre    TEXT NOT NULL UNIQUE,                -- 'Jun-25 Rev28'
  fecha     DATE NOT NULL,
  nota      TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- La vista que resuelve el modo híbrido en UN solo lugar. Todo el resto del
-- sistema lee de acá y no se entera de si la receta está despiezada o no.
--
--   costo_material  → el que se usa para cotizar, según fuente_costo
--   costo_calculado → lo que da la composición (NULL si no está despiezada)
--   colchon         → la diferencia, visible sin que nada cambie de precio
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW est_receta_costo AS
SELECT
  r.id,
  r.descripcion,
  r.unidad,
  r.grupo_id,
  g.nombre  AS grupo,
  g.margen,
  r.horas_unidad,
  r.tarifa_override,
  r.fuente_costo,
  r.costo_directo,
  comp.costo_calculado,
  CASE WHEN r.fuente_costo = 'calculado'
       THEN COALESCE(comp.costo_calculado, 0)
       ELSE COALESCE(r.costo_directo, 0)
  END AS costo_material,
  CASE WHEN comp.costo_calculado IS NOT NULL AND r.costo_directo IS NOT NULL
       THEN r.costo_directo - comp.costo_calculado
  END AS colchon,
  r.material_estandar,
  r.fees_extra,
  r.activo
FROM est_recetas r
LEFT JOIN est_grupos g ON g.id = r.grupo_id
LEFT JOIN LATERAL (
  SELECT SUM(rm.cantidad * m.costo) AS costo_calculado
  FROM est_receta_materiales rm
  JOIN est_materiales m ON m.id = rm.material_id
  WHERE rm.receta_id = r.id
) comp ON TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- La vista de precio: aplica la regla madre con la tarifa de taller VIGENTE.
-- Un estimado en borrador lee de acá y se recalcula solo. Uno enviado o aceptado
-- NO: guarda sus propios números congelados (ver migración 103).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW est_receta_precio AS
SELECT
  c.*,
  COALESCE(c.tarifa_override, t.valor) AS tarifa_taller,
  c.costo_material + c.horas_unidad * COALESCE(c.tarifa_override, t.valor) AS cogs_unidad,
  CASE WHEN c.margen IS NULL OR c.margen >= 1 THEN NULL
       ELSE (c.costo_material + c.horas_unidad * COALESCE(c.tarifa_override, t.valor)) / (1 - c.margen)
  END AS precio_unidad
FROM est_receta_costo c
CROSS JOIN LATERAL (
  SELECT valor FROM est_tarifas
  WHERE clave = 'taller' AND vigente_hasta IS NULL
  LIMIT 1
) t;

COMMENT ON VIEW  est_receta_costo  IS 'Resuelve el modo híbrido: de dónde sale el costo de material de cada receta, y cuánto colchón tiene si está despiezada.';
COMMENT ON VIEW  est_receta_precio IS 'La regla madre aplicada con la tarifa de taller vigente. Sólo para estimados en borrador.';
COMMENT ON COLUMN est_recetas.costo_directo IS 'Material con el colchón adentro, como el Excel. Se usa cuando fuente_costo = directo.';
COMMENT ON COLUMN est_recetas.fuente_costo  IS 'directo = número cargado a mano; calculado = suma de est_receta_materiales.';
