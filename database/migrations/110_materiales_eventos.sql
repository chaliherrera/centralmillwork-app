-- ─────────────────────────────────────────────────────────────────────────────
-- 110 · Registro de eventos de materiales (Paso 2 de la línea de tiempo)
-- ─────────────────────────────────────────────────────────────────────────────
-- Historial de transiciones de estado de cada material, para que la línea de
-- tiempo tenga fechas EXACTAS (cuándo pasó a con precio / ordenado / recibido)
-- en vez de reconstruirlas. 100% aditivo: tabla nueva + trigger que SOLO escribe
-- en ella. No modifica ningún dato existente.
--
-- Idempotente: se puede correr varias veces sin efecto (IF NOT EXISTS / OR
-- REPLACE / DROP TRIGGER IF EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS materiales_eventos (
  id              BIGSERIAL PRIMARY KEY,
  material_id     INTEGER NOT NULL REFERENCES materiales_mto(id) ON DELETE CASCADE,
  evento          TEXT NOT NULL,          -- COTIZADO | ORDENADO | RECIBIDO | PENDIENTE | EN_STOCK
  estado_anterior TEXT,
  fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fuente          TEXT,                   -- 'trigger' | 'app:*'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mat_eventos_material ON materiales_eventos (material_id, evento);

-- Trigger: registra cada cambio real de estado_cotiz, desde cualquier flujo.
CREATE OR REPLACE FUNCTION trg_materiales_estado_evento() RETURNS trigger AS $$
BEGIN
  IF (NEW.estado_cotiz IS DISTINCT FROM OLD.estado_cotiz) THEN
    INSERT INTO materiales_eventos (material_id, evento, estado_anterior, fuente)
    VALUES (NEW.id, NEW.estado_cotiz, OLD.estado_cotiz, 'trigger');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS materiales_estado_evento ON materiales_mto;
CREATE TRIGGER materiales_estado_evento
  AFTER UPDATE OF estado_cotiz ON materiales_mto
  FOR EACH ROW EXECUTE FUNCTION trg_materiales_estado_evento();
