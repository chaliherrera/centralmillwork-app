// ─────────────────────────────────────────────────────────────────────────────
// planosController — Planos PDF por (proyecto_id, numero_item) (2026-07-17)
// ─────────────────────────────────────────────────────────────────────────────
// Solicitud del shop manager: poder ver los planos del ítem ANTES de definir
// la ruta de la OP. Los planos se cargan una vez por (proyecto, ítem) y
// quedan disponibles para toda OP futura del mismo ítem — evita re-cargar.
//
// Storage: Supabase Storage bucket 'oc-imagenes' con path 'planos/{uuid}.pdf'.
// Se reusa el mismo bucket que fotos de recepción y avances por consistencia.
//
// Solo PDF por ahora (decisión del user). El shop manager sube planos que
// ya están exportados a PDF desde el CAD.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../utils/supabase'
import { logger } from '../utils/logger'

const SIGNED_URL_TTL_PLANOS = 3600 // 1h — suficiente para abrir y guardar

// Solo PDF permitido (decisión del user 2026-07-17). Rechazo cualquier otra
// cosa con 400 explícito.
const planoFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const extOk  = /\.pdf$/i.test(file.originalname)
  const mimeOk = (file.mimetype ?? '').toLowerCase() === 'application/pdf'
  if (extOk && mimeOk) return cb(null, true)
  cb(Object.assign(
    new Error(`Solo se aceptan archivos PDF. Recibido: nombre="${file.originalname}", mimetype="${file.mimetype}"`),
    { statusCode: 400 }
  ))
}

// Storage: siempre memoria porque los planos van a Supabase (asumimos
// supabaseEnabled=true en prod). Si algún día se rompe Supabase, buscar
// el fallback a disco que hay en imagenesController.
export const uploadPlano = multer({
  storage: multer.memoryStorage(),
  fileFilter: planoFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — planos grandes ok
})

/**
 * GET /api/proyectos/:id/items/:numero/planos
 * Lista planos del ítem con signed URLs para abrir en el navegador.
 */
export async function getPlanosItem(req: Request, res: Response, next: NextFunction) {
  try {
    const proyectoId = parseInt(String(req.params.id))
    const numeroItem = String(req.params.numero || '').trim()
    if (!Number.isFinite(proyectoId) || !numeroItem) {
      return next(createError('proyecto_id y numero de ítem son requeridos', 400))
    }

    const { rows } = await pool.query<{
      id: number; filename: string; original_name: string;
      size_bytes: number | null; created_at: string; uploaded_by_nombre: string | null;
    }>(
      `SELECT p.id, p.filename, p.original_name, p.size_bytes,
              p.created_at::text AS created_at,
              u.nombre AS uploaded_by_nombre
         FROM proyecto_item_planos p
         LEFT JOIN usuarios u ON u.id = p.uploaded_by
        WHERE p.proyecto_id = $1 AND p.numero_item = $2
        ORDER BY p.created_at DESC`,
      [proyectoId, numeroItem]
    )

    // Firmar URLs en paralelo. Si Supabase no está enabled, url queda null
    // y el frontend muestra el nombre sin link.
    const planos = await Promise.all(
      rows.map(async (r) => {
        let url: string | null = null
        if (supabaseEnabled && supabase) {
          const { data, error } = await supabase.storage
            .from(SUPABASE_BUCKET)
            .createSignedUrl(r.filename, SIGNED_URL_TTL_PLANOS)
          if (error) {
            logger.warn('planos: createSignedUrl error', { filename: r.filename, error: error.message })
          } else {
            url = data.signedUrl
          }
        }
        return {
          id: r.id,
          filename: r.filename,
          original_name: r.original_name,
          size_bytes: r.size_bytes,
          created_at: r.created_at,
          uploaded_by_nombre: r.uploaded_by_nombre,
          url,
        }
      })
    )

    res.json({ data: planos })
  } catch (err) { next(err) }
}

/**
 * POST /api/proyectos/:id/items/:numero/planos
 * Multipart upload de PDF. Field name: 'plano'.
 */
export async function uploadPlanoItem(req: Request, res: Response, next: NextFunction) {
  try {
    const proyectoId = parseInt(String(req.params.id))
    const numeroItem = String(req.params.numero || '').trim()
    if (!Number.isFinite(proyectoId) || !numeroItem) {
      return next(createError('proyecto_id y numero de ítem son requeridos', 400))
    }
    if (!req.file) return next(createError('No se recibió archivo (field name: plano)', 400))

    // Validar que el proyecto existe (evita cargar planos huérfanos por typo)
    const { rows: proyectoRows } = await pool.query('SELECT id FROM proyectos WHERE id = $1', [proyectoId])
    if (proyectoRows.length === 0) return next(createError('Proyecto no encontrado', 404))

    // Nombre único para Supabase — evitar colisiones si dos users suben
    // planos con mismo nombre original.
    const uniqueName = `planos/${randomUUID()}.pdf`

    if (!supabaseEnabled || !supabase) {
      return next(createError('Supabase Storage no está configurado en este entorno', 500))
    }

    const { error: uploadErr } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(uniqueName, req.file.buffer, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadErr) {
      logger.error('planos: upload a Supabase falló', { error: uploadErr.message, uniqueName })
      return next(createError(`Error subiendo plano a storage: ${uploadErr.message}`, 500))
    }

    // Guardar registro en BD
    const { rows: [inserted] } = await pool.query<{ id: number; created_at: string }>(
      `INSERT INTO proyecto_item_planos
         (proyecto_id, numero_item, filename, original_name, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at::text AS created_at`,
      [proyectoId, numeroItem, uniqueName, req.file.originalname, req.file.size, req.user?.id ?? null]
    )

    // Devolver signed URL para preview inmediato
    const { data: signed } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .createSignedUrl(uniqueName, SIGNED_URL_TTL_PLANOS)

    logger.info('plano subido', {
      requestId: req.id, proyectoId, numeroItem, filename: uniqueName,
      size: req.file.size, planoId: inserted.id,
    })

    res.status(201).json({
      data: {
        id: inserted.id,
        filename: uniqueName,
        original_name: req.file.originalname,
        size_bytes: req.file.size,
        created_at: inserted.created_at,
        url: signed?.signedUrl ?? null,
      },
      message: 'Plano subido correctamente',
    })
  } catch (err) { next(err) }
}
