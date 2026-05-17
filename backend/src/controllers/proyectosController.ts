import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import pool from '../db/pool'
import { parsePagination, paginatedResponse } from '../utils/pagination'
import { createError } from '../middleware/errorHandler'

// ─── Schemas de validación ──────────────────────────────────────────────────
const ESTADOS_PROYECTO = ['cotizacion', 'activo', 'en_pausa', 'completado', 'cancelado'] as const

export const createProyectoSchema = z.object({
  codigo:               z.string().trim().min(1, 'requerido').max(30),
  nombre:               z.string().trim().min(1, 'requerido').max(300),
  cliente:              z.string().trim().min(1, 'requerido').max(200),
  descripcion:          z.string().max(2000).nullable().optional(),
  estado:               z.enum(ESTADOS_PROYECTO).optional(),
  fecha_inicio:         z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'formato YYYY-MM-DD').nullable().optional(),
  fecha_fin_estimada:   z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'formato YYYY-MM-DD').nullable().optional(),
  presupuesto:          z.coerce.number().min(0, 'debe ser ≥ 0').optional(),
  responsable:          z.string().max(150).nullable().optional(),
})

export const updateProyectoSchema = z.object({
  codigo:               z.string().trim().min(1).max(30).optional(),
  nombre:               z.string().trim().min(1).max(300).optional(),
  cliente:              z.string().trim().min(1).max(200).optional(),
  descripcion:          z.string().max(2000).nullable().optional(),
  estado:               z.enum(ESTADOS_PROYECTO).optional(),
  fecha_inicio:         z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional(),
  fecha_fin_estimada:   z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional(),
  fecha_fin_real:       z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional(),
  presupuesto:          z.coerce.number().min(0).optional(),
  responsable:          z.string().max(150).nullable().optional(),
})

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

