import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import { SUPABASE_BUCKET } from '../utils/supabase'
import { logger } from '../utils/logger'
import {
  createImageUploadMulter,
  uploadToSupabaseOrDisk,
  removeFromStorage,
  enrichRowsWithPublicUrls,
} from '../utils/fileUploadHelper'

// ─────────────────────────────────────────────────────────────────────────────
// Fotos de avance del kiosko
//
// El operario, antes de "Completar proceso", sube N fotos desde el iPad como
// evidencia. La cantidad mínima se configura por estación en
// estaciones_config.fotos_minimas.
//
// Bucket: SUPABASE_BUCKET_PRODUCCION (el de QC). Si no está seteado, cae al
// bucket genérico. Prefijo: `orden-{id}/avance-{ts}-{rand}.{ext}`
// ─────────────────────────────────────────────────────────────────────────────

const AVANCE_BUCKET = process.env.SUPABASE_BUCKET_PRODUCCION || SUPABASE_BUCKET

// Multer config delegado al helper. Solo imágenes (sin PDF) porque viene de
// la cámara del iPad.
export const uploadAvanceFoto = createImageUploadMulter({
  diskPrefix: 'avance-',
  sizeMb: 10,
  allowedMimes: new Set([
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'image/heic', 'image/heif',
  ]),
  allowedExtRe: /\.(jpe?g|png|webp|heic|heif)$/i,
  formatsLabel: 'imágenes (jpg/png/webp/heic)',
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kiosk/ordenes/:id/avance-foto
// El operario sube una foto desde el kiosko.
//
// Reglas:
//   - El operario debe estar asignado a algún proceso de esta orden
//   - Se asocia automáticamente con su proceso (preferentemente el que matchea
//     la estación actual de la orden; fallback a cualquier proceso del operario)
//   - estacion = la del proceso del operario (consistente con orden.mi_estacion
//     en el frontend, que sale del mismo lugar). NO usamos orden.estacion_actual
//     como fallback porque puede diverger del frontend filter (Fix #8).
//   - **Cleanup en falla** (Fix #2): si la INSERT en DB falla DESPUÉS de subir
//     a Supabase, removemos el blob para no dejar huérfanos.
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

    // Buscar el proceso del operario en la estación actual. Si no hay match
    // exacto, buscamos cualquier proceso del operario en esta orden (ayudante).
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

    // Fix #8: snapshot SOLO desde proceso.estacion (no orden.estacion_actual).
    // El frontend filtra por orden.mi_estacion (op.estacion del proceso del
    // operario en mi-cola), así que si guardamos proceso.estacion siempre
    // matchean. Si proceso.estacion es null, es data corrupta → error.
    if (!proceso.estacion) {
      logger.error('proceso sin estacion', { requestId: req.id, ordenId, procesoId: proceso.id })
      return next(createError('Proceso sin estación asignada (data inválida)', 500))
    }
    const estacionSnapshot: string = proceso.estacion

    const comentario = req.body?.comentario?.toString().trim() || null

    // Subir al storage (Supabase o disk). Tirar throw → next(err).
    const { filename, url } = await uploadToSupabaseOrDisk({
      file: req.file,
      bucket: AVANCE_BUCKET,
      pathPrefix: `orden-${ordenId}`,
      customPrefix: 'avance-',
      requestId: req.id,
      logCtx: { ordenId, personalId },
    })

    // Fix #2: si el INSERT falla DESPUÉS del upload, hay que limpiar el blob
    // para no dejar archivos huérfanos en el bucket. Try/catch + cleanup.
    let foto
    try {
      const { rows: [row] } = await pool.query(
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
      foto = row
    } catch (insertErr: any) {
      // Cleanup del blob recién subido (best effort, no bloquea el error).
      await removeFromStorage({
        filename, bucket: AVANCE_BUCKET, requestId: req.id,
        logCtx: { ordenId, personalId, reason: 'INSERT failed, cleaning orphan' },
      }).catch((cleanupErr) => {
        logger.error('failed to cleanup orphan after INSERT failure', {
          requestId: req.id, ordenId, filename, err: String(cleanupErr),
        })
      })
      throw insertErr
    }

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
    res.json({ data: enrichRowsWithPublicUrls(rows, AVANCE_BUCKET) })
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
    res.json({ data: enrichRowsWithPublicUrls(rows, AVANCE_BUCKET) })
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
// Admin borra la foto (DB + storage). Solo ADMIN/SHOP_MANAGER.
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

    await removeFromStorage({
      filename: foto.filename, bucket: AVANCE_BUCKET,
      requestId: req.id, logCtx: { fotoId, ordenId: foto.orden_id },
    })

    logger.info('avance foto eliminada', { requestId: req.id, fotoId, ordenId: foto.orden_id })
    res.json({ message: 'Foto eliminada' })
  } catch (err) { next(err) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper interno usado por completar-proceso para validar fotos.
// Devuelve { ok, obligatoria, fotos_minimas, fotos_actuales, razon? }.
//
// Fix #6: si foto_obligatoria=true y fotos_minimas<=0, forzamos a 1.
// Para desactivar el gate hay que poner foto_obligatoria=false, no fotos_minimas=0.
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
  const { rows: [cfg] } = await pool.query(
    `SELECT foto_obligatoria, fotos_minimas FROM estaciones_config WHERE nombre = $1`,
    [estacion]
  )
  const obligatoria = cfg?.foto_obligatoria === true
  if (!obligatoria) {
    return { ok: true, obligatoria: false, fotos_minimas: 0, fotos_actuales: 0 }
  }

  // Fix #6: si obligatoria=true pero fotos_minimas<=0 (config rara), forzamos
  // a 1 — el admin claramente quería pedir al menos una foto. Para desactivar
  // del todo debe poner foto_obligatoria=false.
  const fotosMinimasConfig = Number(cfg?.fotos_minimas ?? 0)
  const fotosMinimas = fotosMinimasConfig > 0 ? fotosMinimasConfig : 1
  if (fotosMinimasConfig <= 0) {
    logger.warn('estacion con foto_obligatoria=true pero fotos_minimas<=0; forzando a 1', {
      estacion, fotos_minimas_config: fotosMinimasConfig,
    })
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
    razon: `Esta estación requiere ${fotosMinimas} foto${fotosMinimas === 1 ? '' : 's'}. Llevás ${fotosActuales}.`,
  }
}
