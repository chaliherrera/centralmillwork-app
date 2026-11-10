-- 113_informe_notas.sql
-- Notas del INFORME de materiales por ítem (pantalla nueva en Proyectos).
--
-- SON SEPARADAS de materiales_mto.notas: anotar aquí NO toca el material en la app.
-- Alcance de cada nota, por combinación de columnas:
--   · proyecto      → item IS NULL  y material_id IS NULL
--   · ítem          → item NOT NULL y material_id IS NULL
--   · material+ítem → item NOT NULL y material_id NOT NULL
--
-- Edición restringida a ADMIN (decisión 2026-11-09: "solo yo"); lectura para
-- cualquier usuario que vea el proyecto. material_id SIN FK dura a propósito
-- (los materiales se pueden borrar/re-importar; una nota huérfana no debe
-- romper nada — se limpia aparte).

CREATE TABLE IF NOT EXISTS informe_notas (
  id           SERIAL PRIMARY KEY,
  proyecto_id  INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  item         TEXT,
  material_id  INTEGER,
  texto        TEXT NOT NULL,
  updated_by   UUID REFERENCES usuarios(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una sola nota por alcance (permite upsert). COALESCE para tratar los NULL
-- como una clave estable.
CREATE UNIQUE INDEX IF NOT EXISTS idx_informe_notas_scope
  ON informe_notas (proyecto_id, COALESCE(item, ''), COALESCE(material_id, 0));

-- Lectura típica: todas las notas de un proyecto.
CREATE INDEX IF NOT EXISTS idx_informe_notas_proyecto
  ON informe_notas (proyecto_id);
