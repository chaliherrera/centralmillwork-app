-- ─────────────────────────────────────────────────────────────────────────────
-- 052 — Áreas de tareas alineadas (Tareas dedicado a Muestras)
-- ─────────────────────────────────────────────────────────────────────────────
-- El buzón de Tareas pasa a ser el canal interno de Muestras, por rol. Muestras
-- crea tareas con area 'procurement' y 'shop_manager'; a futuro también
-- 'ingenieria'. El CHECK viejo (migración base) solo permitía procurement/
-- despachos/recepcion/administracion, y en algunos entornos ni siquiera
-- shop_manager (la 041 lo agregó en prod, no en todos lados). Esta migración
-- deja el set completo y consistente en cualquier entorno. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tareas DROP CONSTRAINT IF EXISTS tareas_area_check;
ALTER TABLE tareas ADD CONSTRAINT tareas_area_check CHECK (
  area = ANY (ARRAY[
    'procurement', 'recepcion', 'despachos', 'administracion',
    'shop_manager', 'ingenieria', 'admin'
  ])
);
