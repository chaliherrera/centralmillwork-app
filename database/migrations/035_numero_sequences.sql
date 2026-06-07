-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 035 — Sequences para numeración atómica (audit Fix A2)
-- ─────────────────────────────────────────────────────────────────────────────
-- Race condition arreglada: 8 callsites en el backend hacían:
--   SELECT numero FROM X ORDER BY id DESC LIMIT 1
--   seq = parseInt(numero.split('-')[2]) + 1
--   INSERT numero = `OC-2026-${seq}`
--
-- Con 2 réplicas activas, dos inserts concurrentes leen el MISMO last + calculan
-- el MISMO seq + ambos intentan INSERT con el mismo numero → 23505 duplicate
-- key on UNIQUE constraint.
--
-- Fix: tres sequences Postgres (atómicas server-side) inicializadas al max
-- actual de cada tabla. El código pasa a usar nextval() que es atómico.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- OC: ordenes_compra.numero formato 'OC-2026-NNNN'
CREATE SEQUENCE IF NOT EXISTS oc_numero_seq;
SELECT setval(
  'oc_numero_seq',
  GREATEST(
    COALESCE(
      (SELECT MAX(CAST(SPLIT_PART(numero, '-', 3) AS INTEGER))
       FROM ordenes_compra
       WHERE numero ~ '^OC-[0-9]+-[0-9]+$'),
      0
    ),
    1
  )
);

-- Recepción: recepciones.folio formato 'REC-2026-NNNN'
CREATE SEQUENCE IF NOT EXISTS recepcion_folio_seq;
SELECT setval(
  'recepcion_folio_seq',
  GREATEST(
    COALESCE(
      (SELECT MAX(CAST(SPLIT_PART(folio, '-', 3) AS INTEGER))
       FROM recepciones
       WHERE folio ~ '^REC-[0-9]+-[0-9]+$'),
      0
    ),
    1
  )
);

-- Cotización: solicitudes_cotizacion.folio formato 'COT-2026-NNNN'
CREATE SEQUENCE IF NOT EXISTS cotizacion_folio_seq;
SELECT setval(
  'cotizacion_folio_seq',
  GREATEST(
    COALESCE(
      (SELECT MAX(CAST(SPLIT_PART(folio, '-', 3) AS INTEGER))
       FROM solicitudes_cotizacion
       WHERE folio ~ '^COT-[0-9]+-[0-9]+$'),
      0
    ),
    1
  )
);

COMMENT ON SEQUENCE oc_numero_seq IS
  'Atomic counter for ordenes_compra.numero. Format: OC-YYYY-NNNN. Use nextval() in backend.';
COMMENT ON SEQUENCE recepcion_folio_seq IS
  'Atomic counter for recepciones.folio. Format: REC-YYYY-NNNN.';
COMMENT ON SEQUENCE cotizacion_folio_seq IS
  'Atomic counter for solicitudes_cotizacion.folio. Format: COT-YYYY-NNNN.';

-- Sanity check: mostrar valores iniciales
DO $$
DECLARE
  oc_val   BIGINT := currval('oc_numero_seq');
  rec_val  BIGINT := currval('recepcion_folio_seq');
  cot_val  BIGINT := currval('cotizacion_folio_seq');
BEGIN
  RAISE NOTICE 'oc_numero_seq inicializado en: %', oc_val;
  RAISE NOTICE 'recepcion_folio_seq inicializado en: %', rec_val;
  RAISE NOTICE 'cotizacion_folio_seq inicializado en: %', cot_val;
END $$;

COMMIT;
