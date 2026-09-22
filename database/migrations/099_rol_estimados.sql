-- 099_rol_estimados.sql
-- Nuevo rol de app ESTIMADOS (departamento de estimación). En un rediseño previo
-- la función de Estimados se había fusionado con PROJECT_MANAGEMENT; ahora se
-- separa como rol propio, acotado al "front del deal" (crear proyecto + intake +
-- firma/contrato + tracker de deals + handoff a PM), sin ejecución downstream.
-- Ver: middleware/auth.ts (Role), usuariosController (VALID_ROLES), rutas de
-- proyectos/schedule/ingenieria, y escritorio.ts (ROLES_RUTA_POR_APP).
-- Idempotente (Postgres 12+).

ALTER TYPE user_rol ADD VALUE IF NOT EXISTS 'ESTIMADOS';
