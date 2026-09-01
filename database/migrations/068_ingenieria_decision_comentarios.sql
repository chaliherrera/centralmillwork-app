-- ─────────────────────────────────────────────────────────────────────────────
-- 068 — Ingeniería: comentarios de la decisión del cliente (paso #7 revisión)
-- ─────────────────────────────────────────────────────────────────────────────
-- En la revisión (client_review) el cliente decide aprobado|rechazado|con_comentarios
-- (columna `decision`, migr. 065). Cuando rechaza o aprueba-con-comentarios, hace falta
-- guardar QUÉ dijo. La FECHA de la decisión reusa fecha_fin_real (cuando se cerró la
-- revisión). Reusable para el reject-loop: el motivo del rechazo se copia a shop_drawings
-- al reabrirlo. Aditivo/idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ing_tareas ADD COLUMN IF NOT EXISTS decision_comentarios TEXT;
