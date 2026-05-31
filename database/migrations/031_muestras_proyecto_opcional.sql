-- Migración 031: muestras.proyecto_id puede ser NULL
--
-- Contexto (Chali 2026-05-31): los proyectos hoy "nacen" en Compras. Pero
-- una muestra puede llegar de un cliente prospecto antes de que tengamos
-- proyecto creado. INGENIERIA puede:
--   - crear muestras "huérfanas" (sin proyecto)
--   - linkearlas a un proyecto cuando se decida
--
-- Comportamiento esperado:
--   - INSERT con proyecto_id NULL → permitido
--   - PATCH posterior con proyecto_id puede setearlo
--   - Auto-create OP requiere proyecto_id NOT NULL (la OP necesita proyecto)
--     → bloquear transición a EN_FABRICACION si proyecto_id IS NULL

ALTER TABLE muestras
  ALTER COLUMN proyecto_id DROP NOT NULL;

COMMENT ON COLUMN muestras.proyecto_id IS
  'Proyecto al que pertenece la muestra. NULL = muestra huérfana, pendiente '
  'de linkeo a un proyecto. ENGINEERING puede crear muestras sin proyecto '
  'y linkearlas después (PATCH). EN_FABRICACION requiere proyecto_id NOT NULL '
  'porque la OP auto-creada lo necesita.';
