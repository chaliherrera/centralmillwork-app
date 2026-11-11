-- 104_estimados_parametros_default.sql
-- Los valores por defecto de los 7 calculadores, y qué significa cada perilla.
--
-- BUG QUE ARREGLA: `crearEstimado` no cargaba ningún parámetro, y el motor usa 0
-- como default. Resultado: un estimado armado desde cero cotizaba SÓLO el mueble
-- y daba cero en instalación, embalaje, flete, planos de taller y verificación en
-- obra. En un proyecto real eso es el 36% del precio, perdido en silencio. No apareció
-- en el porteo porque ahí los parámetros venían del Excel.
--
-- Ahora: cada estimado nuevo nace con los defaults copiados, y el estimador los ajusta
-- por proyecto (decisión de Chali: los parámetros los decide ella).
--
-- LOS VALORES NO VIENEN EN ESTA MIGRACIÓN — el repo es público y las tarifas y
-- los márgenes son información comercial. Acá viaja sólo el CATÁLOGO de perillas
-- (nombre, etiqueta, unidad, tipo, orden). Los números se cargan aparte, desde
-- datos que no están en el repo (tools/estimados/cargar.py). Una perilla
-- requerida sin valor hace que el estimado AVISE en vez de calcular cero.
-- Idempotente.

CREATE TABLE IF NOT EXISTS est_parametros_default (
  clave        TEXT PRIMARY KEY,
  etiqueta     TEXT NOT NULL,                -- lo que lee la persona
  ayuda        TEXT,                         -- aclaración para la UI
  unidad       TEXT,                         -- 'USD' | 'USD/hr' | 'días' | 'millas' | '%' | NULL
  tipo         TEXT NOT NULL CHECK (tipo IN ('numero','moneda','porcentaje','si_no')),
  grupo        TEXT NOT NULL,                -- qué calculador
  orden        INT  NOT NULL DEFAULT 0,
  -- Si cambia proyecto a proyecto va arriba de todo en la pantalla; el resto
  -- es configuración de la casa que casi nunca se toca.
  por_proyecto BOOLEAN NOT NULL DEFAULT FALSE,
  -- Sin valor, el estimado no se puede cotizar bien: el motor avisa.
  requerido    BOOLEAN NOT NULL DEFAULT FALSE,
  valor        TEXT,                         -- el default de la casa (se carga aparte)
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE est_parametros_default IS
  'Catálogo de las perillas de los 7 calculadores. Los VALORES se cargan fuera del repo: son información comercial.';
COMMENT ON COLUMN est_parametros_default.valor IS
  'Default de la casa. NULL = sin cargar; si además es requerido, el estimado avisa en vez de calcular cero.';

INSERT INTO est_parametros_default
  (clave, etiqueta, ayuda, unidad, tipo, grupo, orden, por_proyecto, requerido)
VALUES
  -- ── Instalación (el calculador más pesado: ~27% del total) ──
  ('instalacion_incluida','¿Instalamos nosotros?',NULL,NULL,'si_no','instalacion',10,TRUE ,TRUE ),
  ('proyecto_local','¿Proyecto local?','Fuera de la zona se pagan viáticos, hotel y vuelos.',NULL,'si_no','instalacion',20,TRUE ,TRUE ),
  ('dias_instalacion','Días de instalación','Se sugiere con la regla de la casa de producto por día.','días','numero','instalacion',30,TRUE ,FALSE),
  ('instaladores','Instaladores',NULL,'personas','numero','instalacion',40,TRUE ,TRUE ),
  ('horas_por_dia','Horas por día',NULL,'horas','numero','instalacion',50,FALSE,TRUE ),
  ('tarifa_instalacion','Tarifa de instalación',NULL,'USD/hr','moneda','instalacion',60,FALSE,TRUE ),
  ('millas_ida','Millas hasta la obra',NULL,'millas','numero','instalacion',70,TRUE ,FALSE),
  ('punch_list_dias','Días de punch list',NULL,'días','numero','instalacion',80,TRUE ,FALSE),
  ('viajes_instalacion','Viajes de instalación',NULL,'viajes','numero','instalacion',90,TRUE ,FALSE),
  ('margen_labor_inst','Margen — mano de obra',NULL,'%','porcentaje','instalacion',100,FALSE,TRUE),
  ('margen_viaje_inst','Margen — viaje',NULL,'%','porcentaje','instalacion',110,FALSE,TRUE),
  ('margen_otros_inst','Margen — otros',NULL,'%','porcentaje','instalacion',120,FALSE,TRUE),

  -- ── Embalaje ──
  ('crates','Crates',NULL,'crates','numero','embalaje',10,TRUE ,FALSE),
  ('costo_crate','Costo por crate',NULL,'USD','moneda','embalaje',20,FALSE,TRUE ),
  ('margen_packaging','Margen — embalaje',NULL,'%','porcentaje','embalaje',30,FALSE,TRUE ),

  -- ── Entrega ──
  ('viajes_entrega','Viajes de entrega',NULL,'viajes','numero','entrega',10,TRUE ,FALSE),
  ('camion_base','Camión — base','Tarifa local. Fuera del radio se cobra por milla extra.','USD','moneda','entrega',20,FALSE,TRUE ),
  ('camion_factor','Camión — factor',NULL,NULL,'numero','entrega',30,FALSE,TRUE ),
  ('margen_entrega','Margen — entrega',NULL,'%','porcentaje','entrega',40,FALSE,TRUE ),

  -- ── Planos de taller ──
  ('costo_plano_taller','Costo por plano de taller','Se cobra uno por cada ítem cotizado.','USD','moneda','documentos',10,FALSE,TRUE ),
  ('margen_planos','Margen — planos',NULL,'%','porcentaje','documentos',20,FALSE,TRUE ),

  -- ── Verificación en obra (VIF) ──
  ('vif_incluido','¿Incluye verificación en obra?',NULL,NULL,'si_no','obra',10,TRUE ,TRUE ),
  ('viajes_vif','Viajes de verificación',NULL,'viajes','numero','obra',20,TRUE ,FALSE),
  ('costo_vif','Costo por viaje',NULL,'USD','moneda','obra',30,FALSE,TRUE ),
  ('margen_vif','Margen — verificación',NULL,'%','porcentaje','obra',40,FALSE,TRUE ),

  -- ── Material ──
  ('flete_material_pct','Flete de material estándar','Porcentaje sobre el costo de material, sin la mano de obra.','%','porcentaje','material',10,FALSE,TRUE ),
  ('margen_fees_material','Margen — fees de material',NULL,'%','porcentaje','material',20,FALSE,TRUE ),

  -- ── Impuestos ──
  ('incluir_sales_tax','¿Cobrar sales tax?','Se anula con un resale o tax exempt certificate.',NULL,'si_no','impuestos',10,TRUE ,FALSE),
  ('tasa_sales_tax','Tasa de sales tax',NULL,'%','porcentaje','impuestos',20,TRUE ,FALSE)
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
