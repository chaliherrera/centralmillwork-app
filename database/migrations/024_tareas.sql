-- 024_tareas.sql
-- Tabla tareas: para el webhook /api/webhooks/email que alimenta el Task Agent.
--
-- El Task Agent (proyecto separado en N8N RECIBOS/task_agent/) lee el Inbox
-- de Outlook, identifica correos con código de proyecto (XX-XXX) o MTOs,
-- clasifica el área/prioridad/título con Claude Haiku 4.5, y postea acá.
--
-- Idempotencia: source_email_id UNIQUE — si el agente postea dos veces el
-- mismo correo (por reintento, retry de scheduler, etc.) NO duplica.
--
-- Áreas válidas (4): procurement, despachos, recepcion, administracion.
-- Se removió "desarrollo" porque los emails con código de proyecto nunca
-- son bugs de software — Claude lo confundía y generaba clasificaciones malas.
--
-- Fecha de aplicación: 2026-05-22

BEGIN;

CREATE TABLE IF NOT EXISTS tareas (
  id              SERIAL PRIMARY KEY,
  area            TEXT        NOT NULL CHECK (area IN ('procurement', 'despachos', 'recepcion', 'administracion')),
  title           TEXT        NOT NULL,
  description     TEXT,
  priority        TEXT        NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  from_email      TEXT,
  subject         TEXT,
  source_email_id TEXT        UNIQUE,
  estado          TEXT        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_progreso', 'completada', 'descartada')),
  asignado_a      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tareas_estado     ON tareas(estado);
CREATE INDEX IF NOT EXISTS idx_tareas_area       ON tareas(area);
CREATE INDEX IF NOT EXISTS idx_tareas_created_at ON tareas(created_at DESC);

DO $$ BEGIN
  RAISE NOTICE '[024] tabla tareas creada con CHECKs (area, priority, estado) e indices';
END $$;

COMMIT;
