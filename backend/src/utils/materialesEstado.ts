import { PoolClient } from 'pg'

/**
 * Recompute materiales_mto.estado_cotiz for a set of materials based on the
 * current state of all OCs each material participates in.
 *
 * Priority (highest wins):
 *   - Any OC with estado='recibida'                       → RECIBIDO
 *   - Any OC with estado active (not cancelada, not       → ORDENADO
 *     recibida)
 *   - Otherwise                                            → COTIZADO
 *
 * Only touches materials whose current estado_cotiz is one of the OC-related
 * states (COTIZADO, ORDENADO, RECIBIDO). Does NOT touch PENDIENTE or EN_STOCK
 * because those represent situations not driven by the OC flow.
 *
 * Pass a transaction client so the recompute runs in the same transaction as
 * the OC change.
 */
export async function recomputeMaterialesEstadoByIds(
  client: PoolClient,
  materialIds: number[]
) {
  if (!materialIds.length) return
  await client.query(
    `UPDATE materiales_mto m
     SET estado_cotiz = (
       CASE
         WHEN EXISTS (
           SELECT 1 FROM items_orden_compra ioc
           JOIN ordenes_compra oc ON oc.id = ioc.orden_compra_id
           WHERE ioc.material_id = m.id AND oc.estado = 'recibida'
         ) THEN 'RECIBIDO'
         WHEN EXISTS (
           SELECT 1 FROM items_orden_compra ioc
           JOIN ordenes_compra oc ON oc.id = ioc.orden_compra_id
           WHERE ioc.material_id = m.id
             AND oc.estado NOT IN ('cancelada', 'recibida')
         ) THEN 'ORDENADO'
         ELSE 'COTIZADO'
       END
     ),
     updated_at = NOW()
     WHERE m.id = ANY($1::int[])
       AND m.estado_cotiz IN ('COTIZADO', 'ORDENADO', 'RECIBIDO')`,
    [materialIds]
  )
}

/**
 * Helper to fetch all material IDs in an OC and recompute their estado_cotiz.
 * Use after changing an OC's estado within a transaction.
 */
export async function recomputeMaterialesEstadoForOC(
  client: PoolClient,
  ordenCompraId: number
) {
  const { rows } = await client.query(
    `SELECT DISTINCT material_id FROM items_orden_compra
     WHERE orden_compra_id = $1 AND material_id IS NOT NULL`,
    [ordenCompraId]
  )
  await recomputeMaterialesEstadoByIds(
    client,
    rows.map((r: { material_id: number }) => r.material_id)
  )
}
