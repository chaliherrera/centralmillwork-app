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
import { generarPlan, recomputeScheduleForProyecto, cambiarFechaObjetivo } from '../domain/recompute'
import { crearToken, revocarToken } from '../domain/portal'
import { registrarHito } from '../domain/registro'
import { getTrabajoPorArea } from '../domain/trabajo'

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

// ── POST /api/schedule/proyecto/:id/portal-token ─────────────────────────────
// Genera un link de portal para un contacto del cliente. Devuelve el token.
const tokenSchema = z.object({
  contacto_nombre: z.string().trim().max(150).optional(),
  contacto_email: z.string().trim().email().max(200).optional().or(z.literal('')),
})
export async function crearPortalTokenHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const proyectoId = parseProyectoId(req)
    const { contacto_nombre, contacto_email } = tokenSchema.parse(req.body ?? {})
    const userId = (req as any).user?.id ?? null
    const { token } = await crearToken(pool, proyectoId, contacto_nombre ?? null, contacto_email || null, userId)
    res.status(201).json({ data: { token } })
  } catch (err: any) {
    if (err?.issues) return next(createError('datos inválidos', 400))
    next(err)
  }
}

// ── POST /api/schedule/proyecto/:id/fecha-objetivo ───────────────────────────
// Mueve la fecha de entrega comprometida (decisión humana registrada).
const fechaObjetivoSchema = z.object({ fecha_objetivo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
export async function cambiarFechaObjetivoHandler(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const proyectoId = parseProyectoId(req)
    const { fecha_objetivo } = fechaObjetivoSchema.parse(req.body ?? {})
    await client.query('BEGIN')
    const r = await cambiarFechaObjetivo(client, proyectoId, fecha_objetivo, (req as any).user?.nombre ?? null)
    if (!r.ok) { await client.query('ROLLBACK'); return next(createError(r.error ?? 'no se pudo cambiar', 400)) }
    await client.query('COMMIT')
    res.json({ data: { ok: true, anterior: r.anterior }, message: 'Fecha de entrega actualizada' })
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {})
    if (err?.issues) return next(createError('fecha inválida (YYYY-MM-DD)', 400))
    next(err)
  } finally {
    client.release()
  }
}

// ── GET /api/schedule/mi-trabajo?area=engineering ────────────────────────────
// La frontera del área, en todos los proyectos (motor de los escritorios).
const AREAS_VALIDAS = new Set(['engineering', 'estimating', 'pm', 'procurement', 'finance', 'production', 'logistics', 'field'])
export async function trabajoPorAreaHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const area = String(req.query.area ?? '')
    if (!AREAS_VALIDAS.has(area)) return next(createError('area inválida', 400))
    const data = await getTrabajoPorArea(pool, area)
    res.json({ data })
  } catch (err) { next(err) }
}

// ── GET /api/schedule/proyecto/:id/portal-tokens ─────────────────────────────
export async function listPortalTokensHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const proyectoId = parseProyectoId(req)
    const { rows } = await pool.query(
      `SELECT id, token, contacto_nombre, contacto_email, activo,
              to_char(created_at,'YYYY-MM-DD') AS created_at,
              to_char(last_access_at,'YYYY-MM-DD"T"HH24:MI') AS last_access_at
         FROM schedule_portal_tokens WHERE proyecto_id = $1 ORDER BY created_at DESC`, [proyectoId])
    res.json({ data: rows })
  } catch (err) { next(err) }
}

// ── POST /api/schedule/proyecto/:id/portal-token/:tokenId/revocar ────────────
export async function revocarPortalTokenHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const proyectoId = parseProyectoId(req)
    const tokenId = parseInt(String(req.params.tokenId), 10)
    if (Number.isNaN(tokenId)) return next(createError('id de token inválido', 400))
    const ok = await revocarToken(pool, proyectoId, tokenId)
    if (!ok) return next(createError('token no encontrado o ya revocado', 404))
    res.json({ data: { ok: true }, message: 'Link del portal revocado' })
  } catch (err) { next(err) }
}

// ── POST /api/schedule/proyecto/:id/hito/:codigo/registrar ───────────────────
// El responsable registra que un hito ocurrió (evidencia real: fecha + nota).
const registrarSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  nota: z.string().trim().max(500).optional(),
  importe: z.number().nonnegative().optional(),
})
export async function registrarHitoHandler(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const proyectoId = parseProyectoId(req)
    const codigo = String(req.params.codigo)
    const { fecha, nota, importe } = registrarSchema.parse(req.body ?? {})
    const usuarioNombre = (req as any).user?.email ?? null
    await client.query('BEGIN')
    const r = await registrarHito(client, proyectoId, codigo, fecha, nota ?? null, usuarioNombre, importe ?? null)
    await client.query('COMMIT')
    if (!r.ok) return next(createError(r.error ?? 'no se pudo registrar', 400))
    res.json({ data: { ok: true } })
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {})
    if (err?.issues) return next(createError('datos inválidos', 400))
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
