-- ─────────────────────────────────────────────────────────────────────────────
-- 042 — Sequence global para numeración de OPs de Producción
-- ─────────────────────────────────────────────────────────────────────────────
-- Formato nuevo: OP-{año}-{padStart(4,'0')} — ej. OP-2026-0001, OP-2026-0002.
-- Consistente con oc_numero_seq (OC-2026-0124), recepcion_folio_seq
-- (REC-2026-0183) y cotizacion_folio_seq (COT-2026-0043).
--
-- Motivación: el formato viejo OP-{año2dig}-{codigo_proyecto} chocaba cuando
-- un proyecto necesitaba múltiples OPs (varios items del proyecto en distintas
-- OPs). La única OP viva con formato viejo (OP-26-590) sigue funcionando —
-- solo nuevas OPs usan el formato nuevo.
--
-- El usuario ya NO ingresa numero_orden manualmente en el form. El backend
-- lo auto-genera usando esta sequence.
--
-- Muestras mantienen su formato aparte OP-MS-{año}-{seq} para distinguir
-- visualmente (se generan con lógica propia en muestras/domain/fabricacion.ts).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS op_produccion_numero_seq
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  NO CYCLE;
