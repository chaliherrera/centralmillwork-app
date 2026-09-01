// ─────────────────────────────────────────────────────────────────────────────
// Controller — Plan de Ingeniería
// ─────────────────────────────────────────────────────────────────────────────
import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import pool from '../../../db/pool'
import { createError } from '../../../middleware/errorHandler'
import {
  getResumen, listProyectos, listTareas, getCargaPorIngeniero, getTareasDeCelda,
  getCargaPorEtapa, getProyectosDeEtapa,
  crearTarea, actualizarTarea, reportarAvance, getPlanProyecto,
  borrarTareaConReconexion, agregarDep, borrarDep, listReprogramaciones, recomputarYGuardar,
} from '../domain/tareas'
import { listReservasPendientes, liberarReserva } from '../domain/reservas'
import {
  generarPlanIngenieria, aceptarPlanPM,
  enviarAClienteDeal, registrarAprobacionCliente, activarProyecto, listDealsEnCurso,
} from '../domain/plan_inicial'
import { estadoDeposito, overrideGate, listDepositosBloqueando } from '../domain/deposito'
import { listMuestrasPorProyecto } from '../domain/muestras'

function pid(req: Request): number {
  const id = parseInt(String(req.params.id ?? req.params.proyectoId), 10)
  if (Number.isNaN(id)) throw createError('id de proyecto inválido', 400)
  return id
}

// POST /api/ingenieria/proyecto/:id/reservar
// Estimados envía al PM → se genera el plan SUGERIDO completo (origen='sugerencia',
// no bloquea capacidad dura) y el deal pasa a 'esperando_pm'.
export async function reservarHandler(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const id = pid(req)
    await client.query('BEGIN')
    const r = await generarPlanIngenieria(client, id, { origen: 'sugerencia' })
    if (!r.error) await client.query(`UPDATE proyectos SET deal_estado = 'esperando_pm' WHERE id = $1`, [id])
    await client.query('COMMIT')
    if (r.error) return next(createError(r.error, 400))
    res.status(201).json({ data: r })
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e) } finally { client.release() }
}
// GET /api/ingenieria/reservas-pendientes
export async function reservasPendientesHandler(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await listReservasPendientes(pool) }) } catch (e) { next(e) }
}
// POST /api/ingenieria/reserva/:proyectoId/confirmar
// El PM ACEPTA el plan sugerido → se endurece (origen 'sugerencia' → 'app'), preservando
// las ediciones del PM (podar/asignar/mover). El deal pasa a 'plan_propuesto'.
export async function confirmarReservaHandler(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const r = await aceptarPlanPM(client, pid(req))
    await client.query('COMMIT')
    if (r.error) return next(createError(r.error, 400))
    res.json({ data: r })
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e) } finally { client.release() }
}
// DELETE /api/ingenieria/proyecto/:id/reserva
export async function liberarReservaHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await liberarReserva(pool, pid(req)) }) } catch (e) { next(e) }
}

// ── Handoff Estimados → Cliente → PM ─────────────────────────────────────────
// GET /api/ingenieria/deals — deals en curso (tracker de Estimados + activar del PM)
export async function dealsEnCursoHandler(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await listDealsEnCurso(pool) }) } catch (e) { next(e) }
}
// POST /api/ingenieria/proyecto/:id/enviar-cliente — Estimados manda el schedule al cliente
export async function enviarClienteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await enviarAClienteDeal(pool, pid(req))
    if (!r.ok) return next(createError(r.error ?? 'no se pudo enviar', 400))
    res.json({ data: r })
  } catch (e) { next(e) }
}
// POST /api/ingenieria/proyecto/:id/cliente-aprobo — Estimados registra la aprobación del cliente
export async function clienteAproboHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await registrarAprobacionCliente(pool, pid(req))
    if (!r.ok) return next(createError(r.error ?? 'no se pudo registrar', 400))
    res.json({ data: r })
  } catch (e) { next(e) }
}
// POST /api/ingenieria/proyecto/:id/activar — el PM activa el proyecto (prospecto → activo)
export async function activarProyectoHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await activarProyecto(pool, pid(req))
    if (!r.ok) return next(createError(r.error ?? 'no se pudo activar', 400))
    res.json({ data: r })
  } catch (e) { next(e) }
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

