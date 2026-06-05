// ─────────────────────────────────────────────────────────────────────────────
// Helper compartido para uploads de imágenes via multer + Supabase Storage.
// ─────────────────────────────────────────────────────────────────────────────
// Motivación: 4 controllers (imagenes, documentos, qc, avances) repetían
// el mismo patrón con drift (limits 10MB vs 20MB, prefijos distintos, mensajes
// de log distintos). Este helper centraliza:
//   1. createImageUploadMulter — config de multer (storage + fileFilter + limits)
//   2. uploadToSupabaseOrDisk  — sube el File ya en memoria a Supabase con
//      filename server-generated, o fallback a /uploads/ local en dev
//   3. removeFromStorage       — borra de Supabase (o disk) con warn-only
//   4. enrichRowsWithPublicUrls — refresca URLs vacías en rows de DB
//
// MIGRACIÓN: avancesFotosController ya usa este helper. Los otros 3 controllers
// siguen con su código copy-pasted — son working code en prod, migrarlos
// puede esperar a un sprint dedicado de refactor (track en pendientes).
// ─────────────────────────────────────────────────────────────────────────────

import { Request } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { supabase, supabaseEnabled } from './supabase'
import { logger } from './logger'

const UPLOADS_DIR = path.join(__dirname, '../../uploads')
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

// ─────────────────────────────────────────────────────────────────────────────
// 1. Multer config — same pattern as imagenes/qc/documentos
// ─────────────────────────────────────────────────────────────────────────────

export interface ImageUploadOptions {
  /** Prefijo del filename en disk fallback (ej: 'avance-', 'qc-', 'doc-'). */
  diskPrefix: string
  /** Max size en MB. Default 10. */
  sizeMb?: number
  /** Set de mimetypes permitidos. */
  allowedMimes: Set<string>
  /** Regex de extensiones permitidas (matched contra originalname). */
  allowedExtRe: RegExp
  /** Label para errores. Ej: 'jpg/png/webp/heic'. */
  formatsLabel: string
}

/**
 * Crea una instancia de multer configurada con:
 *   - memoryStorage si Supabase está activo, diskStorage si no
 *   - fileFilter con extensión Y mimetype (defense-in-depth)
 *   - límite de tamaño en bytes
 */
export function createImageUploadMulter(opts: ImageUploadOptions): multer.Multer {
  const sizeMb = opts.sizeMb ?? 10

  const storage = supabaseEnabled
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname)
          cb(null, `${opts.diskPrefix}${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
        },
      })

  const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const extOk  = opts.allowedExtRe.test(file.originalname)
    const mimeOk = opts.allowedMimes.has((file.mimetype ?? '').toLowerCase())
    if (extOk && mimeOk) return cb(null, true)
    cb(Object.assign(
      new Error(`Solo ${opts.formatsLabel}. Recibido: name="${file.originalname}" mime="${file.mimetype}"`),
      { statusCode: 400 }
    ))
  }

  return multer({ storage, fileFilter, limits: { fileSize: sizeMb * 1024 * 1024 } })
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Upload a Supabase (o disk fallback)
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadResult {
  filename: string
  url: string | null
}

export interface UploadParams {
  file: Express.Multer.File
  bucket: string
  /** Path prefix in Supabase. Ej: `orden-42`. El filename final será
   *  `${pathPrefix}/${customPrefix}${ts}-${rand}${ext}` */
  pathPrefix: string
  /** Custom prefix dentro del path (ej: 'avance-'). */
  customPrefix?: string
  /** requestId para logs estructurados. */
  requestId?: string
  /** Contexto extra para logs (ej: { ordenId, personalId }). */
  logCtx?: Record<string, unknown>
}

/**
 * Sube el file (que ya está en req.file con .buffer si Supabase activo, o
 * con .filename si disk mode). Devuelve { filename, url } para guardar en DB.
 *
 * **IMPORTANTE**: si después del upload falla la INSERT en DB, el caller
 * debe llamar removeFromStorage() para limpiar el blob. Este helper NO maneja
 * esa transacción — la responsabilidad de rollback queda en el caller.
 */
export async function uploadToSupabaseOrDisk(params: UploadParams): Promise<UploadResult> {
  const { file, bucket, pathPrefix, customPrefix = '', requestId, logCtx } = params

  if (supabaseEnabled && supabase) {
    const ext = path.extname(file.originalname)
    const filename = `${pathPrefix}/${customPrefix}${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`

    const { error } = await supabase.storage
      .from(bucket)
      .upload(filename, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      })

    if (error) {
      logger.error('upload Supabase error', { requestId, bucket, ...logCtx, err: error })
      throw Object.assign(new Error('Error subiendo a Supabase: ' + error.message), { statusCode: 500 })
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filename)
    return { filename, url: data.publicUrl }
  }

  // Disk mode (multer ya escribió a UPLOADS_DIR con filename auto-generado)
  return { filename: file.filename, url: `/uploads/${file.filename}` }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Remove de Supabase (o disk fallback). Warn-only, no throw.
// ─────────────────────────────────────────────────────────────────────────────

export interface RemoveParams {
  filename: string
  bucket: string
  requestId?: string
  logCtx?: Record<string, unknown>
}

/**
 * Borra el archivo del storage. Si falla, solo loggea warn — NO throw.
 * Diseñado para usarse en cleanup (try/catch) o en DELETE endpoints donde
 * el row ya se borró de DB y un fallo de storage no debe romper el response.
 */
export async function removeFromStorage(params: RemoveParams): Promise<void> {
  const { filename, bucket, requestId, logCtx } = params

  if (supabaseEnabled && supabase) {
    const { error } = await supabase.storage.from(bucket).remove([filename])
    if (error) {
      logger.warn('removeFromStorage Supabase warn', {
        requestId, bucket, filename, ...logCtx, err: error.message,
      })
    }
    return
  }

  const filePath = path.join(UPLOADS_DIR, filename)
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch (err: any) {
    logger.warn('removeFromStorage disk warn', { requestId, filename, ...logCtx, err: err?.message })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Enrich rows con URLs públicas frescas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Refresca el campo `url` en cada row si está vacío o viene del disk fallback.
 * Mutates en su lugar Y devuelve el array (encadenable).
 */
export function enrichRowsWithPublicUrls<T extends { url?: string | null; filename: string }>(
  rows: T[],
  bucket: string
): T[] {
  if (!supabaseEnabled || !supabase) return rows
  const sb = supabase
  for (const r of rows) {
    if (!r.url || r.url.startsWith('/uploads/')) {
      const { data } = sb.storage.from(bucket).getPublicUrl(r.filename)
      r.url = data.publicUrl
    }
  }
  return rows
}
