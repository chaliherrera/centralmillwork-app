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
