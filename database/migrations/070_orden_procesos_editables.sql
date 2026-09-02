-- ─────────────────────────────────────────────────────────────────────────────
-- 070 — Ruta de producción EDITABLE por el Shop Manager
-- ─────────────────────────────────────────────────────────────────────────────
-- Hoy la ruta de una OP (tabla orden_procesos, 1 row por estación) se fija al crear
-- la orden y es inmutable, en parte por el UNIQUE(orden_id, estacion) que impide dos
-- pasadas por la misma estación. Requerimiento de Chali: el Shop Manager puede editar
-- la ruta en vivo — agregar una estación o VOLVER a una ya completada (re-trabajo).
--
-- MODELO: cada PASADA por una estación es un ROW NUEVO (nunca se reabre el viejo). El
-- row completado queda como historial con su tiempo/operario/fotos; la pasada nueva
-- pide sus propias fotos/tiempo. Se distinguen por `ciclo` (1 = pasada original).
-- Aditivo/idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Permitir múltiples pasadas: sacar UNIQUE(orden_id, estacion), agregar `ciclo`
--    y re-unicar por (orden_id, estacion, ciclo).
ALTER TABLE orden_procesos ADD COLUMN IF NOT EXISTS ciclo INT NOT NULL DEFAULT 1;
ALTER TABLE orden_procesos DROP CONSTRAINT IF EXISTS orden_procesos_orden_id_estacion_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orden_procesos_orden_estacion_ciclo_key'
  ) THEN
    ALTER TABLE orden_procesos
      ADD CONSTRAINT orden_procesos_orden_estacion_ciclo_key UNIQUE (orden_id, estacion, ciclo);
  END IF;
END $$;

-- 2) Auditoría del origen de cada paso (para reportes de re-trabajo por causa).
ALTER TABLE orden_procesos ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'inicial'
  CHECK (origen IN ('inicial', 'agregado', 'reproceso'));
ALTER TABLE orden_procesos ADD COLUMN IF NOT EXISTS motivo TEXT;
ALTER TABLE orden_procesos ADD COLUMN IF NOT EXISTS agregado_por UUID;
ALTER TABLE orden_procesos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3) Atar los segmentos de tiempo al PROCESO puntual (no a orden+estación), para que
--    el tiempo_real de la 2ª pasada NO herede las horas de la 1ª. Backfill trivial:
--    hoy hay 1 proceso por (orden, estación), así que el match es inequívoco.
ALTER TABLE time_proyectos ADD COLUMN IF NOT EXISTS proceso_id INT
  REFERENCES orden_procesos(id) ON DELETE SET NULL;

UPDATE time_proyectos tp
   SET proceso_id = op.id
  FROM orden_procesos op
 WHERE tp.proceso_id IS NULL
   AND tp.orden_produccion_id = op.orden_id
   AND tp.estacion = op.estacion;

CREATE INDEX IF NOT EXISTS idx_time_proy_proceso ON time_proyectos(proceso_id) WHERE proceso_id IS NOT NULL;

-- 4) Acción nueva para el historial (edición de ruta). orden_historial.accion es TEXT
--    libre; solo lo dejamos documentado — no hay enum que ampliar.
COMMENT ON COLUMN orden_procesos.origen IS 'inicial | agregado (estación nueva) | reproceso (volver a una ya completada)';
