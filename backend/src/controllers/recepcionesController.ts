import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { parsePagination, paginatedResponse } from '../utils/pagination'
import { createError } from '../middleware/errorHandler'

export async function getRecepciones(req: Request, res: Response, next: NextFunction) {
  try {
    const opts = parsePagination(req, 'r.fecha_recepcion')
    const conds: string[] = []
    if (req.query.estado) conds.push(`r.estado = '${req.query.estado}'`)

    const whereMain  = opts.search
      ? [...conds, `(r.folio ILIKE $3 OR r.recibio ILIKE $3 OR oc.numero ILIKE $3)`].join(' AND ')
      : conds.join(' AND ')
    const whereCount = opts.search
      ? [...conds, `(r.folio ILIKE $1 OR r.recibio ILIKE $1 OR oc.numero ILIKE $1)`].join(' AND ')
      : conds.join(' AND ')

    const wm = whereMain  ? `WHERE ${whereMain}`  : ''
    const wc = whereCount ? `WHERE ${whereCount}` : ''
    const join = `LEFT JOIN ordenes_compra oc ON oc.id = r.orden_compra_id`

    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT r.*,
           json_build_object('id', oc.id, 'numero', oc.numero) AS orden_compra
         FROM recepciones r ${join} ${wm}
         ORDER BY ${opts.sort} ${opts.order} LIMIT $1 OFFSET $2`,
        opts.search ? [opts.limit, opts.offset, `%${opts.search}%`] : [opts.limit, opts.offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM recepciones r ${join} ${wc}`,
        opts.search ? [`%${opts.search}%`] : []
      ),
    ])

    res.json(paginatedResponse(rows.rows, parseInt(countRow.rows[0].count), opts))
  } catch (err) { next(err) }
}

export async function getRecepcion(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows: [recepcion] } = await pool.query(
      `SELECT r.*,
         json_build_object('id', oc.id, 'numero', oc.numero) AS orden_compra
       FROM recepciones r
       LEFT JOIN ordenes_compra oc ON oc.id = r.orden_compra_id
       WHERE r.id = $1`,
      [req.params.id]
    )
    if (!recepcion) return next(createError('Recepción no encontrada', 404))

    const { rows: items } = await pool.query(
      `SELECT ir.*, row_to_json(ioc.*) AS item_orden
       FROM items_recepcion ir
       LEFT JOIN items_orden_compra ioc ON ioc.id = ir.item_orden_id
       WHERE ir.recepcion_id = $1`,
      [req.params.id]
    )
    res.json({ data: { ...recepcion, items } })
  } catch (err) { next(err) }
}

export async function createRecepcion(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { orden_compra_id, fecha_recepcion, recibio, notas, items = [] } = req.body
    if (!orden_compra_id) return next(createError('orden_compra_id es requerido', 400))

    const { rows: [last] } = await client.query(
      `SELECT folio FROM recepciones ORDER BY id DESC LIMIT 1`
    )
    const seq = last ? parseInt(last.folio.split('-')[2] ?? '0') + 1 : 1
    const folio = `REC-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`

    const hayDiferencias = (items as { cantidad_ordenada: number; cantidad_recibida: number }[])
      .some((i) => Number(i.cantidad_recibida) !== Number(i.cantidad_ordenada))
    const estadoRec   = hayDiferencias ? 'con_diferencias' : 'completa'
    const estadoOrden = hayDiferencias ? 'parcial' : 'recibida'

    const { rows: [recepcion] } = await client.query(
      `INSERT INTO recepciones (folio, orden_compra_id, estado, fecha_recepcion, recibio, notas)
       VALUES ($1,$2,'${estadoRec}'::estado_recepcion,$3,$4,$5) RETURNING *`,
      [folio, orden_compra_id, fecha_recepcion ?? new Date(), recibio ?? null, notas ?? null]
    )

    for (const item of items as { item_orden_id: number; cantidad_ordenada: number; cantidad_recibida: number; observaciones?: string }[]) {
      await client.query(
        `INSERT INTO items_recepcion (recepcion_id, item_orden_id, cantidad_ordenada, cantidad_recibida, observaciones)
         VALUES ($1,$2,$3,$4,$5)`,
        [recepcion.id, item.item_orden_id, item.cantidad_ordenada, item.cantidad_recibida, item.observaciones ?? null]
      )
    }

    await client.query(
      `UPDATE ordenes_compra SET estado = '${estadoOrden}'::estado_orden, updated_at = NOW() WHERE id = $1`,
      [orden_compra_id]
    )
    if (estadoOrden === 'recibida') {
      await client.query(
        `UPDATE ordenes_compra SET fecha_entrega_real = CURRENT_DATE WHERE id = $1`,
        [orden_compra_id]
      )
    }

    await client.query('COMMIT')
    res.status(201).json({ data: { ...recepcion, folio }, message: `Recepción ${folio} registrada` })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally { client.release() }
}

