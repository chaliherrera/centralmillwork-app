-- ─────────────────────────────────────────────────────────────────────────────
-- 054 — Módulo Ingeniería: schedule con recursos (tareas + ingeniero + % asignación)
-- ─────────────────────────────────────────────────────────────────────────────
-- Réplica nativa del "Master.Sched" de Smartsheet. Ingeniería planifica por TAREAS
-- asignadas a un ingeniero, con % de asignación de su capacidad, duración y
-- dependencias, a través de múltiples proyectos. La carga de un ingeniero = suma
-- de allocation_pct de sus tareas que se solapan en una fecha (>1.0 = sobreasignado).
--
-- MVP: importa del Excel con nombres de proyecto/ingeniero como texto (proyecto_ext,
-- asignado_nombre); el enlace a proyectos/usuarios de la app queda para después
-- (proyecto_id / asignado_usuario_id nullables). Los hitos E-* del schedule NO se
-- tocan acá — la conexión (señales) se agrega en una migración posterior.
-- ─────────────────────────────────────────────────────────────────────────────

-- Catálogo canónico de tipos de tarea (normaliza los nombres "sucios" del Smartsheet)
CREATE TABLE IF NOT EXISTS ing_tarea_tipos (
  id               SERIAL PRIMARY KEY,
  clave            TEXT NOT NULL UNIQUE,      -- 'field_measurements','samples','shop_drawings'…
  nombre           TEXT NOT NULL,
  hito_codigo      TEXT,                      -- señal que emite al completarse (E-03/E-05/E-06/E-07/E-10/E-11/M-03…)
  dur_dias_tipico  INT,
  dur_dias_min     INT,
  dur_dias_max     INT,
  aliases          TEXT[] NOT NULL DEFAULT '{}',  -- variantes de import ("Shop Drawings Process", minúsculas…)
  orden            INT NOT NULL DEFAULT 100,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ing_tareas (
  id                   SERIAL PRIMARY KEY,
  proyecto_ext         TEXT,                  -- nombre/código del proyecto tal cual el Smartsheet
  proyecto_id          INT REFERENCES proyectos(id) ON DELETE SET NULL,  -- enlace a la app (nullable)
  fase                 TEXT,                  -- "Phase 2: 2,3,4,5…" (agrupador del Smartsheet)
  tipo_id              INT REFERENCES ing_tarea_tipos(id) ON DELETE SET NULL,
  nombre               TEXT NOT NULL,
  asignado_nombre      TEXT,                  -- ingeniero tal cual el Excel
  asignado_usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,  -- enlace a usuario (nullable)
  allocation_pct       NUMERIC(5,2) NOT NULL DEFAULT 1.00,  -- 0.20 / 0.70 / 1.00
  dur_dias             NUMERIC(6,2) NOT NULL DEFAULT 1,
  fecha_inicio         DATE,
  fecha_fin            DATE,
  fecha_fin_real       DATE,
  estado               TEXT NOT NULL DEFAULT 'pendiente',   -- pendiente|en_curso|hecha|na
  status_ext           TEXT,                  -- Status crudo del Smartsheet (Active…)
  predecesores_ext     TEXT,                  -- números de fila crudos del Smartsheet (referencia)
  comentario           TEXT,
  origen               TEXT NOT NULL DEFAULT 'manual',       -- manual|import_excel|smartsheet
  external_ref         TEXT,                  -- id de fila del Excel → upsert idempotente
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (external_ref)
);
CREATE INDEX IF NOT EXISTS ing_tareas_asignado_fechas_idx ON ing_tareas (asignado_nombre, fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS ing_tareas_proyecto_idx ON ing_tareas (proyecto_ext);
CREATE INDEX IF NOT EXISTS ing_tareas_estado_idx ON ing_tareas (estado);

CREATE TABLE IF NOT EXISTS ing_tarea_deps (
  tarea_id      INT REFERENCES ing_tareas(id) ON DELETE CASCADE,
  depende_de_id INT REFERENCES ing_tareas(id) ON DELETE CASCADE,
  PRIMARY KEY (tarea_id, depende_de_id)
);
