-- ─────────────────────────────────────────────────────────────────────────────
-- 045 — Tabla proyecto_item_planos (2026-07-17)
-- ─────────────────────────────────────────────────────────────────────────────
-- Almacena planos PDF por (proyecto_id, numero_item). Compartidos entre
-- todas las OPs del mismo ítem — el shop manager los sube UNA vez cuando
-- crea la primera OP, y quedan disponibles para toda OP futura del mismo
-- ítem del mismo proyecto.
--
-- Uso: card "Planos del ítem" en CrearOrden.tsx — carga contextual según
-- proyecto + numero_item seleccionados. Permite al shop manager ver el
-- plano ANTES de definir la ruta de la OP.
--
-- Storage físico: Supabase Storage bucket 'oc-imagenes' con path
-- 'planos/{filename}' (mismo bucket reusado por consistencia + ahorro).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS proyecto_item_planos (
  id            SERIAL PRIMARY KEY,
  proyecto_id   INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  numero_item   TEXT NOT NULL,
  filename      TEXT NOT NULL,           -- path en Supabase Storage (ej: "planos/uuid.pdf")
  original_name TEXT NOT NULL,           -- nombre original que subió el user (para display)
  size_bytes    INTEGER,
  uploaded_by   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookups típicos: "todos los planos del ítem X del proyecto Y"
CREATE INDEX IF NOT EXISTS idx_proyecto_item_planos_lookup
  ON proyecto_item_planos (proyecto_id, numero_item);

COMMENT ON TABLE proyecto_item_planos IS
  'Planos PDF por (proyecto_id, numero_item). Compartidos entre OPs del mismo ítem. Storage físico en Supabase bucket oc-imagenes.';

COMMENT ON COLUMN proyecto_item_planos.filename IS
  'Path completo en Supabase Storage (ej "planos/abc123.pdf"). NO es el nombre original — para display usar original_name.';

COMMENT ON COLUMN proyecto_item_planos.original_name IS
  'Nombre del archivo tal como lo subió el usuario. Se muestra en la UI y en el link de descarga.';
