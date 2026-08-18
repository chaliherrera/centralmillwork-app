import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'

// ─── Schemas ─────────────────────────────────────────────────────────────────

const AREAS = ['procurement', 'despachos', 'recepcion', 'administracion', 'shop_manager', 'ingenieria', 'admin'] as const
const PRIORITIES = ['low', 'medium', 'high'] as const
const ESTADOS = ['pendiente', 'en_progreso', 'completada', 'descartada'] as const

// Buzón por rol (Tareas dedicado a Muestras): cada rol ve las áreas de las que
// es responsable. ADMIN ve todo. Un rol sin áreas mapeadas no ve nada.
const ROLE_AREAS: Record<string, string[]> = {
  PROCUREMENT: ['procurement', 'recepcion'],
  SHOP_MANAGER: ['shop_manager'],
  ENGINEERING: ['ingenieria'],
  PROJECT_MANAGEMENT: ['administracion', 'admin'],
}
/** Áreas que puede ver el usuario, o null si ve todo (ADMIN). */
function areasForUser(req: Request): string[] | null {
  const rol = (req as any).user?.rol
  if (rol === 'ADMIN') return null
  return ROLE_AREAS[rol] ?? []
}

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

    // Scoping por rol: los no-ADMIN solo ven las áreas de las que son dueños.
    const areas = areasForUser(req)
    if (areas !== null) {
      vals.push(areas)
      conds.push(`area = ANY($${vals.length}::text[])`)
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

    // Scoping por rol: un no-ADMIN solo puede tocar tareas de sus áreas.
    const areas = areasForUser(req)
    if (areas !== null) {
      const { rows } = await pool.query('SELECT area FROM tareas WHERE id = $1::int', [id])
      if (!rows[0]) return next(createError('Tarea no encontrada', 404))
      if (!areas.includes(rows[0].area)) return next(createError('Tarea no encontrada', 404))
    }
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
      // Cierre por user (completada/descartada) → setear closed_by_user_at = NOW()
      // para que el job de sistema NO reactive esta tarea aunque la condición siga activa.
      // Reapertura (pendiente/en_progreso) → limpiar ambos timestamps, vuelve a comportamiento normal.
      if (body.estado === 'completada') {
        updates.push('completed_at = NOW()')
        updates.push('closed_by_user_at = NOW()')
      } else if (body.estado === 'descartada') {
        // completed_at queda como estaba (descartada no implica completada)
        updates.push('closed_by_user_at = NOW()')
      } else {
        // pendiente / en_progreso → user la reabrió → limpiar ambos
        updates.push('completed_at = NULL')
        updates.push('closed_by_user_at = NULL')
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

export async function getTareasStats(req: Request, res: Response, next: NextFunction) {
  try {
    // Scoping por rol: un no-ADMIN ve stats solo de sus áreas.
    const areas = areasForUser(req)
    const areaVals: any[] = areas !== null ? [areas] : []
    const areaWhere = areas !== null ? `area = ANY($1::text[])` : ''
    const withArea = (extra: string) => {
      const parts = [areaWhere, extra].filter(Boolean)
      return parts.length ? `WHERE ${parts.join(' AND ')}` : ''
    }
    const [byArea, byEstado, byPriority, totals] = await Promise.all([
      pool.query(
        `SELECT area, COUNT(*)::int AS n
         FROM tareas
         ${withArea(`estado IN ('pendiente', 'en_progreso')`)}
         GROUP BY area`, areaVals,
      ),
      pool.query(
        `SELECT estado, COUNT(*)::int AS n FROM tareas ${withArea('')} GROUP BY estado`, areaVals,
      ),
      pool.query(
        `SELECT priority, COUNT(*)::int AS n
         FROM tareas
         ${withArea(`estado IN ('pendiente', 'en_progreso')`)}
         GROUP BY priority`, areaVals,
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE estado IN ('pendiente', 'en_progreso'))::int AS activas,
           COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE)::int AS hoy,
           COUNT(*) FILTER (WHERE estado = 'completada' AND DATE(completed_at) = CURRENT_DATE)::int AS completadas_hoy
         FROM tareas ${withArea('')}`, areaVals,
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
    // Scoping por rol: un no-ADMIN no puede leer tareas de otras áreas.
    const areas = areasForUser(req)
    if (areas !== null && !areas.includes(rows[0].area)) return next(createError('Tarea no encontrada', 404))
    res.json({ data: rows[0] })
  } catch (err) {
    next(err)
  }
}

