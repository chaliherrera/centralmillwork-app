-- ─────────────────────────────────────────────────────────────────────────────
-- 069 — Poda de la plantilla de hitos: elimina el "grupo C" (milestones teóricos
--        del PDF viejo que nadie llena y que no mapean a los 18 pasos de la ruta).
-- ─────────────────────────────────────────────────────────────────────────────
-- El schedule real es la ruta de ingeniería (18 pasos, ing_tareas). La plantilla de
-- hitos (schedule_plantilla_hitos) heredó 54 milestones del PDF; conservamos:
--   · Grupo A (mapean a los 18 pasos): C-03, C-04, E-01, E-03, E-04, E-06, E-07,
--     E-08, E-10, E-11, M-03, M-04, P-05, I-04.
--   · Grupo B (enchufados a un módulo o usados en código): E-05, E-09, M-05, M-07,
--     P-01, P-06, QC-01, QC-02, QC-03, I-05, I-06, I-07 (ancla=entrega), X-03.
-- Podamos el Grupo C (27 manuales sin uso). En Contract quedan solo C-03 + C-04.
--
-- Antes de borrar, RE-COSEMOS las aristas puente donde un hito CONSERVADO dependía
-- de uno podado, reconectándolo a su ancestro conservado más cercano (misma idea que
-- la reconexión al borrar una tarea) para que el DAG viejo quede coherente:
--   E-01→C-03 · E-04→E-01 · M-03→E-01 · M-05→E-09 · I-04→QC-02
--
-- Idempotente: los DELETE son naturales; los INSERT usan ON CONFLICT DO NOTHING.
-- schedule_planes = 0 en esta base (no hay planes instanciados), pero por seguridad
-- en producción también limpiamos schedule_hitos del grupo C que estén SIN fecha
-- registrada (fecha_real IS NULL) — nunca se borra un hito con dato cargado.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Re-coser las aristas puente (kept → nearest kept ancestor). Se insertan ANTES
--    de borrar para no perder la conectividad. plantilla_id = el de cada hito.
INSERT INTO schedule_plantilla_dependencias (plantilla_id, hito_codigo, depende_de_codigo)
SELECT h.plantilla_id, e.hito, e.dep
FROM (VALUES
  ('E-01','C-03'),
  ('E-04','E-01'),
  ('M-03','E-01'),
  ('M-05','E-09'),
  ('I-04','QC-02')
) AS e(hito, dep)
JOIN schedule_plantilla_hitos h ON h.codigo = e.hito
ON CONFLICT (plantilla_id, hito_codigo, depende_de_codigo) DO NOTHING;

-- 2) Borrar TODAS las dependencias de plantilla que toquen el grupo C.
DELETE FROM schedule_plantilla_dependencias
WHERE hito_codigo IN (
  'C-05','C-06','C-07','C-08','C-09',
  'E-01a','E-01b','E-01c','E-01d','E-01e','E-02','E-12',
  'M-01','M-02','M-06','P-04',
  'S-01','S-02','S-03','S-04','S-05',
  'I-01','I-02','I-03','X-01','X-02','X-04')
   OR depende_de_codigo IN (
  'C-05','C-06','C-07','C-08','C-09',
  'E-01a','E-01b','E-01c','E-01d','E-01e','E-02','E-12',
  'M-01','M-02','M-06','P-04',
  'S-01','S-02','S-03','S-04','S-05',
  'I-01','I-02','I-03','X-01','X-02','X-04');

-- 3) Limpiar hitos instanciados del grupo C SIN fecha registrada (prod-safe; 0 acá).
DELETE FROM schedule_hitos
WHERE fecha_real IS NULL
  AND codigo IN (
  'C-05','C-06','C-07','C-08','C-09',
  'E-01a','E-01b','E-01c','E-01d','E-01e','E-02','E-12',
  'M-01','M-02','M-06','P-04',
  'S-01','S-02','S-03','S-04','S-05',
  'I-01','I-02','I-03','X-01','X-02','X-04');

-- 4) Borrar los hitos del grupo C de la plantilla.
DELETE FROM schedule_plantilla_hitos
WHERE codigo IN (
  'C-05','C-06','C-07','C-08','C-09',
  'E-01a','E-01b','E-01c','E-01d','E-01e','E-02','E-12',
  'M-01','M-02','M-06','P-04',
  'S-01','S-02','S-03','S-04','S-05',
  'I-01','I-02','I-03','X-01','X-02','X-04');
