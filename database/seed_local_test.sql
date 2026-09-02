-- Seed local para probar Problemas A/B (Bug fix cotizar='SI' + estados ORDENADO/RECIBIDO).
-- Este script asume que migrations 001-013 + 019 ya corrieron (con errores tolerados
-- por columnas faltantes). Completa lo que falta y mete fixtures que reproducen el bug.
--
-- NO USAR EN PROD — solo desarrollo local.

BEGIN;

-- ─── 1. Completar columnas faltantes en materiales_mto ──────────────────────
ALTER TABLE materiales_mto
  ADD COLUMN IF NOT EXISTS proyecto_id       INT REFERENCES proyectos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item              VARCHAR(50)  DEFAULT '',
  ADD COLUMN IF NOT EXISTS vendor_code       VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS vendor            VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS color             VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS size              VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS qty               NUMERIC(12,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price        NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_price       NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mill_made         VARCHAR(5)   DEFAULT 'NO',
  ADD COLUMN IF NOT EXISTS estado_cotiz      VARCHAR(20)  DEFAULT 'PENDIENTE';

-- ─── 2. Fixtures: proyecto + proveedor ──────────────────────────────────────
INSERT INTO proyectos (codigo, nombre, cliente, estado)
VALUES ('PRY-TEST-001', 'Proyecto de prueba local', 'Cliente Test', 'activo')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO proveedores (nombre)
VALUES ('VENDOR-ACME')
ON CONFLICT DO NOTHING;

-- ─── 3. Materiales — mezcla de cotizar SI/NO/EN_STOCK en el mismo batch ─────
-- Mismo proyecto + mismo vendor + misma fecha_importacion → todos caen en la
-- misma "batch query" de la OC. El bug del Problema A debería incluir TODOS,
-- pero con el fix solo deberían aparecer los cotizar='SI'.

INSERT INTO materiales_mto
  (codigo, descripcion, unidad, proyecto_id, vendor, qty, unit_price, total_price,
   cotizar, estado_cotiz, fecha_importacion)
SELECT
  v.codigo, v.descripcion, 'EACH',
  (SELECT id FROM proyectos WHERE codigo = 'PRY-TEST-001'),
  'VENDOR-ACME',
  v.qty, v.unit_price, v.qty * v.unit_price,
  v.cotizar, v.estado, '2026-05-01'::date
FROM (VALUES
  ('TEST-001', 'Madera roble 1m x 2m',     10, 50.00, 'SI',       'COTIZADO'),
  ('TEST-002', 'Madera nogal 1m x 2m',      5, 75.00, 'SI',       'COTIZADO'),
  ('TEST-003', 'Bisagra metal 4 pulgadas', 30,  3.50, 'SI',       'COTIZADO'),
  ('TEST-004', 'Tornillos M6 caja',         2, 12.00, 'NO',       'PENDIENTE'),
  ('NC-005',   'Cola blanca 1L (stock)',    8,  8.00, 'EN_STOCK', 'EN_STOCK'),
  ('NC-006',   'Lija grano 120 (stock)',   20,  1.50, 'EN_STOCK', 'EN_STOCK'),
  ('TEST-007', 'Barniz 1L (sin precio)',    4,  0.00, 'SI',       'PENDIENTE')
) AS v(codigo, descripcion, qty, unit_price, cotizar, estado)
ON CONFLICT (codigo) DO NOTHING;

-- ─── 4. Crear una OC con SOLO los materiales cotizar='SI' AND estado='COTIZADO' ──
-- Esto simula una OC creada vía el flujo correcto (generarOCs) — pero el bug
-- está en cómo se VISUALIZA: la batch view muestra de más.
DO $$
DECLARE
  v_prov_id    INT;
  v_proy_id    INT;
  v_oc_id      INT;
  v_mat_id     INT;
  v_subtotal   NUMERIC := 0;
BEGIN
  SELECT id INTO v_prov_id FROM proveedores WHERE nombre = 'VENDOR-ACME' LIMIT 1;
  SELECT id INTO v_proy_id FROM proyectos    WHERE codigo = 'PRY-TEST-001';

  INSERT INTO ordenes_compra
    (numero, proyecto_id, proveedor_id, estado, fecha_emision, fecha_mto, categoria)
  VALUES
    ('OC-TEST-0001', v_proy_id, v_prov_id, 'enviada', CURRENT_DATE, '2026-05-01', 'MILLWORK')
  ON CONFLICT (numero) DO NOTHING
  RETURNING id INTO v_oc_id;

  IF v_oc_id IS NOT NULL THEN
    -- Insertar items SOLO para cotizar='SI' AND estado_cotiz='COTIZADO'
    FOR v_mat_id IN
      SELECT id FROM materiales_mto
      WHERE proyecto_id = v_proy_id
        AND vendor = 'VENDOR-ACME'
        AND cotizar = 'SI'
        AND estado_cotiz = 'COTIZADO'
    LOOP
      INSERT INTO items_orden_compra
        (orden_compra_id, material_id, descripcion, unidad, cantidad, precio_unitario)
      SELECT v_oc_id, id, descripcion, unidad, qty, unit_price
      FROM materiales_mto WHERE id = v_mat_id;

      SELECT v_subtotal + (qty * unit_price) INTO v_subtotal
      FROM materiales_mto WHERE id = v_mat_id;
    END LOOP;

    UPDATE ordenes_compra
    SET subtotal = v_subtotal,
        iva      = v_subtotal * 0.16,
        total    = v_subtotal * 1.16
    WHERE id = v_oc_id;
  END IF;
END $$;

-- ─── 5. Resumen — qué quedó ─────────────────────────────────────────────────
DO $$
DECLARE
  n_mat int; n_oc int; n_items int;
BEGIN
  SELECT COUNT(*) INTO n_mat   FROM materiales_mto WHERE proyecto_id IN (SELECT id FROM proyectos WHERE codigo = 'PRY-TEST-001');
  SELECT COUNT(*) INTO n_oc    FROM ordenes_compra WHERE numero = 'OC-TEST-0001';
  SELECT COUNT(*) INTO n_items FROM items_orden_compra ioc JOIN ordenes_compra oc ON oc.id = ioc.orden_compra_id WHERE oc.numero = 'OC-TEST-0001';
  RAISE NOTICE '[seed] Materiales del proyecto: %', n_mat;
  RAISE NOTICE '[seed] OCs creadas: %', n_oc;
  RAISE NOTICE '[seed] Items en la OC: % (debería ser 3 — solo cotizar=SI+COTIZADO)', n_items;
END $$;

COMMIT;

-- Verificación: distribución por cotizar/estado_cotiz
SELECT cotizar, estado_cotiz, COUNT(*) AS n
FROM materiales_mto
WHERE proyecto_id IN (SELECT id FROM proyectos WHERE codigo = 'PRY-TEST-001')
GROUP BY cotizar, estado_cotiz
ORDER BY cotizar, estado_cotiz;
