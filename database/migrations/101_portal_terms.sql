-- 101_portal_terms.sql
-- Registro simple de la aceptación de Términos y Condiciones en el portal del cliente.
-- Cada token (link enviado a un contacto) guarda cuándo aceptó, desde qué IP y con qué
-- navegador, y qué versión del documento. No hay login → es la constancia posible sin cuenta.
ALTER TABLE schedule_portal_tokens ADD COLUMN IF NOT EXISTS terms_accepted_at      TIMESTAMPTZ;
ALTER TABLE schedule_portal_tokens ADD COLUMN IF NOT EXISTS terms_accepted_ip      TEXT;
ALTER TABLE schedule_portal_tokens ADD COLUMN IF NOT EXISTS terms_accepted_ua      TEXT;
ALTER TABLE schedule_portal_tokens ADD COLUMN IF NOT EXISTS terms_accepted_version TEXT;
