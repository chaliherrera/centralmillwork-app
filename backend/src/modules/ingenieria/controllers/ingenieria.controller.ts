// ─────────────────────────────────────────────────────────────────────────────
// Controller — Plan de Ingeniería
// ─────────────────────────────────────────────────────────────────────────────
import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import pool from '../../../db/pool'
import { createError } from '../../../middleware/errorHandler'
import {
  getResumen, listProyectos, listTareas, getCargaPorIngeniero, getTareasDeCelda,
  crearTarea, actualizarTarea, getPlanProyecto,
  borrarTareaConReconexion, agregarDep, borrarDep,
} from '../domain/tareas'
import { crearReserva, listReservasPendientes, liberarReserva } from '../domain/reservas'
import { generarPlanIngenieria } from '../domain/plan_inicial'

function pid(req: Request): number {
  const id = parseInt(String(req.params.id ?? req.params.proyectoId), 10)
  if (Number.isNaN(id)) throw createError('id de proyecto inválido', 400)
  return id
}

// POST /api/ingenieria/proyecto/:id/reservar
export async function reservarHandler(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ data: await crearReserva(pool, pid(req)) }) } catch (e) { next(e) }
}
// GET /api/ingenieria/reservas-pendientes
export async function reservasPendientesHandler(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await listReservasPendientes(pool) }) } catch (e) { next(e) }
}
// POST /api/ingenieria/reserva/:proyectoId/confirmar
// Opción B: el PM confirma → se genera el ESPEJO COMPLETO del plan de ingeniería
// (todas las tareas + dependencias, pre-llenadas del intake), absorbiendo la reserva
// tentativa. El PM poda y asigna en el plan del proyecto.
export async function confirmarReservaHandler(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const r = await generarPlanIngenieria(client, pid(req))
    await client.query('COMMIT')
    if (r.error) return next(createError(r.error, 400))
    res.json({ data: r })
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e) } finally { client.release() }
}
// DELETE /api/ingenieria/proyecto/:id/reserva
export async function liberarReservaHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await liberarReserva(pool, pid(req)) }) } catch (e) { next(e) }
}

export async function resumenHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const [resumen, proyectos] = await Promise.all([getResumen(pool), listProyectos(pool)])
    res.json({ data: { resumen, proyectos } })
  } catch (e) { next(e) }
}

export async function tareasHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const proyecto = typeof req.query.proyecto === 'string' && req.query.proyecto ? req.query.proyecto : undefined
    res.json({ data: await listTareas(pool, proyecto) })
  } catch (e) { next(e) }
}

export async function cargaHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: await getCargaPorIngeniero(pool) })
  } catch (e) { next(e) }
}

// GET /api/ingenieria/carga/detalle?ingeniero=<nombre>&semana=<YYYY-MM-DD (lunes)>
export async function cargaDetalleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const ing = typeof req.query.ingeniero === 'string' ? req.query.ingeniero : ''
    const semana = typeof req.query.semana === 'string' ? req.query.semana : ''
    if (!ing || !/^\d{4}-\d{2}-\d{2}$/.test(semana)) return next(createError('faltan ingeniero/semana', 400))
    res.json({ data: await getTareasDeCelda(pool, ing, semana) })
  } catch (e) { next(e) }
}

// GET /api/ingenieria/plan?proyecto=<proyecto_ext>  → tareas + dependencias + holgura/riesgo
export async function planHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const proyecto = typeof req.query.proyecto === 'string' ? req.query.proyecto : ''
    if (!proyecto) return next(createError('falta el parámetro proyecto', 400))
    res.json({ data: await getPlanProyecto(pool, proyecto) })
  } catch (e) { next(e) }
}

const tareaSchema = z.object({
  proyecto_ext: z.string().max(200).nullish(),
  nombre: z.string().min(1).max(300),
  asignado_nombre: z.string().max(120).nullish(),
  allocation_pct: z.number().min(0).max(20).optional(),
  dur_dias: z.number().min(0).max(365).optional(),
  fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  estado: z.enum(['pendiente', 'en_curso', 'hecha', 'na']).optional(),
  comentario: z.string().max(1000).nullish(),
})

export async function crearTareaHandler(req: Request, res: Response, next: NextFunction) {
  const parsed = tareaSchema.safeParse(req.body)
  if (!parsed.success) return next(createError('Datos inválidos', 400))
  try {
    const r = await crearTarea(pool, parsed.data)
    res.status(201).json({ data: r })
  } catch (e) { next(e) }
}

export async function actualizarTareaHandler(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(String(req.params.id), 10)
  if (Number.isNaN(id)) return next(createError('id inválido', 400))
  const parsed = tareaSchema.partial({ nombre: true }).safeParse(req.body)
  if (!parsed.success) return next(createError('Datos inválidos', 400))
  try {
    const ok = await actualizarTarea(pool, id, parsed.data as any)
    if (!ok) return next(createError('tarea no encontrada', 404))
    res.json({ data: { ok: true } })
  } catch (e) { next(e) }
}

// PATCH /api/ingenieria/tareas/:id/avance — Ingeniería reporta avance de SU tarea.
// Solo toca estado/comentario (ejecución); la estructura del plan es del PM.
const avanceSchema = z.object({
  estado: z.enum(['pendiente', 'en_curso', 'hecha', 'na']).optional(),
  comentario: z.string().max(1000).nullish(),
})
export async function avanceTareaHandler(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(String(req.params.id), 10)
  if (Number.isNaN(id)) return next(createError('id inválido', 400))
  const parsed = avanceSchema.safeParse(req.body)
  if (!parsed.success || (parsed.data.estado === undefined && parsed.data.comentario === undefined))
    return next(createError('Datos inválidos', 400))
  try {
    const ok = await actualizarTarea(pool, id, parsed.data as any)
    if (!ok) return next(createError('tarea no encontrada', 404))
    res.json({ data: { ok: true } })
  } catch (e) { next(e) }
}

export async function borrarTareaHandler(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(String(req.params.id), 10)
  if (Number.isNaN(id)) return next(createError('id inválido', 400))
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const r = await borrarTareaConReconexion(client, id)  // reconecta la cadena antes de borrar
    await client.query('COMMIT')
    if (!r.ok) return next(createError('tarea no encontrada', 404))
    res.json({ data: r })
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e) } finally { client.release() }
}

// ── Dependencias (predecesores) ──
// POST /api/ingenieria/tareas/:id/dep   { depende_de_id, lag_dias?, tipo? }
export async function agregarDepHandler(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(String(req.params.id), 10)
  const dep = parseInt(String(req.body?.depende_de_id), 10)
  if (Number.isNaN(id) || Number.isNaN(dep)) return next(createError('ids inválidos', 400))
  const lag = Number.isFinite(+req.body?.lag_dias) ? Math.trunc(+req.body.lag_dias) : 0
  const tipo = typeof req.body?.tipo === 'string' ? req.body.tipo : 'FS'
  try {
    const r = await agregarDep(pool, id, dep, lag, tipo)
    if (!r.ok) return next(createError(r.error ?? 'no se pudo agregar', 400))
    res.status(201).json({ data: { ok: true } })
  } catch (e) { next(e) }
}
// DELETE /api/ingenieria/tareas/:id/dep/:depId
export async function borrarDepHandler(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(String(req.params.id), 10)
  const dep = parseInt(String(req.params.depId), 10)
  if (Number.isNaN(id) || Number.isNaN(dep)) return next(createError('ids inválidos', 400))
  try {
    await borrarDep(pool, id, dep)
    res.json({ data: { ok: true } })
  } catch (e) { next(e) }
}
