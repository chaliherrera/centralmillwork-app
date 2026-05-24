import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'

// ─── Schemas ─────────────────────────────────────────────────────────────────

const AREAS = ['procurement', 'despachos', 'recepcion', 'administracion'] as const
const PRIORITIES = ['low', 'medium', 'high'] as const
const ESTADOS = ['pendiente', 'en_progreso', 'completada', 'descartada'] as const

export const updateTareaSchema = z.object({
  area:        z.enum(AREAS).optional(),
  title:       z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  priority:    z.enum(PRIORITIES).optional(),
  estado:      z.enum(ESTADOS).optional(),
  asignado_a:  z.string().max(200).nullable().optional(),
})

// ─── GET /api/tareas ─────────────────────────────────────────────────────────
// Filtros: area, priority, estado (multi), search (title/description), project_code
// Sin paginación tradicional — devuelve todo + lo ordena por priority (high>med>low) y created_at desc.

export async function getTareas(req: Request, res: Response, next: NextFunction) {
  try {
    const conds: string[] = []
    const vals: any[] = []

    const area = req.query.area as string | undefined
    if (area && (AREAS as readonly string[]).includes(area)) {
      vals.push(area)
      conds.push(`area = $${vals.length}`)
    }

    const priority = req.query.priority as string | undefined
    if (priority && (PRIORITIES as readonly string[]).includes(priority)) {
      vals.push(priority)
      conds.push(`priority = $${vals.length}`)
    }

    // estado puede venir como CSV: ?estado=pendiente,en_progreso
    const estadoParam = req.query.estado as string | undefined
    if (estadoParam) {
      const estados = estadoParam.split(',').filter((e) => (ESTADOS as readonly string[]).includes(e))
      if (estados.length) {
        vals.push(estados)
        conds.push(`estado = ANY($${vals.length}::text[])`)
      }
    }

    const search = (req.query.search as string | undefined)?.trim()
    if (search) {
      vals.push(`%${search}%`)
      conds.push(`(title ILIKE $${vals.length} OR description ILIKE $${vals.length} OR subject ILIKE $${vals.length})`)
    }

    // project_code = filtra por código XX-XXX detectado en subject
    const projectCode = (req.query.project_code as string | undefined)?.trim()
    if (projectCode && /^\d{2}-\d{3}$/.test(projectCode)) {
      vals.push(`%${projectCode}%`)
      conds.push(`subject ILIKE $${vals.length}`)
    }

    const whereClause = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

    // Orden: estados activos primero (pendiente, en_progreso), luego prioridad, luego fecha
    const { rows } = await pool.query(
      `SELECT id, area, title, description, priority, from_email, subject,
              source_email_id, estado, asignado_a, created_at, completed_at
       FROM tareas
       ${whereClause}
       ORDER BY
         CASE estado
           WHEN 'pendiente' THEN 1
           WHEN 'en_progreso' THEN 2
           WHEN 'completada' THEN 3
           WHEN 'descartada' THEN 4
         END,
         CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
         created_at DESC`,
      vals,
    )

    res.json({ data: rows })
  } catch (err) {
    next(err)
  }
}

// ─── PATCH /api/tareas/:id ──────────────────────────────────────────────────
// Update parcial. Setea completed_at = NOW() automáticamente cuando pasa a 'completada'.

export async function updateTarea(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id
    const body = req.body as z.infer<typeof updateTareaSchema>
    const updates: string[] = []
    const vals: any[] = []

    const addField = (col: string, value: any) => {
      vals.push(value)
      updates.push(`${col} = $${vals.length}`)
    }

    if (body.area !== undefined) addField('area', body.area)
    if (body.title !== undefined) addField('title', body.title)
    if (body.description !== undefined) addField('description', body.description)
    if (body.priority !== undefined) addField('priority', body.priority)
    if (body.asignado_a !== undefined) addField('asignado_a', body.asignado_a)

    if (body.estado !== undefined) {
      addField('estado', body.estado)
      // Cuando pasa a completada, setear completed_at = NOW(). Cuando deja de estarlo, limpiar.
      if (body.estado === 'completada') {
        updates.push('completed_at = NOW()')
      } else {
        updates.push('completed_at = NULL')
      }
    }

    if (!updates.length) return next(createError('Sin campos para actualizar', 400))

    vals.push(id)
    const { rows } = await pool.query(
      `UPDATE tareas SET ${updates.join(', ')} WHERE id = $${vals.length}::int RETURNING *`,
      vals,
    )

    if (!rows[0]) return next(createError('Tarea no encontrada', 404))
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
}

// ─── GET /api/tareas/stats ──────────────────────────────────────────────────
// Devuelve: counts por area, por estado, por priority. Para el KPI strip.

export async function getTareasStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const [byArea, byEstado, byPriority, totals] = await Promise.all([
      pool.query(
        `SELECT area, COUNT(*)::int AS n
         FROM tareas
         WHERE estado IN ('pendiente', 'en_progreso')
         GROUP BY area`,
      ),
      pool.query(
        `SELECT estado, COUNT(*)::int AS n FROM tareas GROUP BY estado`,
      ),
      pool.query(
        `SELECT priority, COUNT(*)::int AS n
         FROM tareas
         WHERE estado IN ('pendiente', 'en_progreso')
         GROUP BY priority`,
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE estado IN ('pendiente', 'en_progreso'))::int AS activas,
           COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE)::int AS hoy,
           COUNT(*) FILTER (WHERE estado = 'completada' AND DATE(completed_at) = CURRENT_DATE)::int AS completadas_hoy
         FROM tareas`,
      ),
    ])

    const toMap = (rows: any[], key: string) =>
      rows.reduce((acc, r) => ({ ...acc, [r[key]]: r.n }), {} as Record<string, number>)

    res.json({
      data: {
        totals: totals.rows[0],
        by_area: toMap(byArea.rows, 'area'),
        by_estado: toMap(byEstado.rows, 'estado'),
        by_priority: toMap(byPriority.rows, 'priority'),
      },
    })
  } catch (err) {
    next(err)
  }
}

// ─── GET /api/tareas/:id ─────────────────────────────────────────────────────

export async function getTarea(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query('SELECT * FROM tareas WHERE id = $1', [req.params.id])
    if (!rows[0]) return next(createError('Tarea no encontrada', 404))
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
}
