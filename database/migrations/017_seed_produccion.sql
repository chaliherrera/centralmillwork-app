-- ============================================================================
-- Seeds — datos iniciales de producción
-- ============================================================================
-- 1) Catálogo de estaciones del taller
-- 2) Matriz de distancias estimadas (es_estimado = true)
-- 3) 13 personas del taller (SIN PIN — todos en blanco, se asignan desde la UI)
-- 4) Asignaciones personal ↔ estación
--
-- Idempotencia: cada bloque se gatilla solo si la tabla destino está vacía.
-- Volver a correr el archivo no duplica filas.
-- ============================================================================

-- ─── 1. Catálogo de estaciones ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM estaciones_config LIMIT 1) THEN
    INSERT INTO estaciones_config (nombre, tipo, posicion_x, posicion_y, capacidad_max) VALUES
      ('cnc',          'maquinado',  2, 2, 1),
      ('edge_banding', 'maquinado',  2, 3, 1),
      ('lamina',       'acabado',    1, 1, 1),
      ('pintura',      'acabado',    2, 1, 4),
      ('boot_pintura', 'acabado',    3, 1, 1),
      ('final',        'qc',         1, 2, 2),
      ('assembly',     'ensamblaje', 4, 2, 5),
      ('packing',      'logistica',  1, 3, 2),
      ('shipping',     'logistica',  1, 4, 5);
  END IF;
END$$;

-- ─── 2. Distancias entre estaciones (estimadas) ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM estaciones_distancias LIMIT 1) THEN
    INSERT INTO estaciones_distancias
      (estacion_origen, estacion_destino, distancia_metros, tiempo_estimado_seg, es_estimado) VALUES
      ('cnc',          'edge_banding', 3.5, 25, true),
      ('edge_banding', 'assembly',     4.8, 35, true),
      ('assembly',     'lamina',       7.2, 50, true),
      ('assembly',     'pintura',      6.8, 45, true),
      ('lamina',       'final',        4.5, 30, true),
      ('pintura',      'final',        5.1, 35, true),
      ('final',        'packing',      3.2, 20, true),
      ('packing',      'shipping',     1.5, 10, true);
  END IF;
END$$;

-- ─── 3 & 4. Personal del taller + asignaciones ──────────────────────────────
-- Insertamos los 13 operarios y luego sus asignaciones a estaciones.
-- pin_hash = NULL (todos sin PIN — se asignan después desde la UI admin).
-- Usamos `iniciales` como clave natural para hacer las asignaciones.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM personal_taller LIMIT 1) THEN
    INSERT INTO personal_taller (nombre, apellido, iniciales, tipo_personal) VALUES
      -- Maquinado
      ('Victor',   NULL,        'VI', 'operador'),
      -- Lámina
      ('Julio',    'Casillas',  'JC', 'operador'),
      -- Pintura (4)
      ('Victor',   'Padilla',   'VP', 'operador'),
      ('Raquel',   'González',  'RG', 'operador'),
      ('José',     'Pérez',     'JP', 'operador'),
      ('Elvis',    NULL,        'EL', 'operador'),
      -- Assembly (5)
      ('Juan',     NULL,        'JU', 'carpintero'),
      ('Rolando',  NULL,        'RO', 'carpintero'),
      ('Luis',     NULL,        'LU', 'carpintero'),
      ('Rubén',    NULL,        'RU', 'carpintero'),
      ('Dilan',    NULL,        'DI', 'carpintero'),
      -- Final QC (2)
      ('Renny',    'Hernández', 'RH', 'inspector'),
      ('Jhonatan', NULL,        'JH', 'inspector');

    -- Asignaciones por estación (referenciando por iniciales, no por id)

    -- Victor: CNC (principal) + Edge Banding (secundaria)
    INSERT INTO personal_estaciones (personal_id, estacion, es_estacion_principal, capacidad_max)
      SELECT id, 'cnc',          true,  1 FROM personal_taller WHERE iniciales = 'VI';
    INSERT INTO personal_estaciones (personal_id, estacion, es_estacion_principal, capacidad_max)
      SELECT id, 'edge_banding', false, 1 FROM personal_taller WHERE iniciales = 'VI';

    -- Julio Casillas: Lámina
    INSERT INTO personal_estaciones (personal_id, estacion, es_estacion_principal, capacidad_max)
      SELECT id, 'lamina', true, 1 FROM personal_taller WHERE iniciales = 'JC';

    -- Pintores (4): todos en pintura
    INSERT INTO personal_estaciones (personal_id, estacion, es_estacion_principal, capacidad_max)
      SELECT id, 'pintura', true, 4
      FROM personal_taller WHERE iniciales IN ('VP','RG','JP','EL');

    -- Carpinteros (5): todos en assembly, capacidad 3 c/u
    INSERT INTO personal_estaciones (personal_id, estacion, es_estacion_principal, capacidad_max)
      SELECT id, 'assembly', true, 3
      FROM personal_taller WHERE iniciales IN ('JU','RO','LU','RU','DI');

    -- Inspectores (2): Final QC
    INSERT INTO personal_estaciones (personal_id, estacion, es_estacion_principal, capacidad_max)
      SELECT id, 'final', true, 2
      FROM personal_taller WHERE iniciales IN ('RH','JH');
  END IF;
END$$;
