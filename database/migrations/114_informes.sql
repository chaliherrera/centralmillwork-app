-- 114_informes.sql
-- Informes guardados del armador transversal "Materiales por ítem".
--
-- Un informe = un NOMBRE + una SELECCIÓN de proyectos y, dentro de cada uno,
-- qué ítems incluir. Se guarda SOLO la selección (no los datos): al abrirlo,
-- la app recalcula en vivo desde items-readiness + informe_notas.
--
-- seleccion (jsonb): [{ "proyecto_id": 28, "items": ["12","15"] }, ...]
--   · items vacío []  → incluir TODOS los ítems de ese proyecto.
--
-- Compartidos (biblioteca del equipo): todos los leen; crean los roles
-- operativos; editar/borrar lo hace el creador o un ADMIN (se controla en el
-- backend).

CREATE TABLE IF NOT EXISTS informes (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  seleccion   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by  UUID REFERENCES usuarios(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_informes_created_by ON informes (created_by);
