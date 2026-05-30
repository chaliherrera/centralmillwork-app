import { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../utils/supabase'
import { logger } from '../utils/logger'

// Storage compartido con imagenesController, mismo patrón:
// memoria si Supabase está activo, disco si no.
const UPLOADS_DIR = path.join(__dirname, '../../uploads')
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const QC_BUCKET = process.env.SUPABASE_BUCKET_PRODUCCION || SUPABASE_BUCKET

const storage = supabaseEnabled
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname)
        cb(null, `qc-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
      },
    })

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
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

export const uploadQcFoto = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } })

const VALID_DECISIONES = ['Aprobar', 'Reprocesar', 'Scrap']
const VALID_SEVERIDADES = ['Menor', 'Moderado', 'Mayor']

/**
 * POST /api/produccion/qc/inspecciones
 * Crea una inspección + checklist + defectos en una transacción.
 * Body: {
 *   orden_id, estacion, inspector_id?, decision?,
 *   estacion_reproceso?, notas?,
 *   checklist?: [{descripcion, aprobado?, notas?}],
 *   defectos?:  [{tipo_defecto, descripcion, severidad?}]
 * }
 *
 * Las fotos de defectos se suben aparte con POST /qc/defectos/:id/foto
 * y se vinculan al defecto correspondiente.
 */
export async function createInspeccion(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const {
      orden_id, estacion, inspector_id, decision, estacion_reproceso, notas,
      checklist = [], defectos = [],
    } = req.body

    if (!orden_id || !estacion) return next(createError('orden_id y estacion son requeridos', 400))
    if (decision && !VALID_DECISIONES.includes(decision)) return next(createError('decision inválida', 400))

    await client.query('BEGIN')

    const { rows: [insp] } = await client.query(
      `INSERT INTO qc_inspecciones (orden_id, estacion, inspector_id, decision, estacion_reproceso, notas)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [orden_id, estacion, inspector_id || null, decision || null, estacion_reproceso || null, notas || null]
    )

    if (Array.isArray(checklist)) {
      for (const item of checklist) {
        if (!item?.descripcion) continue
        await client.query(
          `INSERT INTO qc_checklist_items (inspeccion_id, descripcion, aprobado, notas)
           VALUES ($1,$2,$3,$4)`,
          [insp.id, String(item.descripcion), item.aprobado ?? null, item.notas || null]
        )
      }
    }

    const defectosInsertados: any[] = []
    if (Array.isArray(defectos)) {
      for (const d of defectos) {
        if (!d?.tipo_defecto || !d?.descripcion) continue
        if (d.severidad && !VALID_SEVERIDADES.includes(d.severidad)) {
          await client.query('ROLLBACK')
          return next(createError(`Severidad inválida: ${d.severidad}`, 400))
        }
        const { rows: [insertado] } = await client.query(
          `INSERT INTO qc_defectos (inspeccion_id, tipo_defecto, descripcion, severidad)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [insp.id, String(d.tipo_defecto), String(d.descripcion), d.severidad || null]
        )
        defectosInsertados.push(insertado)
      }
    }

    await client.query('COMMIT')
    res.status(201).json({ data: { ...insp, defectos: defectosInsertados }, message: 'Inspección registrada' })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}

/**
 * GET /api/produccion/qc/inspecciones?orden_id=...
 * Lista inspecciones (filtrable por orden) con su checklist y defectos.
 */
export async function getInspecciones(req: Request, res: Response, next: NextFunction) {
  try {
    const conds: string[] = []
    const vals: unknown[] = []
    if (req.query.orden_id) {
      conds.push(`i.orden_id = $${vals.length + 1}`)
      vals.push(parseInt(String(req.query.orden_id)))
    }
    if (req.query.inspector_id) {
      conds.push(`i.inspector_id = $${vals.length + 1}`)
      vals.push(parseInt(String(req.query.inspector_id)))
    }
    if (req.query.decision) {
      conds.push(`i.decision = $${vals.length + 1}`)
      vals.push(String(req.query.decision))
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

    const { rows } = await pool.query(
      `SELECT i.*,
              pt.nombre_completo AS inspector_nombre,
              COALESCE((SELECT json_agg(c) FROM qc_checklist_items c WHERE c.inspeccion_id = i.id), '[]'::json) AS checklist,
              COALESCE((SELECT json_agg(d) FROM qc_defectos        d WHERE d.inspeccion_id = i.id), '[]'::json) AS defectos
       FROM qc_inspecciones i
       LEFT JOIN personal_taller pt ON pt.id = i.inspector_id
       ${where}
       ORDER BY i.fecha_inspeccion DESC`,
      vals
    )

    res.json({ data: rows })
  } catch (err) { next(err) }
}

/**
 * POST /api/produccion/qc/defectos/:id/foto
 * Sube una foto y la vincula al defecto.
 * Multipart: foto (file)
 */
export async function uploadDefectoFoto(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params
    if (!req.file) return next(createError('No se recibió ningún archivo', 400))

    const { rows: [defecto] } = await pool.query(
      `SELECT id FROM qc_defectos WHERE id = $1`, [id]
    )
    if (!defecto) return next(createError('Defecto no encontrado', 404))

    let filename: string
    let publicUrl: string | null = null

    if (supabaseEnabled && supabase) {
      const ext = path.extname(req.file.originalname)
      filename = `qc/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
      const { error } = await supabase.storage
        .from(QC_BUCKET)
        .upload(filename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        })
      if (error) {
        logger.error('uploadDefectoFoto Supabase error', { requestId: req.id, defectoId: id, err: error })
        return next(createError('Error subiendo a Supabase: ' + error.message, 500))
      }
      const { data } = supabase.storage.from(QC_BUCKET).getPublicUrl(filename)
      publicUrl = data.publicUrl
    } else {
      filename = req.file.filename
      publicUrl = `/uploads/${filename}`
    }

    await pool.query(
      `UPDATE qc_defectos SET foto_url = $1 WHERE id = $2`,
      [publicUrl, id]
    )

    res.status(201).json({ data: { foto_url: publicUrl }, message: 'Foto subida' })
  } catch (err) { next(err) }
}

