-- 087_indices_fk_escritorio.sql (Fase B/D, 2026-09-10)
-- Índices sobre FKs sin indexar que usa la query CROSS-PROJECT del escritorio
-- (el "corazón" del sistema: se recorre en cada carga del escritorio de cada rol,
-- + su resolución de predecesores). Hoy hacen seq-scans. Tablas chicas → CREATE
-- INDEX plano (no CONCURRENTLY, para poder correr dentro de la transacción del runner).
--
--   1. ing_tarea_deps(depende_de_id): la PK es (tarea_id, depende_de_id) — sirve para
--      WHERE tarea_id=… pero NO para el JOIN inverso ing_tareas p ON p.id = d.depende_de_id
--      (resolución de predecesores en escritorio.ts). Es el que más falta.
--   2. ing_tareas(tipo_id): JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id (todas las variantes).
--   3. ing_tareas(proyecto_id): cruce a proyectos p para el filtro p.estado='activo'.
--   4. ing_proyectos(proyecto_id): cruce a proyectos (la PK es proyecto_ext).
CREATE INDEX IF NOT EXISTS ing_tarea_deps_depende_de_idx ON ing_tarea_deps (depende_de_id);
CREATE INDEX IF NOT EXISTS ing_tareas_tipo_idx           ON ing_tareas (tipo_id);
CREATE INDEX IF NOT EXISTS ing_tareas_proyecto_id_idx    ON ing_tareas (proyecto_id);
CREATE INDEX IF NOT EXISTS ing_proyectos_proyecto_id_idx ON ing_proyectos (proyecto_id);
