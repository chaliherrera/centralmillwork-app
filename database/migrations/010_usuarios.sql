-- Recreate usuarios table with UUID primary key and proper ENUM role type

-- Drop existing table and type if present
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TYPE  IF EXISTS user_rol CASCADE;

-- Enum for roles
CREATE TYPE user_rol AS ENUM (
  'ADMIN',
  'PROCUREMENT',
  'PRODUCTION',
  'PROJECT_MANAGEMENT',
  'RECEPTION'
);

CREATE TABLE usuarios (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  rol           user_rol    NOT NULL,
  activo        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin inicial: chali@centralmillwork.com / CentralMillwork2026!
INSERT INTO usuarios (nombre, email, password_hash, rol)
VALUES (
  'Chali Herrera',
  'chali@centralmillwork.com',
  '$2a$10$p2m/RVnb.jcUtTqlGTOWweUynjG2.Pee/2eFkzXpT4cYzEPlApKrO',
  'ADMIN'
)
ON CONFLICT (email) DO NOTHING;
