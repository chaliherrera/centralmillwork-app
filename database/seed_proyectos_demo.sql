-- Seed local: 3 proyectos demo con materiales + OCs en distintos estados
-- para poder probar la vista de detalle.
--
-- NO USAR EN PROD.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- Proyecto 1: HOTEL RIVERA — varios estados, MTO + 1 DIRECTA + 1 URGENTE
-- ──────────────────────────────────────────────────────────────────────
INSERT INTO proyectos (codigo, nombre, cliente, estado, fecha_inicio, fecha_fin_estimada, presupuesto, responsable)
VALUES ('PRY-2026-101', 'Hotel Rivera Lobby Renovation', 'Rivera Hotels Group', 'activo', '2026-03-01', '2026-09-30', 180000, 'Juan Perez')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO proveedores (nombre) VALUES ('OAK SUPPLY CO'),    ('METAL HARDWARE INC'), ('GLASS WORKS LTD') ON CONFLICT DO NOTHING;

INSERT INTO materiales_mto
  (codigo, descripcion, unidad, proyecto_id, vendor, qty, unit_price, total_price, cotizar, estado_cotiz, origen, fecha_importacion, categoria, notas)
SELECT
  v.codigo, v.desc, 'EACH',
  (SELECT id FROM proyectos WHERE codigo = 'PRY-2026-101'),
  v.vendor, v.qty, v.price, v.qty * v.price,
  v.cotizar, v.estado, v.origen, '2026-03-15'::date, v.cat, v.notas
FROM (VALUES
  ('CM-101-001', 'Roble blanco 4x8',          'OAK SUPPLY CO',   25, 120.00, 'SI',       'COTIZADO',  'MTO',     'MILLWORK', NULL),
  ('CM-101-002', 'Nogal 4x8',                 'OAK SUPPLY CO',   12, 180.00, 'SI',       'COTIZADO',  'MTO',     'MILLWORK', NULL),
  ('CM-101-003', 'Bisagra dorada 4 pulgadas', 'METAL HARDWARE INC', 100, 4.50, 'SI',     'COTIZADO',  'MTO',     'HARDWARE', NULL),
  ('CM-101-004', 'Cerradura puerta principal','METAL HARDWARE INC', 20, 35.00, 'SI',     'PENDIENTE', 'MTO',     'HARDWARE', 'Pendiente cotizar con segundo vendor'),
  ('NC-101-005', 'Tornillos M6 caja',         'STOCK INTERNO',   50, 12.00,  'EN_STOCK', 'EN_STOCK',  'MTO',     NULL,       NULL),
  ('CM-101-006', 'Espejo bisel 60x80',        'GLASS WORKS LTD',  8, 220.00, 'NO',       'PENDIENTE', 'MTO',     'GLASS',    'Cliente prefiere espejos en obra'),
  ('CM-101-007', 'Vidrio templado 6mm',       'GLASS WORKS LTD', 15, 95.00,  'SI',       'COTIZADO',  'MTO',     'GLASS',    NULL)
) AS v(codigo, "desc", vendor, qty, price, cotizar, estado, origen, cat, notas)
ON CONFLICT (codigo) DO NOTHING;

-- OC 1 enviada (con OAK SUPPLY CO)
DO $$
DECLARE v_proy INT; v_prov INT; v_oc INT; v_sub NUMERIC := 0;
BEGIN
  SELECT id INTO v_proy FROM proyectos WHERE codigo='PRY-2026-101';
  SELECT id INTO v_prov FROM proveedores WHERE nombre='OAK SUPPLY CO';

  INSERT INTO ordenes_compra (numero, proyecto_id, proveedor_id, estado, fecha_emision, fecha_entrega_estimada, fecha_mto, categoria, origen, freight)
  VALUES ('OC-2026-1001', v_proy, v_prov, 'enviada', '2026-04-02', '2026-05-15', '2026-03-15', 'MILLWORK', 'MTO', 350)
  ON CONFLICT (numero) DO NOTHING
  RETURNING id INTO v_oc;
  IF v_oc IS NULL THEN RETURN; END IF;

  INSERT INTO items_orden_compra (orden_compra_id, material_id, descripcion, unidad, cantidad, precio_unitario)
  SELECT v_oc, m.id, m.descripcion, m.unidad, m.qty, m.unit_price
  FROM materiales_mto m WHERE m.proyecto_id=v_proy AND m.vendor='OAK SUPPLY CO' AND m.cotizar='SI';

  SELECT SUM(qty*unit_price) INTO v_sub FROM materiales_mto WHERE proyecto_id=v_proy AND vendor='OAK SUPPLY CO' AND cotizar='SI';
  UPDATE ordenes_compra SET subtotal=v_sub, total=v_sub+350 WHERE id=v_oc;
  UPDATE materiales_mto SET estado_cotiz='ORDENADO' WHERE proyecto_id=v_proy AND vendor='OAK SUPPLY CO' AND cotizar='SI';
