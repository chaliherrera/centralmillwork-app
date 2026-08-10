-- ─────────────────────────────────────────────────────────────────────────────
-- 046 — Módulo Schedule (Life of a Deal) — motor de hitos + plantilla canónica
-- ─────────────────────────────────────────────────────────────────────────────
-- Etapa 1 del proyecto "Life of a Deal": schedule inteligente de proyectos que
-- programa hacia atrás desde una fecha de entrega objetivo y recalcula solo
-- ante cada hecho real (recepción, avance de OP, etc.).
--
-- Diseño: docs/SCHEDULE_LIFE_OF_A_DEAL.md (Mapa de Hitos Rev 1) +
--         docs/SCHEDULE_ETAPA1_DISENO_TECNICO.md (arquitectura del motor).
--
-- Esta migración crea las 7 tablas del módulo y siembra la plantilla canónica
-- "Millwork estándar" (8 fases, 53 hitos principales + 5 sub-tareas de E-01).
--
-- Nada de esto afecta el flujo existente: son tablas nuevas, sin FKs que
-- modifiquen tablas actuales (solo referencian proyectos/usuarios en read).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Catálogo de plantillas ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_plantillas (
  id           SERIAL PRIMARY KEY,
  nombre       TEXT NOT NULL UNIQUE,
  descripcion  TEXT,
  activa       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Hitos canónicos de una plantilla ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_plantilla_hitos (
  id               SERIAL PRIMARY KEY,
  plantilla_id     INTEGER NOT NULL REFERENCES schedule_plantillas(id) ON DELETE CASCADE,
  codigo           TEXT NOT NULL,                 -- 'M-07', 'P-01', 'E-01a'…
  fase             TEXT NOT NULL,                 -- CONTRACT…COMPLETED
  nombre           TEXT NOT NULL,
  tipo             TEXT NOT NULL DEFAULT 'normal',-- normal | gate | cont | cond
  es_gate          BOOLEAN NOT NULL DEFAULT false,
  es_ancla         BOOLEAN NOT NULL DEFAULT false,-- el hito de entrega: se ancla a fecha_objetivo
  rol_responsable  TEXT,                          -- rol del PDF (mapeo a roles app pendiente)
  dur_dias_default INTEGER NOT NULL DEFAULT 1,    -- duración en DÍAS HÁBILES
  dur_dias_min     INTEGER,
  dur_dias_max     INTEGER,
  parent_codigo    TEXT,                          -- sub-tarea de (E-01a → E-01)
  orden            INTEGER NOT NULL DEFAULT 0,    -- orden de display
  fuente_dato      TEXT NOT NULL DEFAULT 'manual_futuro',
                   -- manual_futuro | oc_emitida | cotizacion | readiness | op_estacion | qc | portal | archivo
  UNIQUE (plantilla_id, codigo)
);

-- ── Dependencias entre hitos de la plantilla (aristas del DAG) ────────────────
CREATE TABLE IF NOT EXISTS schedule_plantilla_dependencias (
  id                 SERIAL PRIMARY KEY,
  plantilla_id       INTEGER NOT NULL REFERENCES schedule_plantillas(id) ON DELETE CASCADE,
  hito_codigo        TEXT NOT NULL,               -- el que depende
  depende_de_codigo  TEXT NOT NULL,               -- su predecesor
  UNIQUE (plantilla_id, hito_codigo, depende_de_codigo)
);

-- ── Plan instanciado para un proyecto (o item) ───────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_planes (
  id                       SERIAL PRIMARY KEY,
  proyecto_id              INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  plantilla_id             INTEGER NOT NULL REFERENCES schedule_plantillas(id),
  scope                    TEXT NOT NULL DEFAULT 'proyecto',  -- proyecto | item (item = futuro)
  item_ref                 TEXT,                              -- número de item, solo si scope='item'
  fecha_objetivo           DATE NOT NULL,                     -- ancla sagrada (P1). Campo propio.
  fecha_objetivo_original  DATE NOT NULL,                     -- la primera confirmada; nunca cambia
  semaforo                 TEXT NOT NULL DEFAULT 'gris',      -- verde|amarillo|rojo|gris
  holgura_dias             INTEGER,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedule_planes_proyecto ON schedule_planes (proyecto_id);

-- ── Instancias de hito dentro de un plan ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_hitos (
  id                      SERIAL PRIMARY KEY,
  plan_id                 INTEGER NOT NULL REFERENCES schedule_planes(id) ON DELETE CASCADE,
  codigo                  TEXT NOT NULL,
  fecha_planeada          DATE,                    -- calculada hacia atrás
  fecha_baseline          DATE,                    -- la primera planeada; para medir slippage
  fecha_real              TIMESTAMPTZ,             -- cuándo se cumplió (null si no)
  fecha_proyectada        DATE,                    -- reloj hacia adelante
  estado                  TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente|cumplido|en_riesgo|vencido|no_aplica
  semaforo                TEXT NOT NULL DEFAULT 'gris',        -- verde|amarillo|rojo|gris
  holgura_dias            INTEGER,
  responsable_usuario_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  atribucion_atraso       TEXT,                    -- cliente|gc|vendor|engineering|procurement|…
  evidencia_ref           JSONB,                   -- de dónde salió la fecha real (id recepción, OP…)
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, codigo)
);

-- ── Calendario laboral (feriados / semanas de cierre) ────────────────────────
-- Días hábiles = lunes a viernes MENOS las fechas de esta tabla.
CREATE TABLE IF NOT EXISTS schedule_feriados (
  fecha        DATE PRIMARY KEY,
  descripcion  TEXT
);

-- ── Bitácora de recálculos ("¿por qué se movió esto?") ───────────────────────
CREATE TABLE IF NOT EXISTS schedule_eventos (
  id             SERIAL PRIMARY KEY,
  plan_id        INTEGER NOT NULL REFERENCES schedule_planes(id) ON DELETE CASCADE,
  hito_codigo    TEXT,
  tipo           TEXT NOT NULL,                    -- recalculo|fecha_real|cambio_objetivo
  descripcion    TEXT,
  dias_delta     INTEGER,
  disparado_por  TEXT,                             -- recepcion|op|manual|cron
  payload        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedule_eventos_plan ON schedule_eventos (plan_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED — Plantilla canónica "Millwork estándar" (Life of a Deal Rev 1)
-- Idempotente: solo siembra si la plantilla no existe.
-- Duraciones en días hábiles; son ESTIMACIONES a calibrar con los owners.
-- fuente_dato: qué hitos captura el motor en Etapa 1 (Compras/Producción/QC).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pid INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM schedule_plantillas WHERE nombre = 'Millwork estándar') THEN
    RETURN;
  END IF;

  INSERT INTO schedule_plantillas (nombre, descripcion, activa)
    VALUES ('Millwork estándar',
            'Plantilla canónica Life of a Deal Rev 1 — 8 fases, 53 hitos. Duraciones estimadas a calibrar.',
            true)
    RETURNING id INTO v_pid;

  INSERT INTO schedule_plantilla_hitos
    (plantilla_id, codigo, fase, nombre, tipo, es_gate, es_ancla, rol_responsable,
     dur_dias_default, dur_dias_min, dur_dias_max, parent_codigo, orden, fuente_dato) VALUES
  -- FASE 1 · CONTRACT
  (v_pid,'C-01','CONTRACT','Proyecto en negociación','normal',false,false,'Estimator',        1, 1, 1, NULL, 10,'manual_futuro'),
  (v_pid,'C-02','CONTRACT','Contrato revisado / addendum','normal',false,false,'Estimator',    7, 3,10, NULL, 20,'manual_futuro'),
  (v_pid,'C-03','CONTRACT','Contrato firmado (día cero)','gate',true,false,'Estimator+CFO',    1, 1, 1, NULL, 30,'manual_futuro'),
  (v_pid,'C-04','CONTRACT','Depósito de materiales recibido','normal',false,false,'Office Manager',10,5,15,NULL,40,'manual_futuro'),
  (v_pid,'C-05','CONTRACT','MTO preliminar validado','normal',false,false,'Estimator',         2, 1, 2, NULL, 50,'manual_futuro'),
  (v_pid,'C-06','CONTRACT','Budget del proyecto validado','normal',false,false,'Estimator',    1, 1, 1, NULL, 60,'manual_futuro'),
  (v_pid,'C-07','CONTRACT','Project announcement enviado','normal',false,false,'Estimator',    1, 1, 1, NULL, 70,'manual_futuro'),
  (v_pid,'C-08','CONTRACT','Kickoff = revisión completa','normal',false,false,'Estimator+Eng+PM',1,1,1,NULL, 80,'manual_futuro'),
  (v_pid,'C-09','CONTRACT','POC transferido a Engineer/PM','normal',false,false,'Estimator',   1, 1, 1, NULL, 90,'manual_futuro'),
  -- FASE 2 · ENGINEERING
  (v_pid,'E-01','ENGINEERING','Design call / arranque de ingeniería','normal',false,false,'Engineer',2,1,2,NULL,100,'manual_futuro'),
  (v_pid,'E-01a','ENGINEERING','Long lead times identificados','gate',true,false,'Engineer+PM',3,2,3,'E-01',101,'manual_futuro'),
  (v_pid,'E-01b','ENGINEERING','Compra anticipada aprobada por cliente','gate',true,false,'PM',7,3,10,'E-01',102,'manual_futuro'),
  (v_pid,'E-01c','ENGINEERING','Muestras solicitadas al cliente','normal',false,false,'Engineer',1,1,1,'E-01',103,'manual_futuro'),
  (v_pid,'E-01d','ENGINEERING','Revisión de schedule','normal',false,false,'Engineer+PM',1,1,1,'E-01',104,'manual_futuro'),
  (v_pid,'E-01e','ENGINEERING','Estimado validado','normal',false,false,'Engineer',1,1,1,'E-01',105,'manual_futuro'),
  (v_pid,'E-02','ENGINEERING','V/E propuesto al cliente','cond',false,false,'Engineer+PM',      4, 3, 5, NULL,110,'manual_futuro'),
  (v_pid,'E-03','ENGINEERING','VIF / medición en obra','cond',false,false,'Field Specialist',  2, 1, 2, NULL,120,'manual_futuro'),
  (v_pid,'E-04','ENGINEERING','Muestras fabricadas y enviadas','normal',false,false,'Shop Manager',12,10,14,NULL,130,'manual_futuro'),
  (v_pid,'E-05','ENGINEERING','Muestras aprobadas por el cliente','gate',true,false,'Engineer',10,5,15,NULL,140,'manual_futuro'),
  (v_pid,'E-06','ENGINEERING','Shop drawings emitidos al cliente','normal',false,false,'Engineer',18,10,25,NULL,150,'manual_futuro'),
  (v_pid,'E-07','ENGINEERING','Shop drawings aprobados por el cliente','gate',true,false,'Engineer',15,10,20,NULL,160,'manual_futuro'),
  (v_pid,'E-08','ENGINEERING','Revisiones incorporadas y resubmittal','cond',false,false,'Engineer',5,3,10,NULL,170,'manual_futuro'),
  (v_pid,'E-09','ENGINEERING','MTO final liberado a compras','gate',true,false,'Engineer',      3, 2, 5, NULL,180,'manual_futuro'),
  (v_pid,'E-10','ENGINEERING','Release to Production','gate',true,false,'Engineer',             1, 1, 1, NULL,190,'manual_futuro'),
  (v_pid,'E-11','ENGINEERING','Archivos CNC entregados','gate',true,false,'Engineer',           3, 2, 5, NULL,200,'manual_futuro'),
  (v_pid,'E-12','ENGINEERING','Gestión de riesgo (¿el plazo se cumple?)','cont',false,false,'Engineer+PM',0,0,0,NULL,210,'manual_futuro'),
  -- FASE 3 · MATERIALS
  (v_pid,'M-01','MATERIALS','Revisión de schedule de Compras','cont',false,false,'Procurement Mgr',0,0,0,NULL,220,'manual_futuro'),
  (v_pid,'M-02','MATERIALS','Budget de materiales validado','normal',false,false,'Procurement Mgr',3,2,3,NULL,230,'manual_futuro'),
  (v_pid,'M-03','MATERIALS','Long-lead ordenados','gate',true,false,'Procurement Mgr',          2, 1, 3, NULL,240,'oc_emitida'),
  (v_pid,'M-04','MATERIALS','MTO cotizado','normal',false,false,'Procurement Mgr',              7, 5,10, NULL,250,'cotizacion'),
  (v_pid,'M-05','MATERIALS','OCs emitidas','normal',false,false,'Procurement Mgr',              3, 2, 3, NULL,260,'oc_emitida'),
  (v_pid,'M-06','MATERIALS','POs a subcontratistas','cond',false,false,'PM+CFO',                7, 5,10, NULL,270,'manual_futuro'),
  (v_pid,'M-07','MATERIALS','Material recibido y stockeado 100%','gate',true,false,'Procurement Mgr',30,10,60,NULL,280,'readiness'),
  -- FASE 4 · PRODUCTION
  (v_pid,'P-01','PRODUCTION','Production Intake (gate compuesto)','gate',true,false,'Production Mgr',1,1,1,NULL,290,'manual_futuro'),
  (v_pid,'P-02','PRODUCTION','Distribución a producción','normal',false,false,'Production Controller',1,1,1,NULL,300,'manual_futuro'),
  (v_pid,'P-03','PRODUCTION','Budget de labor validado','normal',false,false,'Production Mgr',  1, 1, 1, NULL,310,'manual_futuro'),
  (v_pid,'P-04','PRODUCTION','3-Week Lookahead (formulario del sistema)','cont',false,false,'PM+Production Mgr',0,0,0,NULL,320,'manual_futuro'),
  (v_pid,'P-05','PRODUCTION','Fabricación en curso','cont',false,false,'Production Team',       20,10,30, NULL,330,'op_estacion'),
  (v_pid,'P-06','PRODUCTION','Fabricación completa','normal',false,false,'Production Mgr',       1, 1, 1, NULL,340,'op_estacion'),
  -- FASE 5 · QC
  (v_pid,'QC-01','QC','Controles por etapa','cont',false,false,'Production Assistant',          0, 0, 0, NULL,350,'qc'),
  (v_pid,'QC-02','QC','QC final aprobado','gate',true,false,'Production Assistant',             2, 1, 3, NULL,360,'qc'),
  (v_pid,'QC-03','QC','Reproceso por defecto','cond',false,false,'Production Mgr',              0, 0, 0, NULL,370,'qc'),
  -- FASE 6 · SHIPPING
  (v_pid,'S-01','SHIPPING','Packaging completo','normal',false,false,'Production Team',          2, 1, 3, NULL,380,'manual_futuro'),
  (v_pid,'S-02','SHIPPING','Delivery request emitido (48 h)','gate',true,false,'PM',            1, 1, 1, NULL,390,'manual_futuro'),
  (v_pid,'S-03','SHIPPING','Transporte confirmado + BOL','normal',false,false,'Logistics Mgr',  2, 1, 2, NULL,400,'manual_futuro'),
  (v_pid,'S-04','SHIPPING','Despachado','normal',false,false,'Logistics Mgr',                   1, 1, 1, NULL,410,'manual_futuro'),
  (v_pid,'S-05','SHIPPING','Recepción en obra coordinada','cond',false,false,'Field Specialist',1, 1, 1, NULL,420,'manual_futuro'),
  -- FASE 7 · INSTALL
  (v_pid,'I-01','INSTALL','Fechas de instalación coordinadas','gate',true,false,'PM',           4, 3, 5, NULL,430,'manual_futuro'),
  (v_pid,'I-02','INSTALL','Materiales de instalación comprados','gate',true,false,'Procurement Mgr',3,2,5,NULL,440,'manual_futuro'),
  (v_pid,'I-03','INSTALL','Obra lista para instalar (GC)','gate',true,false,'PM',               1, 1, 1, NULL,450,'manual_futuro'),
  (v_pid,'I-04','INSTALL','Instalación iniciada','normal',false,false,'Field Specialist',       1, 1, 1, NULL,460,'manual_futuro'),
  (v_pid,'I-05','INSTALL','Instalación en curso','cont',false,false,'Field Specialist',         12,5,20, NULL,470,'manual_futuro'),
  (v_pid,'I-06','INSTALL','Punch list cerrado','gate',true,false,'Field Specialist',            5, 3,10, NULL,480,'manual_futuro'),
  (v_pid,'I-07','INSTALL','Sign-off del cliente (ENTREGA)','normal',false,true,'PM',            1, 1, 1, NULL,490,'manual_futuro'),
  -- FASE 8 · COMPLETED
  (v_pid,'X-01','COMPLETED','Closeout report interno','normal',false,false,'PM',                3, 2, 3, NULL,500,'manual_futuro'),
  (v_pid,'X-02','COMPLETED','Carpeta del proyecto archivada','normal',false,false,'PM',         1, 1, 1, NULL,510,'manual_futuro'),
  (v_pid,'X-03','COMPLETED','Pago final recibido','normal',false,false,'Financial Mgr',         45,30,90, NULL,520,'manual_futuro'),
  (v_pid,'X-04','COMPLETED','P&L final emitido','normal',false,false,'CFO',                     5, 5, 5, NULL,530,'manual_futuro');

  INSERT INTO schedule_plantilla_dependencias (plantilla_id, hito_codigo, depende_de_codigo) VALUES
  -- CONTRACT
  (v_pid,'C-02','C-01'),(v_pid,'C-03','C-02'),(v_pid,'C-04','C-03'),(v_pid,'C-05','C-03'),
  (v_pid,'C-06','C-03'),(v_pid,'C-07','C-05'),(v_pid,'C-07','C-06'),(v_pid,'C-08','C-07'),(v_pid,'C-09','C-08'),
  -- ENGINEERING
  (v_pid,'E-01','C-08'),
  (v_pid,'E-01a','E-01'),(v_pid,'E-01b','E-01'),(v_pid,'E-01c','E-01'),(v_pid,'E-01d','E-01'),(v_pid,'E-01e','E-01'),
  (v_pid,'E-02','E-01'),(v_pid,'E-03','E-01'),(v_pid,'E-04','E-01c'),(v_pid,'E-05','E-04'),
  (v_pid,'E-06','E-01'),(v_pid,'E-06','E-03'),(v_pid,'E-07','E-06'),(v_pid,'E-08','E-07'),
  (v_pid,'E-09','E-07'),(v_pid,'E-10','E-07'),(v_pid,'E-11','E-10'),
  -- MATERIALS
  (v_pid,'M-01','C-07'),(v_pid,'M-02','E-09'),(v_pid,'M-03','E-01b'),(v_pid,'M-04','E-09'),
  (v_pid,'M-05','M-04'),(v_pid,'M-05','M-02'),(v_pid,'M-06','E-10'),(v_pid,'M-07','M-05'),
  -- PRODUCTION
  (v_pid,'P-01','E-05'),(v_pid,'P-01','E-07'),(v_pid,'P-01','E-10'),(v_pid,'P-01','E-11'),(v_pid,'P-01','M-07'),
  (v_pid,'P-02','P-01'),(v_pid,'P-03','P-01'),(v_pid,'P-04','P-01'),(v_pid,'P-05','P-02'),(v_pid,'P-06','P-05'),
  -- QC
  (v_pid,'QC-01','P-05'),(v_pid,'QC-02','P-06'),(v_pid,'QC-03','QC-01'),
  -- SHIPPING
  (v_pid,'S-01','QC-02'),(v_pid,'S-02','S-01'),(v_pid,'S-03','S-02'),(v_pid,'S-04','S-03'),(v_pid,'S-05','S-04'),
  -- INSTALL
  (v_pid,'I-01','QC-02'),(v_pid,'I-02','I-01'),(v_pid,'I-04','S-05'),(v_pid,'I-04','I-02'),(v_pid,'I-04','I-03'),
  (v_pid,'I-05','I-04'),(v_pid,'I-06','I-05'),(v_pid,'I-07','I-06'),
  -- COMPLETED
  (v_pid,'X-01','I-07'),(v_pid,'X-02','X-01'),(v_pid,'X-03','I-07'),(v_pid,'X-04','X-03');

END $$;

COMMENT ON TABLE schedule_planes IS
  'Plan de schedule por proyecto (Life of a Deal). fecha_objetivo es el ancla sagrada (P1): campo propio, no se recalcula sola.';
COMMENT ON TABLE schedule_hitos IS
  'Instancias de hito de un plan. fecha_planeada = hacia atrás desde el ancla; fecha_real = evidencia; holgura = planeada - proyectada.';
COMMENT ON COLUMN schedule_plantilla_hitos.fuente_dato IS
  'Cómo el motor captura la fecha real. Etapa 1 activas: oc_emitida, cotizacion, readiness, op_estacion, qc. El resto manual_futuro (etapas posteriores).';
