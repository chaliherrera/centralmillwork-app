-- ─── Backfill cotizar + estado_cotiz based on data rules ─────────────────────

-- 1. Materiales con CM code que empiece con 'NC' → EN_STOCK (independiente del precio)
UPDATE materiales_mto
SET cotizar = 'EN_STOCK', estado_cotiz = 'EN_STOCK'
WHERE codigo ILIKE 'NC%';

-- 2. Materiales con unit_price > 0 que no son EN_STOCK → COTIZADO + SI
UPDATE materiales_mto
SET cotizar = 'SI', estado_cotiz = 'COTIZADO'
WHERE unit_price > 0
  AND cotizar != 'EN_STOCK';

-- 3. Materiales con unit_price = 0 que no son EN_STOCK → PENDIENTE + SI
UPDATE materiales_mto
SET cotizar = 'SI', estado_cotiz = 'PENDIENTE'
WHERE unit_price = 0
  AND cotizar != 'EN_STOCK';

-- ─── Verificación ──────────────────────────────────────────────────────────────
SELECT
  estado_cotiz,
  cotizar,
  COUNT(*) AS total
FROM materiales_mto
GROUP BY estado_cotiz, cotizar
ORDER BY estado_cotiz, cotizar;
