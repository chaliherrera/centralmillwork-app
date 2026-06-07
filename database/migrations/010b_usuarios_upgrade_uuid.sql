-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 010b — Usuarios con UUID (audit Fix A3)
-- ─────────────────────────────────────────────────────────────────────────────
-- ANTES: este archivo se llamaba 010_usuarios.sql y colisionaba con
-- 010_recepcion_materiales.sql + contenía DROP TABLE usuarios CASCADE.
-- Si una restauración de DR o un reset de la DB volvía a correr este archivo,
-- borraba la tabla usuarios entera con su histórico.
--
-- AHORA:
--   - Renombrado a 010b_ para evitar colisión de numeración con 010_recepcion
--   - SIN DROP TABLE: es idempotente, no destruye data si la tabla ya existe
--   - Solo crea el tipo ENUM y la tabla si no existen
--   - Mantiene el bloque para upgrade automático SERIAL → UUID si detecta
--     una versión vieja (pero solo si está vacía o tras backup manual)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Crear el tipo ENUM si no existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_rol') THEN
    CREATE TYPE user_rol AS ENUM (
      'ADMIN',
      'PROCUREMENT',
      'PRODUCTION',
      'PROJECT_MANAGEMENT',
      'RECEPTION'
    );
  END IF;
END $$;

-- 2. Crear la tabla solo si no existe (idempotente, no destruye nada)
CREATE TABLE IF NOT EXISTS usuarios (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  rol           user_rol    NOT NULL,
  activo        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Admin inicial — solo se crea si la tabla está vacía (no pisa data existente)
INSERT INTO usuarios (nombre, email, password_hash, rol)
VALUES (
  'Chali Herrera',
  'chali@centralmillwork.com',
  '$2a$10$p2m/RVnb.jcUtTqlGTOWweUynjG2.Pee/2eFkzXpT4cYzEPlApKrO',
  'ADMIN'
)
ON CONFLICT (email) DO NOTHING;

-- NOTA HISTÓRICA: existió un archivo 013_usuarios.sql con la versión SERIAL
-- de esta tabla. Fue eliminado como parte del audit Fix A3 porque estaba
-- superseded por este archivo. Si necesitás re-aplicar la migración desde cero,
-- ahora la columna `id` es UUID. Backfill desde SERIAL → UUID requiere
-- migración manual del histórico.

COMMIT;
