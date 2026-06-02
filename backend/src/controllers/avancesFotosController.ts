import { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../utils/supabase'
import { logger } from '../utils/logger'

// ─────────────────────────────────────────────────────────────────────────────
// Fotos de avance del kiosko
//
// El operario, antes de "Completar proceso", sube una foto desde el iPad como
// evidencia. Mismo patrón de storage que imagenesController + qcController:
// memoria si Supabase está activo, disco si no.
//
// Bucket: reutilizamos SUPABASE_BUCKET_PRODUCCION (el de QC). Si no está
// seteado, cae al bucket genérico. Prefijo: orden-{id}/avance-{ts}-{rand}.{ext}
// ─────────────────────────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, '../../uploads')
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const AVANCE_BUCKET = process.env.SUPABASE_BUCKET_PRODUCCION || SUPABASE_BUCKET

const storage = supabaseEnabled
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname)
        cb(null, `avance-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
      },
    })

// Defense-in-depth: extensión + mimetype. Solo imágenes (no PDFs porque
// el caso de uso es foto tomada con la cámara del iPad).
const ALLOWED_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/heic', 'image/heif',
])
const ALLOWED_EXT_RE = /\.(jpe?g|png|webp|heic|heif)$/i

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const extOk  = ALLOWED_EXT_RE.test(file.originalname)
  const mimeOk = ALLOWED_MIMES.has((file.mimetype ?? '').toLowerCase())
  if (extOk && mimeOk) return cb(null, true)
  cb(Object.assign(
    new Error(`Solo imágenes (jpg/png/webp/heic). Recibido: name="${file.originalname}" mime="${file.mimetype}"`),
    { statusCode: 400 }
  ))
}

export const uploadAvanceFoto = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },  // 10 MB
})

// ─────────────────────────────────────────────────────────────────────────────
// Helper: enriquece rows con URL pública de Supabase si está activo y la URL
// guardada en DB está vacía o desactualizada.
// ─────────────────────────────────────────────────────────────────────────────
function enrichWithUrls(rows: any[]) {
  if (!supabaseEnabled || !supabase) return rows
  const sb = supabase
  for (const r of rows) {
    if (!r.url || r.url.startsWith('/uploads/')) {
      const { data } = sb.storage.from(AVANCE_BUCKET).getPublicUrl(r.filename)
      r.url = data.publicUrl
    }
  }
  return rows
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kiosk/ordenes/:id/avance-foto
// El operario sube una foto desde el kiosko.
//
// Reglas:
//   - El operario debe estar asignado a algún proceso de esta orden
//     (defensa básica para evitar que cualquier operario suba a cualquier orden)
//   - Se asocia automáticamente con:
//       * estacion       = la estación actual de la orden
//       * proceso_id     = el orden_proceso del operario en esa estación (si existe)
//       * personal_id    = el operario logueado
//   - Body multipart: campo `archivo` (la imagen), opcional `comentario`
// ─────────────────────────────────────────────────────────────────────────────
export async function uploadAvanceFotoKiosk(req: Request, res: Response, next: NextFunction) {
  try {
    const ordenId = parseInt(String(req.params.id))
    if (Number.isNaN(ordenId)) return next(createError('id inválido', 400))
    if (!req.file) return next(createError('No se recibió ningún archivo', 400))

    const personalId = req.kioskUser!.personal_id

    // Validar que la orden existe + traer la estación actual
    const { rows: [orden] } = await pool.query(
      `SELECT id, estacion_actual FROM ordenes_produccion WHERE id = $1`,
      [ordenId]
    )
    if (!orden) return next(createError('Orden no encontrada', 404))

    // Buscar el proceso del operario en la estación actual.
    // Si no hay match exacto, buscamos cualquier proceso del operario en esta orden
    // (puede ser ayudante en un proceso colateral).
    let { rows: [proceso] } = await pool.query(
      `SELECT id, estacion FROM orden_procesos
       WHERE orden_id = $1 AND operador_id = $2 AND estacion = $3`,
      [ordenId, personalId, orden.estacion_actual]
    )
    if (!proceso) {
      const fallback = await pool.query(
        `SELECT id, estacion FROM orden_procesos
         WHERE orden_id = $1 AND operador_id = $2
         ORDER BY (completado = false) DESC, id
         LIMIT 1`,
        [ordenId, personalId]
      )
      proceso = fallback.rows[0]
    }
    if (!proceso) {
      return next(createError('No estás asignado a esta orden', 403))
    }

    const estacionSnapshot = proceso.estacion || orden.estacion_actual
    const comentario = req.body?.comentario?.toString().trim() || null

    // Upload al storage
    let filename: string
    let url: string | null = null

    if (supabaseEnabled && supabase) {
      const ext = path.extname(req.file.originalname)
      filename = `orden-${ordenId}/avance-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
      const { error } = await supabase.storage
        .from(AVANCE_BUCKET)
        .upload(filename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        })
      if (error) {
        logger.error('uploadAvanceFoto Supabase error', { requestId: req.id, ordenId, err: error })
        return next(createError('Error subiendo a Supabase: ' + error.message, 500))
      }
      const { data } = supabase.storage.from(AVANCE_BUCKET).getPublicUrl(filename)
      url = data.publicUrl
    } else {
      filename = req.file.filename
      url = `/uploads/${filename}`
    }

    // Insert row
    const { rows: [foto] } = await pool.query(
      `INSERT INTO orden_avance_fotos
         (orden_id, proceso_id, estacion, personal_id, usuario_id,
          filename, original_name, mime_type, size_bytes, url, comentario)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        ordenId, proceso.id, estacionSnapshot, personalId, null,
        filename, req.file.originalname, req.file.mimetype, req.file.size, url, comentario,
      ]
    )

    logger.info('avance foto subida (kiosko)', {
      requestId: req.id,
      ordenId, fotoId: foto.id, personalId,
      estacion: estacionSnapshot, tamano_kb: Math.round(req.file.size / 1024),
    })

    res.status(201).json({ data: foto, message: 'Foto guardada' })
  } catch (err) { next(err) }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/kiosk/ordenes/:id/avance-fotos
// El operario ve las fotos previas de esta orden (read-only).
// ─────────────────────────────────────────────────────────────────────────────
export async function listAvanceFotosKiosk(req: Request, res: Response, next: NextFunction) {
  try {
    const ordenId = parseInt(String(req.params.id))
    if (Number.isNaN(ordenId)) return next(createError('id inválido', 400))

    const { rows } = await pool.query(
      `SELECT f.id, f.orden_id, f.proceso_id, f.estacion, f.personal_id,
              f.filename, f.original_name, f.mime_type, f.size_bytes, f.url,
              f.comentario, f.visible_cliente, f.created_at,
              p.nombre_completo AS personal_nombre, p.iniciales AS personal_iniciales
       FROM orden_avance_fotos f
       LEFT JOIN personal_taller p ON p.id = f.personal_id
       WHERE f.orden_id = $1
       ORDER BY f.created_at DESC`,
      [ordenId]
    )
    res.json({ data: enrichWithUrls(rows) })
  } catch (err) { next(err) }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/produccion/ordenes/:id/avance-fotos
// Vista desde sistema (admin/eng). Mismas fotos + datos del operario.
// ─────────────────────────────────────────────────────────────────────────────
export async function listAvanceFotosAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const ordenId = parseInt(String(req.params.id))
    if (Number.isNaN(ordenId)) return next(createError('id inválido', 400))

    const conds: string[] = ['f.orden_id = $1']
    const vals: unknown[] = [ordenId]

    if (req.query.estacion) {
      conds.push(`f.estacion = $${vals.length + 1}`)
      vals.push(String(req.query.estacion))
    }
    if (req.query.visible_cliente === 'true') {
      conds.push('f.visible_cliente = true')
    }

    const { rows } = await pool.query(
      `SELECT f.*,
              p.nombre_completo AS personal_nombre,
              p.iniciales       AS personal_iniciales,
              u.nombre          AS usuario_nombre
       FROM orden_avance_fotos f
       LEFT JOIN personal_taller p ON p.id = f.personal_id
       LEFT JOIN usuarios u        ON u.id = f.usuario_id
       WHERE ${conds.join(' AND ')}
       ORDER BY f.estacion, f.created_at DESC`,
      vals
    )
    res.json({ data: enrichWithUrls(rows) })
  } catch (err) { next(err) }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/produccion/avance-fotos/:fotoId
// Permite togglear visible_cliente y editar comentario.
// ─────────────────────────────────────────────────────────────────────────────
export async function patchAvanceFoto(req: Request, res: Response, next: NextFunction) {
  try {
    const fotoId = parseInt(String(req.params.fotoId))
    if (Number.isNaN(fotoId)) return next(createError('id inválido', 400))

    const sets: string[] = []
    const vals: unknown[] = []
    if (typeof req.body?.visible_cliente === 'boolean') {
      sets.push(`visible_cliente = $${sets.length + 1}`)
      vals.push(req.body.visible_cliente)
    }
    if (typeof req.body?.comentario === 'string') {
      sets.push(`comentario = $${sets.length + 1}`)
      vals.push(req.body.comentario.trim() || null)
    }
    if (sets.length === 0) return next(createError('Nada para actualizar', 400))

    vals.push(fotoId)
    const { rows: [foto] } = await pool.query(
      `UPDATE orden_avance_fotos SET ${sets.join(', ')}
       WHERE id = $${vals.length} RETURNING *`,
      vals
    )
    if (!foto) return next(createError('Foto no encontrada', 404))

    res.json({ data: foto, message: 'Foto actualizada' })
  } catch (err) { next(err) }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/produccion/avance-fotos/:fotoId
// Admin borra la foto (DB + storage). Solo ADMIN/ENGINEERING.
// ─────────────────────────────────────────────────────────────────────────────
export async function deleteAvanceFoto(req: Request, res: Response, next: NextFunction) {
  try {
    const fotoId = parseInt(String(req.params.fotoId))
    if (Number.isNaN(fotoId)) return next(createError('id inválido', 400))

    const { rows: [foto] } = await pool.query(
      `DELETE FROM orden_avance_fotos WHERE id = $1 RETURNING *`,
      [fotoId]
    )
    if (!foto) return next(createError('Foto no encontrada', 404))

    if (supabaseEnabled && supabase) {
      const { error } = await supabase.storage.from(AVANCE_BUCKET).remove([foto.filename])
      if (error) {
        logger.warn('deleteAvanceFoto Supabase warn', { requestId: req.id, fotoId, err: error.message })
      }
    } else {
      const filePath = path.join(UPLOADS_DIR, foto.filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }

    logger.info('avance foto eliminada', { requestId: req.id, fotoId, ordenId: foto.orden_id })
    res.json({ message: 'Foto eliminada' })
  } catch (err) { next(err) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper interno usado por completar-proceso (en kiosk router) para validar
// que existen suficientes fotos del proceso actual si la estación las requiere.
// Devuelve { ok, obligatoria, fotos_minimas, fotos_actuales, razon? }.
// ─────────────────────────────────────────────────────────────────────────────
export async function tieneAvanceFotoSiRequerida(
  ordenId: number,
  estacion: string,
  procesoId: number | null
): Promise<{
  ok: boolean
  obligatoria: boolean
  fotos_minimas: number
  fotos_actuales: number
  razon?: string
}> {
  // Es obligatoria para esta estación? + cuántas fotos mínimo?
  const { rows: [cfg] } = await pool.query(
    `SELECT foto_obligatoria, fotos_minimas FROM estaciones_config WHERE nombre = $1`,
    [estacion]
  )
  const obligatoria = cfg?.foto_obligatoria === true
  const fotosMinimas = Number(cfg?.fotos_minimas ?? 0)
  if (!obligatoria || fotosMinimas <= 0) {
    return { ok: true, obligatoria, fotos_minimas: fotosMinimas, fotos_actuales: 0 }
  }

  // Contar fotos para este proceso (o por orden+estacion como fallback).
  let queryText: string
  let queryVals: unknown[]
  if (procesoId != null) {
    queryText = `SELECT COUNT(*)::int AS c FROM orden_avance_fotos WHERE proceso_id = $1`
    queryVals = [procesoId]
  } else {
    queryText = `SELECT COUNT(*)::int AS c FROM orden_avance_fotos WHERE orden_id = $1 AND estacion = $2`
    queryVals = [ordenId, estacion]
  }
  const { rows: [{ c: fotosActuales }] } = await pool.query<{ c: number }>(queryText, queryVals)

  if (fotosActuales >= fotosMinimas) {
    return { ok: true, obligatoria: true, fotos_minimas: fotosMinimas, fotos_actuales: fotosActuales }
  }

  return {
    ok: false,
    obligatoria: true,
    fotos_minimas: fotosMinimas,
    fotos_actuales: fotosActuales,
    razon: `Esta estación requiere ${fotosMinimas} fotos. Llevás ${fotosActuales}.`,
  }
}
