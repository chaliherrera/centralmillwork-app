// ─────────────────────────────────────────────────────────────────────────────
// Controller — Intake de Estimación: arrancar un proyecto en el schedule.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import pool from '../../../db/pool'
import { createError } from '../../../middleware/errorHandler'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../../../utils/supabase'
import { logger } from '../../../utils/logger'
import { intakeProyecto } from '../domain/intake'

// El contrato: solo PDF, hasta 25 MB. Opcional (se puede arrancar sin él).
export const uploadContrato = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(new Error('El contrato debe ser PDF'))
  },
})

// POST /api/schedule/proyecto/:id/intake  (body: fecha_objetivo; file opcional: 'contrato')
export async function intakeHandler(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const proyectoId = parseInt(String(req.params.id), 10)
    if (Number.isNaN(proyectoId)) return next(createError('id de proyecto inválido', 400))
    const fecha = String(req.body?.fecha_objetivo ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return next(createError('fecha_objetivo inválida (YYYY-MM-DD)', 400))

    // Si vino contrato, subirlo a Supabase (si está configurado).
    let contrato: { filename: string; original_name: string; size: number } | null = null
    if (req.file) {
      if (!supabaseEnabled || !supabase)
        return next(createError('Storage no está configurado — probá sin adjuntar el contrato', 503))
      const path = `contratos/${randomUUID()}.pdf`
      const { error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(path, req.file.buffer, { contentType: 'application/pdf', cacheControl: '3600', upsert: false })
      if (error) {
        logger.error('intake: upload contrato falló', { error: error.message })
        return next(createError(`Error subiendo el contrato: ${error.message}`, 500))
      }
      contrato = { filename: path, original_name: req.file.originalname, size: req.file.size }
    }

    await client.query('BEGIN')
    const r = await intakeProyecto(client, proyectoId, fecha, contrato,
      (req as any).user?.id ?? null, (req as any).user?.nombre ?? null)
    if (!r.ok) { await client.query('ROLLBACK'); return next(createError(r.error ?? 'no se pudo iniciar', 400)) }
    await client.query('COMMIT')

    res.status(201).json({
      data: { ok: true, planNuevo: r.planNuevo },
      message: r.planNuevo ? 'Proyecto iniciado en el schedule' : 'Contrato registrado — día cero',
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
}