END $$;

-- OC 2 recibida (con METAL HARDWARE — la mayoría)
DO $$
DECLARE v_proy INT; v_prov INT; v_oc INT; v_rec INT; v_sub NUMERIC := 0;
BEGIN
  SELECT id INTO v_proy FROM proyectos WHERE codigo='PRY-2026-101';
  SELECT id INTO v_prov FROM proveedores WHERE nombre='METAL HARDWARE INC';

  INSERT INTO ordenes_compra (numero, proyecto_id, proveedor_id, estado, fecha_emision, fecha_entrega_estimada, fecha_entrega_real, fecha_mto, categoria, origen, freight, notas)
  VALUES ('OC-2026-1002', v_proy, v_prov, 'recibida', '2026-04-05', '2026-04-20', '2026-04-22', '2026-03-15', 'HARDWARE', 'MTO', 80, 'Llegó 2 días tarde')
  ON CONFLICT (numero) DO NOTHING
  RETURNING id INTO v_oc;
  IF v_oc IS NULL THEN RETURN; END IF;

  INSERT INTO items_orden_compra (orden_compra_id, material_id, descripcion, unidad, cantidad, precio_unitario)
  SELECT v_oc, m.id, m.descripcion, m.unidad, m.qty, m.unit_price
  FROM materiales_mto m WHERE m.proyecto_id=v_proy AND m.codigo='CM-101-003';

  SELECT SUM(qty*unit_price) INTO v_sub FROM materiales_mto WHERE proyecto_id=v_proy AND codigo='CM-101-003';
  UPDATE ordenes_compra SET subtotal=v_sub, total=v_sub+80 WHERE id=v_oc;
  UPDATE materiales_mto SET estado_cotiz='RECIBIDO' WHERE proyecto_id=v_proy AND codigo='CM-101-003';

  -- recepcion
  INSERT INTO recepciones (folio, orden_compra_id, estado, fecha_recepcion, recibio, notas)
  VALUES ('REC-2026-101A', v_oc, 'completa', '2026-04-22', 'Pedro Lopez', 'Entrega completa, todo OK')
  ON CONFLICT (folio) DO NOTHING;
END $$;

-- OC 3 URGENTE: bisagras de emergencia
DO $$
DECLARE v_proy INT; v_prov INT; v_oc INT; v_mat INT;
BEGIN
  SELECT id INTO v_proy FROM proyectos WHERE codigo='PRY-2026-101';
  SELECT id INTO v_prov FROM proveedores WHERE nombre='METAL HARDWARE INC';

  INSERT INTO ordenes_compra (numero, proyecto_id, proveedor_id, estado, fecha_emision, fecha_entrega_estimada, categoria, origen, freight, notas)
  VALUES ('OC-2026-1003', v_proy, v_prov, 'enviada', '2026-05-10', '2026-05-14', 'HARDWARE', 'URGENTE', 150, 'Rotura en obra, cliente parado esperando')
  ON CONFLICT (numero) DO NOTHING
  RETURNING id INTO v_oc;
  IF v_oc IS NULL THEN RETURN; END IF;

  INSERT INTO materiales_mto (codigo, descripcion, unidad, proyecto_id, vendor, qty, unit_price, total_price, cotizar, estado_cotiz, origen, fecha_importacion, categoria)
  VALUES ('NOMTO-OC-2026-1003-01', 'Bisagra emergencia reemplazo', 'EACH', v_proy, 'METAL HARDWARE INC', 4, 28.00, 112.00, 'SI', 'ORDENADO', 'URGENTE', CURRENT_DATE, 'HARDWARE')
  ON CONFLICT (codigo) DO NOTHING
  RETURNING id INTO v_mat;
  IF v_mat IS NULL THEN RETURN; END IF;

  INSERT INTO items_orden_compra (orden_compra_id, material_id, descripcion, unidad, cantidad, precio_unitario)
  VALUES (v_oc, v_mat, 'Bisagra emergencia reemplazo', 'EACH', 4, 28.00);

  UPDATE ordenes_compra SET subtotal=112, total=262 WHERE id=v_oc;