/**
 * GET /api/produccion/qc/stats?fecha_desde=...&fecha_hasta=...
 * Stats de defectos para el dashboard de QC.
 */
export async function getQcStats(req: Request, res: Response, next: NextFunction) {
  try {
    const fechaDesde = String(req.query.fecha_desde ?? '1900-01-01')
    const fechaHasta = String(req.query.fecha_hasta ?? '2999-12-31')

    const [decisiones, topDefectos, severidad] = await Promise.all([
      pool.query(
        `SELECT decision, COUNT(*) AS total
         FROM qc_inspecciones
         WHERE fecha_inspeccion::date BETWEEN $1 AND $2 AND decision IS NOT NULL
         GROUP BY decision`,
        [fechaDesde, fechaHasta]
      ),
      pool.query(
        `SELECT d.tipo_defecto, COUNT(*) AS total
         FROM qc_defectos d
         JOIN qc_inspecciones i ON i.id = d.inspeccion_id
         WHERE i.fecha_inspeccion::date BETWEEN $1 AND $2
         GROUP BY d.tipo_defecto
         ORDER BY total DESC
         LIMIT 10`,
        [fechaDesde, fechaHasta]
      ),
      pool.query(
        `SELECT d.severidad, COUNT(*) AS total
         FROM qc_defectos d
         JOIN qc_inspecciones i ON i.id = d.inspeccion_id
         WHERE i.fecha_inspeccion::date BETWEEN $1 AND $2 AND d.severidad IS NOT NULL
         GROUP BY d.severidad`,
        [fechaDesde, fechaHasta]
      ),
    ])

    res.json({
      periodo: { desde: fechaDesde, hasta: fechaHasta },
      decisiones: decisiones.rows,
      top_defectos: topDefectos.rows,
      por_severidad: severidad.rows,
    })
  } catch (err) { next(err) }
}
