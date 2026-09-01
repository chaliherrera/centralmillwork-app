-- ─────────────────────────────────────────────────────────────────────────────
-- 067 — Ingeniería: método de envío al cliente (paso #5 shop drawings, portal-ready)
-- ─────────────────────────────────────────────────────────────────────────────
-- "Completar shop drawings = ENVIARLO al cliente" (Chali). La FECHA de envío ya se
-- captura en fecha_fin_real ("Enviada al cliente"). Este campo guarda CÓMO se envió:
--   correo  → el ingeniero lo marca a mano (vía actual)
--   portal  → lo captura el portal del cliente automáticamente (cuando esté al 100%)
--   ambos   → se envió por los dos
-- Así el mismo campo de fecha sirve hoy (correo, manual) y mañana (portal, auto): solo
-- cambia la fuente. Reusable para otros pasos que se envían al cliente (ej. sd_update).
-- Aditivo/idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ing_tareas ADD COLUMN IF NOT EXISTS envio_metodo TEXT
  CHECK (envio_metodo IS NULL OR envio_metodo IN ('correo', 'portal', 'ambos'));