END $$;

-- ──────────────────────────────────────────────────────────────────────
-- Proyecto 2: OFFICE TOWER — Solo PENDIENTES (sin órdenes aún)
-- ──────────────────────────────────────────────────────────────────────
INSERT INTO proyectos (codigo, nombre, cliente, estado, fecha_inicio, fecha_fin_estimada, presupuesto, responsable)
VALUES ('PRY-2026-102', 'Office Tower Floor 12 Buildout', 'Vertex Capital', 'activo', '2026-04-01', '2026-12-15', 320000, 'Maria Garcia')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO materiales_mto
  (codigo, descripcion, unidad, proyecto_id, vendor, qty, unit_price, total_price, cotizar, estado_cotiz, origen, fecha_importacion, categoria)
SELECT
  v.codigo, v.desc, 'EACH',
  (SELECT id FROM proyectos WHERE codigo = 'PRY-2026-102'),
  v.vendor, v.qty, v.price, v.qty * v.price,
  v.cotizar, v.estado, 'MTO', '2026-04-10'::date, v.cat
FROM (VALUES
  ('CM-102-001', 'Panel acústico 2x4',         'AKUSTIK PRODUCTS', 80, 0.00,  'SI',       'PENDIENTE', 'EDGE BANDING'),
  ('CM-102-002', 'Iluminación LED panel 2x2', 'LIGHT WORLD',      45, 0.00,  'SI',       'PENDIENTE', 'METAL'),
  ('CM-102-003', 'Alfombra modular',           'CARPET CO',         200, 0.00, 'SI',      'PENDIENTE', 'OTHER'),
  ('NC-102-004', 'Cinta doble cara',           'STOCK INTERNO',   15, 8.00,  'EN_STOCK', 'EN_STOCK',  NULL)
) AS v(codigo, "desc", vendor, qty, price, cotizar, estado, cat)
ON CONFLICT (codigo) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────
-- Proyecto 3: RESIDENCIA SMITH — Completado, todo recibido
-- ──────────────────────────────────────────────────────────────────────
INSERT INTO proyectos (codigo, nombre, cliente, estado, fecha_inicio, fecha_fin_estimada, fecha_fin_real, presupuesto, responsable)
VALUES ('PRY-2026-099', 'Residencia Smith Kitchen', 'Family Smith', 'completado', '2026-01-15', '2026-04-30', '2026-04-25', 45000, 'Carlos Mendez')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO proveedores (nombre) VALUES ('GRANITE WORKS'), ('APPLIANCE PRO') ON CONFLICT DO NOTHING;

INSERT INTO materiales_mto
  (codigo, descripcion, unidad, proyecto_id, vendor, qty, unit_price, total_price, cotizar, estado_cotiz, origen, fecha_importacion, categoria)
SELECT
  v.codigo, v.desc, 'EACH',
  (SELECT id FROM proyectos WHERE codigo = 'PRY-2026-099'),
  v.vendor, v.qty, v.price, v.qty * v.price,
  'SI', 'RECIBIDO', 'MTO', '2026-01-20'::date, v.cat
FROM (VALUES
  ('CM-099-001', 'Mesada granito negro',     'GRANITE WORKS',  2, 850.00, 'SOLID WOOD'),
  ('CM-099-002', 'Horno eléctrico 60cm',     'APPLIANCE PRO',  1, 1200.00, 'OTHER'),
  ('CM-099-003', 'Cooktop inducción 60cm',   'APPLIANCE PRO',  1, 850.00, 'OTHER'),
  ('CM-099-004', 'Campana extractora 60cm',  'APPLIANCE PRO',  1, 450.00, 'OTHER')
) AS v(codigo, "desc", vendor, qty, price, cat)
ON CONFLICT (codigo) DO NOTHING;

