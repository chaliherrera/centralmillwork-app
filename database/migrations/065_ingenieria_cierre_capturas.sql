-- ─────────────────────────────────────────────────────────────────────────────
-- 065 — Ingeniería: cierre de capturas del escritorio del ingeniero
-- ─────────────────────────────────────────────────────────────────────────────
-- Dos capturas propias que faltaban (nadie más dueña estos datos):
--
--  · reprogramacion_pedida: el ingeniero NO mueve fechas; si no puede cumplir el
--    schedule, PIDE reprogramación al PM (interacción del paso #2, reusable en todos).
--    El PM ve la bandera en el Gantt y reprograma; al reprogramar la limpia.
--
--  · decision: la respuesta del cliente en la revisión (#7 client_review):
--    'aprobado' | 'rechazado' | 'con_comentarios'. Aprobado abre el gate #8;
--    rechazado dispara una vuelta de revisión (por ahora se captura; la
--    materialización de la vuelta/rev-loop es un paso aparte).
--
-- Los "envíos" de #5 (SD al cliente) y #13 (CNC a taller) usan la fecha de
-- cumplimiento (fecha_fin_real, migr. 064) con etiqueta contextual — sin columna nueva.
--
-- Aditivo/idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ing_tareas ADD COLUMN IF NOT EXISTS reprogramacion_pedida BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ing_tareas ADD COLUMN IF NOT EXISTS decision TEXT
  CHECK (decision IS NULL OR decision IN ('aprobado', 'rechazado', 'con_comentarios'));
