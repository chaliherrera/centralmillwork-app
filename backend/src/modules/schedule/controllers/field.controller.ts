// ─────────────────────────────────────────────────────────────────────────────
// Controller — Field / Install: punch list + sign-off en obra (desde el móvil)
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import pool from '../../../db/pool'
import { createError } from '../../../middleware/errorHandler'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../../../utils/supabase'
import { logger } from '../../../utils/logger'
import { crearPunchItem, resolverPunchItem, listPunch, registrarSignoff, listInstallQueue } from '../domain/field'

// Fotos de punch list / firma — solo imágenes, hasta 15 MB.
export const uploadFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Solo se aceptan imágenes'))
  },
})

function parseProyectoId(req: Request): number {
  const id = parseInt(String(req.params.id), 10)
  if (Number.isNaN(id)) throw createError('id de proyecto inválido', 400)
  return id
}

/** Sube el buffer de una imagen a Supabase bajo path 'punch/'. Devuelve el path o null. */
async function subirFoto(file: Express.Multer.File | undefined): Promise<string | null> {
  if (!file) return null
  if (!supabaseEnabled || !supabase) throw createError('Storage no está configurado en este entorno', 503)
  const ext = (file.originalname.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `punch/${randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype || 'image/jpeg', cacheControl: '3600', upsert: false })
  if (error) {
    logger.error('field: upload Supabase falló', { error: error.message })
    throw createError(`Error subiendo la foto: ${error.message}`, 500)
  }
  return path
}

// GET /api/schedule/install-queue
export async function installQueueHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await listInstallQueue(pool)
    res.json({ data: rows })
  } catch (err) { next(err) }
}

// GET /api/schedule/proyecto/:id/punch
export async function listPunchHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const proyectoId = parseProyectoId(req)
    const items = await listPunch(pool, proyectoId)
    res.json({ data: items })
  } catch (err) { next(err) }
}

// POST /api/schedule/proyecto/:id/punch  (field: 'foto', body: descripcion, area?)
export async function crearPunchHandler(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const proyectoId = parseProyectoId(req)
    const descripcion = typeof req.body?.descripcion === 'string' ? req.body.descripcion.trim().slice(0, 500) : ''
    if (!descripcion) return next(createError('La descripción es obligatoria', 400))
    const area = typeof req.body?.area === 'string' ? req.body.area.slice(0, 60) : null
    const foto = await subirFoto(req.file)

    await client.query('BEGIN')
    const r = await crearPunchItem(client, proyectoId, descripcion, area, foto, (req as any).user?.id ?? null)
    await client.query('COMMIT')
    res.status(201).json({ data: r, message: 'Ítem de punch list agregado' })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
}

// POST /api/schedule/punch/:itemId/resolver  (field: 'foto')
export async function resolverPunchHandler(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const itemId = parseInt(String(req.params.itemId), 10)
    if (Number.isNaN(itemId)) return next(createError('id de ítem inválido', 400))
    const foto = await subirFoto(req.file)

    await client.query('BEGIN')
    const r = await resolverPunchItem(client, itemId, foto, (req as any).user?.id ?? null)
    await client.query('COMMIT')
    if (!r.ok) return next(createError('El ítem no existe o ya estaba resuelto', 400))
    res.json({ data: r, message: 'Ítem resuelto' })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
}

// POST /api/schedule/proyecto/:id/signoff  (field: 'firma', body: cliente?)
export async function signoffHandler(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const proyectoId = parseProyectoId(req)
    const cliente = typeof req.body?.cliente === 'string' ? req.body.cliente.trim().slice(0, 120) : null
    const firma = await subirFoto(req.file)

    await client.query('BEGIN')
    await registrarSignoff(client, proyectoId, cliente, firma)
    await client.query('COMMIT')
    res.status(201).json({ data: { ok: true }, message: 'Sign-off del cliente registrado — proyecto ENTREGADO' })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
}
