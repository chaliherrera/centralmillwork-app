-- 095_eliminar_qc02_journey.sql
-- QC-02 ("QC final aprobado") NO es un paso propio del Gantt (mapea a `fabrication`) y el
-- QC es IMPLÍCITO en la fabricación — no es un entregable/milestone separado del recorrido.
-- Además es un hito interno (no lo ve el cliente) y bloqueaba la instalación pidiendo una
-- inspección aparte fácil de saltear. Se elimina del journey (decisión de Chali 2026-09-20).
--
-- La herramienta de inspección QC (qc_inspecciones / checklist / defectos) SE CONSERVA como
-- función opcional de producción — solo deja de ser un gate/milestone del journey.
--
-- La instalación (I-04) pasa a depender del ENVÍO (S-04) en vez de QC-02. Cadena natural:
--   producción → fabricación completa (P-06) → envío (S-04) → instalación (I-04).
-- Idempotente.
BEGIN;

-- 1. Re-apuntar: installation (I-04) ← QC-02  →  I-04 ← S-04 (instalación después del envío).
UPDATE schedule_plantilla_dependencias
   SET depende_de_codigo = 'S-04'
 WHERE hito_codigo = 'I-04' AND depende_de_codigo = 'QC-02'
   AND NOT EXISTS (
     SELECT 1 FROM schedule_plantilla_dependencias d2
      WHERE d2.plantilla_id = schedule_plantilla_dependencias.plantilla_id
        AND d2.hito_codigo = 'I-04' AND d2.depende_de_codigo = 'S-04');

-- 2. Quitar cualquier dependencia que involucre a QC-02 (ej. QC-02 ← P-06, o I-04 ← QC-02 que
--    no se haya podido re-apuntar por ya existir I-04 ← S-04).
DELETE FROM schedule_plantilla_dependencias
 WHERE hito_codigo = 'QC-02' OR depende_de_codigo = 'QC-02';

-- 3. Borrar las instancias de QC-02 en los proyectos (journey de cada proyecto).
DELETE FROM schedule_hitos WHERE codigo = 'QC-02';

-- 4. Eliminar QC-02 de la plantilla de hitos.
DELETE FROM schedule_plantilla_hitos WHERE codigo = 'QC-02';

COMMIT;
