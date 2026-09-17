-- 093_proyecto_incluye_stone.sql (Fase 2 · 2.5b — checkbox de stone)
-- Simétrico con incluye_instalacion (migr 063): un checkbox explícito decide si el
-- schedule incluye los pasos de stone/countertops (stone_measure, stone_fab,
-- stone_install). Antes se DEDUCÍA de stone_total > 0; ahora es explícito, así se
-- puede decir sí/no sin depender del monto cargado.
-- Idempotente y seguro ante re-aplicación: se agrega NULLABLE, se backfillea SOLO lo
-- que está en NULL (los existentes conservan su comportamiento: incluye_stone = tenían
-- stone_total > 0), y recién después se fija DEFAULT TRUE + NOT NULL. Re-correr no pisa
-- ninguna elección del usuario (el UPDATE ya no toca filas no-NULL).
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS incluye_stone BOOLEAN;

UPDATE proyectos
   SET incluye_stone = (stone_total IS NOT NULL AND stone_total > 0)
 WHERE incluye_stone IS NULL;

ALTER TABLE proyectos ALTER COLUMN incluye_stone SET DEFAULT TRUE;
ALTER TABLE proyectos ALTER COLUMN incluye_stone SET NOT NULL;
