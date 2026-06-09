-- ─────────────────────────────────────────────────────────────────────────────
-- Migración 039 — Muestras F5: foto del paquete/etiqueta en envíos
-- ─────────────────────────────────────────────────────────────────────────────
-- Agrega columna foto_filename para almacenar el nombre de archivo en
-- Supabase Storage (bucket oc-imagenes, mismo bucket que las imágenes de
-- recepción). La URL se genera al vuelo en el backend con createSignedUrl
-- (no la persistimos porque rota con el TTL del bucket privado).
--
-- Idempotente: usa IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.muestras_envios
  ADD COLUMN IF NOT EXISTS foto_filename text;

COMMENT ON COLUMN public.muestras_envios.foto_filename IS
  'Filename de la foto del paquete/etiqueta en Supabase Storage (bucket oc-imagenes). NULL = sin foto. F5 Muestras 2026-06-09.';
