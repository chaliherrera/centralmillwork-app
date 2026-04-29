import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { parsePagination, paginatedResponse } from '../utils/pagination'
import { createError } from '../middleware/errorHandler'

// ─── Shared FROM/JOIN block (table + lateral recepcion) ──────────────────────
const OC_JOINS = `
  LEFT JOIN proyectos  p ON p.id = o.proyecto_id
  LEFT JOIN proveedores v ON v.id = o.proveedor_id
  LEFT JOIN LATERAL (
    SELECT id, fecha_recepcion
    FROM recepciones
    WHERE orden_compra_id = o.id
    ORDER BY fecha_recepcion DESC
    LIMIT 1
  ) rec ON true`

// ─── Shared computed SELECT columns ──────────────────────────────────────────
const OC_COMPUTED = `
  json_build_object('id', p.id, 'nombre', p.nombre, 'codigo', p.codigo) AS proyecto,
  json_build_object('id', v.id, 'nombre', v.nombre, 'email', v.email)   AS proveedor,
  rec.fecha_recepcion,
  CASE
    WHEN o.estado = 'cancelada'   THEN 'CANCELADA'
    WHEN o.estado = 'recibida'    THEN 'EN_EL_TALLER'
    WHEN o.estado = 'en_transito' THEN 'EN_TRANSITO'
    ELSE 'ORDENADO'
  END AS estado_display,
  CASE WHEN o.estado NOT IN ('cancelada','recibida')
            AND o.fecha_entrega_estimada IS NOT NULL
            AND o.fecha_entrega_estimada < CURRENT_DATE
       THEN true ELSE false END AS flag_vencida,
  CASE WHEN rec.id IS NOT NULL
            AND o.fecha_entrega_estimada IS NOT NULL
            AND rec.fecha_recepcion > o.fecha_entrega_estimada
       THEN true ELSE false END AS flag_retraso,
  CASE WHEN o.estado NOT IN ('cancelada','recibida')
            AND o.fecha_entrega_estimada IS NOT NULL
            AND (o.fecha_entrega_estimada - CURRENT_DATE) BETWEEN 0 AND 2
       THEN true ELSE false END AS flag_2dias`

export async function getOrdenesCompraImportDates(req: Request, res: Response, next: NextFunction) {
  try {
    const { proyecto_id } = req.query
    const where = proyecto_id
      ? `WHERE proyecto_id = ${parseInt(String(proyecto_id))} AND fecha_mto IS NOT NULL`
      : `WHERE fecha_mto IS NOT NULL`
    const { rows } = await pool.query(
      `SELECT DISTINCT fecha_mto::text AS fecha FROM ordenes_compra ${where} ORDER BY fecha_mto DESC`
    )
    res.json({ data: rows.map((r) => r.fecha) })
  } catch (err) { next(err) }
}

