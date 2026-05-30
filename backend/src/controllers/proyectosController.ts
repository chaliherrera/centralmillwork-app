import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { parsePagination, paginatedResponse } from '../utils/pagination'
import { createError } from '../middleware/errorHandler'

export async function getProyectos(req: Request, res: Response, next: NextFunction) {
  try {
    const opts = parsePagination(req, 'created_at')
    const whereMain  = opts.search
      ? `WHERE p.nombre ILIKE $3 OR p.codigo ILIKE $3 OR p.cliente ILIKE $3`
      : ''
    const whereCount = opts.search
      ? `WHERE nombre ILIKE $1 OR codigo ILIKE $1 OR cliente ILIKE $1`
      : ''

    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT p.*,
           COALESCE(SUM(oc.total), 0) AS total_ocs
         FROM proyectos p
         LEFT JOIN ordenes_compra oc ON oc.proyecto_id = p.id
         ${whereMain}
         GROUP BY p.id
         ORDER BY ${opts.sort} ${opts.order}
         LIMIT $1 OFFSET $2`,
        opts.search ? [opts.limit, opts.offset, `%${opts.search}%`] : [opts.limit, opts.offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM proyectos ${whereCount}`,
        opts.search ? [`%${opts.search}%`] : []
      ),
    ])

    res.json(paginatedResponse(rows.rows, parseInt(countRow.rows[0].count), opts))
  } catch (err) { next(err) }
}

export async function getProyecto(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query('SELECT * FROM proyectos WHERE id = $1', [req.params.id])
    if (!rows[0]) return next(createError('Proyecto no encontrado', 404))
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
}

export async function createProyecto(req: Request, res: Response, next: NextFunction) {
  try {
    const { codigo, nombre, cliente, descripcion, estado, fecha_inicio,
            fecha_fin_estimada, presupuesto, responsable } = req.body
    const { rows } = await pool.query(
      `INSERT INTO proyectos (codigo, nombre, cliente, descripcion, estado,
        fecha_inicio, fecha_fin_estimada, presupuesto, responsable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [codigo, nombre, cliente, descripcion || null, estado || 'activo',
       fecha_inicio || null, fecha_fin_estimada || null, presupuesto ?? 0, responsable || null]
    )
    res.status(201).json({ data: rows[0], message: 'Proyecto creado exitosamente' })
  } catch (err) { next(err) }
}

export async function updateProyecto(req: Request, res: Response, next: NextFunction) {
  try {
    const fields = ['codigo','nombre','cliente','descripcion','estado',
                    'fecha_inicio','fecha_fin_estimada','fecha_fin_real','presupuesto','responsable']
    const updates = fields
      .filter((f) => req.body[f] !== undefined)
      .map((f, i) => `${f} = $${i + 2}`)
    if (!updates.length) return next(createError('Sin campos para actualizar', 400))

    const values = fields.filter((f) => req.body[f] !== undefined).map((f) => req.body[f])
    const { rows } = await pool.query(
      `UPDATE proyectos SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    )
    if (!rows[0]) return next(createError('Proyecto no encontrado', 404))
    res.json({ data: rows[0], message: 'Proyecto actualizado' })
  } catch (err) { next(err) }
}

export async function deleteProyecto(req: Request, res: Response, next: NextFunction) {
  try {
    const { rowCount } = await pool.query('DELETE FROM proyectos WHERE id = $1', [req.params.id])
    if (!rowCount) return next(createError('Proyecto no encontrado', 404))
    res.json({ message: 'Proyecto eliminado' })
  } catch (err) { next(err) }
}

