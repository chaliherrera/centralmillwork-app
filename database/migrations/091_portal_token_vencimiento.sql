-- ─────────────────────────────────────────────────────────────────────────────
-- 091 — Vencimiento de los links del portal (Fase 1)
-- ─────────────────────────────────────────────────────────────────────────────
-- Higiene de seguridad: un link del portal no debería vivir para siempre. Se
-- agrega expires_at; resolverToken rechaza los vencidos (igual que los revocados).
--
-- SIN ROMPER NADA: la columna es NULLABLE y SIN default → los tokens que YA
-- existen quedan con expires_at = NULL = "nunca vence", así ningún cliente actual
-- (ERIC/staging, los 28 de prod) pierde acceso. Solo los links NUEVOS nacen con
-- un vencimiento (180 días por defecto, lo setea crearToken en el backend). El PM
-- ve el vencimiento en la gestión de links y puede generar uno nuevo cuando haga
-- falta.
--
-- Aditivo/idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE schedule_portal_tokens
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMENT ON COLUMN schedule_portal_tokens.expires_at IS
  'Vencimiento del link. NULL = nunca vence (tokens previos a la 091). Los nuevos nacen con ~180 días.';
