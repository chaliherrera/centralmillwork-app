import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { parsePagination, paginatedResponse } from '../utils/pagination'
import { createError } from '../middleware/errorHandler'

export async function getProveedores(req: Request, res: Response, next: NextFunction) {
  try {
    const opts = parsePagination(req, 'nombre')
    const whereMain  = opts.search ? `WHERE nombre ILIKE $3 OR email ILIKE $3 OR rfc ILIKE $3` : ''
    const whereCount = opts.search ? `WHERE nombre ILIKE $1 OR email ILIKE $1 OR rfc ILIKE $1` : ''

    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT * FROM proveedores ${whereMain}
         ORDER BY ${opts.sort} ${opts.order} LIMIT $1 OFFSET $2`,
        opts.search ? [opts.limit, opts.offset, `%${opts.search}%`] : [opts.limit, opts.offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM proveedores ${whereCount}`,
        opts.search ? [`%${opts.search}%`] : []
      ),
    ])

    res.json(paginatedResponse(rows.rows, parseInt(countRow.rows[0].count), opts))
  } catch (err) { next(err) }
}

export async function getProveedor(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query('SELECT * FROM proveedores WHERE id = $1', [req.params.id])
    if (!rows[0]) return next(createError('Proveedor no encontrado', 404))
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
}

export async function createProveedor(req: Request, res: Response, next: NextFunction) {
  try {
    const { nombre, contacto, email, telefono, rfc, direccion } = req.body
    if (!nombre) return next(createError('El nombre es requerido', 400))
    const { rows } = await pool.query(
      `INSERT INTO proveedores (nombre, contacto, email, telefono, rfc, direccion)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [nombre, contacto ?? null, email ?? null, telefono ?? null, rfc ?? null, direccion ?? null]
    )
    res.status(201).json({ data: rows[0], message: 'Proveedor creado exitosamente' })
  } catch (err) { next(err) }
}

export async function updateProveedor(req: Request, res: Response, next: NextFunction) {
  try {
    const fields = ['nombre', 'contacto', 'email', 'telefono', 'rfc', 'direccion', 'activo']
    const updates = fields.filter((f) => req.body[f] !== undefined).map((f, i) => `${f} = $${i + 2}`)
    if (!updates.length) return next(createError('Sin campos para actualizar', 400))
    const values = fields.filter((f) => req.body[f] !== undefined).map((f) => req.body[f])
    const { rows } = await pool.query(
      `UPDATE proveedores SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    )
    if (!rows[0]) return next(createError('Proveedor no encontrado', 404))
    res.json({ data: rows[0], message: 'Proveedor actualizado' })
  } catch (err) { next(err) }
}

export async function deleteProveedor(req: Request, res: Response, next: NextFunction) {
  try {
    const { rowCount } = await pool.query('DELETE FROM proveedores WHERE id = $1', [req.params.id])
    if (!rowCount) return next(createError('Proveedor no encontrado', 404))
    res.json({ message: 'Proveedor eliminado' })
  } catch (err) { next(err) }
}
