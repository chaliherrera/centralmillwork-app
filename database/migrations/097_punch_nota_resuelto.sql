-- ─────────────────────────────────────────────────────────────────────────────
-- 097 — Nota al resolver un punch item (Field, desde el móvil)
-- ─────────────────────────────────────────────────────────────────────────────
-- Al resolver un pendiente de obra, Field puede dejar una nota de texto de cómo
-- se resolvió (además de la foto de resuelto). Antes no había dónde guardarla.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE schedule_punch_items ADD COLUMN IF NOT EXISTS nota_resuelto TEXT;
