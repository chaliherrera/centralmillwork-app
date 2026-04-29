-- ─── Seed: datos de ejemplo ───────────────────────────────────────────────────

-- Usuario admin (password: Admin2026!)
INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES
  ('Administrador', 'admin@centralmillwork.com',
   '$2b$10$XQjp8NxgPZxL2K/FKJVKIeyI/u0jYYFnPP5xEHXNNNhAH.F3gWM.m', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Proveedores de ejemplo
INSERT INTO proveedores (nombre, contacto, email, telefono, rfc) VALUES
  ('Maderas del Norte S.A.', 'Carlos Ramírez', 'ventas@maderasnorte.mx', '81-1234-5678', 'MDN8901014A1'),
  ('Herrajes y Accesorios HYA', 'Laura Vega', 'laura@hya.mx', '55-9876-5432', 'HYA0203055B2'),
  ('Pinturas Corona MX', 'Miguel Flores', 'mflores@corona.mx', '33-4567-8901', 'PCM1105122C3')
ON CONFLICT DO NOTHING;

-- Proyectos de ejemplo
INSERT INTO proyectos (codigo, nombre, cliente, descripcion, estado, fecha_inicio, fecha_fin_estimada, presupuesto, responsable) VALUES
  ('PRY-2026-001', 'Residencia Garza García', 'Familia Rodríguez', 'Closets y cocina integral', 'activo', '2026-01-15', '2026-06-30', 850000, 'Pedro Chali'),
  ('PRY-2026-002', 'Oficinas Corporativas TechMX', 'TechMX S.A. de C.V.', 'Puertas y divisiones de madera', 'activo', '2026-02-01', '2026-07-31', 1200000, 'Pedro Chali'),
  ('PRY-2026-003', 'Hotel Boutique Centro', 'Hotelera del Centro S.C.', 'Lobby y habitaciones VIP', 'cotizacion', '2026-05-01', '2026-12-31', 3500000, 'Pedro Chali')
ON CONFLICT DO NOTHING;

-- Materiales MTO de ejemplo
INSERT INTO materiales_mto (codigo, descripcion, unidad, categoria, precio_referencia) VALUES
  ('MAD-ROBLE-3/4', 'Tablero roble natural 3/4"', 'm²', 'Madera', 420.00),
  ('MAD-MDF-18MM', 'Tablero MDF 18mm crudo', 'm²', 'Madera', 185.00),
  ('MAD-TRIP-9MM', 'Triplay 9mm abedul', 'm²', 'Madera', 140.00),
  ('HRR-BISAGRA-35', 'Bisagra invisible 35mm Blum', 'pza', 'Herrajes', 45.00),
  ('HRR-CORREDERA-500', 'Corredera telescópica 500mm', 'par', 'Herrajes', 220.00),
  ('PIN-SELLADOR', 'Sellador transparente base agua 1L', 'lt', 'Pintura', 95.00)
ON CONFLICT DO NOTHING;
