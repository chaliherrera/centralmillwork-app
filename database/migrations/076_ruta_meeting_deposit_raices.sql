-- ─────────────────────────────────────────────────────────────────────────────
-- 076 — Ruta: Meeting y Deposit pasan a ser RAÍCES (alineación con la fuente de verdad)
-- ─────────────────────────────────────────────────────────────────────────────
-- La guía del equipo (imagen del proyecto base) define que PO Execution "no afecta el
-- inicio de Shop Drawings" — es solo el marcador de arranque/activación. Por eso Meeting
-- with Designer (2) y Receipt of Material Deposit (3) NO deben depender de po_execution:
-- son raíces (arrancan en el día cero del plan), como el resto de la ruta ya lo refleja
-- (long_leads/shop_drawings ← meeting; samples paralelo; etc.).
--
-- Efecto secundario buscado: al no colgar de po_execution, el Meeting queda desbloqueado
-- desde el arranque → aparece en el escritorio de Ingeniería sin esperar la firma. La firma
-- sigue anclando el día cero real (reanclarPlanAFirma), pero ya no BLOQUEA la ingeniería.
--
-- Solo afecta la GENERACIÓN de planes nuevos (ing_tipo_deps es la plantilla). Los planes
-- existentes tienen sus aristas materializadas en ing_tarea_deps y no se tocan. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DELETE FROM ing_tipo_deps
 WHERE (tipo_clave = 'meeting_designer' AND depende_de_clave = 'po_execution')
    OR (tipo_clave = 'material_deposit' AND depende_de_clave = 'po_execution');

COMMIT;
