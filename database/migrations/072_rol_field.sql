-- ─────────────────────────────────────────────────────────────────────────────
-- 072 — Rol FIELD (Field Specialist con su propio usuario)
-- ─────────────────────────────────────────────────────────────────────────────
-- Chali: las mediciones de campo (field_measurements, rol 'field' en la ruta) las hace
-- un Field Specialist que debe tener su propio usuario. Agregamos el valor 'FIELD' al
-- enum user_rol para poder crear ese usuario y darle su escritorio (rol=field).
-- Aditivo/idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE user_rol ADD VALUE IF NOT EXISTS 'FIELD';
