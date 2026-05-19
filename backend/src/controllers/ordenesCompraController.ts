import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { parsePagination, paginatedResponse } from '../utils/pagination'
import { createError } from '../middleware/errorHandler'
import { recomputeMaterialesEstadoByIds } from '../utils/materialesEstado'

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
    const proyectoId = req.query.proyecto_id ? parseInt(String(req.query.proyecto_id)) : null
    const { rows } = proyectoId
      ? await pool.query(
          `SELECT DISTINCT fecha_mto::text AS fecha FROM ordenes_compra
           WHERE proyecto_id = $1 AND fecha_mto IS NOT NULL ORDER BY fecha_mto DESC`,
          [proyectoId]
        )
      : await pool.query(
          `SELECT DISTINCT fecha_mto::text AS fecha FROM ordenes_compra
           WHERE fecha_mto IS NOT NULL ORDER BY fecha_mto DESC`
        )
    res.json({ data: rows.map((r) => r.fecha) })
  } catch (err) { next(err) }
}

export async function getOrdenesCompraKpis(req: Request, res: Response, next: NextFunction) {
  try {
    const proyectoId = req.query.proyecto_id ? parseInt(String(req.query.proyecto_id)) : null
    const extraWhere = proyectoId ? `AND o.proyecto_id = $1` : ''
    const vals = proyectoId ? [proyectoId] : []

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
       WHERE o.estado != 'cancelada' ${extraWhere}`,
      vals
    )
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
}

const OC_SORT_WHITELIST = [
  'o.fecha_emision', 'o.fecha_entrega_estimada', 'o.fecha_mto',
  'o.numero', 'o.total', 'o.estado', 'o.created_at',
] as const

export async function getOrdenesCompra(req: Request, res: Response, next: NextFunction) {
  try {
    const opts = parsePagination(req, 'o.fecha_emision', OC_SORT_WHITELIST)
    const conds: string[] = []
    const vals: unknown[] = []
    const ph = () => `$${vals.length + 1}`

    if (req.query.proyecto_id)  { conds.push(`o.proyecto_id = ${ph()}`); vals.push(parseInt(String(req.query.proyecto_id))) }
    if (req.query.proveedor_id) { conds.push(`o.proveedor_id = ${ph()}`); vals.push(parseInt(String(req.query.proveedor_id))) }
    if (req.query.vendor)       { conds.push(`v.nombre ILIKE ${ph()}`); vals.push(String(req.query.vendor)) }
    if (req.query.categoria)    { conds.push(`o.categoria = ${ph()}`); vals.push(String(req.query.categoria)) }
    if (req.query.fecha_mto)       { conds.push(`o.fecha_mto = ${ph()}`); vals.push(String(req.query.fecha_mto)) }
    if (req.query.fecha_mto_desde) { conds.push(`o.fecha_mto >= ${ph()}`); vals.push(String(req.query.fecha_mto_desde)) }
    if (req.query.fecha_mto_hasta) { conds.push(`o.fecha_mto <= ${ph()}`); vals.push(String(req.query.fecha_mto_hasta)) }

    const edFilter = req.query.estado_display as string | undefined
    if (edFilter === 'ORDENADO')     conds.push(`o.estado NOT IN ('cancelada','recibida','en_transito')`)
    if (edFilter === 'EN_EL_TALLER') conds.push(`o.estado = 'recibida'`)
    if (edFilter === 'EN_TRANSITO')  conds.push(`o.estado = 'en_transito'`)
    if (edFilter === 'CANCELADA')    conds.push(`o.estado = 'cancelada'`)

    // Count query: filtros + (opcionalmente) search
    const countVals = [...vals]
    const countConds = [...conds]
    if (opts.search) {
      countConds.push(`(o.numero ILIKE $${countVals.length + 1} OR p.nombre ILIKE $${countVals.length + 1} OR v.nombre ILIKE $${countVals.length + 1})`)
      countVals.push(`%${opts.search}%`)
    }
    const wc = countConds.length ? `WHERE ${countConds.join(' AND ')}` : ''

    // Main query: filtros + search + LIMIT/OFFSET
    const mainVals = [...vals]
    const mainConds = [...conds]
    if (opts.search) {
      mainConds.push(`(o.numero ILIKE $${mainVals.length + 1} OR p.nombre ILIKE $${mainVals.length + 1} OR v.nombre ILIKE $${mainVals.length + 1})`)
      mainVals.push(`%${opts.search}%`)
    }
    const limitPh  = `$${mainVals.length + 1}`
    const offsetPh = `$${mainVals.length + 2}`
    mainVals.push(opts.limit, opts.offset)
    const wm = mainConds.length ? `WHERE ${mainConds.join(' AND ')}` : ''

    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT o.*, ${OC_COMPUTED}
         FROM ordenes_compra o ${OC_JOINS} ${wm}
         ORDER BY ${opts.sort} ${opts.order} LIMIT ${limitPh} OFFSET ${offsetPh}`,
        mainVals
      ),
      pool.query(
        `SELECT COUNT(*) FROM ordenes_compra o ${OC_JOINS} ${wc}`,
        countVals
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
       WHERE (fi_prev.fi IS NULL OR fi_this.fi IS DISTINCT FROM fi_prev.fi)
         AND m.cotizar = 'SI'
         AND m.estado_cotiz IN ('COTIZADO', 'ORDENADO', 'RECIBIDO')
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
  const client = await pool.connect()
  try {
    const fields = [
      'proyecto_id', 'proveedor_id', 'estado', 'fecha_emision',
      'fecha_entrega_estimada', 'fecha_entrega_real', 'fecha_mto', 'categoria', 'notas',
    ]
    const updates = fields.filter((f) => req.body[f] !== undefined).map((f, i) => `${f} = $${i + 2}`)
    if (!updates.length) return next(createError('Sin campos para actualizar', 400))
    const values = fields.filter((f) => req.body[f] !== undefined).map((f) => req.body[f])

    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE ordenes_compra SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    )
    if (!rows[0]) {
      await client.query('ROLLBACK')
      return next(createError('Orden no encontrada', 404))
    }

    // If estado changed, sync materiales_mto.estado_cotiz
    if (req.body.estado !== undefined) {
      const { rows: items } = await client.query(
        `SELECT DISTINCT material_id FROM items_orden_compra
         WHERE orden_compra_id = $1 AND material_id IS NOT NULL`,
        [req.params.id]
      )
      await recomputeMaterialesEstadoByIds(
        client,
        items.map((it: { material_id: number }) => it.material_id)
      )
    }

    await client.query('COMMIT')
    res.json({ data: rows[0], message: 'Orden actualizada' })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally { client.release() }
}

export async function updateEstadoOrden(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const { estado } = req.body
    if (!estado) return next(createError('El estado es requerido', 400))

    await client.query('BEGIN')

    const { rows } = await client.query(
      `UPDATE ordenes_compra SET estado = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, estado]
    )
    if (!rows[0]) {
      await client.query('ROLLBACK')
      return next(createError('Orden no encontrada', 404))
    }

    // Recompute estado_cotiz for affected materials based on the OC's new state.
    // (recibida → RECIBIDO, cancelada → COTIZADO or stay ORDENADO if material is
    // in another active OC, etc.)
    const { rows: items } = await client.query(
      `SELECT DISTINCT material_id FROM items_orden_compra
       WHERE orden_compra_id = $1 AND material_id IS NOT NULL`,
      [req.params.id]
    )
    await recomputeMaterialesEstadoByIds(
      client,
      items.map((it: { material_id: number }) => it.material_id)
    )

    await client.query('COMMIT')
    res.json({ data: rows[0], message: `Estado actualizado a "${estado}"` })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally { client.release() }
}

export async function getVendorsCotizados(req: Request, res: Response, next: NextFunction) {
  try {
    const proyecto_id = parseInt(String(req.query.proyecto_id))
    if (!proyecto_id) return next(createError('proyecto_id requerido', 400))

    // For each vendor, find their most recent import batch (fecha_importacion) and
    // sum the total_price of all materials in that batch that are eligible for an OC
    // (cotizar='SI' AND estado_cotiz='COTIZADO'). Filtering by both campos defiende
    // contra estados inconsistentes (ej. material con cotizar='NO' pero estado_cotiz='COTIZADO'
    // por edición manual posterior a la captura de precios).
    const { rows } = await pool.query(
      `WITH latest_fechas AS (
         SELECT vendor, MAX(fecha_importacion) AS fecha_importacion
         FROM materiales_mto
         WHERE proyecto_id = $1
           AND vendor IS NOT NULL AND vendor != ''
           AND cotizar = 'SI'
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
         AND m.cotizar = 'SI'
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
      // Most recent fecha_importacion for this vendor's eligible materials
      // (cotizar='SI' AND estado_cotiz='COTIZADO'). El filtro doble previene
      // que se cuelen materiales marcados cotizar='NO' o 'EN_STOCK' que
      // hayan quedado con estado_cotiz='COTIZADO' por edición previa.
      const { rows: [fechaRow] } = await client.query(
        `SELECT MAX(fecha_importacion) AS fecha_importacion
         FROM materiales_mto
         WHERE proyecto_id = $1 AND vendor = $2
           AND cotizar = 'SI' AND estado_cotiz = 'COTIZADO'`,
        [proyecto_id, vendor]
      )
      const fecha_mto = fechaRow?.fecha_importacion ?? null

      // All eligible materials for this vendor in that batch
      const { rows: materiales } = await client.query(
        `SELECT id, descripcion, unidad, qty, unit_price, total_price
         FROM materiales_mto
         WHERE proyecto_id = $1 AND vendor = $2
           AND cotizar = 'SI' AND estado_cotiz = 'COTIZADO'
           AND (fecha_importacion = $3
                OR ($3::date IS NULL AND fecha_importacion IS NULL))
         ORDER BY item NULLS LAST, codigo`,
        [proyecto_id, vendor, fecha_mto]
      )
      if (!materiales.length) continue

      // Lookup proveedor_id, auto-create if missing
      let { rows: [prov] } = await client.query(
        `SELECT id FROM proveedores WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1)) LIMIT 1`,
        [vendor]
      )
      if (!prov) {
        const inserted = await client.query(
          `INSERT INTO proveedores (nombre) VALUES ($1) RETURNING id`,
          [vendor.trim()]
        )
        prov = inserted.rows[0]
      }

      // Get categoria from materials (one vendor → one category per project)
      const { rows: [catRow] } = await client.query(
        `SELECT categoria FROM materiales_mto
         WHERE proyecto_id = $1 AND vendor = $2 AND categoria IS NOT NULL AND categoria != ''
         LIMIT 1`,
        [proyecto_id, vendor]
      )
      const categoria = catRow?.categoria ?? ''

      // Generate OC number — re-query inside loop so sequence is correct across iterations
      const { rows: [last] } = await client.query(
        `SELECT numero FROM ordenes_compra ORDER BY id DESC LIMIT 1`
      )
      const seq = last ? parseInt(last.numero.split('-')[2] ?? '0') + 1 : 1
      const numero = `OC-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`

      const { rows: [orden] } = await client.query(
        `INSERT INTO ordenes_compra
           (numero, proyecto_id, proveedor_id, categoria, estado, fecha_emision,
            fecha_entrega_estimada, fecha_mto)
         VALUES ($1,$2,$3,$4,'enviada',NOW(),$5,$6) RETURNING id`,
        [numero, proyecto_id, prov?.id ?? null, categoria,
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

      // Materials that now belong to this OC pass from COTIZADO → ORDENADO
      await recomputeMaterialesEstadoByIds(
        client,
        materiales.map((m: { id: number }) => m.id)
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
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [orden] } = await client.query(
      `SELECT estado FROM ordenes_compra WHERE id = $1`, [req.params.id]
    )
    if (!orden) {
      await client.query('ROLLBACK')
      return next(createError('Orden no encontrada', 404))
    }
    if (['recibida', 'confirmada'].includes(orden.estado)) {
      await client.query('ROLLBACK')
      return next(createError('No se puede eliminar una orden confirmada o recibida', 409))
    }

    // Capture material IDs BEFORE delete (items_orden_compra is CASCADE-deleted).
    const { rows: items } = await client.query(
      `SELECT DISTINCT material_id FROM items_orden_compra
       WHERE orden_compra_id = $1 AND material_id IS NOT NULL`,
      [req.params.id]
    )
    const materialIds = items.map((it: { material_id: number }) => it.material_id)

    await client.query('DELETE FROM ordenes_compra WHERE id = $1', [req.params.id])

    // Recompute: each material falls back to COTIZADO unless it's in another active OC.
    await recomputeMaterialesEstadoByIds(client, materialIds)

    await client.query('COMMIT')
    res.json({ message: 'Orden eliminada' })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally { client.release() }
}

// ─── Compras NO-MTO (DIRECTA / URGENTE) ──────────────────────────────────────
//
// Una compra que NO viene del MTO planificado. El usuario carga vendor + ETA +
// items con precio y la transacción:
//   1) crea N rows en materiales_mto con origen='DIRECTA'|'URGENTE',
//      cotizar='SI', estado_cotiz='COTIZADO' (ya entran con precio)
//   2) crea 1 ordenes_compra dedicada con estado='enviada'
//   3) crea N items_orden_compra linkeando los nuevos materiales a la OC
//   4) el helper recomputeMaterialesEstadoByIds los pasa a ORDENADO
//
// Diferencia con createOrdenCompra (manual): este endpoint POBLA materiales_mto
// además de crear la OC, manteniendo el catálogo de materiales del proyecto
// unificado. createOrdenCompra acepta items con material_id nullable pero NO
// crea materiales nuevos.
export async function crearOCNoMTO(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const {
      proyecto_id, vendor, origen, fecha_entrega_estimada,
      categoria, notas, items = [], freight = 0,
    } = req.body as {
      proyecto_id: number | null
      vendor: string
      origen: 'DIRECTA' | 'URGENTE' | 'OPERATIVA'
      fecha_entrega_estimada: string | null
      categoria: string | null
      notas: string | null
      items: Array<{ descripcion: string; unidad: string; qty: number; unit_price: number }>
      freight?: number
    }

    // Validations
    if (!vendor || !String(vendor).trim()) return next(createError('vendor es requerido', 400))
    if (!origen || !['DIRECTA', 'URGENTE', 'OPERATIVA'].includes(origen))
      return next(createError("origen debe ser 'DIRECTA', 'URGENTE' u 'OPERATIVA'", 400))

    // OPERATIVA es ADMIN-only (gastos del taller, controlados por el dueño)
    if (origen === 'OPERATIVA' && req.user?.rol !== 'ADMIN') {
      return next(createError('Solo ADMIN puede registrar compras OPERATIVAS', 403))
    }
    // OPERATIVA no tiene proyecto asociado (es un gasto del taller, no de obra)
    if (origen === 'OPERATIVA' && proyecto_id != null) {
      return next(createError('Compras OPERATIVAS no pueden tener proyecto asociado', 400))
    }

    if (!Array.isArray(items) || items.length === 0)
      return next(createError('items: al menos 1 línea requerida', 400))
    if (Number(freight) < 0)
      return next(createError('freight no puede ser negativo', 400))
    for (const [i, it] of items.entries()) {
      if (!it.descripcion || !String(it.descripcion).trim())
        return next(createError(`item ${i + 1}: descripcion es requerida`, 400))
      if (!it.unidad) return next(createError(`item ${i + 1}: unidad es requerida`, 400))
      if (!(Number(it.qty) > 0))
        return next(createError(`item ${i + 1}: qty debe ser > 0`, 400))
      if (!(Number(it.unit_price) > 0))
        return next(createError(`item ${i + 1}: unit_price debe ser > 0`, 400))
    }

    // OPERATIVAS saltan directo a recibida (ya están compradas al momento de registrar)
    const ocEstado    = origen === 'OPERATIVA' ? 'recibida' : 'enviada'
    const matEstado   = origen === 'OPERATIVA' ? 'RECIBIDO' : 'COTIZADO'
    // Para OPERATIVA, fecha_entrega_real = hoy (porque ya se recibió)
    const fechaRealOp = origen === 'OPERATIVA' ? new Date().toISOString().slice(0, 10) : null

    await client.query('BEGIN')

    // Lookup / auto-create proveedor
    let { rows: [prov] } = await client.query(
      `SELECT id FROM proveedores WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1)) LIMIT 1`,
      [vendor]
    )
    if (!prov) {
      const inserted = await client.query(
        `INSERT INTO proveedores (nombre) VALUES ($1) RETURNING id`,
        [String(vendor).trim()]
      )
      prov = inserted.rows[0]
    }

    // Generate OC number
    const { rows: [last] } = await client.query(
      `SELECT numero FROM ordenes_compra ORDER BY id DESC LIMIT 1`
    )
    const seq = last ? parseInt(last.numero.split('-')[2] ?? '0') + 1 : 1
    const numero = `OC-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`

    // Create OC (incluye origen + freight; sin IVA — opera en USD)
    // OPERATIVA arranca como 'recibida' + fecha_entrega_real=hoy
    const { rows: [orden] } = await client.query(
      `INSERT INTO ordenes_compra
         (numero, proyecto_id, proveedor_id, categoria, estado, fecha_emision,
          fecha_entrega_estimada, fecha_entrega_real, notas, origen, freight)
       VALUES ($1,$2,$3,$4,$5::estado_orden,NOW(),$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        numero, proyecto_id ?? null, prov?.id ?? null, categoria ?? '',
        ocEstado, fecha_entrega_estimada || null, fechaRealOp,
        notas ?? null, origen, Number(freight) || 0,
      ]
    )

    // Create materiales_mto rows + items_orden_compra
    const materialIds: number[] = []
    let subtotal = 0
    for (const [i, it] of items.entries()) {
      const qty   = Number(it.qty)
      const price = Number(it.unit_price)
      const lineTotal = qty * price
      subtotal   += lineTotal

      // Codigo auto-generado: NOMTO-{numero}-{idx} para uniqueness
      const codigo = `NOMTO-${numero}-${String(i + 1).padStart(2, '0')}`

      const { rows: [mat] } = await client.query(
        `INSERT INTO materiales_mto
           (codigo, descripcion, unidad, proyecto_id, vendor, qty, unit_price,
            total_price, cotizar, estado_cotiz, origen, fecha_importacion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SI',$9,$10,CURRENT_DATE)
         RETURNING id`,
        [codigo, it.descripcion, it.unidad, proyecto_id ?? null,
         String(vendor).trim(), qty, price, lineTotal, matEstado, origen]
      )
      materialIds.push(mat.id)

      await client.query(
        `INSERT INTO items_orden_compra
           (orden_compra_id, material_id, descripcion, unidad, cantidad, precio_unitario)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [orden.id, mat.id, it.descripcion, it.unidad, qty, price]
      )
    }

    // Total = subtotal + freight (sin IVA porque opera en USD)
    const freightNum = Number(freight) || 0
    const total = parseFloat((subtotal + freightNum).toFixed(2))
    await client.query(
      `UPDATE ordenes_compra SET subtotal=$1, iva=0, total=$2 WHERE id=$3`,
      [subtotal, total, orden.id]
    )

    // Para DIRECTA/URGENTE el helper transiciona COTIZADO → ORDENADO.
    // Para OPERATIVA los materiales ya nacen como RECIBIDO; el helper igual los
    // chequea pero al recomputar verá la OC en estado 'recibida' y los dejará en RECIBIDO.
    await recomputeMaterialesEstadoByIds(client, materialIds)

    await client.query('COMMIT')
    res.status(201).json({
      data: { id: orden.id, numero, total, freight: freightNum, materiales_count: materialIds.length, origen },
      message: `Compra ${origen.toLowerCase()} ${numero} creada con ${materialIds.length} ítem(s)`,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally { client.release() }
}
