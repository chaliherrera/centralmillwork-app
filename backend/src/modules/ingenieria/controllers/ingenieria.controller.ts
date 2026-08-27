// ─────────────────────────────────────────────────────────────────────────────
// Controller — Plan de Ingeniería
// ─────────────────────────────────────────────────────────────────────────────
import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import pool from '../../../db/pool'
import { createError } from '../../../middleware/errorHandler'
import {
  getResumen, listProyectos, listTareas, getCargaPorIngeniero,
  crearTarea, actualizarTarea, borrarTarea, getPlanProyecto,
} from '../domain/tareas'
import { crearReserva, listReservasPendientes, confirmarReserva, liberarReserva } from '../domain/reservas'

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
// POST /api/ingenieria/reserva/:proyectoId/confirmar  { asignaciones?: [{id, asignado_nombre}] }
export async function confirmarReservaHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const asigns = Array.isArray(req.body?.asignaciones) ? req.body.asignaciones : undefined
    res.json({ data: await confirmarReserva(pool, pid(req), (req as any).user?.id ?? null, asigns) })
  } catch (e) { next(e) }
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

export async function borrarTareaHandler(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(String(req.params.id), 10)
  if (Number.isNaN(id)) return next(createError('id inválido', 400))
  try {
    const ok = await borrarTarea(pool, id)
    if (!ok) return next(createError('tarea no encontrada', 404))
    res.json({ data: { ok: true } })
  } catch (e) { next(e) }
}
