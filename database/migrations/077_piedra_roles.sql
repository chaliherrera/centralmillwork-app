-- ─────────────────────────────────────────────────────────────────────────────
-- 077 — Piedra: dueños de los pasos 16/18 (decisión de Chali, Q6)
-- ─────────────────────────────────────────────────────────────────────────────
-- Los 3 pasos de piedra estaban rol 'externo' y NADIE los veía en un escritorio
-- (quedaban pendientes para siempre). Decisión:
--   · Stone Countertop Measuring (16) → FIELD (mide en obra)
--   · Stone Countertops Fabrication (17) → PM (queda 'externo'; el PM lo confirma)
--   · Stone Countertops Installation (18) → FIELD (lo marca en la app móvil)
-- Cambiar el rol del catálogo alcanza: el escritorio filtra por ing_tarea_tipos.rol,
-- así que afecta a TODOS los proyectos (existentes y nuevos) al instante.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

UPDATE ing_tarea_tipos SET rol = 'field' WHERE clave IN ('stone_measure', 'stone_install');
-- stone_fab queda 'externo' (lo ve el PM en su escritorio de piedra).

COMMIT;
