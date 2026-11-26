-- 122 — PO Execution (contrato / día cero) NO traba las demás tareas.
-- Decisión documentada (gate blando): la firma del contrato no frena tareas; el día
-- cero solo sirve para atribuir demoras del cliente. En la plantilla, PO Execution
-- figuraba como predecesora (FS, con lag) de "Meeting with Designer" (+2 d) y de
-- "Receipt of Material Deposit" (+5 d), lo que empujaba esas tareas y no dejaba al
-- Scheduler adelantarlas. Se quitan esas dependencias: Meeting y Material Deposit
-- quedan libres (arrancan desde el día cero del proyecto, donde el Scheduler las ponga).
DELETE FROM ing_tipo_deps WHERE depende_de_clave = 'po_execution';
