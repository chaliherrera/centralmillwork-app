-- ============================================================================
-- Time Tracking — clock in/out, asignación de tiempo a proyectos, pausas
-- ============================================================================
-- Modelo:
--   time_registros   → un row por jornada (clock-in → clock-out) por operario
--   time_proyectos   → segmentos de trabajo dentro de la jornada (cambios de proyecto)
--   time_pausas      → breaks dentro de la jornada
--   time_resumen_diario → tabla materializada para reportes rápidos (calculada por job)
--
-- Todos los registros llevan `dispositivo` (ej: 'tablet-cnc-01') para auditar
-- desde qué tablet se hizo cada acción.
-- ============================================================================

-- 1. Registros de jornada (clock in / clock out)
CREATE TABLE IF NOT EXISTS time_registros (
  id            SERIAL PRIMARY KEY,
  personal_id   INT NOT NULL REFERENCES personal_taller(id) ON DELETE RESTRICT,
  fecha         DATE NOT NULL,
  hora_entrada  TIMESTAMPTZ NOT NULL,
  hora_salida   TIMESTAMPTZ,
  total_horas   DECIMAL(5,2) GENERATED ALWAYS AS (
                  CASE
                    WHEN hora_salida IS NOT NULL THEN
                      EXTRACT(EPOCH FROM (hora_salida - hora_entrada)) / 3600
                    ELSE NULL
                  END
                ) STORED,
  status        TEXT CHECK (status IN ('activo','finalizado','pausado')) DEFAULT 'activo',
  dispositivo   TEXT,   -- ej: 'tablet-cnc-01'
  notas         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_reg_personal ON time_registros(personal_id);
CREATE INDEX IF NOT EXISTS idx_time_reg_fecha    ON time_registros(fecha);
CREATE INDEX IF NOT EXISTS idx_time_reg_status   ON time_registros(status);

-- Índice parcial: a lo sumo un registro 'activo' por operario.
-- (Garantiza que no se pueda hacer doble clock-in.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_time_reg_personal_activo
  ON time_registros(personal_id) WHERE status = 'activo';

COMMENT ON COLUMN time_registros.dispositivo
  IS 'Identificador de la tablet desde la cual se hizo el clock-in. Auditoría.';

-- 2. Segmentos de trabajo por proyecto (un operario puede cambiar de proyecto
-- varias veces en su jornada — un row por cambio).
CREATE TABLE IF NOT EXISTS time_proyectos (
  id                   SERIAL PRIMARY KEY,
  registro_id          INT NOT NULL REFERENCES time_registros(id) ON DELETE CASCADE,
  personal_id          INT NOT NULL REFERENCES personal_taller(id) ON DELETE RESTRICT,
  proyecto_id          INT  NOT NULL REFERENCES proyectos(id) ON DELETE RESTRICT,
  estacion             TEXT NOT NULL,
  orden_produccion_id  INT REFERENCES ordenes_produccion(id) ON DELETE SET NULL,
  hora_inicio          TIMESTAMPTZ NOT NULL,
  hora_fin             TIMESTAMPTZ,
  total_horas          DECIMAL(5,2) GENERATED ALWAYS AS (
                         CASE
                           WHEN hora_fin IS NOT NULL THEN
                             EXTRACT(EPOCH FROM (hora_fin - hora_inicio)) / 3600
                           ELSE NULL
                         END
                       ) STORED,
  descripcion_trabajo  TEXT,
  completado           BOOLEAN DEFAULT false,
  dispositivo          TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_proy_personal ON time_proyectos(personal_id);
CREATE INDEX IF NOT EXISTS idx_time_proy_proyecto ON time_proyectos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_time_proy_inicio   ON time_proyectos(hora_inicio);
CREATE INDEX IF NOT EXISTS idx_time_proy_registro ON time_proyectos(registro_id);

-- Índice parcial: a lo sumo un segmento de proyecto abierto por operario.
CREATE UNIQUE INDEX IF NOT EXISTS uq_time_proy_personal_abierto
  ON time_proyectos(personal_id) WHERE hora_fin IS NULL;

-- 3. Pausas / breaks dentro de la jornada
CREATE TABLE IF NOT EXISTS time_pausas (
  id                SERIAL PRIMARY KEY,
  registro_id       INT NOT NULL REFERENCES time_registros(id) ON DELETE CASCADE,
  personal_id       INT NOT NULL REFERENCES personal_taller(id) ON DELETE RESTRICT,
  hora_inicio       TIMESTAMPTZ NOT NULL,
  hora_fin          TIMESTAMPTZ,
  motivo            TEXT,
  duracion_minutos  DECIMAL(6,2) GENERATED ALWAYS AS (
                      CASE
                        WHEN hora_fin IS NOT NULL THEN
                          EXTRACT(EPOCH FROM (hora_fin - hora_inicio)) / 60
                        ELSE NULL
                      END
                    ) STORED,
  dispositivo       TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pausas_personal  ON time_pausas(personal_id);
CREATE INDEX IF NOT EXISTS idx_pausas_registro  ON time_pausas(registro_id);

-- Índice parcial: a lo sumo una pausa abierta por operario.
CREATE UNIQUE INDEX IF NOT EXISTS uq_time_pausa_personal_abierta
  ON time_pausas(personal_id) WHERE hora_fin IS NULL;

-- 4. Resumen diario (tabla materializada para reportes rápidos)
-- Se actualiza por job nightly o on-demand desde el controller de reportes.
CREATE TABLE IF NOT EXISTS time_resumen_diario (
  id                      SERIAL PRIMARY KEY,
  personal_id             INT NOT NULL REFERENCES personal_taller(id) ON DELETE CASCADE,
  fecha                   DATE NOT NULL,
  total_horas_trabajadas  DECIMAL(5,2),
  total_horas_pausas      DECIMAL(5,2),
  total_horas_netas       DECIMAL(5,2),
  proyectos_trabajados    JSONB,
  generado_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(personal_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_resumen_personal ON time_resumen_diario(personal_id);
CREATE INDEX IF NOT EXISTS idx_resumen_fecha    ON time_resumen_diario(fecha);

COMMENT ON TABLE time_resumen_diario
  IS 'Snapshot calculado de horas por día y persona. Recalculable desde time_registros + time_pausas + time_proyectos.';
