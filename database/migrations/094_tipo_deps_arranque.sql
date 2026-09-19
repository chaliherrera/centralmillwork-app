-- 094_tipo_deps_arranque.sql (Ingeniería · Bloque 4 — alinear arranque al SAMPLE PROJECT)
-- La plantilla del generador (ing_tipo_deps) no encadenaba el arranque a la firma (PO):
-- Meeting y Recepción del depósito arrancaban el día cero, no escalonados. El SAMPLE
-- PROJECT (plantilla canónica) los pone Meeting = PO + 2 días, Depósito = PO + 5 días.
-- Se agregan esas dos dependencias para que el plan AUTO-GENERADO arranque como el SAMPLE.
-- Idempotente (WHERE NOT EXISTS). No toca planes ya generados (import_excel/app); aplica a
-- los que Estimados genere de acá en más.
INSERT INTO ing_tipo_deps (tipo_clave, depende_de_clave, tipo, lag_dias)
SELECT 'meeting_designer', 'po_execution', 'FS', 2
 WHERE NOT EXISTS (SELECT 1 FROM ing_tipo_deps
                    WHERE tipo_clave = 'meeting_designer' AND depende_de_clave = 'po_execution');

INSERT INTO ing_tipo_deps (tipo_clave, depende_de_clave, tipo, lag_dias)
SELECT 'material_deposit', 'po_execution', 'FS', 5
 WHERE NOT EXISTS (SELECT 1 FROM ing_tipo_deps
                    WHERE tipo_clave = 'material_deposit' AND depende_de_clave = 'po_execution');
