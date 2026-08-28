-- ─────────────────────────────────────────────────────────────────────────────
-- 059 — Ingeniería: plantilla de ruta (dependencias por TIPO) + re-anclaje día cero
-- ─────────────────────────────────────────────────────────────────────────────
-- Opción B: al confirmar el PM, se genera el ESPEJO COMPLETO del Excel (todas las
-- tareas del catálogo + sus dependencias). Hoy las dependencias solo venían del
-- Excel importado; acá se materializa una plantilla de dependencias ENTRE TIPOS
-- (la ruta canónica de ingeniería), derivada de la plantilla del schedule (046).
--
-- La cadena crítica: field_measurements → shop_drawings → client_review → release
--                    → cnc → fabrication → shipment → installation
-- En paralelo: samples y long_leads (arrancan temprano); material_proc tras la
-- aprobación; stone_* es una rama opcional (solo si el proyecto tiene piedra).
--
-- Todo ADITIVO. No toca el schedule/motor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Plantilla de dependencias entre tipos de tarea de ingeniería
CREATE TABLE IF NOT EXISTS ing_tipo_deps (
  tipo_clave        TEXT NOT NULL,   -- el que depende
  depende_de_clave  TEXT NOT NULL,   -- su predecesor
  tipo              TEXT NOT NULL DEFAULT 'FS',   -- FS/SS/FF/SF
  lag_dias          INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (tipo_clave, depende_de_clave)
);

INSERT INTO ing_tipo_deps (tipo_clave, depende_de_clave) VALUES
  -- cadena de ingeniería
  ('shop_drawings', 'field_measurements'),
  ('client_review', 'shop_drawings'),
  ('client_review', 'samples'),          -- el cliente aprueba planos habiendo visto muestras
  ('release',       'client_review'),
  ('cnc',           'release'),
  ('material_proc', 'client_review'),     -- compra tras aprobación
  -- aguas abajo (se generan pero el PM las poda / las mide el taller)
  ('fabrication',   'cnc'),
  ('fabrication',   'material_proc'),
  ('fabrication',   'long_leads'),
  ('shipment',      'fabrication'),
  ('installation',  'shipment'),
  -- rama piedra (solo si el proyecto tiene stone_total)
  ('stone_fab',     'stone_measure'),
  ('stone_install', 'stone_fab')
ON CONFLICT (tipo_clave, depende_de_clave) DO NOTHING;
-- Raíces (sin predecesor): field_measurements, samples, long_leads, stone_measure.

-- 2) Re-anclaje del día cero a la firma: guardamos el inicio original para poder
--    mostrar cuánta holgura se comió la demora del cliente (envío → firma).
ALTER TABLE ing_proyectos
  ADD COLUMN IF NOT EXISTS fecha_inicio_original DATE;
COMMENT ON COLUMN ing_proyectos.fecha_inicio_original IS
  'Inicio del plan cuando se generó (pre-firma). Al firmar, fecha_inicio se re-ancla a la firma; el delta documenta la demora del cliente.';
