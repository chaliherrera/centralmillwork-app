-- ============================================================================
-- Documentos adjuntos a órdenes de producción (PDFs por estación)
-- ============================================================================
-- Cada documento se sube indicando a qué estación pertenece:
--   - estacion = 'cnc'      → hoja de corte para CNC
--   - estacion = 'assembly' → plano de ensamble
--   - estacion = NULL       → documento general de la orden (specs globales)
--
-- Persistencia: los documentos NO se borran al completar la orden — quedan
-- como referencia histórica para órdenes similares en el futuro. La
-- eliminación es manual desde la UI o via DELETE /api/produccion/documentos/:id.
--
-- Storage: el archivo físico vive en Supabase Storage (prod) o /uploads (dev),
-- igual que las imágenes de OC y QC. La columna `filename` es la clave en el
-- storage; `url` cachea la URL pública para evitar regenerar.
-- ============================================================================

CREATE TABLE IF NOT EXISTS orden_documentos (
  id           SERIAL PRIMARY KEY,
  orden_id     INT  NOT NULL REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
  estacion     TEXT,                    -- NULL = documento general de la orden
  nombre       TEXT NOT NULL,           -- nombre visible (puede ser el original o renombrado)
  descripcion  TEXT,                    -- nota opcional ("v3 con corrección del 11/05")
  filename     TEXT NOT NULL,           -- key/path en storage
  mime_type    TEXT,
  size_bytes   INT,
  url          TEXT,                    -- URL pública (Supabase) o /uploads/<file> (local)
  uploaded_by  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orden_docs_orden     ON orden_documentos(orden_id);
CREATE INDEX IF NOT EXISTS idx_orden_docs_estacion  ON orden_documentos(orden_id, estacion);

COMMENT ON TABLE  orden_documentos IS 'PDFs adjuntos a una orden, opcionalmente vinculados a una estación específica (hojas de corte, planos, etc.).';
COMMENT ON COLUMN orden_documentos.estacion IS 'Nombre de la estación (cnc, assembly, pintura...). NULL = documento general de la orden.';
COMMENT ON COLUMN orden_documentos.filename IS 'Clave en Supabase Storage o nombre de archivo en /uploads. NO es el nombre visible (eso está en `nombre`).';