export async function createRecepcionCompleta(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { orden_compra_id, fecha_recepcion, recibio, notas, tipo, materiales = [] } = req.body

    console.log(`[createRecepcionCompleta] payload recibido:`, JSON.stringify({
      orden_compra_id, tipo, fecha_recepcion, recibio, notas,
      materiales_count: Array.isArray(materiales) ? materiales.length : '?',
    }))

    if (!orden_compra_id) return next(createError('orden_compra_id es requerido', 400))
    if (!tipo || !['total', 'parcial'].includes(tipo))
      return next(createError('tipo debe ser "total" o "parcial"', 400))

    // Verify the OC exists
    const { rows: [ocRow] } = await client.query(
      `SELECT id, estado FROM ordenes_compra WHERE id = $1`, [orden_compra_id]
    )
    if (!ocRow) return next(createError(`OC ${orden_compra_id} no encontrada`, 404))

    const { rows: [last] } = await client.query(
      `SELECT folio FROM recepciones ORDER BY id DESC LIMIT 1`
    )
    const seq = last ? parseInt(last.folio.split('-')[2] ?? '0') + 1 : 1
    const folio = `REC-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`

    const estadoRecepcion = tipo === 'total' ? 'completa' : 'con_diferencias'
    const estadoOrden     = tipo === 'total' ? 'recibida'  : 'en_transito'

    const { rows: [recepcion] } = await client.query(
      `INSERT INTO recepciones (folio, orden_compra_id, estado, fecha_recepcion, recibio, notas)
       VALUES ($1,$2,'${estadoRecepcion}'::estado_recepcion,$3,$4,$5) RETURNING *`,
      [folio, orden_compra_id, fecha_recepcion ?? new Date(), recibio ?? null, notas ?? null]
    )

    const mats = materiales as { id_material?: number; cm_code?: string; descripcion?: string; recibido: boolean; nota?: string }[]
    for (const mat of mats) {
      await client.query(
        `INSERT INTO recepcion_materiales (id_recepcion, id_material, cm_code, descripcion, recibido, nota)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [recepcion.id, mat.id_material ?? null, mat.cm_code ?? null,
         mat.descripcion ?? null, mat.recibido, mat.nota ?? null]
      )
    }

    await client.query(
      `UPDATE ordenes_compra SET estado = '${estadoOrden}'::estado_orden, updated_at = NOW() WHERE id = $1`,
      [orden_compra_id]
    )
    if (estadoOrden === 'recibida') {
      await client.query(
        `UPDATE ordenes_compra SET fecha_entrega_real = CURRENT_DATE WHERE id = $1`,
        [orden_compra_id]
      )
    }

    await client.query('COMMIT')
    res.status(201).json({ data: { ...recepcion, folio }, message: `Recepción ${folio} registrada` })
  } catch (err: any) {
    await client.query('ROLLBACK')
    console.error(`[createRecepcionCompleta] ERROR oc=${req.body?.orden_compra_id}: ${err?.message}`)
    console.error(`[createRecepcionCompleta] body:`, JSON.stringify(req.body))
    next(err)
  } finally { client.release() }
}

export async function getRecepcionesHistorial(req: Request, res: Response, next: NextFunction) {
  try {
    const orden_compra_id = parseInt(String(req.query.orden_compra_id))
    if (!orden_compra_id) return next(createError('orden_compra_id requerido', 400))

    // Exclude 'pendiente' — those are internal templates, not real reception events
    const { rows } = await pool.query(
      `SELECT r.*,
         COALESCE(
           json_agg(
             json_build_object(
               'id',          rm.id,
               'id_material', rm.id_material,
               'cm_code',     rm.cm_code,
               'descripcion', rm.descripcion,
               'recibido',    rm.recibido,
               'nota',        rm.nota
             ) ORDER BY rm.id
           ) FILTER (WHERE rm.id IS NOT NULL),
           '[]'::json
         ) AS materiales
       FROM recepciones r
       LEFT JOIN recepcion_materiales rm ON rm.id_recepcion = r.id
       WHERE r.orden_compra_id = $1 AND r.estado != 'pendiente'
       GROUP BY r.id
       ORDER BY r.created_at DESC`,
      [orden_compra_id]
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
}

export async function inicializarMateriales(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const orden_compra_id = parseInt(String(req.body.orden_compra_id))
    if (!orden_compra_id) return next(createError('orden_compra_id requerido', 400))

    await client.query('BEGIN')

    // Check if a pending template recepcion already exists for this OC
    const { rows: [existing] } = await client.query(
      `SELECT id FROM recepciones WHERE orden_compra_id = $1 AND estado = 'pendiente' LIMIT 1`,
      [orden_compra_id]
    )
    if (existing) {
      await client.query('ROLLBACK')
      return res.json({ data: null, created: false })
    }

    // Get materials from items_orden_compra (most reliable for any OC type)
    const { rows: ocItems } = await client.query(
      `SELECT ioc.material_id AS id, m.codigo, m.descripcion
       FROM items_orden_compra ioc
       JOIN materiales_mto m ON m.id = ioc.material_id
       WHERE ioc.orden_compra_id = $1
       ORDER BY m.item NULLS LAST, m.descripcion`,
      [orden_compra_id]
    )

    let mats = ocItems

    // Fallback: batch-sliced materiales_mto (for OCs generated via generarOCs workflow)
    if (!mats.length) {
      const { rows: batchMats } = await client.query(
        `WITH oc_info AS (
           SELECT o.id, o.proyecto_id, o.fecha_emision, v.nombre AS vendor_nombre
           FROM ordenes_compra o
           JOIN proveedores v ON v.id = o.proveedor_id
           WHERE o.id = $1
         ),
         fi_this AS (
           SELECT MAX(m.fecha_importacion) AS fi
           FROM materiales_mto m
           JOIN oc_info ON m.proyecto_id = oc_info.proyecto_id
             AND m.vendor ILIKE oc_info.vendor_nombre
             AND m.fecha_importacion IS NOT NULL
             AND m.fecha_importacion <= oc_info.fecha_emision
         ),
         prev_oc AS (
           SELECT o2.fecha_emision AS prev_fecha
           FROM ordenes_compra o2
           JOIN proveedores v2 ON v2.id = o2.proveedor_id
           JOIN oc_info ON o2.proyecto_id = oc_info.proyecto_id
             AND v2.nombre ILIKE oc_info.vendor_nombre
             AND o2.fecha_emision < oc_info.fecha_emision
             AND o2.id != oc_info.id
           ORDER BY o2.fecha_emision DESC
           LIMIT 1
         ),
         fi_prev AS (
           SELECT MAX(m.fecha_importacion) AS fi
           FROM materiales_mto m
           JOIN oc_info ON m.proyecto_id = oc_info.proyecto_id
             AND m.vendor ILIKE oc_info.vendor_nombre
             AND m.fecha_importacion IS NOT NULL
           CROSS JOIN prev_oc
           WHERE m.fecha_importacion <= prev_oc.prev_fecha
         )
         SELECT m.id, m.codigo, m.descripcion
         FROM materiales_mto m
         JOIN oc_info ON m.proyecto_id = oc_info.proyecto_id
           AND m.vendor ILIKE oc_info.vendor_nombre
         JOIN fi_this ON m.fecha_importacion = fi_this.fi
         LEFT JOIN fi_prev ON true
         WHERE fi_prev.fi IS NULL OR fi_this.fi IS DISTINCT FROM fi_prev.fi
         ORDER BY m.item NULLS LAST, m.descripcion`,
        [orden_compra_id]
      )
      mats = batchMats
    }

    if (!mats.length) {
      await client.query('ROLLBACK')
      return res.json({ data: null, created: false })
    }

    // Generate folio for the template recepcion
    const { rows: [last] } = await client.query(
      `SELECT folio FROM recepciones ORDER BY id DESC LIMIT 1`
    )
    const seq = last ? parseInt(last.folio.split('-')[2] ?? '0') + 1 : 1
    const folio = `REC-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`

    const { rows: [recepcion] } = await client.query(
      `INSERT INTO recepciones (folio, orden_compra_id, estado, fecha_recepcion, recibio, notas)
       VALUES ($1, $2, 'pendiente', NULL, NULL, NULL) RETURNING id`,
      [folio, orden_compra_id]
    )

    for (const m of mats as { id: number; codigo: string | null; descripcion: string }[]) {
      await client.query(
        `INSERT INTO recepcion_materiales (id_recepcion, id_material, cm_code, descripcion, recibido, nota)
         VALUES ($1, $2, $3, $4, false, NULL)`,
        [recepcion.id, m.id ?? null, m.codigo ?? null, m.descripcion]
      )
    }

    await client.query('COMMIT')
    res.json({ data: { folio, count: mats.length }, created: true })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally { client.release() }
}

export async function updateRecepcion(req: Request, res: Response, next: NextFunction) {
  try {
    const fields = ['estado', 'fecha_recepcion', 'recibio', 'notas']
    const updates = fields.filter((f) => req.body[f] !== undefined).map((f, i) => `${f} = $${i + 2}`)
    if (!updates.length) return next(createError('Sin campos para actualizar', 400))
    const values = fields.filter((f) => req.body[f] !== undefined).map((f) => req.body[f])
    const { rows } = await pool.query(
      `UPDATE recepciones SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    )
    if (!rows[0]) return next(createError('Recepción no encontrada', 404))
    res.json({ data: rows[0], message: 'Recepción actualizada' })
  } catch (err) { next(err) }
}
