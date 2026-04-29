CREATE TABLE IF NOT EXISTS mto_freight (
  id          SERIAL PRIMARY KEY,
  proyecto_id INT  NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  vendor      TEXT NOT NULL,
  freight     DECIMAL(12,2) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proyecto_id, vendor)
);
