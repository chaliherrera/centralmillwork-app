-- ─────────────────────────────────────────────────────────────────────────────
-- 098 — Varias fotos por ítem instalado (obra)
-- ─────────────────────────────────────────────────────────────────────────────
-- schedule_install_items guardaba UNA sola foto por ítem (columna `foto`). Field
-- necesita poder tomar VARIAS fotos del ítem instalado. Esta tabla guarda las fotos
-- adicionales; la `foto` original sigue siendo la "portada". client_id = idempotency
-- key de la cola offline (un reenvío no duplica). Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TABLE IF NOT EXISTS schedule_install_item_fotos (
  id           SERIAL PRIMARY KEY,
  proyecto_id  INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  op_id        INTEGER NOT NULL REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,              -- path en Supabase
  client_id    UUID,                       -- idempotencia de la cola offline
  created_by   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_install_item_fotos ON schedule_install_item_fotos (proyecto_id, op_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_install_item_foto_client
  ON schedule_install_item_fotos (client_id) WHERE client_id IS NOT NULL;

COMMIT;
