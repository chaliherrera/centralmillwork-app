import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import { normalizeSeleccion } from '../utils/informes'

// ─────────────────────────────────────────────────────────────────────────────
// Informes guardados del armador transversal (tabla informes, migr. 114).
// Compartidos: todos los leen; crean los roles operativos (guard en la ruta);
// editar/borrar solo el creador o un ADMIN (se chequea acá).
// ─────────────────────────────────────────────────────────────────────────────

const SELECT_COLS =
  `i.id, i.nombre, i.seleccion, i.created_by,
   u.nombre AS creado_por_nombre,
   to_char(i.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at,
   to_char(i.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at`

function puedeEditar(req: Request, created_by: string | null): boolean {
  return req.user?.rol === 'ADMIN' || (!!req.user && req.user.id === created_by)
}

// GET /api/informes → lista (compartida)
export async function getInformes(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLS}
         FROM informes i LEFT JOIN usuarios u ON u.id = i.created_by
        ORDER BY i.updated_at DESC`
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
}

// GET /api/informes/:id
export async function getInforme(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id))
    if (!id) return next(createError('id inválido', 400))
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLS}
         FROM informes i LEFT JOIN usuarios u ON u.id = i.created_by
        WHERE i.id = $1`, [id]
    )
    if (!rows.length) return next(createError('Informe no encontrado', 404))
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
}

// POST /api/informes  { nombre, seleccion }
export async function createInforme(req: Request, res: Response, next: NextFunction) {
  try {
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : ''
    if (!nombre) return next(createError('nombre es requerido', 400))
    let seleccion
    try { seleccion = normalizeSeleccion(req.body?.seleccion ?? []) }
    catch (e) { return next(createError((e as Error).message, 400)) }

    const { rows } = await pool.query(
      `INSERT INTO informes (nombre, seleccion, created_by)
         VALUES ($1, $2::jsonb, $3)
       RETURNING id`,
      [nombre, JSON.stringify(seleccion), req.user?.id ?? null]
    )
    const { rows: full } = await pool.query(
      `SELECT ${SELECT_COLS} FROM informes i LEFT JOIN usuarios u ON u.id = i.created_by WHERE i.id = $1`,
      [rows[0].id]
    )
    res.status(201).json({ data: full[0] })
  } catch (err) { next(err) }
}

// PUT /api/informes/:id  { nombre?, seleccion? } — creador o ADMIN
export async function updateInforme(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id))
    if (!id) return next(createError('id inválido', 400))
    const { rows: [actual] } = await pool.query(`SELECT created_by FROM informes WHERE id = $1`, [id])
    if (!actual) return next(createError('Informe no encontrado', 404))
    if (!puedeEditar(req, actual.created_by)) return next(createError('Solo el creador o un ADMIN pueden editar este informe', 403))

    const sets: string[] = []
    const vals: unknown[] = []
    if (typeof req.body?.nombre === 'string') {
      const nombre = req.body.nombre.trim()
      if (!nombre) return next(createError('nombre no puede quedar vacío', 400))
      vals.push(nombre); sets.push(`nombre = $${vals.length}`)
    }
    if (req.body?.seleccion !== undefined) {
      let seleccion
      try { seleccion = normalizeSeleccion(req.body.seleccion) }
      catch (e) { return next(createError((e as Error).message, 400)) }
      vals.push(JSON.stringify(seleccion)); sets.push(`seleccion = $${vals.length}::jsonb`)
    }
    if (!sets.length) return next(createError('Nada para actualizar', 400))
    sets.push(`updated_at = now()`)
    vals.push(id)
    await pool.query(`UPDATE informes SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals)

    const { rows: full } = await pool.query(
      `SELECT ${SELECT_COLS} FROM informes i LEFT JOIN usuarios u ON u.id = i.created_by WHERE i.id = $1`, [id]
    )
    res.json({ data: full[0] })
  } catch (err) { next(err) }
}

// DELETE /api/informes/:id — creador o ADMIN
export async function deleteInforme(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id))
    if (!id) return next(createError('id inválido', 400))
    const { rows: [actual] } = await pool.query(`SELECT created_by FROM informes WHERE id = $1`, [id])
    if (!actual) return next(createError('Informe no encontrado', 404))
    if (!puedeEditar(req, actual.created_by)) return next(createError('Solo el creador o un ADMIN pueden borrar este informe', 403))
    await pool.query(`DELETE FROM informes WHERE id = $1`, [id])
    res.json({ message: 'Informe eliminado' })
  } catch (err) { next(err) }
}
