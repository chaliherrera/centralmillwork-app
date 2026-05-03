import { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../utils/supabase'
import { logger } from '../utils/logger'

const UPLOADS_DIR = path.join(__dirname, '../../uploads')
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

// Storage en memoria si Supabase está activo, en disco si no
const storage = supabaseEnabled
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
      filename: (_req, file, cb) => {
        const ext  = path.extname(file.originalname)
        const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
        cb(null, name)
      },
    })

// Validación defense-in-depth: extensión Y mimetype tienen que coincidir.
// Solo extensión es trivial de bypassear renombrando un archivo. Solo mimetype
// es controlable por el cliente. Ambos juntos hacen más difícil colar
// algo malicioso. Para garantía total habría que leer magic bytes, pero
// para una app interna esto alcanza.
const ALLOWED_IMG_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/gif', 'image/heic', 'image/heif',
  'application/pdf',
])
const ALLOWED_IMG_EXT_RE = /\.(jpe?g|png|webp|gif|heic|heif|pdf)$/i

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const extOk  = ALLOWED_IMG_EXT_RE.test(file.originalname)
  const mimeOk = ALLOWED_IMG_MIMES.has((file.mimetype ?? '').toLowerCase())
  if (extOk && mimeOk) return cb(null, true)
  // statusCode=400 hace que errorHandler devuelva 400 con el mensaje en vez de 500.
  cb(Object.assign(
    new Error(`Tipo de archivo no permitido. Solo imágenes (jpg, png, webp, gif, heic) o PDF. Recibido: nombre="${file.originalname}", mimetype="${file.mimetype}"`),
    { statusCode: 400 }
  ))
}

export const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } })

export async function getImagenes(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params
    const { rows } = await pool.query(
      `SELECT * FROM oc_imagenes WHERE orden_compra_id = $1 ORDER BY tipo, created_at`,
      [id]
    )
    // Si Supabase está activo, agregar URL pública a cada imagen
    if (supabaseEnabled && supabase) {
      const sb = supabase
      const enriched = rows.map((img) => {
        const { data } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(img.filename)
        return { ...img, url: data.publicUrl }
      })
      res.json({ data: enriched })
    } else {
      res.json({ data: rows })
    }
  } catch (err) { next(err) }
}

export async function uploadImagen(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params
    const tipo = (req.query.tipo as string) || 'material_recibido'
    if (!req.file) return next(createError('No se recibió ningún archivo', 400))

    let filename: string

    if (supabaseEnabled && supabase) {
      // Subir a Supabase Storage
      const ext = path.extname(req.file.originalname)
      filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
      const { error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(filename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        })
      if (error) {
        logger.error('uploadImagen Supabase error', { requestId: req.id, ocId: id, err: error })
        return next(createError('Error subiendo a Supabase: ' + error.message, 500))
      }
    } else {
      // Fallback al filesystem local
      filename = req.file.filename
    }

    const { rows } = await pool.query(
      `INSERT INTO oc_imagenes (orden_compra_id, tipo, filename, original_name)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, tipo, filename, req.file.originalname]
    )
    res.status(201).json({ data: rows[0], message: 'Imagen guardada' })
  } catch (err) { next(err) }
}

export async function deleteImagen(req: Request, res: Response, next: NextFunction) {
  try {
    const { imagenId } = req.params
    const { rows: [img] } = await pool.query(
      `DELETE FROM oc_imagenes WHERE id = $1 RETURNING *`, [imagenId]
    )
    if (!img) return next(createError('Imagen no encontrada', 404))

    if (supabaseEnabled && supabase) {
      const { error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .remove([img.filename])
      if (error) logger.warn('deleteImagen Supabase remove warn', { requestId: req.id, imagenId, err: error.message })
    } else {
      const filePath = path.join(UPLOADS_DIR, img.filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }

    res.json({ message: 'Imagen eliminada' })
  } catch (err) { next(err) }
}