// GET /api/proyectos/:id/items-readiness
// Portado desde main (feat items-readiness, commit e0a29fe). Devuelve, por cada
// item del MTO del proyecto, el estado de readiness de sus materiales.
//
// Estado calculado así:
//   - LISTO     → todos recibidos o en stock (recibidos + en_stock == total)
//   - PARCIAL   → al menos uno recibido pero faltan otros
//   - ORDENADO  → ninguno recibido, todos están en una OC activa
//   - PENDIENTE → hay materiales sin ordenar
//
// Los materiales sin item (vacío o NULL) se excluyen del cálculo.
export async function getProyectoItemsReadiness(req: Request, res: Response, next: NextFunction) {
  try {
    const proyecto_id = parseInt(String(req.params.id))
    if (!proyecto_id) return next(createError('id inválido', 400))

    const { rows } = await pool.query(
      `WITH items_expanded AS (
         SELECT
           TRIM(item_num) AS item,
           m.id, m.codigo, m.descripcion, m.vendor, m.qty, m.unit_price,
           m.estado_cotiz, m.cotizar,
           oc_link.oc_id, oc_link.oc_numero, oc_link.oc_fecha_entrega
         FROM materiales_mto m
         CROSS JOIN UNNEST(STRING_TO_ARRAY(m.item, ',')) AS item_num
         LEFT JOIN LATERAL (
           SELECT oc.id AS oc_id, oc.numero AS oc_numero,
                  oc.fecha_entrega_estimada AS oc_fecha_entrega
           FROM items_orden_compra ioc
           JOIN ordenes_compra oc ON oc.id = ioc.orden_compra_id
           WHERE ioc.material_id = m.id
             AND oc.estado != 'cancelada'
           ORDER BY oc.fecha_emision DESC
           LIMIT 1
         ) oc_link ON true
         WHERE m.proyecto_id = $1
           AND m.item IS NOT NULL
           AND TRIM(m.item) != ''
       )
       SELECT
         item,
         COUNT(*)::int                                                       AS total,
         COUNT(*) FILTER (WHERE estado_cotiz = 'RECIBIDO')::int              AS recibidos,
         COUNT(*) FILTER (WHERE estado_cotiz = 'ORDENADO')::int              AS ordenados,
         COUNT(*) FILTER (WHERE estado_cotiz IN ('PENDIENTE','COTIZADO'))::int AS pendientes,
         COUNT(*) FILTER (WHERE estado_cotiz = 'EN_STOCK')::int              AS en_stock,
         json_agg(
           json_build_object(
             'id',          id,
             'codigo',      codigo,
             'descripcion', descripcion,
             'vendor',      vendor,
             'qty',         qty,
             'unit_price',  unit_price,
             'estado_cotiz', estado_cotiz,
             'oc_id',       oc_id,
             'oc_numero',   oc_numero,
             'oc_fecha_entrega', oc_fecha_entrega
           ) ORDER BY codigo
         ) AS materiales
       FROM items_expanded
       GROUP BY item
       ORDER BY
         CASE WHEN item ~ '^\\d+$' THEN LPAD(item, 10, '0') ELSE item END`,
      [proyecto_id]
    )

    const items = rows.map((r: any) => {
      const total = r.total
      const recibidos = r.recibidos
      const en_stock = r.en_stock
      const pendientes = r.pendientes
      const disponibles = recibidos + en_stock

      let estado: 'LISTO' | 'PARCIAL' | 'ORDENADO' | 'PENDIENTE'
      if (disponibles === total)      estado = 'LISTO'
      else if (disponibles > 0)       estado = 'PARCIAL'
      else if (pendientes === 0)      estado = 'ORDENADO'
      else                            estado = 'PENDIENTE'

      return { ...r, disponibles, estado }
    })

    const resumen = {
      total_items:  items.length,
      listos:       items.filter((i: any) => i.estado === 'LISTO').length,
      parciales:    items.filter((i: any) => i.estado === 'PARCIAL').length,
      ordenados:    items.filter((i: any) => i.estado === 'ORDENADO').length,
      pendientes:   items.filter((i: any) => i.estado === 'PENDIENTE').length,
    }

    res.json({ data: { items, resumen } })
  } catch (err) { next(err) }
}
