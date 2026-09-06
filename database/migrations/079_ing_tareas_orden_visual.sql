-- 079_ing_tareas_orden_visual.sql
-- Orden VISUAL de la lista del Gantt, separado de las fechas.
-- El arrastre (drag & drop) ahora reordena la LISTA sin tocar dependencias ni
-- fechas: escribe este orden. Las barras siguen ubicándose por fecha (CPM); las
-- FILAS se ordenan por orden_visual. Así una tarea paralela puede aparecer donde
-- el usuario quiere sin cambiar cuándo ocurre.
-- Se siembra con el orden actual (por fecha de inicio, desempate por id) para que
-- nada cambie de golpe. Tareas nuevas quedan NULL → van al final hasta que se
-- las arrastre a su lugar.

ALTER TABLE ing_tareas ADD COLUMN IF NOT EXISTS orden_visual INTEGER;

UPDATE ing_tareas t
   SET orden_visual = s.rn
  FROM (
    SELECT id, row_number() OVER (
             PARTITION BY proyecto_ext
             ORDER BY fecha_inicio NULLS LAST, id
           ) AS rn
      FROM ing_tareas
  ) s
 WHERE s.id = t.id
   AND t.orden_visual IS NULL;
