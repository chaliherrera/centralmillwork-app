import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import { normalizeNotaScope } from '../utils/informeNotas'

// ─────────────────────────────────────────────────────────────────────────────
// Notas del INFORME de materiales por ítem (tabla informe_notas, migr. 113).
// SEPARADAS de materiales_mto.notas: anotar acá NO toca el material en la app.
// Lectura: cualquier usuario que vea el proyecto. Escritura: ADMIN (ruta).
// ─────────────────────────────────────────────────────────────────────────────

const SELECT_COLS =
  `id, item, material_id, texto,
   to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS updated_at`

// GET /api/proyectos/:id/informe-notas → todas las notas del proyecto
export async function getInformeNotas(req: Request, res: Response, next: NextFunction) {
  try {
    const proyecto_id = parseInt(String(req.params.id))
    if (!proyecto_id) return next(createError('id inválido', 400))
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLS} FROM informe_notas WHERE proyecto_id = $1
        ORDER BY item NULLS FIRST, material_id NULLS FIRST`,
      [proyecto_id]
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
}

// PUT /api/proyectos/:id/informe-notas → upsert (texto con contenido) o
// delete (texto vacío) de la nota de un alcance. ADMIN.
// Body: { item?: string|null, material_id?: number|null, texto: string }
export async function upsertInformeNota(req: Request, res: Response, next: NextFunction) {
  try {
    const proyecto_id = parseInt(String(req.params.id))
    if (!proyecto_id) return next(createError('id inválido', 400))

    let scope
    try { scope = normalizeNotaScope(req.body ?? {}) }
    catch (e) { return next(createError((e as Error).message, 400)) }

    const texto = typeof req.body?.texto === 'string' ? req.body.texto.trim() : ''
    const userId = req.user?.id ?? null

    // Texto vacío = borrar la nota de ese alcance (si existe).
    if (!texto) {
      await pool.query(
        `DELETE FROM informe_notas
          WHERE proyecto_id = $1
            AND COALESCE(item, '') = COALESCE($2, '')
            AND COALESCE(material_id, 0) = COALESCE($3, 0)`,
        [proyecto_id, scope.item, scope.material_id]
      )
      return res.json({ data: null, deleted: true })
    }

    // Upsert manual (una nota por alcance; sin carrera: solo ADMIN edita).
    const existing = await pool.query(
      `SELECT id FROM informe_notas
        WHERE proyecto_id = $1
          AND COALESCE(item, '') = COALESCE($2, '')
          AND COALESCE(material_id, 0) = COALESCE($3, 0)`,
      [proyecto_id, scope.item, scope.material_id]
    )

    if (existing.rows.length) {
      const { rows } = await pool.query(
        `UPDATE informe_notas
            SET texto = $2, updated_by = $3, updated_at = now()
          WHERE id = $1
        RETURNING ${SELECT_COLS}`,
        [existing.rows[0].id, texto, userId]
      )
      return res.json({ data: rows[0] })
    }

    const { rows } = await pool.query(
      `INSERT INTO informe_notas (proyecto_id, item, material_id, texto, updated_by)
         VALUES ($1, $2, $3, $4, $5)
       RETURNING ${SELECT_COLS}`,
      [proyecto_id, scope.item, scope.material_id, texto, userId]
    )
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
}
