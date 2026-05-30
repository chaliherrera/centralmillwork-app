-- ============================================================================
-- Layout del taller v2
-- ============================================================================
-- Cambios respecto al seed inicial (017):
--   1. Se elimina `boot_pintura` (era referencia visual del spec, no estación real)
--   2. Se renombra `packing` → `registro` (terminología local)
--   3. Se reposicionan estaciones en grilla 4×5 según layout definitivo:
--
--          col 1            col 2          col 3          col 4
--   y=1   CNC              JUAN           PINTURA        FINAL
--   y=2   EDGE BANDING     ROLANDO        LÁMINA         REGISTRO
--   y=3   (vacío)          LUIS           (vacío)        SHIPPING
--   y=4   (vacío)          RUBÉN          (vacío)        (vacío)
--   y=5   (vacío)          DILAN          (vacío)        (vacío)
--
--   La columna 2 (assembly) se renderiza como una celda por carpintero,
--   por eso assembly tiene posicion_x/y NULL — el frontend ubica los
--   carpinteros en (2, 1..N) ordenados por personal_id ASC.
-- ============================================================================

-- 1. Limpiar boot_pintura — borrar de todas las tablas que pudieran referenciarla
DELETE FROM orden_procesos       WHERE estacion = 'boot_pintura';
DELETE FROM personal_estaciones  WHERE estacion = 'boot_pintura';
DELETE FROM estaciones_distancias
  WHERE estacion_origen = 'boot_pintura' OR estacion_destino = 'boot_pintura';
DELETE FROM estaciones_config    WHERE nombre = 'boot_pintura';

-- 2. Renombrar packing → registro en TODAS las tablas que lo referencien
UPDATE estaciones_config       SET nombre = 'registro'           WHERE nombre = 'packing';
UPDATE estaciones_distancias   SET estacion_origen = 'registro'  WHERE estacion_origen = 'packing';
UPDATE estaciones_distancias   SET estacion_destino = 'registro' WHERE estacion_destino = 'packing';
UPDATE personal_estaciones     SET estacion = 'registro'         WHERE estacion = 'packing';
UPDATE orden_procesos          SET estacion = 'registro'         WHERE estacion = 'packing';
UPDATE ordenes_produccion      SET estacion_actual = 'registro'  WHERE estacion_actual = 'packing';
UPDATE orden_historial         SET estacion_origen = 'registro'  WHERE estacion_origen = 'packing';
UPDATE orden_historial         SET estacion_destino = 'registro' WHERE estacion_destino = 'packing';
UPDATE qc_inspecciones         SET estacion = 'registro'         WHERE estacion = 'packing';
UPDATE qc_inspecciones         SET estacion_reproceso = 'registro' WHERE estacion_reproceso = 'packing';
UPDATE time_proyectos          SET estacion = 'registro'         WHERE estacion = 'packing';

-- 3. Reposicionar estaciones (layout definitivo)
UPDATE estaciones_config SET posicion_x = 1,    posicion_y = 1    WHERE nombre = 'cnc';
UPDATE estaciones_config SET posicion_x = 1,    posicion_y = 2    WHERE nombre = 'edge_banding';
UPDATE estaciones_config SET posicion_x = 3,    posicion_y = 1    WHERE nombre = 'pintura';
UPDATE estaciones_config SET posicion_x = 3,    posicion_y = 2    WHERE nombre = 'lamina';
UPDATE estaciones_config SET posicion_x = 4,    posicion_y = 1    WHERE nombre = 'final';
UPDATE estaciones_config SET posicion_x = 4,    posicion_y = 2    WHERE nombre = 'registro';
UPDATE estaciones_config SET posicion_x = 4,    posicion_y = 3    WHERE nombre = 'shipping';

-- Assembly: posición NULL — el frontend la renderiza como una celda por carpintero
-- en la columna 2, ordenados por personal_id ASC.
UPDATE estaciones_config SET posicion_x = NULL, posicion_y = NULL WHERE nombre = 'assembly';
