import { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../utils/supabase'
import { logger } from '../utils/logger'

// Mismo patrón que imagenesController + qcController:
// memoria si Supabase está activo, disco si no.
const UPLOADS_DIR = path.join(__dirname, '../../uploads')
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

// Bucket dedicado para documentos de producción (separado de OC images y QC photos).
// Si no está seteado, cae al bucket genérico — mejor que romper en prod si faltó configurar.
const DOCS_BUCKET = process.env.SUPABASE_BUCKET_DOCS || SUPABASE_BUCKET

const storage = supabaseEnabled
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname)
        cb(null, `doc-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
      },
    })

// PDFs y por ahora también imágenes (jpg/png/webp) por si alguien quiere
// adjuntar una foto rápida de referencia.
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
])
const ALLOWED_EXT_RE = /\.(pdf|jpe?g|png|webp)$/i

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const extOk  = ALLOWED_EXT_RE.test(file.originalname)
  const mimeOk = ALLOWED_MIMES.has((file.mimetype ?? '').toLowerCase())
  if (extOk && mimeOk) return cb(null, true)
  cb(Object.assign(
    new Error(`Tipo no permitido. Solo PDF e imágenes (jpg/png/webp). Recibido: name="${file.originalname}" mime="${file.mimetype}"`),
    { statusCode: 400 }
  ))
}

// 20 MB por archivo. Los planos de carpintería rara vez pasan de 10 MB.
export const uploadDocumento = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
})

/**
 * GET /api/produccion/ordenes/:id/documentos
 * Lista todos los documentos de la orden, devolviendo `estacion` para
 * que el frontend los agrupe.
 *
 * Query opcional: ?estacion=cnc → filtra a esa estación.
 */
export async function getDocumentos(req: Request, res: Response, next: NextFunction) {
  try {
    const ordenId = parseInt(String(req.params.id))
    if (Number.isNaN(ordenId)) return next(createError('id inválido', 400))

    const conds: string[] = ['d.orden_id = $1']
    const vals: unknown[] = [ordenId]

    if (req.query.estacion) {
      // 'null' literal → docs sin estación específica (generales).
      const est = String(req.query.estacion)
      if (est === 'null') {
        conds.push('d.estacion IS NULL')
      } else {
        conds.push(`d.estacion = $${vals.length + 1}`)
        vals.push(est)
      }
    }

    const { rows } = await pool.query(
      `SELECT d.*, u.nombre AS uploaded_by_nombre
       FROM orden_documentos d
       LEFT JOIN usuarios u ON u.id = d.uploaded_by
       WHERE ${conds.join(' AND ')}
       ORDER BY d.estacion NULLS FIRST, d.created_at DESC`,
      vals
    )

    // Si Supabase está activo y la URL no se cacheó, regenerar (a veces el
    // bucket cambió de público a privado o al revés).
    if (supabaseEnabled && supabase) {
      const sb = supabase
      for (const r of rows) {
        if (!r.url || r.url.startsWith('/uploads/')) {
          const { data } = sb.storage.from(DOCS_BUCKET).getPublicUrl(r.filename)
          r.url = data.publicUrl
        }
      }
    }

    res.json({ data: rows })
  } catch (err) { next(err) }
}

/**
 * POST /api/produccion/ordenes/:id/documentos
 * Sube un documento (multipart, campo `archivo`).
 * Body fields: estacion (opcional), nombre (opcional, default = filename original),
 *              descripcion (opcional).
 */
export async function createDocumento(req: Request, res: Response, next: NextFunction) {
  try {
    const ordenId = parseInt(String(req.params.id))
    if (Number.isNaN(ordenId)) return next(createError('id inválido', 400))
    if (!req.file) return next(createError('No se recibió ningún archivo', 400))

    // Verificar que la orden existe
    const { rows: [orden] } = await pool.query(
      'SELECT id FROM ordenes_produccion WHERE id = $1',
      [ordenId]
    )
    if (!orden) return next(createError('Orden no encontrada', 404))

    const estacion = req.body.estacion ? String(req.body.estacion) : null
    const nombre = req.body.nombre?.trim() || req.file.originalname
    const descripcion = req.body.descripcion?.trim() || null

    let filename: string
    let url: string | null = null

    if (supabaseEnabled && supabase) {
      // Subir a Supabase Storage. Prefijo por orden para organizar.
      const ext = path.extname(req.file.originalname)
      filename = `orden-${ordenId}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
      const { error } = await supabase.storage
        .from(DOCS_BUCKET)
        .upload(filename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        })
      if (error) {
        logger.error('upload documento Supabase error', { requestId: req.id, ordenId, err: error })
        return next(createError('Error subiendo a Supabase: ' + error.message, 500))
      }
      const { data } = supabase.storage.from(DOCS_BUCKET).getPublicUrl(filename)
      url = data.publicUrl
    } else {
      // Filesystem local (dev)
      filename = req.file.filename
      url = `/uploads/${filename}`
    }

    const { rows: [doc] } = await pool.query(
      `INSERT INTO orden_documentos
         (orden_id, estacion, nombre, descripcion, filename, mime_type, size_bytes, url, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        ordenId, estacion, nombre, descripcion,
        filename, req.file.mimetype, req.file.size, url,
        req.user?.id || null,
      ]
    )

    logger.info('documento creado', {
      requestId: req.id,
      ordenId, docId: doc.id,
      estacion: estacion || 'general',
      tamano_kb: Math.round(req.file.size / 1024),
    })

    res.status(201).json({ data: doc, message: 'Documento subido' })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/produccion/documentos/:docId
 * Elimina el documento de DB y del storage.
 */
export async function deleteDocumento(req: Request, res: Response, next: NextFunction) {
  try {
    const docId = parseInt(String(req.params.docId))
    if (Number.isNaN(docId)) return next(createError('id inválido', 400))

    const { rows: [doc] } = await pool.query(
      'DELETE FROM orden_documentos WHERE id = $1 RETURNING *',
      [docId]
    )
    if (!doc) return next(createError('Documento no encontrado', 404))

    if (supabaseEnabled && supabase) {
      const { error } = await supabase.storage.from(DOCS_BUCKET).remove([doc.filename])
      if (error) {
        // No fallamos la request: el row ya se borró, el archivo huérfano se
        // limpia eventualmente. Solo loggeamos warning.
        logger.warn('delete documento Supabase warn', { requestId: req.id, docId, err: error.message })
      }
    } else {
      const filePath = path.join(UPLOADS_DIR, doc.filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }

    logger.info('documento eliminado', { requestId: req.id, docId, ordenId: doc.orden_id })
    res.json({ message: 'Documento eliminado' })
  } catch (err) { next(err) }
}

/**
 * GET /api/kiosk/ordenes/:id/documentos
 * Variante para el kiosko: el operario ve los docs de su estación + los
 * generales de la orden. Filtra por (estacion = estacion_actual del operario)
 * O (estacion IS NULL).
 *
 * Si el operario no está asignado a ninguna estación activa de la orden,
 * solo ve los docs generales.
 */
export async function getDocumentosKiosk(req: Request, res: Response, next: NextFunction) {
  try {
    const ordenId = parseInt(String(req.params.id))
    if (Number.isNaN(ordenId)) return next(createError('id inválido', 400))
    const personalId = req.kioskUser!.personal_id

    // Estaciones donde este operario está asignado en esta orden
    const { rows: estaciones } = await pool.query(
      `SELECT DISTINCT estacion FROM orden_procesos
       WHERE orden_id = $1 AND operador_id = $2`,
      [ordenId, personalId]
    )
    const estacionesPersona = estaciones.map((r) => r.estacion)

    const { rows: docs } = await pool.query(
      `SELECT d.*
       FROM orden_documentos d
       WHERE d.orden_id = $1
         AND (d.estacion IS NULL OR d.estacion = ANY($2::text[]))
       ORDER BY d.estacion NULLS FIRST, d.created_at DESC`,
      [ordenId, estacionesPersona]
    )

    // Refresh URLs from Supabase si está activo
    if (supabaseEnabled && supabase) {
      const sb = supabase
      for (const r of docs) {
        if (!r.url || r.url.startsWith('/uploads/')) {
          const { data } = sb.storage.from(DOCS_BUCKET).getPublicUrl(r.filename)
          r.url = data.publicUrl
        }
      }
    }

    res.json({ data: docs })
  } catch (err) { next(err) }
}
