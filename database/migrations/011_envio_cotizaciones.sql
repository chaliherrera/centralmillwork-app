-- 011: Add envío columns to solicitudes_cotizacion for the send-quotes flow
ALTER TABLE solicitudes_cotizacion
  ALTER COLUMN proveedor_id DROP NOT NULL;

ALTER TABLE solicitudes_cotizacion
  ADD COLUMN IF NOT EXISTS vendor TEXT,
  ADD COLUMN IF NOT EXISTS materiales_incluidos JSONB,
  ADD COLUMN IF NOT EXISTS email_destinatario TEXT,
  ADD COLUMN IF NOT EXISTS fecha_envio TIMESTAMPTZ;
