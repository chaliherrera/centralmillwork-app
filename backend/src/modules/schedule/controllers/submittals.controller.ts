// ─────────────────────────────────────────────────────────────────────────────
// Controller — Submittals de planos (Ingeniería). Subida multipart de PDF.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import pool from '../../../db/pool'
import { createError } from '../../../middleware/errorHandler'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../../../utils/supabase'
import { logger } from '../../../utils/logger'
import { crearSubmittal, listSubmittals } from '../domain/submittals'
import { subirArchivoHito, listArchivosHito } from '../domain/archivos'

// Multer en memoria — solo PDF, hasta 25 MB.
export const uploadSubmittal = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(new Error('Solo se aceptan archivos PDF'))
  },
})

function parseProyectoId(req: Request): number {
  const id = parseInt(String(req.params.id), 10)
  if (Number.isNaN(id)) throw createError('id de proyecto inválido', 400)
  return id
}

// POST /api/schedule/proyecto/:id/submittals  (field: 'planos')
export async function uploadSubmittalHandler(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const proyectoId = parseProyectoId(req)
    if (!req.file) return next(createError('No se recibió el archivo (field: planos)', 400))
    if (!supabaseEnabled || !supabase)
      return next(createError('Storage no está configurado en este entorno', 503))

    const uniqueName = `submittals/${randomUUID()}.pdf`
    const { error: upErr } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(uniqueName, req.file.buffer, { contentType: 'application/pdf', cacheControl: '3600', upsert: false })
    if (upErr) {
      logger.error('submittal: upload Supabase falló', { error: upErr.message })
      return next(createError(`Error subiendo el submittal: ${upErr.message}`, 500))
    }

    await client.query('BEGIN')
    const r = await crearSubmittal(client, proyectoId,
      { filename: uniqueName, original_name: req.file.originalname, size: req.file.size },
      (req as any).user?.id ?? null)
    if (!r.ok) { await client.query('ROLLBACK'); return next(createError(r.error, 400)) }
    await client.query('COMMIT')

    res.status(201).json({ data: r, message: `Submittal ${r.version_label} emitido` })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
}

// GET /api/schedule/proyecto/:id/submittals
export async function listSubmittalsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const proyectoId = parseProyectoId(req)
    const rows = await listSubmittals(pool, proyectoId)
    res.json({ data: rows })
  } catch (err) { next(err) }
}

// Archivos por hito (ej. CNC de E-11) — acepta cualquier tipo, hasta 50 MB.
export const uploadArchivo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

// POST /api/schedule/proyecto/:id/hito/:codigo/archivo  (field: 'archivo')
export async function uploadArchivoHitoHandler(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const proyectoId = parseProyectoId(req)
    const codigo = String(req.params.codigo)
    if (!req.file) return next(createError('No se recibió el archivo (field: archivo)', 400))
    if (!supabaseEnabled || !supabase)
      return next(createError('Storage no está configurado en este entorno', 503))

    const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
    const uniqueName = `hito-archivos/${randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(uniqueName, req.file.buffer, { contentType: req.file.mimetype || 'application/octet-stream', cacheControl: '3600', upsert: false })
    if (upErr) return next(createError(`Error subiendo el archivo: ${upErr.message}`, 500))

    const nota = typeof req.body?.nota === 'string' ? req.body.nota.slice(0, 300) : null
    await client.query('BEGIN')
    const r = await subirArchivoHito(client, proyectoId, codigo,
      { filename: uniqueName, original_name: req.file.originalname, size: req.file.size },
      (req as any).user?.id ?? null, nota)
    await client.query('COMMIT')
    if (!r.ok) return next(createError(r.error ?? 'no se pudo adjuntar', 400))
    res.status(201).json({ data: { id: r.id }, message: 'Archivo adjuntado' })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
}

// GET /api/schedule/proyecto/:id/hito/:codigo/archivos
export async function listArchivosHitoHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const proyectoId = parseProyectoId(req)
    const rows = await listArchivosHito(pool, proyectoId, String(req.params.codigo))
    res.json({ data: rows })
  } catch (err) { next(err) }
}

// POST /api/schedule/tarea/:tareaId/plano-campo  (field: 'plano')
// Etapa 1 del handoff de Field Measurements: el ingeniero adjunta el PLANO de campo y
// HACE EL HANDOFF (la tarea pasa a en_curso → Campo). A diferencia de /hito/:codigo/archivo,
// esto NO cierra E-03 (solo guarda el plano para que Campo lo vea); cerrar es de Campo (Medida).
export async function uploadPlanoCampoHandler(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const tareaId = parseInt(String(req.params.tareaId), 10)
    if (Number.isNaN(tareaId)) return next(createError('id de tarea inválido', 400))
    if (!req.file) return next(createError('No se recibió el archivo (field: plano)', 400))
    if (!supabaseEnabled || !supabase)
      return next(createError('Storage no está configurado en este entorno', 503))

    const { rows: tr } = await client.query<{ proyecto_id: number | null; proyecto_ext: string | null; clave: string; estado: string }>(
      `SELECT t.proyecto_id, t.proyecto_ext, tt.clave, t.estado
         FROM ing_tareas t JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id WHERE t.id = $1`, [tareaId])
    const tarea = tr[0]
    if (!tarea) return next(createError('tarea no encontrada', 404))
    if (tarea.clave !== 'field_measurements') return next(createError('esta acción es solo para Field Measurements', 400))
    if (!tarea.proyecto_id) return next(createError('la tarea no está ligada a un proyecto con schedule', 400))

    const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
    const uniqueName = `hito-archivos/${randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(uniqueName, req.file.buffer, { contentType: req.file.mimetype || 'application/octet-stream', cacheControl: '3600', upsert: false })
    if (upErr) return next(createError(`Error subiendo el archivo: ${upErr.message}`, 500))

    await client.query('BEGIN')
    // Guardar el plano (visible para Campo vía listArchivosHito('E-03')) SIN cerrar el hito.
    const ins = await client.query<{ id: number }>(
      `INSERT INTO schedule_hito_archivos (proyecto_id, hito_codigo, filename, original_name, size_bytes, subido_por)
         VALUES ($1,'E-03',$2,$3,$4,$5) RETURNING id`,
      [tarea.proyecto_id, uniqueName, req.file.originalname, req.file.size, (req as any).user?.id ?? null])
    // Handoff: la tarea pasa a en_curso → sale de Ingeniería, entra a Campo.
    await client.query(`UPDATE ing_tareas SET estado = 'en_curso', updated_at = NOW() WHERE id = $1`, [tareaId])
    await client.query('COMMIT')

    if (tarea.proyecto_ext) {
      try {
        const { recomputarYGuardar } = await import('../../ingenieria/domain/tareas')
        await recomputarYGuardar(pool, tarea.proyecto_ext)
      } catch (e) { logger.warn('recompute tras plano-campo falló', { tareaId, err: String(e) }) }
    }
    res.status(201).json({ data: { id: ins.rows[0].id }, message: 'Plano enviado a Campo' })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
}
