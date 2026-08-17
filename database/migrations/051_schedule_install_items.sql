-- ─────────────────────────────────────────────────────────────────────────────
-- 051 — Checklist de instalación por item (Life of a Deal, Etapa: Field/Install)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cada proyecto tiene una lista distinta de cosas a instalar. Esa lista NO se
-- recarga a mano: son los items que el taller fabricó, o sea las Órdenes de
-- Producción (ordenes_produccion) de ese proyecto. Un item puede tener varias
-- piezas (cantidad), pero se controla como una unidad en la obra.
--
-- Esta tabla guarda SOLO el estado de instalación por item (op_id). La lista se
-- deriva en vivo de las OPs; acá vive el "instalado ✓" con su foto y autor.
-- Cuando TODOS los items del proyecto están instalados, el hito I-05
-- "Instalación en curso" se completa solo. Evidencia real (P2).
--
-- Fotos en Supabase bucket 'oc-imagenes' path 'install/{uuid}'.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schedule_install_items (
  id             SERIAL PRIMARY KEY,
  proyecto_id    INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  op_id          INTEGER NOT NULL REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
  estado         TEXT NOT NULL DEFAULT 'instalado',   -- instalado
  foto           TEXT,                                 -- path Supabase
  nota           TEXT,
  instalado_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  instalado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proyecto_id, op_id)
);
CREATE INDEX IF NOT EXISTS idx_schedule_install_proyecto ON schedule_install_items (proyecto_id);

COMMENT ON TABLE schedule_install_items IS
  'Estado de instalacion por item (OP) de cada proyecto (Life of a Deal). La lista de items se deriva de ordenes_produccion; cuando todos estan instalados, completa I-05.';