// GET /api/ingenieria/carga-etapas — mapa de calor de etapas del portafolio
// ?sugerencia=<proyecto_ext> superpone la huella del plan sugerido de ese proyecto.
export async function cargaEtapasHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const sug = typeof req.query.sugerencia === 'string' && req.query.sugerencia ? req.query.sugerencia : undefined
    res.json({ data: await getCargaPorEtapa(pool, { sugerenciaExt: sug }) })
  } catch (e) { next(e) }
}
// GET /api/ingenieria/carga-etapas/detalle?etapa=<clave>&semana=<YYYY-MM-DD>
export async function etapaDetalleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const etapa = typeof req.query.etapa === 'string' ? req.query.etapa : ''
    const semana = typeof req.query.semana === 'string' ? req.query.semana : ''
    if (!etapa || !/^\d{4}-\d{2}-\d{2}$/.test(semana)) return next(createError('faltan etapa/semana', 400))
    res.json({ data: await getProyectosDeEtapa(pool, etapa, semana) })
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
// Ejecución: estado/comentario + fechas de compromiso y cumplimiento (patrón
// "comprometida + cumplida", ej. field measurements). La estructura del plan es del PM.
const fechaOpt = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish()
const avanceSchema = z.object({
  estado: z.enum(['pendiente', 'en_curso', 'hecha', 'na']).optional(),
  comentario: z.string().max(1000).nullish(),
  fecha_compromiso: fechaOpt,
  fecha_fin_real: fechaOpt,
  reprogramacion_pedida: z.boolean().optional(),
  reprogramacion_motivo: z.string().max(500).nullish(),
  decision: z.enum(['aprobado', 'rechazado', 'con_comentarios']).nullish(),
  envio_metodo: z.enum(['correo', 'portal', 'ambos']).nullish(),
})
export async function avanceTareaHandler(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(String(req.params.id), 10)
  if (Number.isNaN(id)) return next(createError('id inválido', 400))
  const parsed = avanceSchema.safeParse(req.body)
  if (!parsed.success || Object.keys(parsed.data).length === 0)
    return next(createError('Datos inválidos', 400))
  try {
    const ok = await reportarAvance(pool, id, parsed.data)
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

// ── Pedidos de reprogramación (bandeja del PM) ──
// GET /api/ingenieria/reprogramaciones
export async function reprogramacionesHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listReprogramaciones(pool)
    res.json({ data })
  } catch (e) { next(e) }
}

// ── Estado de muestras por proyecto (escritorio del ingeniero, paso #6) ──
// GET /api/ingenieria/muestras-estado
export async function muestrasEstadoHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listMuestrasPorProyecto(pool)
    res.json({ data })
  } catch (e) { next(e) }
}

// ── Depósitos que bloquean compras (bandeja del PM) ──
// GET /api/ingenieria/depositos-bloqueando
export async function depositosBloqueandoHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listDepositosBloqueando(pool)
    res.json({ data })
  } catch (e) { next(e) }
}

// ── Gate del depósito ──
// POST /api/ingenieria/proyecto/:ext/deposito   { abrir: boolean }
// El PM abre/cierra el gate a mano (candado). La confirmación de Finanzas se LEE aparte.
const depositoSchema = z.object({ abrir: z.boolean() })
export async function overrideDepositoHandler(req: Request, res: Response, next: NextFunction) {
  const proyectoExt = String(req.params.ext ?? '')
  if (!proyectoExt) return next(createError('proyecto inválido', 400))
  let abrir: boolean
  try { ({ abrir } = depositoSchema.parse(req.body ?? {})) }
  catch { return next(createError('datos inválidos', 400)) }
  const usuarioId = req.user?.id ?? null
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await overrideGate(client, proyectoExt, 'material_deposit', abrir, usuarioId)
    await recomputarYGuardar(client, proyectoExt)   // el candado mueve el schedule → sync fechas guardadas
    const estado = await estadoDeposito(client, proyectoExt)
    await client.query('COMMIT')
    res.json({ data: estado, message: abrir ? 'Gate del depósito abierto' : 'Gate del depósito cerrado' })
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e) } finally { client.release() }
}
