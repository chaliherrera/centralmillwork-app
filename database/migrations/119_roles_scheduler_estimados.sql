-- ─────────────────────────────────────────────────────────────────────────────
-- 119 — Agregar los roles SCHEDULER y ESTIMADOS al enum user_rol
-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-11-25: proceso simplificado de alta de proyecto (Fase 1).
--
--  · SCHEDULER: dueño de la planificación. Nace con las MISMAS capacidades que
--    PROJECT_MANAGEMENT (planificar, reservar, activar). Convive en paralelo con
--    PM; el reemplazo/renombre de PM se hace prolijo más adelante (Fase 4).
--  · ESTIMADOS: el "front del deal". Propone la fecha, manda al cliente y registra
--    su decisión. Hasta ahora el frontend lo nombraba pero la base no lo aceptaba.
--
-- Mismo patrón idempotente que la migración 043 (VIEWER): se agrega el valor solo
-- si no existe. Un valor de enum NO se puede borrar, así que estos nombres quedan.
-- Mantener sincronizado con `Role` (middleware/auth.ts) y VALID_ROLES
-- (controllers/usuariosController.ts).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_enum
     WHERE enumlabel = 'SCHEDULER'
       AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_rol')
  ) THEN
    ALTER TYPE user_rol ADD VALUE 'SCHEDULER';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_enum
     WHERE enumlabel = 'ESTIMADOS'
       AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_rol')
  ) THEN
    ALTER TYPE user_rol ADD VALUE 'ESTIMADOS';
  END IF;
END $$;

COMMENT ON TYPE user_rol IS
  'Roles del sistema. SCHEDULER (2026-11-25) = dueño de la planificación, mismas '
  'capacidades que PROJECT_MANAGEMENT. ESTIMADOS (2026-11-25) = front del deal '
  '(propone fecha, envía al cliente, registra su decisión). VIEWER = solo lectura. '
  'ADMIN puede todo.';
