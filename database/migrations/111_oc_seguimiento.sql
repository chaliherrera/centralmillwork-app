-- ─────────────────────────────────────────────────────────────────────────────
-- 111 · Seguimiento de OCs (notas con hilo + reprogramaciones)
-- ─────────────────────────────────────────────────────────────────────────────
-- Historial de gestiones sobre una OC (ej. "llamé a RUGBY, promete el 12").
-- 100% aditivo. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oc_seguimiento (
  id               BIGSERIAL PRIMARY KEY,
  orden_compra_id  INTEGER NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL DEFAULT 'nota',   -- 'nota' | 'reprograma'
  nota             TEXT,
  fecha_anterior   DATE,                           -- para reprogramaciones
  fecha_nueva      DATE,
  usuario_nombre   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oc_seguimiento_oc ON oc_seguimiento (orden_compra_id, created_at DESC);
