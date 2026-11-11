-- Prueba de humo del modo híbrido de la migración 102.
--
-- ⚠ Los números de acá son INVENTADOS y redondos a propósito: este repo es público
--   y ningún costo, margen ni tarifa real puede entrar. Sirven sólo para verificar
--   la mecánica, no para cotizar nada.
--
-- Cómo correrlo contra una base descartable:
--     dropdb --if-exists cm_estimados_test && createdb cm_estimados_test
--     psql -q -d cm_estimados_test -f database/migrations/102_estimados_catalogo.sql
--     psql -d cm_estimados_test -f tools/estimados/smoke_modo_hibrido.sql
--
-- Lo que tiene que pasar, en orden:
--   1. receta en 'directo'                    → precio 200,00
--   2. se le carga la composición             → precio SIGUE 200,00, aparece colchón 20,00
--   3. se la pasa a 'calculado'               → precio baja a 160,00
--   4. sube un material                       → el precio se mueve solo
--   5. sube la tarifa de taller               → el precio se mueve solo

BEGIN;

INSERT INTO est_tarifas (clave, valor, vigente_desde) VALUES ('taller', 10.00, '2026-01-01');
INSERT INTO est_grupos  (nombre, margen)              VALUES ('Demo', 0.50);

INSERT INTO est_recetas (descripcion, unidad, grupo_id, horas_unidad, fuente_costo, costo_directo)
  SELECT 'Receta de prueba', 'LF', id, 5.0, 'directo', 50.00 FROM est_grupos WHERE nombre = 'Demo';

\echo '— 1) modo directo: costo 50 + 5hr x 10 = 100 ; precio 100/(1-0,50) = 200'
SELECT fuente_costo, costo_material, cogs_unidad, precio_unidad, colchon
  FROM est_receta_precio WHERE descripcion = 'Receta de prueba';

INSERT INTO est_materiales (descripcion, unidad, costo) VALUES
  ('Material A de prueba', 'EA', 10.00),
  ('Material B de prueba', 'EA',  5.00);
INSERT INTO est_receta_materiales (receta_id, material_id, cantidad)
  SELECT r.id, m.id, v.cant
  FROM est_recetas r, est_materiales m,
       (VALUES ('Material A de prueba', 2.0), ('Material B de prueba', 2.0)) AS v(d, cant)
  WHERE r.descripcion = 'Receta de prueba' AND m.descripcion = v.d;

\echo '— 2) despiezada (2x10 + 2x5 = 30) pero sigue en directo: precio NO se mueve, colchón = 50-30 = 20'
SELECT fuente_costo, costo_material, costo_calculado, colchon, precio_unidad
  FROM est_receta_precio WHERE descripcion = 'Receta de prueba';

UPDATE est_recetas SET fuente_costo = 'calculado' WHERE descripcion = 'Receta de prueba';
\echo '— 3) en calculado: costo 30 + 50 = 80 ; precio 160'
SELECT fuente_costo, costo_material, cogs_unidad, precio_unidad
  FROM est_receta_precio WHERE descripcion = 'Receta de prueba';

UPDATE est_materiales SET costo = 15.00 WHERE descripcion = 'Material A de prueba';
\echo '— 4) sube Material A a 15: costo 40 + 50 = 90 ; precio 180'
SELECT costo_material, cogs_unidad, precio_unidad
  FROM est_receta_precio WHERE descripcion = 'Receta de prueba';

UPDATE est_tarifas SET vigente_hasta = '2026-06-30' WHERE clave = 'taller' AND vigente_hasta IS NULL;
INSERT INTO est_tarifas (clave, valor, vigente_desde) VALUES ('taller', 12.00, '2026-07-01');
\echo '— 5) sube la hora a 12: costo 40 + 60 = 100 ; precio 200'
SELECT tarifa_taller, cogs_unidad, precio_unidad
  FROM est_receta_precio WHERE descripcion = 'Receta de prueba';

ROLLBACK;
