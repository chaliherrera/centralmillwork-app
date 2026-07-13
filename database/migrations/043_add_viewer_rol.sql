-- ─────────────────────────────────────────────────────────────────────────────
-- 043 — Agregar VIEWER al enum user_rol
-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-07-12: nuevo rol para usuarios de solo lectura (Mathias, futuros
-- observadores). VIEWER puede ver todo el sistema (dashboard, proyectos,
-- materiales, OCs, recepciones, muestras) pero NO puede modificar nada.
--
-- Los endpoints GET son abiertos a cualquier user autenticado, por lo cual
-- VIEWER "hereda" acceso de lectura automáticamente. Los endpoints de
-- escritura (POST/PUT/PATCH/DELETE) están restringidos por listas explícitas
-- que NO incluyen VIEWER, así que las modificaciones son rechazadas con 403.
--
-- Único endpoint que necesita update en código es MUESTRAS_READ, que en vez
-- de estar abierto por default está protegido por rol (para ocultar el
-- módulo de operarios). Se agrega VIEWER a esa lista en el mismo commit.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_enum
     WHERE enumlabel = 'VIEWER'
       AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_rol')
  ) THEN
    ALTER TYPE user_rol ADD VALUE 'VIEWER';
  END IF;
END $$;

COMMENT ON TYPE user_rol IS
  'Roles del sistema. VIEWER (agregado 2026-07-12) tiene solo lectura — '
  've todo pero no puede modificar. ADMIN puede todo. PROCUREMENT/PRODUCTION/'
  'SHOP_MANAGER/ENGINEERING/INGENIERIA tienen alcances específicos.';
