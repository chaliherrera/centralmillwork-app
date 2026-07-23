-- ─────────────────────────────────────────────────────────────────────────────
-- 044 — Activar foto_obligatoria en CNC y Edge Banding
-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-07-17: Extender la regla de fotos obligatorias a las 2 estaciones que
-- faltaban del flujo productivo. Después del reporte de OP para dirección
-- (feature nueva de la semana pasada), se identificó que estas 2 estaciones
-- también requieren evidencia visual para completar el proceso — el CEO
-- necesita ver fotos de TODO el recorrido.
--
-- Estado previo:
--   • 6 estaciones con foto_obligatoria=true (lamina/pintura/final/
--     assembly/registro/shipping) — activadas en task #9 (2026-06-02).
--   • cnc + edge_banding con foto_obligatoria=false — se saltearon
--     originalmente porque el flujo empezaba visualmente después.
--
-- Este cambio:
--   • Setea foto_obligatoria=true en cnc + edge_banding.
--   • Setea fotos_minimas=3 (mismo umbral que las otras 6).
--
-- Idempotente: si ya estaban en true/3, no cambia nada.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE estaciones_config
   SET foto_obligatoria = true,
       fotos_minimas    = 3
 WHERE nombre IN ('cnc', 'edge_banding');
