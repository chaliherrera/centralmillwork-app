// ─────────────────────────────────────────────────────────────────────────────
// Domain helper — Estado de OCs asociadas a una muestra
// ─────────────────────────────────────────────────────────────────────────────
// Helper puro (no toca Express) que calcula el estado de las OCs directas
// asociadas a una muestra y decide si está lista para fabricar.
//
// "Lista para fabricar" = todas las OCs con muestra_id están en estado
// 'recibida'. O no hay OCs asociadas (la muestra se hace con stock).
//
// Este archivo es el PRIMER ejemplo del patrón modules/<feature>/domain/.
// Cuando 3-4 helpers similares existan, evaluar mover el state machine de
// muestrasController (TRANSICIONES) acá también.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { notifyTareaBySourceRef } from '../../../utils/notifyTarea'
import { logger } from '../../../utils/logger'

type QueryRunner = PoolClient | typeof pool

export interface MuestraOCsStatus {
  /** Total de OCs directas asociadas a la muestra */
  total: number
  /** Cuántas ya están en estado 'recibida' */
  recibidas: number
  /** OCs pendientes (no recibidas todavía) con info para el UI */
  pendientes: Array<{ id: number; numero: string; estado: string }>
  /** Lista para fabricar: TRUE si total === recibidas (o total === 0 con stock confirmado) */
  puede_fabricar: boolean
  /** TRUE si la muestra fue marcada "sin compras necesarias" — bypass del check */
  sin_compras_marcado: boolean
}

/**
 * Devuelve el estado de las OCs asociadas a una muestra + flag puede_fabricar.
 *
 * Reglas:
 *   - Sin OCs + sin marca "sin_compras" → NO puede fabricar (probablemente
 *     procurement no resolvió todavía)
 *   - Sin OCs + marca "sin_compras" → SÍ puede fabricar (stock confirmado)
 *   - Con OCs: todas en 'recibida' → SÍ puede fabricar
 *   - Con OCs: alguna pendiente → NO puede fabricar
 */
export async function getMuestraOCsStatus(
  runner: QueryRunner,
  muestraId: number
): Promise<MuestraOCsStatus> {
  // OCs asociadas
  const { rows: ocs } = await runner.query<{ id: number; numero: string; estado: string }>(
    `SELECT id, numero, estado
       FROM ordenes_compra
      WHERE muestra_id = $1
      ORDER BY id`,
    [muestraId]
  )

  const total = ocs.length
  const recibidas = ocs.filter((o) => o.estado === 'recibida').length
  const pendientes = ocs.filter((o) => o.estado !== 'recibida')

  // Marca "sin compras necesarias" → evento en timeline tipo='sin_compras'
  const { rows: marca } = await runner.query<{ marcado: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM muestras_eventos
        WHERE muestra_id = $1 AND tipo = 'sin_compras'
     ) AS marcado`,
    [muestraId]
  )
  const sin_compras_marcado = marca[0]?.marcado === true

  // Reglas de puede_fabricar
  let puede_fabricar = false
  if (total === 0) {
    puede_fabricar = sin_compras_marcado
  } else {
    puede_fabricar = recibidas === total
  }

  return { total, recibidas, pendientes, puede_fabricar, sin_compras_marcado }
}

/**
 * Trigger llamado desde recepcionesController cuando una OC pasa a 'recibida'.
 * Si la OC tenía muestra_id asociada Y todas las OCs de esa muestra ya están
 * recibidas, dispara el auto-cierre de tarea procurement + creación de tarea
 * SHOP_MANAGER.
 *
 * Diseñado para ser idempotente: si ya se disparó antes (porque otra OC de
 * la misma muestra ya cumplió la condición), el ON CONFLICT del INSERT hace
 * que la segunda llamada sea no-op.
 *
 * Llamar DENTRO de la misma transacción del recepcionar OC (in-tx, no
 * fire-and-forget) para garantizar consistencia.
 */
export async function onOCRecibidaParaMuestras(
  runner: QueryRunner,
  ordenCompraId: number
): Promise<void> {
  // 1. La OC tenía muestra asociada?
  const { rows: [oc] } = await runner.query<{ muestra_id: number | null }>(
    `SELECT muestra_id FROM ordenes_compra WHERE id = $1`,
    [ordenCompraId]
  )
  if (!oc?.muestra_id) return

  // 2. Status de OCs de la muestra
  const status = await getMuestraOCsStatus(runner, oc.muestra_id)
  if (!status.puede_fabricar) return

  // 3. Traer código de la muestra para los textos de tareas
  const { rows: [muestra] } = await runner.query<{ codigo: string }>(
    `SELECT codigo FROM muestras WHERE id = $1`,
    [oc.muestra_id]
  )
  if (!muestra) return  // muestra borrada — no debería pasar, defensivo

  // 4. Cerrar + crear (idempotente)
  await cerrarProcurementYCrearShopManager(
    runner, oc.muestra_id, muestra.codigo, 'ocs_recibidas'
  )
}

/**
 * Cierra la tarea procurement de la muestra (source_ref `muestra:{id}:request`)
 * y crea la tarea SHOP_MANAGER "Iniciar fabricación" (source_ref
 * `muestra:{id}:ready_to_fab`).
 *
 * Idempotente: usa UPDATE con WHERE estado != 'completada' + INSERT ON CONFLICT.
 */
export async function cerrarProcurementYCrearShopManager(
  runner: QueryRunner,
  muestraId: number,
  codigoMuestra: string,
  motivo: 'sin_compras' | 'ocs_recibidas'
): Promise<void> {
  // 1. Cerrar tarea procurement (si está abierta)
  // NOTA: tabla tareas no tiene updated_at — completed_at marca el cambio
  await runner.query(
    `UPDATE tareas
        SET estado = 'completada',
            completed_at = NOW()
      WHERE source_ref = $1
        AND estado NOT IN ('completada', 'descartada')`,
    [`muestra:${muestraId}:request`]
  )

  // 2. Crear tarea SHOP_MANAGER (idempotente)
  const motivoLabel = motivo === 'sin_compras'
    ? 'Materiales confirmados en stock (sin compras necesarias)'
    : 'Todas las OCs asociadas a la muestra fueron recibidas'

  const tareaDesc = [
    `Muestra: ${codigoMuestra}`,
    motivoLabel,
    '',
    `Acción: iniciar fabricación → transicionar muestra a EN_FABRICACION`,
    `Link: /muestras (abrir ${codigoMuestra})`,
  ].join('\n')

  await runner.query(
    `INSERT INTO tareas (area, title, description, priority, from_email, subject, source_email_id, origen, source_ref)
     VALUES ('shop_manager', $1, $2, 'medium', 'sistema@centralmillwork.com', $3, NULL, 'sistema', $4)
     ON CONFLICT (source_ref) WHERE origen = 'sistema' AND source_ref IS NOT NULL
     DO NOTHING`,
    [
      `Iniciar fabricación de muestra: ${codigoMuestra}`,
      tareaDesc,
      `Ready to fabricate — ${codigoMuestra}`,
      `muestra:${muestraId}:ready_to_fab`,
    ]
  )

  // F7: notificar a SHOP_MANAGER por email. Fire-and-forget — si falla
  // el email no abortamos el flujo de procurement→fabricación.
  notifyTareaBySourceRef(pool, `muestra:${muestraId}:ready_to_fab`)
    .catch((err) => logger.warn('notifyTarea after ready_to_fab failed', {
      muestraId, err: String(err),
    }))
}
