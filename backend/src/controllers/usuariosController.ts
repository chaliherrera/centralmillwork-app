import { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import { parsePagination, paginatedResponse } from '../utils/pagination'

const VALID_ROLES = ['ADMIN', 'PROCUREMENT', 'PRODUCTION', 'PROJECT_MANAGEMENT', 'CONTABILIDAD']

export async function getUsuarios(req: Request, res: Response, next: NextFunction) {
  try {
    const opts = parsePagination(req, 'nombre')
    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT id, nombre, email, rol, activo, created_at, updated_at
         FROM usuarios ORDER BY ${opts.sort} ${opts.order} LIMIT $1 OFFSET $2`,
        [opts.limit, opts.offset]
      ),
      pool.query(`SELECT COUNT(*) FROM usuarios`),
    ])
    res.json(paginatedResponse(rows.rows, parseInt(countRow.rows[0].count), opts))
  } catch (err) { next(err) }
}

export async function createUsuario(req: Request, res: Response, next: NextFunction) {
  try {
    const { nombre, email, password, rol } = req.body
    if (!nombre || !email || !password || !rol) return next(createError('Todos los campos son requeridos', 400))
    if (!VALID_ROLES.includes(rol)) return next(createError('Rol inválido', 400))

    const hash = await bcrypt.hash(String(password), 10)
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol)
       VALUES ($1,$2,$3,$4)
       RETURNING id, nombre, email, rol, activo, created_at`,
      [nombre.trim(), String(email).toLowerCase().trim(), hash, rol]
    )
    res.status(201).json({ data: rows[0], message: 'Usuario creado' })
  } catch (err: any) {
    if (err.code === '23505') return next(createError('El email ya está registrado', 409))
    next(err)
  }
}

export async function updateUsuario(req: Request, res: Response, next: NextFunction) {
  try {
    const { nombre, email, rol, activo, password } = req.body
    const fields: string[] = []
    const vals: unknown[] = [req.params.id]
    let i = 2

    if (nombre !== undefined)  { fields.push(`nombre=$${i++}`);         vals.push(nombre.trim()) }
    if (email !== undefined)   { fields.push(`email=$${i++}`);          vals.push(String(email).toLowerCase().trim()) }
    if (rol !== undefined)     { fields.push(`rol=$${i++}`);            vals.push(rol) }
    if (activo !== undefined)  { fields.push(`activo=$${i++}`);         vals.push(activo) }
    if (password)              { fields.push(`password_hash=$${i++}`);  vals.push(await bcrypt.hash(String(password), 10)) }

    if (!fields.length) return next(createError('Sin campos para actualizar', 400))
    if (rol && !VALID_ROLES.includes(rol)) return next(createError('Rol inválido', 400))

    const { rows } = await pool.query(
      `UPDATE usuarios SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$1 RETURNING id, nombre, email, rol, activo`,
      vals
    )
    if (!rows[0]) return next(createError('Usuario no encontrado', 404))
    res.json({ data: rows[0], message: 'Usuario actualizado' })
  } catch (err: any) {
    if (err.code === '23505') return next(createError('El email ya está registrado', 409))
    next(err)
  }
}
