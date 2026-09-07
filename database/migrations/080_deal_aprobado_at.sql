-- 080_deal_aprobado_at.sql
-- Marca de tiempo de cuándo el cliente aprobó el schedule (deal_estado→'aprobado').
-- Antes solo se cambiaba el estado, sin registrar cuándo: Estimados no tenía forma
-- de mostrar una confirmación con fecha/hora. Ahora se guarda el momento exacto.
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS deal_aprobado_at TIMESTAMPTZ;
