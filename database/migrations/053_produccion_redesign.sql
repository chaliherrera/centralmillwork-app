-- ─────────────────────────────────────────────────────────────────────────────
-- 053 — Rediseño de Producción (Life of a Deal)
-- ─────────────────────────────────────────────────────────────────────────────
-- El taller solo EJECUTA y deja un log a medida que las piezas van de estación en
-- estación. No hay pasos administrativos en el piso. Entonces:
--   · P-01 "Producción iniciada" → se completa SOLO al crear la primera OP
--     (fuente 'op_creada', capturada; antes era manual_futuro).
--   · P-02 "Distribución a producción" → ELIMINADO (lo hace el kiosko al crear
--     la OP: le calcula la ruta por las estaciones).
--   · P-03 "Budget de labor validado" → ELIMINADO (es estimación, no del taller).
--   · P-05 "Fabricación en curso" pasa a depender de P-01 (antes de P-02).
-- El rollup de P-05/P-06/QC sobre TODAS las OP del proyecto ya existe (captura.ts).
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_pid INT;
BEGIN
  SELECT id INTO v_pid FROM schedule_plantillas WHERE nombre = 'Millwork estándar';
  IF v_pid IS NULL THEN RETURN; END IF;

  -- P-01 pasa a instrumentado: se prende al crear la primera OP.
  UPDATE schedule_plantilla_hitos
     SET fuente_dato = 'op_creada'
   WHERE plantilla_id = v_pid AND codigo = 'P-01';

  -- Reconectar P-05: dependía de P-02 → ahora depende de P-01.
  DELETE FROM schedule_plantilla_dependencias
   WHERE plantilla_id = v_pid AND hito_codigo = 'P-05' AND depende_de_codigo = 'P-02';
  INSERT INTO schedule_plantilla_dependencias (plantilla_id, hito_codigo, depende_de_codigo)
  SELECT v_pid, 'P-05', 'P-01'
   WHERE NOT EXISTS (
     SELECT 1 FROM schedule_plantilla_dependencias
      WHERE plantilla_id = v_pid AND hito_codigo = 'P-05' AND depende_de_codigo = 'P-01');

  -- Borrar toda dependencia que involucre a P-02 o P-03 (como hito o predecesor).
  DELETE FROM schedule_plantilla_dependencias
   WHERE plantilla_id = v_pid
     AND (hito_codigo IN ('P-02','P-03') OR depende_de_codigo IN ('P-02','P-03'));

  -- Borrar los hitos P-02 y P-03 de la plantilla.
  DELETE FROM schedule_plantilla_hitos
   WHERE plantilla_id = v_pid AND codigo IN ('P-02','P-03');

  -- Limpiar los hitos P-02/P-03 de los planes ya generados (quedarían huérfanos).
  DELETE FROM schedule_hitos sh
    USING schedule_planes sp
   WHERE sh.plan_id = sp.id AND sp.plantilla_id = v_pid AND sh.codigo IN ('P-02','P-03');
END $$;
