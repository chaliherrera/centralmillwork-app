-- ─────────────────────────────────────────────────────────────────────────────
-- 063 — Proyecto: flag "incluye instalación" (paso 15 condicional)
-- ─────────────────────────────────────────────────────────────────────────────
-- Algunos clientes NO llevan instalación de millwork (ej. Digney York: solo fabrican
-- y despachan; el cliente instala). El schedule debe poder omitir el paso 15
-- (Millwork Installation) por proyecto. Default TRUE = la mayoría instala.
--
-- El PM/Estimados lo marca en el intake (checkbox); a futuro puede tener default por
-- cliente. Aditivo/idempotente. La rama de piedra ya es condicional (stone_total>0).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS incluye_instalacion BOOLEAN NOT NULL DEFAULT TRUE;
