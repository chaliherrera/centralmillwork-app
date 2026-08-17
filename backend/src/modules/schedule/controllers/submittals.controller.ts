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
