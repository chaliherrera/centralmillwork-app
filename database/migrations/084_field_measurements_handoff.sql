-- 084_field_measurements_handoff.sql (2026-09-08)
-- Field Measurements pasa a ser un HANDOFF en 2 etapas Ingeniería→Campo (decisión de Chali),
-- igual que el MTO (Ingeniería produce → Compras compra):
--   Etapa 1 (rol 'ingenieria'): el INGENIERO sube el PLANO de campo (obligatorio; es un
--     documento DISTINTO del shop drawing del cliente) → la tarea pasa a en_curso (handoff).
--   Etapa 2 (rol 'field', escritorio de Campo): Campo solo marca "Medida" → cierra E-03.
--     La medida real viaja por una herramienta externa (PlanGrid), no se sube en la app.
-- El ruteo del handoff (pendiente→Ingeniería, en_curso→Campo) vive en escritorio.ts.
UPDATE ing_tarea_tipos SET rol = 'ingenieria', entregable = 'plano' WHERE clave = 'field_measurements';