export async function getOrdenesCompraKpis(req: Request, res: Response, next: NextFunction) {
  try {
    const { proyecto_id } = req.query
    const extraWhere = proyecto_id
      ? `AND o.proyecto_id = ${parseInt(String(proyecto_id))}`
      : ''

    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::text AS total,
         COALESCE(SUM(o.total) FILTER (WHERE o.estado NOT IN ('cancelada','recibida')), 0)::text AS monto_ordenado,
         COALESCE(SUM(o.total) FILTER (WHERE o.estado = 'recibida'), 0)::text                   AS monto_en_taller,
         COUNT(*) FILTER (WHERE o.estado NOT IN ('cancelada','recibida'))::text                  AS pendientes_recepcion,
         COUNT(*) FILTER (
           WHERE o.estado NOT IN ('cancelada','recibida')
             AND o.fecha_entrega_estimada IS NOT NULL
             AND o.fecha_entrega_estimada < CURRENT_DATE
         )::text AS con_retraso
       FROM ordenes_compra o ${OC_JOINS}
       WHERE o.estado != 'cancelada' ${extraWhere}`
    )
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
}

export async function getOrdenesCompra(req: Request, res: Response, next: NextFunction) {
  try {
    const opts = parsePagination(req, 'o.fecha_emision')
    const conds: string[] = []

    if (req.query.proyecto_id)  conds.push(`o.proyecto_id = ${parseInt(String(req.query.proyecto_id))}`)
    if (req.query.proveedor_id) conds.push(`o.proveedor_id = ${parseInt(String(req.query.proveedor_id))}`)
    if (req.query.vendor)       conds.push(`v.nombre ILIKE '${String(req.query.vendor).replace(/'/g, "''")}'`)
    if (req.query.categoria)    conds.push(`o.categoria = '${String(req.query.categoria).replace(/'/g, "''")}'`)
    if (req.query.fecha_mto)       conds.push(`o.fecha_mto = '${String(req.query.fecha_mto).replace(/'/g, "''")}'`)
    if (req.query.fecha_mto_desde) conds.push(`o.fecha_mto >= '${String(req.query.fecha_mto_desde).replace(/'/g, "''")}'`)
    if (req.query.fecha_mto_hasta) conds.push(`o.fecha_mto <= '${String(req.query.fecha_mto_hasta).replace(/'/g, "''")}'`)

    const edFilter = req.query.estado_display as string | undefined
    if (edFilter === 'ORDENADO')     conds.push(`o.estado NOT IN ('cancelada','recibida','en_transito')`)
    if (edFilter === 'EN_EL_TALLER') conds.push(`o.estado = 'recibida'`)
    if (edFilter === 'EN_TRANSITO')  conds.push(`o.estado = 'en_transito'`)
    if (edFilter === 'CANCELADA')    conds.push(`o.estado = 'cancelada'`)

    const whereMain  = opts.search
      ? [...conds, `(o.numero ILIKE $3 OR p.nombre ILIKE $3 OR v.nombre ILIKE $3)`].join(' AND ')
      : conds.join(' AND ')
    const whereCount = opts.search
      ? [...conds, `(o.numero ILIKE $1 OR p.nombre ILIKE $1 OR v.nombre ILIKE $1)`].join(' AND ')
      : conds.join(' AND ')

    const wm = whereMain  ? `WHERE ${whereMain}`  : ''
    const wc = whereCount ? `WHERE ${whereCount}` : ''

    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT o.*, ${OC_COMPUTED}
         FROM ordenes_compra o ${OC_JOINS} ${wm}
         ORDER BY ${opts.sort} ${opts.order} LIMIT $1 OFFSET $2`,
        opts.search ? [opts.limit, opts.offset, `%${opts.search}%`] : [opts.limit, opts.offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM ordenes_compra o ${OC_JOINS} ${wc}`,
        opts.search ? [`%${opts.search}%`] : []
      ),
    ])

    res.json(paginatedResponse(rows.rows, parseInt(countRow.rows[0].count), opts))
  } catch (err) { next(err) }
}

export async function getOrdenCompra(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows: [orden] } = await pool.query(
      `SELECT o.*, ${OC_COMPUTED}
       FROM ordenes_compra o ${OC_JOINS}
       WHERE o.id = $1`,
      [req.params.id]
    )
    if (!orden) return next(createError('Orden de compra no encontrada', 404))

    const { rows: items } = await pool.query(
      `SELECT i.*, row_to_json(m.*) AS material
       FROM items_orden_compra i
       LEFT JOIN materiales_mto m ON m.id = i.material_id
       WHERE i.orden_compra_id = $1 ORDER BY i.id`,
      [req.params.id]
    )
    res.json({ data: { ...orden, items } })
  } catch (err) { next(err) }
}