-- OCs recibidas para el proyecto 099
DO $$
DECLARE v_proy INT; v_prov INT; v_oc INT; v_sub NUMERIC;
BEGIN
  SELECT id INTO v_proy FROM proyectos WHERE codigo='PRY-2026-099';
  SELECT id INTO v_prov FROM proveedores WHERE nombre='GRANITE WORKS';
  INSERT INTO ordenes_compra (numero, proyecto_id, proveedor_id, estado, fecha_emision, fecha_entrega_estimada, fecha_entrega_real, fecha_mto, categoria, origen, freight)
  VALUES ('OC-2026-0991', v_proy, v_prov, 'recibida', '2026-02-01', '2026-02-15', '2026-02-14', '2026-01-20', 'SOLID WOOD', 'MTO', 200)
  ON CONFLICT (numero) DO NOTHING RETURNING id INTO v_oc;
  IF v_oc IS NOT NULL THEN
    INSERT INTO items_orden_compra (orden_compra_id, material_id, descripcion, unidad, cantidad, precio_unitario)
    SELECT v_oc, m.id, m.descripcion, m.unidad, m.qty, m.unit_price FROM materiales_mto m
    WHERE m.proyecto_id=v_proy AND m.vendor='GRANITE WORKS';
    SELECT SUM(qty*unit_price) INTO v_sub FROM materiales_mto WHERE proyecto_id=v_proy AND vendor='GRANITE WORKS';
    UPDATE ordenes_compra SET subtotal=v_sub, total=v_sub+200 WHERE id=v_oc;
    INSERT INTO recepciones (folio, orden_compra_id, estado, fecha_recepcion, recibio, notas)
    VALUES ('REC-2026-099A', v_oc, 'completa', '2026-02-14', 'Carlos Mendez', NULL) ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO v_prov FROM proveedores WHERE nombre='APPLIANCE PRO';
  INSERT INTO ordenes_compra (numero, proyecto_id, proveedor_id, estado, fecha_emision, fecha_entrega_estimada, fecha_entrega_real, fecha_mto, categoria, origen, freight, notas)
  VALUES ('OC-2026-0992', v_proy, v_prov, 'recibida', '2026-02-10', '2026-03-01', '2026-03-05', '2026-01-20', 'OTHER', 'MTO', 180, '1 item llegó dañado, reemplazado luego')
  ON CONFLICT (numero) DO NOTHING RETURNING id INTO v_oc;
  IF v_oc IS NOT NULL THEN
    INSERT INTO items_orden_compra (orden_compra_id, material_id, descripcion, unidad, cantidad, precio_unitario)
    SELECT v_oc, m.id, m.descripcion, m.unidad, m.qty, m.unit_price FROM materiales_mto m
    WHERE m.proyecto_id=v_proy AND m.vendor='APPLIANCE PRO';
    SELECT SUM(qty*unit_price) INTO v_sub FROM materiales_mto WHERE proyecto_id=v_proy AND vendor='APPLIANCE PRO';
    UPDATE ordenes_compra SET subtotal=v_sub, total=v_sub+180 WHERE id=v_oc;
    INSERT INTO recepciones (folio, orden_compra_id, estado, fecha_recepcion, recibio, notas)
    VALUES ('REC-2026-099B', v_oc, 'con_diferencias', '2026-03-05', 'Carlos Mendez', 'Horno con golpe, gestion con vendor por reemplazo') ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Resumen final
DO $$
DECLARE n_proy int; n_mat int; n_oc int;
BEGIN
  SELECT COUNT(*) INTO n_proy FROM proyectos;
  SELECT COUNT(*) INTO n_mat FROM materiales_mto;
  SELECT COUNT(*) INTO n_oc FROM ordenes_compra;
  RAISE NOTICE '[seed] proyectos=% materiales=% ocs=%', n_proy, n_mat, n_oc;
END $$;

COMMIT;
