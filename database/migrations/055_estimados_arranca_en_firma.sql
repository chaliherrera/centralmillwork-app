-- ─────────────────────────────────────────────────────────────────────────────
-- 055 — Upgrade de Estimados (paso 2): el proceso arranca en la FIRMA del contrato
-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Elimina los pasos PRE-FIRMA de la plantilla del schedule:
--      C-01 "Proyecto en negociación"  ·  C-02 "Contrato revisado / addendum"
--    Eran ruido: el proceso (Estimados y el schedule) empieza con la firma (C-03).
--    C-03 queda como raíz de la fase Contrato (el motor lo maneja sin problema).
--    Las filas schedule_hitos existentes de C-01/C-02 quedan huérfanas e INVISIBLES
--    (getPlan hace INNER JOIN con la plantilla) — NO se tocan, para no pisar evidencia
--    real que alguien haya registrado. Se limpian en un prune futuro si molestan.
--
-- 2) Agrega proyectos.fecha_entrega_solicitada: la fecha que PIDIÓ el cliente. Es el
--    input del chequeo de factibilidad. NO gobierna (eso lo hace schedule_planes.fecha_objetivo,
--    la comprometida y sagrada). Se guarda para el registro y para medir cumplimiento.
--
-- Reversa: re-INSERT de C-01/C-02 en schedule_plantilla_hitos + sus deps
--          (C-02→C-01, C-03→C-02); DROP COLUMN fecha_entrega_solicitada.
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM schedule_plantilla_dependencias
 WHERE hito_codigo IN ('C-01', 'C-02') OR depende_de_codigo IN ('C-01', 'C-02');

DELETE FROM schedule_plantilla_hitos WHERE codigo IN ('C-01', 'C-02');

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS fecha_entrega_solicitada DATE;
