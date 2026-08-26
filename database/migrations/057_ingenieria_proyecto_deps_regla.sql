-- ─────────────────────────────────────────────────────────────────────────────
-- 057 — Ingeniería: encabezado de proyecto (fecha FIJA) + dependencias con lag
--        + gancho para la regla de duración (día por ítem)
-- ─────────────────────────────────────────────────────────────────────────────
-- El módulo de Tareas de Ingeniería (réplica editable del Smartsheet) necesita:
--  1) La FECHA DE ENTREGA FIJA por proyecto (el Finish de la fila-proyecto del
--     Excel). NO se puede derivar de max(fecha_fin) de las tareas: borrar la
--     última tarea movería la entrega, que es justo lo que NO queremos. Va en
--     una tabla propia (ing_proyectos).
--  2) Dependencias con tipo (FS/SS/FF/SF) y lag en días — hoy predecesores_ext
--     es texto crudo; acá se materializan como aristas editables.
--  3) La regla de duración vive en el catálogo: dias_por_item (shop drawings = 1).
--
-- Todo ADITIVO. No toca schedule/motor/plantilla ni el flujo de Estimados.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Encabezado del proyecto de Ingeniería (la fila-proyecto del Smartsheet)
CREATE TABLE IF NOT EXISTS ing_proyectos (
  proyecto_ext    TEXT PRIMARY KEY,                              -- "26-599 Mars 400 - Phase 2"
  proyecto_id     INT REFERENCES proyectos(id) ON DELETE SET NULL,
  fecha_inicio    DATE,
  fecha_entrega   DATE,                                          -- FIJA (Finish del Smartsheet) = sagrada del módulo
  dur_total_dias  NUMERIC(7,2),
  n_items         INT,                                           -- parámetro de la regla de duración
  presupuesto     NUMERIC(14,2),                                 -- parámetro de la regla de duración
  status_ext      TEXT,
  origen          TEXT NOT NULL DEFAULT 'import_excel',          -- import_excel | manual
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Dependencias con tipo + lag (la tabla ya existía vacía en la 054)
ALTER TABLE ing_tarea_deps
  ADD COLUMN IF NOT EXISTS tipo     TEXT NOT NULL DEFAULT 'FS',  -- FS|SS|FF|SF (hoy el Excel solo usa FS)
  ADD COLUMN IF NOT EXISTS lag_dias INT  NOT NULL DEFAULT 0;     -- días hábiles de holgura/retraso ("+6d")

-- 3) Regla de duración por tipo (hoy manual; mañana sugerencia). shop drawings ≈ 1 día/ítem
ALTER TABLE ing_tarea_tipos
  ADD COLUMN IF NOT EXISTS dias_por_item NUMERIC(6,2);
UPDATE ing_tarea_tipos SET dias_por_item = 1.0 WHERE clave = 'shop_drawings';
