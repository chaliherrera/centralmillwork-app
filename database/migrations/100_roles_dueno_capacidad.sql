-- 100_roles_dueno_capacidad.sql
-- Modelo limpio de roles en ing_tarea_tipos. La columna `rol` mezclaba 3 conceptos
-- (escritorio, capacidad del ingeniero y responsable), y la 061 dejó `es_gate_cliente`
-- como intento de separar "no consume capacidad"… que NUNCA se cableó (columna muerta).
-- Se separan explícitamente:
--   · rol               = EJECUTOR / en qué escritorio aparece la tarea.
--   · dueno             = RESPONSABLE que la persigue (lo que muestra el Gantt).
--   · consume_capacidad = si consume horas del ingeniero (reemplaza a es_gate_cliente).
-- Corrección de fondo (Chali, validada contra el código y los docs del schedule): el
-- review/approval/long_leads/deposit los PERSIGUE Ingeniería/Estimados aunque el que
-- actúa en el gate sea el cliente (aprueba) o Compras (emite la OC). Idempotente.

ALTER TABLE ing_tarea_tipos ADD COLUMN IF NOT EXISTS dueno             TEXT;
ALTER TABLE ing_tarea_tipos ADD COLUMN IF NOT EXISTS consume_capacidad BOOLEAN NOT NULL DEFAULT FALSE;

-- Por defecto el dueño = el rol actual (se sobreescribe abajo para los casos corregidos).
UPDATE ing_tarea_tipos SET dueno = COALESCE(dueno, rol);

-- Solo el TRABAJO real de ingeniería consume capacidad del ingeniero. Los gates
-- (aprobaciones del cliente), las derivadas (compras/producción) y los hitos NO.
UPDATE ing_tarea_tipos SET consume_capacidad = TRUE
  WHERE clave IN ('meeting_designer','shop_drawings','samples','material_proc',
                  'field_measurements','sd_update','release','cnc');
UPDATE ing_tarea_tipos SET consume_capacidad = FALSE
  WHERE clave NOT IN ('meeting_designer','shop_drawings','samples','material_proc',
                      'field_measurements','sd_update','release','cnc');

-- Escritorio (rol): el depósito lo persigue Estimados; el review/approval entran al
-- dominio de Ingeniería (para registrar la decisión del cliente desde ahí).
UPDATE ing_tarea_tipos SET rol = 'estimacion' WHERE clave = 'material_deposit';
UPDATE ing_tarea_tipos SET rol = 'ingenieria'  WHERE clave IN ('client_review','approval');

-- Responsable (dueno) que muestra el Gantt: review/approval/long_leads = Ingeniería
-- (aunque el gate lo cierre el cliente o Compras); deposit = Estimados.
UPDATE ing_tarea_tipos SET dueno = 'ingenieria' WHERE clave IN ('client_review','approval','long_leads');
UPDATE ing_tarea_tipos SET dueno = 'estimacion' WHERE clave = 'material_deposit';
