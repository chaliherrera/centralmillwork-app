-- 116_ing_tarea_deps_tipo_check.sql
-- Endurece las dependencias de Ingeniería para los 4 tipos de MS Project.
--
-- Hasta ahora `tipo` era TEXT libre (default 'FS') SIN restricción: el motor
-- aplastaba cualquier cosa distinta de 'SS' a 'FS'. Ahora el motor entiende los
-- 4 tipos (FS/SS/FF/SF), así que la base debe garantizar que solo se guarden
-- esos 4, que el lag esté acotado, y que ninguna tarea dependa de sí misma.
--
-- SEGURO/ADITIVO: no agrega ni borra columnas. El saneo previo deja los datos
-- en el MISMO estado que el motor ya asumía (cualquier tipo desconocido = FS),
-- así que NO mueve ninguna fecha. En prod `ing_tarea_deps` está vacía (el
-- scheduler aún no se usa ahí); el saneo afecta 0 filas. Idempotente.

-- ── 1) Saneo previo (deja los datos válidos antes de activar los CHECK) ──
-- Normaliza mayúsculas/espacios ("fs " → "FS").
UPDATE ing_tarea_deps SET tipo = upper(trim(tipo))
 WHERE tipo IS DISTINCT FROM upper(trim(tipo));
-- Cualquier tipo desconocido → FS (es lo que el motor ya hacía).
UPDATE ing_tarea_deps SET tipo = 'FS'
 WHERE tipo NOT IN ('FS','SS','FF','SF');
-- Una auto-dependencia rompe el CPM (ciclo); no debería existir. Se espera 0.
DELETE FROM ing_tarea_deps WHERE tarea_id = depende_de_id;
-- Acota el lag a ±365 días hábiles.
UPDATE ing_tarea_deps SET lag_dias = GREATEST(-365, LEAST(365, lag_dias))
 WHERE lag_dias NOT BETWEEN -365 AND 365;

-- ── 2) CHECKs en ing_tarea_deps (DROP IF EXISTS + ADD para idempotencia) ──
ALTER TABLE ing_tarea_deps DROP CONSTRAINT IF EXISTS ing_tarea_deps_tipo_chk;
ALTER TABLE ing_tarea_deps ADD  CONSTRAINT ing_tarea_deps_tipo_chk
  CHECK (tipo IN ('FS','SS','FF','SF')) NOT VALID;
ALTER TABLE ing_tarea_deps VALIDATE CONSTRAINT ing_tarea_deps_tipo_chk;

ALTER TABLE ing_tarea_deps DROP CONSTRAINT IF EXISTS ing_tarea_deps_lag_chk;
ALTER TABLE ing_tarea_deps ADD  CONSTRAINT ing_tarea_deps_lag_chk
  CHECK (lag_dias BETWEEN -365 AND 365) NOT VALID;
ALTER TABLE ing_tarea_deps VALIDATE CONSTRAINT ing_tarea_deps_lag_chk;

ALTER TABLE ing_tarea_deps DROP CONSTRAINT IF EXISTS ing_tarea_deps_no_self_chk;
ALTER TABLE ing_tarea_deps ADD  CONSTRAINT ing_tarea_deps_no_self_chk
  CHECK (tarea_id <> depende_de_id) NOT VALID;
ALTER TABLE ing_tarea_deps VALIDATE CONSTRAINT ing_tarea_deps_no_self_chk;

COMMENT ON COLUMN ing_tarea_deps.lag_dias IS
  'Desfase en DÍAS HÁBILES (lun-vie menos schedule_feriados). Negativo = adelanto (lead). Rango ±365.';

-- ── 3) Misma protección para la plantilla de la ruta (ing_tipo_deps) ──
UPDATE ing_tipo_deps SET tipo = upper(trim(tipo))
 WHERE tipo IS DISTINCT FROM upper(trim(tipo));
UPDATE ing_tipo_deps SET tipo = 'FS'
 WHERE tipo NOT IN ('FS','SS','FF','SF');
DELETE FROM ing_tipo_deps WHERE tipo_clave = depende_de_clave;

ALTER TABLE ing_tipo_deps DROP CONSTRAINT IF EXISTS ing_tipo_deps_tipo_chk;
ALTER TABLE ing_tipo_deps ADD  CONSTRAINT ing_tipo_deps_tipo_chk
  CHECK (tipo IN ('FS','SS','FF','SF')) NOT VALID;
ALTER TABLE ing_tipo_deps VALIDATE CONSTRAINT ing_tipo_deps_tipo_chk;

ALTER TABLE ing_tipo_deps DROP CONSTRAINT IF EXISTS ing_tipo_deps_no_self_chk;
ALTER TABLE ing_tipo_deps ADD  CONSTRAINT ing_tipo_deps_no_self_chk
  CHECK (tipo_clave <> depende_de_clave) NOT VALID;
ALTER TABLE ing_tipo_deps VALIDATE CONSTRAINT ing_tipo_deps_no_self_chk;