// ─── Resumen del proyecto: info + KPIs agregados para la vista de detalle ────
//
// Devuelve en una sola llamada:
//   - proyecto: datos básicos (codigo, nombre, cliente, estado, fechas, presupuesto)
//   - kpis.materiales: distribución por estado_cotiz + total + monto
//   - kpis.origen: cantidades por MTO / DIRECTA / URGENTE
//   - kpis.ocs: cantidades por estado + montos
//   - kpis.recepciones: cantidades + con diferencias
//   - kpis.vendors: top 5 por gasto
//   - kpis.gasto_mensual: serie mensual acumulada de gastos (para chart)
export async function getProyectoResumen(req: Request, res: Response, next: NextFunction) {
  try {
    const proyecto_id = parseInt(String(req.params.id))
    if (!proyecto_id) return next(createError('id inválido', 400))

    const { rows: [proyecto] } = await pool.query(
      `SELECT * FROM proyectos WHERE id = $1`, [proyecto_id]
    )
    if (!proyecto) return next(createError('Proyecto no encontrado', 404))

    // ── KPIs de materiales (distribución por estado + origen + totales) ────
    const { rows: [materialesKpi] } = await pool.query(
      `SELECT
         COUNT(*)::int                                             AS total,
         COUNT(*) FILTER (WHERE estado_cotiz = 'PENDIENTE')::int   AS pendientes,
         COUNT(*) FILTER (WHERE estado_cotiz = 'COTIZADO')::int    AS cotizados,
         COUNT(*) FILTER (WHERE estado_cotiz = 'ORDENADO')::int    AS ordenados,
         COUNT(*) FILTER (WHERE estado_cotiz = 'RECIBIDO')::int    AS recibidos,
         COUNT(*) FILTER (WHERE estado_cotiz = 'EN_STOCK')::int    AS en_stock,
         COUNT(*) FILTER (WHERE origen = 'MTO')::int               AS origen_mto,
         COUNT(*) FILTER (WHERE origen = 'DIRECTA')::int           AS origen_directa,
         COUNT(*) FILTER (WHERE origen = 'URGENTE')::int           AS origen_urgente,
         COALESCE(SUM(total_price), 0)::numeric                    AS monto_total,
         COALESCE(SUM(total_price) FILTER (WHERE estado_cotiz IN ('ORDENADO','RECIBIDO')), 0)::numeric AS monto_comprado,
         COALESCE(SUM(total_price) FILTER (WHERE estado_cotiz = 'RECIBIDO'), 0)::numeric AS monto_recibido
       FROM materiales_mto
       WHERE proyecto_id = $1`,
      [proyecto_id]
    )

    // ── KPIs de OCs ────────────────────────────────────────────────────────
    const { rows: [ocsKpi] } = await pool.query(
      `SELECT
         COUNT(*)::int                                              AS total,
         COUNT(*) FILTER (WHERE estado = 'recibida')::int           AS recibidas,
         COUNT(*) FILTER (WHERE estado NOT IN ('cancelada','recibida'))::int AS activas,
         COUNT(*) FILTER (WHERE estado = 'cancelada')::int          AS canceladas,
         COUNT(*) FILTER (WHERE origen = 'DIRECTA')::int            AS directas,
         COUNT(*) FILTER (WHERE origen = 'URGENTE')::int            AS urgentes,
         COALESCE(SUM(total), 0)::numeric                           AS monto_total,
         COALESCE(SUM(freight), 0)::numeric                         AS freight_total,
         COUNT(*) FILTER (
           WHERE estado NOT IN ('cancelada','recibida')
             AND fecha_entrega_estimada IS NOT NULL
             AND fecha_entrega_estimada < CURRENT_DATE
         )::int                                                     AS vencidas
       FROM ordenes_compra
       WHERE proyecto_id = $1`,
      [proyecto_id]
    )

    // ── KPIs de recepciones ────────────────────────────────────────────────
    const { rows: [recepcionesKpi] } = await pool.query(
      `SELECT
         COUNT(*)::int                                                AS total,
         COUNT(*) FILTER (WHERE r.estado = 'completa')::int           AS completas,
         COUNT(*) FILTER (WHERE r.estado = 'con_diferencias')::int    AS con_diferencias
       FROM recepciones r
       JOIN ordenes_compra oc ON oc.id = r.orden_compra_id
       WHERE oc.proyecto_id = $1`,
      [proyecto_id]
    )

    // ── Top 5 vendors por gasto (para gráfica) ─────────────────────────────
    const { rows: topVendors } = await pool.query(
      `SELECT
         v.nombre                              AS vendor,
         COUNT(oc.id)::int                     AS ocs_count,
         COALESCE(SUM(oc.total), 0)::numeric   AS monto
       FROM ordenes_compra oc
       JOIN proveedores v ON v.id = oc.proveedor_id
       WHERE oc.proyecto_id = $1 AND oc.estado != 'cancelada'
       GROUP BY v.nombre
       ORDER BY monto DESC
       LIMIT 5`,
      [proyecto_id]
    )

    // ── Serie mensual de gasto (para line chart) ───────────────────────────
    const { rows: gastoMensual } = await pool.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', fecha_emision), 'YYYY-MM') AS mes,
         COALESCE(SUM(total), 0)::numeric                       AS monto
       FROM ordenes_compra
       WHERE proyecto_id = $1 AND estado != 'cancelada'
       GROUP BY DATE_TRUNC('month', fecha_emision)
       ORDER BY DATE_TRUNC('month', fecha_emision)`,
      [proyecto_id]
    )

    res.json({
      data: {
        proyecto,
        kpis: {
          materiales:   materialesKpi,
          ocs:          ocsKpi,
          recepciones:  recepcionesKpi,
          top_vendors:  topVendors,
          gasto_mensual: gastoMensual,
        },
      },
    })
  } catch (err) { next(err) }
}

// ─── Actividad cronológica del proyecto ──────────────────────────────────────
//
// Devuelve un feed de eventos ordenados desc por fecha, mezclando:
//   - importaciones de MTO (agrupadas por fecha_importacion + origen)
//   - generación / creación de OCs (cualquier estado, incluido cancelada)
//   - recepciones (completa o con_diferencias)
//
// Cada evento incluye una nota cuando existe (oc.notas, recepcion.notas, etc.)
export async function getProyectoActividad(req: Request, res: Response, next: NextFunction) {
  try {
    const proyecto_id = parseInt(String(req.params.id))
    if (!proyecto_id) return next(createError('id inválido', 400))

    // 1) Imports de MTO: agrupados por (fecha_importacion, origen)
    const { rows: imports } = await pool.query(
      `SELECT
         'mto_import'                                AS tipo,
         MIN(created_at)                             AS ts,
         fecha_importacion                           AS fecha,
         origen,
         COUNT(*)::int                               AS items_count,
         COUNT(*) FILTER (WHERE cotizar = 'SI')::int      AS cotizar_si,
         COUNT(*) FILTER (WHERE cotizar = 'EN_STOCK')::int AS en_stock,
         (SELECT MIN(vendor) FROM materiales_mto m2
          WHERE m2.proyecto_id = materiales_mto.proyecto_id
            AND m2.fecha_importacion = materiales_mto.fecha_importacion
            AND m2.origen = materiales_mto.origen
            AND m2.vendor IS NOT NULL AND m2.vendor != '')   AS vendor_principal
       FROM materiales_mto
       WHERE proyecto_id = $1
       GROUP BY fecha_importacion, origen, proyecto_id
       ORDER BY ts DESC`,
      [proyecto_id]
    )

    // 2) OCs: cada OC = 1 evento con su estado actual
    const { rows: ocs } = await pool.query(
      `SELECT
         'oc'                                AS tipo,
         oc.created_at                       AS ts,
         oc.id, oc.numero, oc.estado, oc.origen,
         oc.fecha_emision, oc.fecha_entrega_estimada, oc.fecha_entrega_real,
         oc.total, oc.freight, oc.categoria, oc.notas,
         v.nombre                            AS vendor,
         (SELECT COUNT(*)::int FROM items_orden_compra WHERE orden_compra_id = oc.id) AS items_count
       FROM ordenes_compra oc
       LEFT JOIN proveedores v ON v.id = oc.proveedor_id
       WHERE oc.proyecto_id = $1
       ORDER BY oc.created_at DESC`,
      [proyecto_id]
    )

    // 3) Recepciones
    const { rows: recepciones } = await pool.query(
      `SELECT
         'recepcion'                         AS tipo,
         r.created_at                        AS ts,
         r.id, r.folio, r.estado, r.fecha_recepcion, r.recibio, r.notas,
         oc.numero                           AS oc_numero,
         oc.id                               AS oc_id,
         (SELECT COUNT(*)::int FROM items_recepcion WHERE recepcion_id = r.id AND cantidad_recibida != cantidad_ordenada) AS diffs_count
       FROM recepciones r
       JOIN ordenes_compra oc ON oc.id = r.orden_compra_id
       WHERE oc.proyecto_id = $1
       ORDER BY r.created_at DESC`,
      [proyecto_id]
    )

    // Merge + sort desc por ts
    const eventos = [...imports, ...ocs, ...recepciones].sort(
      (a: any, b: any) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
    )

    res.json({ data: eventos })
  } catch (err) { next(err) }
}
