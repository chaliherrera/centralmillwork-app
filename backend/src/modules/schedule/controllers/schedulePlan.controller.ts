// ─────────────────────────────────────────────────────────────────────────────
// Controller — Plan de schedule de un proyecto
// ─────────────────────────────────────────────────────────────────────────────
// Endpoints HTTP delgados: parsean input, abren tx si escriben, delegan al
// dominio (modules/schedule/domain/). La lógica vive en domain/.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import pool from '../../../db/pool'
import { createError } from '../../../middleware/errorHandler'
import { generarPlan, recomputeScheduleForProyecto } from '../domain/recompute'

function parseProyectoId(req: Request): number {
  const id = parseInt(String(req.params.id), 10)
  if (Number.isNaN(id)) throw createError('id de proyecto inválido', 400)
  return id
}

// ── GET /api/schedule/proyecto/:id ───────────────────────────────────────────
// Devuelve el plan + hitos (con metadata de la plantilla) para el timeline.
export async function getPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const proyectoId = parseProyectoId(req)

    const { rows: planRows } = await pool.query(
      `SELECT id, plantilla_id, scope,
              to_char(fecha_objetivo,'YYYY-MM-DD')          AS fecha_objetivo,
              to_char(fecha_objetivo_original,'YYYY-MM-DD') AS fecha_objetivo_original,
              semaforo, holgura_dias, to_char(updated_at,'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at
         FROM schedule_planes WHERE proyecto_id = $1 AND scope = 'proyecto' LIMIT 1`, [proyectoId])

    if (!planRows[0]) return res.json({ data: { plan: null, hitos: [] } })

    const { rows: hitos } = await pool.query(
      `SELECT sh.codigo, ph.fase, ph.nombre, ph.tipo, ph.es_gate, ph.es_ancla,
              ph.parent_codigo, ph.rol_responsable, ph.fuente_dato, ph.orden,
              to_char(sh.fecha_planeada,'YYYY-MM-DD')   AS fecha_planeada,
              to_char(sh.fecha_baseline,'YYYY-MM-DD')   AS fecha_baseline,
              to_char(sh.fecha_real,'YYYY-MM-DD')       AS fecha_real,
              to_char(sh.fecha_proyectada,'YYYY-MM-DD') AS fecha_proyectada,
              sh.estado, sh.semaforo, sh.holgura_dias, sh.atribucion_atraso
         FROM schedule_hitos sh
         JOIN schedule_planes sp ON sp.id = sh.plan_id
         JOIN schedule_plantilla_hitos ph
              ON ph.plantilla_id = sp.plantilla_id AND ph.codigo = sh.codigo
        WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto'
        ORDER BY ph.orden`, [proyectoId])

    res.json({ data: { plan: planRows[0], hitos } })
  } catch (err) { next(err) }
}

// ── POST /api/schedule/proyecto/:id/generar ──────────────────────────────────
// Crea el plan del proyecto anclado a fecha_objetivo (entrega). Body: { fecha_objetivo }
const generarSchema = z.object({
  fecha_objetivo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'formato YYYY-MM-DD'),
})
export async function generarPlanHandler(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const proyectoId = parseProyectoId(req)
    const { fecha_objetivo } = generarSchema.parse(req.body)

    await client.query('BEGIN')
    const planId = await generarPlan(client, proyectoId, fecha_objetivo)
    await client.query('COMMIT')

    res.status(201).json({ data: { plan_id: planId } })
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {})
    if (err?.issues) return next(createError('datos inválidos', 400))
    if (typeof err?.message === 'string' && err.message.includes('ya tiene un plan'))
      return next(createError(err.message, 409))
    next(err)
  } finally {
    client.release()
  }
}

// ── POST /api/schedule/proyecto/:id/recalcular ───────────────────────────────
// Fuerza un recálculo manual (útil para pruebas y para el botón "recalcular").
export async function recalcularHandler(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const proyectoId = parseProyectoId(req)
    await client.query('BEGIN')
    const result = await recomputeScheduleForProyecto(client, proyectoId, 'manual')
    await client.query('COMMIT')
    if (result.skipped) return next(createError('el proyecto no tiene plan de schedule', 404))
    res.json({ data: result })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
}
