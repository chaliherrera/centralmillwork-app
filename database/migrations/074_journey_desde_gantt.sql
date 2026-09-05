-- ─────────────────────────────────────────────────────────────────────────────
-- 074 — El journey/schedule toma TODAS sus fechas del Gantt de ingeniería.
-- ─────────────────────────────────────────────────────────────────────────────
-- Fin del motor teórico (Life of a Deal). Cada hito de la plantilla apunta a un
-- PASO del Gantt (gantt_clave) y a un ancla (inicio|fin); la proyección (Paso 2/3)
-- toma esa fecha del CPM real. Varios hitos pueden apuntar al mismo paso.
--   · Poda 3 hitos internos que nadie mira: E-04 (muestras enviadas, redundante con
--     E-05), QC-01 (control por etapa, interno del taller), QC-03 (reproceso, cond).
--   · Re-agrega S-04 (Envío): su fecha real sale de la estación 'shipping' de
--     producción (Paso 3, captura), la planeada del paso 'shipment' del Gantt.
--   · E-03/E-08 pasan de 'cond' a 'normal' (son pasos reales del Gantt).
--   · Corrige aristas de plantilla que contradicen ing_tipo_deps (si no, al volver
--     E-03 'normal' se bloquearía la subida de planos): quita E-06←E-03, agrega
--     E-03←E-07, quita P-01←E-05.
--   · X-03 (pago final) e I-07 (entrega) NO toman fecha de un paso: X-03 sin fecha
--     planeada (decisión de Chali); I-07 = fecha de entrega (lo maneja la proyección).
--   · Resetea baselines teóricas (fecha_baseline) de hitos no cumplidos.
-- Idempotente. Se aplica DIRECTO (esta base no usa el runner de migraciones).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Columnas del mapeo al Gantt (aditivas).
ALTER TABLE schedule_plantilla_hitos
  ADD COLUMN IF NOT EXISTS gantt_clave    TEXT,
  ADD COLUMN IF NOT EXISTS gantt_ancla    TEXT,
  ADD COLUMN IF NOT EXISTS gantt_lag_dias INTEGER NOT NULL DEFAULT 0;

-- 2) Re-agregar S-04 (Envío) a la plantilla activa (fue podado en 069).
INSERT INTO schedule_plantilla_hitos
  (plantilla_id, codigo, fase, nombre, tipo, es_gate, es_ancla, rol_responsable,
   dur_dias_default, dur_dias_min, dur_dias_max, parent_codigo, orden, fuente_dato)
SELECT p.id, 'S-04', 'SHIPPING', 'Envío', 'normal', false, false, 'production',
       1, 1, 1, NULL, 400, 'op_estacion'
FROM schedule_plantillas p WHERE p.activa
ON CONFLICT (plantilla_id, codigo) DO NOTHING;

-- 3) Mapeo hito → (paso del Gantt, ancla). Un paso puede alimentar varios hitos.
UPDATE schedule_plantilla_hitos ph SET gantt_clave = m.clave, gantt_ancla = m.ancla
FROM (VALUES
  ('C-03','po_execution','fin'),
  ('C-04','material_deposit','fin'),
  ('E-01','meeting_designer','fin'),
  ('E-03','field_measurements','fin'),
  ('E-05','samples','fin'),
  ('E-06','shop_drawings','fin'),
  ('E-07','approval','fin'),
  ('E-08','sd_update','fin'),
  ('E-09','material_proc','inicio'),
  ('E-10','release','fin'),
  ('E-11','cnc','fin'),
  ('M-03','long_leads','fin'),
  ('M-04','material_proc','fin'),
  ('M-05','material_proc','fin'),
  ('M-07','material_proc','fin'),
  ('P-01','fabrication','inicio'),
  ('P-05','fabrication','inicio'),
  ('P-06','fabrication','fin'),
  ('QC-02','fabrication','fin'),
  ('S-04','shipment','fin'),
  ('I-04','installation','inicio'),
  ('I-05','installation','fin'),
  ('I-06','installation','fin')
) AS m(codigo, clave, ancla)
WHERE ph.codigo = m.codigo;

-- I-07 (entrega/sign-off) e X-03 (pago final) NO mapean a un paso: la proyección
-- pone I-07 = fecha de entrega (planeada) + fin_proyectado (proyectada); X-03 queda
-- sin fecha planeada (se marca solo cuando el cliente paga).
UPDATE schedule_plantilla_hitos SET gantt_clave = NULL, gantt_ancla = NULL
 WHERE codigo IN ('I-07','X-03');

-- 4) E-03 y E-08 son pasos reales del Gantt: dejan de ser condicionales.
UPDATE schedule_plantilla_hitos SET tipo = 'normal' WHERE codigo IN ('E-03','E-08');

-- 5) Corregir aristas de plantilla que contradicen la ruta real (ing_tipo_deps).
--    a) Los planos (E-06) NO dependen de la medición (E-03) — es al revés.
DELETE FROM schedule_plantilla_dependencias
 WHERE hito_codigo = 'E-06' AND depende_de_codigo = 'E-03';
--    b) La medición (E-03) va DESPUÉS de la aprobación de planos (E-07).
INSERT INTO schedule_plantilla_dependencias (plantilla_id, hito_codigo, depende_de_codigo)
SELECT h.plantilla_id, 'E-03', 'E-07'
FROM schedule_plantilla_hitos h
JOIN schedule_plantillas p ON p.id = h.plantilla_id AND p.activa
WHERE h.codigo = 'E-03'
ON CONFLICT (plantilla_id, hito_codigo, depende_de_codigo) DO NOTHING;
--    c) Producción (P-01) NO espera a las muestras (E-05).
DELETE FROM schedule_plantilla_dependencias
 WHERE hito_codigo = 'P-01' AND depende_de_codigo = 'E-05';

-- 6) PODA de E-04, QC-01, QC-03. Primero re-coser el puente (E-05 dependía de E-04).
INSERT INTO schedule_plantilla_dependencias (plantilla_id, hito_codigo, depende_de_codigo)
SELECT h.plantilla_id, 'E-05', 'E-01'
FROM schedule_plantilla_hitos h
JOIN schedule_plantillas p ON p.id = h.plantilla_id AND p.activa
WHERE h.codigo = 'E-05'
ON CONFLICT (plantilla_id, hito_codigo, depende_de_codigo) DO NOTHING;

DELETE FROM schedule_plantilla_dependencias
 WHERE hito_codigo IN ('E-04','QC-01','QC-03')
    OR depende_de_codigo IN ('E-04','QC-01','QC-03');

-- Instancias sin fecha registrada (prod-safe: nunca se borra un hito con dato real).
DELETE FROM schedule_hitos
 WHERE fecha_real IS NULL AND codigo IN ('E-04','QC-01','QC-03');

DELETE FROM schedule_plantilla_hitos WHERE codigo IN ('E-04','QC-01','QC-03');

-- 7) Reset de baselines teóricas: los hitos no cumplidos re-baselinean con el Gantt
--    en la primera corrida de la proyección.
UPDATE schedule_hitos SET fecha_baseline = NULL WHERE fecha_real IS NULL;

COMMENT ON COLUMN schedule_plantilla_hitos.gantt_clave IS
  'Paso del Gantt (ing_tarea_tipos.clave) del que este hito toma su fecha. NULL = no mapea (I-07 entrega, X-03 pago).';
COMMENT ON COLUMN schedule_plantilla_hitos.gantt_ancla IS
  'inicio|fin: si el hito toma la fecha de inicio o de fin del paso del Gantt.';