export async function getOrdenCompraMaterialesLote(req: Request, res: Response, next: NextFunction) {
  try {
    const ocId = req.params.id

    // Primary: batch-sliced materials from materiales_mto
    const { rows: batchRows } = await pool.query(
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
       SELECT m.id, m.item, m.codigo, m.vendor_code, m.vendor,
              m.descripcion, m.color, m.manufacturer, m.categoria,
              m.unidad, m.size, m.qty, m.unit_price, m.total_price,
              m.estado_cotiz, m.cotizar, m.fecha_importacion, m.notas
       FROM materiales_mto m
       JOIN oc_info ON m.proyecto_id = oc_info.proyecto_id
         AND m.vendor ILIKE oc_info.vendor_nombre
       JOIN fi_this ON m.fecha_importacion = fi_this.fi
       LEFT JOIN fi_prev ON true
       WHERE fi_prev.fi IS NULL OR fi_this.fi IS DISTINCT FROM fi_prev.fi
       ORDER BY m.item NULLS LAST, m.descripcion`,
      [ocId]
    )

    if (batchRows.length > 0) return res.json({ data: batchRows })

    // Fallback: items explicitly added to this OC via items_orden_compra
    const { rows: itemRows } = await pool.query(
      `SELECT m.id, m.item, m.codigo, m.vendor_code, m.vendor,
              m.descripcion, m.color, m.manufacturer, m.categoria,
              m.unidad, m.size, m.qty, m.unit_price, m.total_price,
              m.estado_cotiz, m.cotizar, m.fecha_importacion, m.notas
       FROM items_orden_compra ioc
       JOIN materiales_mto m ON m.id = ioc.material_id
       WHERE ioc.orden_compra_id = $1
       ORDER BY m.item NULLS LAST, m.descripcion`,
      [ocId]
    )

    res.json({ data: itemRows })
  } catch (err) { next(err) }
}

export async function createOrdenCompra(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const {
      proyecto_id, proveedor_id, estado, fecha_emision,
      fecha_entrega_estimada, fecha_mto, categoria, notas, items = [],
    } = req.body

    const { rows: [last] } = await client.query(
      `SELECT numero FROM ordenes_compra ORDER BY id DESC LIMIT 1`
    )
    const seq = last ? parseInt(last.numero.split('-')[2] ?? '0') + 1 : 1
    const numero = `OC-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`

    const { rows: [orden] } = await client.query(
      `INSERT INTO ordenes_compra
         (numero, proyecto_id, proveedor_id, estado, fecha_emision, fecha_entrega_estimada, fecha_mto, categoria, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        numero, proyecto_id, proveedor_id, estado ?? 'borrador',
        fecha_emision ?? new Date(), fecha_entrega_estimada ?? null,
        fecha_mto ?? null, categoria ?? '', notas ?? null,
      ]
    )

    let subtotal = 0
    for (const item of items as { material_id?: number; descripcion: string; unidad: string; cantidad: number; precio_unitario: number }[]) {
      await client.query(
        `INSERT INTO items_orden_compra (orden_compra_id, material_id, descripcion, unidad, cantidad, precio_unitario)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [orden.id, item.material_id ?? null, item.descripcion, item.unidad, item.cantidad, item.precio_unitario]
      )
      subtotal += Number(item.cantidad) * Number(item.precio_unitario)
    }

    const iva   = subtotal * 0.16
    const total = subtotal + iva
    await client.query(
      `UPDATE ordenes_compra SET subtotal=$1, iva=$2, total=$3 WHERE id=$4`,
      [subtotal, iva, total, orden.id]
    )

    await client.query('COMMIT')
    res.status(201).json({ data: { ...orden, numero, subtotal, iva, total }, message: `Orden ${numero} creada` })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally { client.release() }
}

export async function updateOrdenCompra(req: Request, res: Response, next: NextFunction) {
  try {
    const fields = [
      'proyecto_id', 'proveedor_id', 'estado', 'fecha_emision',
      'fecha_entrega_estimada', 'fecha_entrega_real', 'fecha_mto', 'categoria', 'notas',
    ]
    const updates = fields.filter((f) => req.body[f] !== undefined).map((f, i) => `${f} = $${i + 2}`)
    if (!updates.length) return next(createError('Sin campos para actualizar', 400))
    const values = fields.filter((f) => req.body[f] !== undefined).map((f) => req.body[f])
    const { rows } = await pool.query(
      `UPDATE ordenes_compra SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    )
    if (!rows[0]) return next(createError('Orden no encontrada', 404))
    res.json({ data: rows[0], message: 'Orden actualizada' })
  } catch (err) { next(err) }
}

export async function updateEstadoOrden(req: Request, res: Response, next: NextFunction) {
  try {
    const { estado } = req.body
    if (!estado) return next(createError('El estado es requerido', 400))
    const { rows } = await pool.query(
      `UPDATE ordenes_compra SET estado = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, estado]
    )
    if (!rows[0]) return next(createError('Orden no encontrada', 404))
    res.json({ data: rows[0], message: `Estado actualizado a "${estado}"` })
  } catch (err) { next(err) }
}

export async function getVendorsCotizados(req: Request, res: Response, next: NextFunction) {
  try {
    const proyecto_id = parseInt(String(req.query.proyecto_id))
    if (!proyecto_id) return next(createError('proyecto_id requerido', 400))

    // For each vendor, find their most recent import batch (fecha_importacion) and
    // sum the total_price of all COTIZADO materials in that batch.
    const { rows } = await pool.query(
      `WITH latest_fechas AS (
         SELECT vendor, MAX(fecha_importacion) AS fecha_importacion
         FROM materiales_mto
         WHERE proyecto_id = $1
           AND vendor IS NOT NULL AND vendor != ''
           AND estado_cotiz = 'COTIZADO'
         GROUP BY vendor
       )
       SELECT
         m.vendor,
         lf.fecha_importacion::text,
         COUNT(*)::int               AS materiales_count,
         SUM(m.total_price)::numeric AS total
       FROM materiales_mto m
       JOIN latest_fechas lf ON lf.vendor = m.vendor
       WHERE m.proyecto_id = $1
         AND m.estado_cotiz = 'COTIZADO'
         AND (m.fecha_importacion = lf.fecha_importacion
              OR (lf.fecha_importacion IS NULL AND m.fecha_importacion IS NULL))
       GROUP BY m.vendor, lf.fecha_importacion
       ORDER BY m.vendor`,
      [proyecto_id]
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
}

export async function generarOCs(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const { proyecto_id, vendors } = req.body as {
      proyecto_id: number
      vendors: Array<{ vendor: string; fecha_entrega_estimada: string | null }>
    }
    if (!proyecto_id || !Array.isArray(vendors) || !vendors.length)
      return next(createError('proyecto_id y vendors son requeridos', 400))

    await client.query('BEGIN')

    const results: Array<{ numero: string; vendor: string; total: number; materiales_count: number }> = []

    for (const { vendor, fecha_entrega_estimada } of vendors) {
      // Most recent fecha_importacion for this vendor's COTIZADO materials
      const { rows: [fechaRow] } = await client.query(
        `SELECT MAX(fecha_importacion) AS fecha_importacion
         FROM materiales_mto
         WHERE proyecto_id = $1 AND vendor = $2 AND estado_cotiz = 'COTIZADO'`,
        [proyecto_id, vendor]
      )
      const fecha_mto = fechaRow?.fecha_importacion ?? null

      // All COTIZADO materials for this vendor in that batch
      const { rows: materiales } = await client.query(
        `SELECT id, descripcion, unidad, qty, unit_price, total_price
         FROM materiales_mto
         WHERE proyecto_id = $1 AND vendor = $2 AND estado_cotiz = 'COTIZADO'
           AND (fecha_importacion = $3
                OR ($3::date IS NULL AND fecha_importacion IS NULL))
         ORDER BY item NULLS LAST, codigo`,
        [proyecto_id, vendor, fecha_mto]
      )
      if (!materiales.length) continue

      // Lookup proveedor_id via case-insensitive name match
      const { rows: [prov] } = await client.query(
        `SELECT id FROM proveedores WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1)) LIMIT 1`,
        [vendor]
      )

      // Generate OC number — re-query inside loop so sequence is correct across iterations
      const { rows: [last] } = await client.query(
        `SELECT numero FROM ordenes_compra ORDER BY id DESC LIMIT 1`
      )
      const seq = last ? parseInt(last.numero.split('-')[2] ?? '0') + 1 : 1
      const numero = `OC-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`

      const { rows: [orden] } = await client.query(
        `INSERT INTO ordenes_compra
           (numero, proyecto_id, proveedor_id, estado, fecha_emision,
            fecha_entrega_estimada, fecha_mto)
         VALUES ($1,$2,$3,'enviada',NOW(),$4,$5) RETURNING id`,
        [numero, proyecto_id, prov?.id ?? null,
         fecha_entrega_estimada || null, fecha_mto]
      )

      let subtotal = 0
      for (const m of materiales) {
        await client.query(
          `INSERT INTO items_orden_compra
             (orden_compra_id, material_id, descripcion, unidad, cantidad, precio_unitario)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [orden.id, m.id, m.descripcion, m.unidad, m.qty, m.unit_price]
        )
        subtotal += Number(m.qty) * Number(m.unit_price)
      }

      const iva   = parseFloat((subtotal * 0.16).toFixed(2))
      const total = parseFloat((subtotal + iva).toFixed(2))
      await client.query(
        `UPDATE ordenes_compra SET subtotal=$1, iva=$2, total=$3 WHERE id=$4`,
        [subtotal, iva, total, orden.id]
      )

      results.push({ numero, vendor, total, materiales_count: materiales.length })
    }

    await client.query('COMMIT')
    res.status(201).json({ data: results, message: `${results.length} OC(s) generada(s)` })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally { client.release() }
}

export async function deleteOrdenCompra(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows: [orden] } = await pool.query(
      `SELECT estado FROM ordenes_compra WHERE id = $1`, [req.params.id]
    )
    if (!orden) return next(createError('Orden no encontrada', 404))
    if (['recibida', 'confirmada'].includes(orden.estado))
      return next(createError('No se puede eliminar una orden confirmada o recibida', 409))
    await pool.query('DELETE FROM ordenes_compra WHERE id = $1', [req.params.id])
    res.json({ message: 'Orden eliminada' })
  } catch (err) { next(err) }
}
