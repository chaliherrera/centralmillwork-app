import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import { normalizeSeleccion } from '../utils/informes'
import { computeItemsReadiness } from './proyectosController'
import { fetchInformeNotas } from './informeNotasController'

// ─────────────────────────────────────────────────────────────────────────────
// Informes guardados del armador transversal (tabla informes, migr. 114).
// Compartidos: todos los leen; crean los roles operativos (guard en la ruta);
// editar/borrar solo el creador o un ADMIN (se chequea acá).
// ─────────────────────────────────────────────────────────────────────────────

const SELECT_COLS =
  `i.id, i.nombre, i.seleccion, i.created_by, i.token, i.compartir_activo,
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

// PUT /api/informes/:id/compartir  { activo: boolean, regenerar?: boolean }
// Enciende/apaga el link público. Genera token la primera vez (o si regenerar).
// Creador o ADMIN.
export async function setCompartir(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id))
    if (!id) return next(createError('id inválido', 400))
    const { rows: [actual] } = await pool.query(`SELECT created_by, token FROM informes WHERE id = $1`, [id])
    if (!actual) return next(createError('Informe no encontrado', 404))
    if (!puedeEditar(req, actual.created_by)) return next(createError('Solo el creador o un ADMIN pueden compartir este informe', 403))

    const activo = !!req.body?.activo
    const regenerar = !!req.body?.regenerar
    let token: string | null = actual.token
    if (activo && (!token || regenerar)) token = crypto.randomBytes(16).toString('hex')

    await pool.query(
      `UPDATE informes SET token = $2, compartir_activo = $3, updated_at = now() WHERE id = $1`,
      [id, token, activo]
    )
    res.json({ data: { token, compartir_activo: activo } })
  } catch (err) { next(err) }
}

// GET /api/public/informe/:token  (SIN login) — informe consolidado de SOLO
// LECTURA. Solo funciona si el token existe y compartir_activo = true.
// IMPORTANTE: quita unit_price de cada material (no exponer costos afuera).
export async function getInformePublico(req: Request, res: Response, next: NextFunction) {
  try {
    const token = String(req.params.token || '')
    if (!token) return next(createError('Token requerido', 400))
    const { rows: [inf] } = await pool.query(
      `SELECT id, nombre, seleccion FROM informes WHERE token = $1 AND compartir_activo = true`, [token]
    )
    if (!inf) return next(createError('Informe no disponible', 404))

    const seleccion = (inf.seleccion ?? []) as Array<{ proyecto_id: number; items: string[] }>
    const proyectos: unknown[] = []
    for (const s of seleccion) {
      const { rows: [p] } = await pool.query(`SELECT codigo, nombre FROM proyectos WHERE id = $1`, [s.proyecto_id])
      if (!p) continue
      const readiness = await computeItemsReadiness(s.proyecto_id)
      const notas = await fetchInformeNotas(s.proyecto_id)
      const sel = Array.isArray(s.items) && s.items.length ? new Set(s.items) : null
      const items = (sel ? readiness.items.filter((it: { item: string }) => sel.has(it.item)) : readiness.items)
        .map((it: Record<string, unknown>) => ({
          ...it,
          // Sacar costos: unit_price nunca sale al público.
          materiales: (it.materiales as Array<Record<string, unknown>>).map((m) => {
            const { unit_price, ...rest } = m
            void unit_price
            return rest
          }),
        }))
      proyectos.push({ proyecto_id: s.proyecto_id, codigo: p.codigo, nombre: p.nombre, items, notas })
    }
    res.json({ data: { nombre: inf.nombre, proyectos } })
  } catch (err) { next(err) }
}
