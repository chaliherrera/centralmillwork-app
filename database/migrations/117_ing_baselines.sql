-- 117_ing_baselines.sql
-- Línea base (baseline) del Gantt de Ingeniería, con histórico.
--
-- El scheduler "congela" una foto del plan (inicio/fin/duración de cada tarea).
-- La baseline ACTIVA = la más reciente del proyecto. La Variación de cada tarea
-- se calcula contra ella (fin real/calculado − fin de la línea base). Se puede
-- re-guardar cuando quiera (decisión Chali): cada captura queda archivada para
-- comparar versiones y auditar.
--
-- SEGURO/ADITIVO: solo crea dos tablas nuevas. No toca ing_tareas ni nada en uso.

CREATE TABLE IF NOT EXISTS ing_baselines (
  id            SERIAL PRIMARY KEY,
  proyecto_ext  TEXT NOT NULL,
  nota          TEXT,                                   -- opcional: por qué se guardó ("baseline inicial", "re-plan oct")
  created_by    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Foto por tarea en el momento de guardar la línea base.
CREATE TABLE IF NOT EXISTS ing_baseline_tareas (
  baseline_id   INT NOT NULL REFERENCES ing_baselines(id) ON DELETE CASCADE,
  tarea_id      INT NOT NULL REFERENCES ing_tareas(id)    ON DELETE CASCADE,
  inicio        DATE,
  fin           DATE,
  dur_dias      NUMERIC(6,2),
  PRIMARY KEY (baseline_id, tarea_id)
);

-- Para encontrar rápido la baseline ACTIVA (la más reciente) de un proyecto.
CREATE INDEX IF NOT EXISTS idx_ing_baselines_proy_fecha
  ON ing_baselines (proyecto_ext, created_at DESC);
