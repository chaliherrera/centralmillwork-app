// ─────────────────────────────────────────────────────────────────────────────
// Endpoint diagnóstico — Storage status
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/storage-status
// Devuelve si Supabase está enabled, qué bucket, y URLs de prueba.
// Solo ADMIN. Sin secretos sensibles en el output.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { requireRole } from '../middleware/auth'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../utils/supabase'
import { createError } from '../middleware/errorHandler'

const router = Router()

router.get('/storage-status', requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Stats de imágenes en BD
    const { rows: [ocStats] } = await pool.query<{ total: number; ultimos7d: number }>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END)::int AS ultimos7d
       FROM oc_imagenes`
    )

    // Última imagen subida con URL armada
    const { rows: [lastImg] } = await pool.query<{ id: number; filename: string; created_at: string; orden_compra_id: number }>(
      `SELECT id, orden_compra_id, filename, created_at FROM oc_imagenes ORDER BY created_at DESC LIMIT 1`
    )

    let testUrl: string | null = null
    let supabaseError: string | null = null
    if (lastImg) {
      if (supabaseEnabled && supabase) {
        try {
          const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(lastImg.filename)
          testUrl = data.publicUrl
          // Probar HEAD para ver si realmente existe en bucket
          // (no podemos await fetch acá sin agregar deps, así que solo devolvemos URL)
        } catch (err: any) {
          supabaseError = String(err?.message ?? err)
        }
      } else {
        const proto = req.protocol
        const host  = req.get('host')
        testUrl = `${process.env.BACKEND_PUBLIC_URL || `${proto}://${host}`}/uploads/${lastImg.filename}`
      }
    }

    res.json({
      data: {
        mode: supabaseEnabled ? 'supabase' : 'disk',
        supabase: {
          enabled: supabaseEnabled,
          bucket: supabaseEnabled ? SUPABASE_BUCKET : null,
          urlConfigured: !!process.env.SUPABASE_URL,
          serviceKeyConfigured: !!process.env.SUPABASE_SERVICE_KEY,
          bucketProduccionConfigured: !!process.env.SUPABASE_BUCKET_PRODUCCION,
        },
        oc_imagenes: {
          total: ocStats.total,
          ultimos7d: ocStats.ultimos7d,
          last: lastImg ? {
            id: lastImg.id,
            orden_compra_id: lastImg.orden_compra_id,
            filename: lastImg.filename,
            created_at: lastImg.created_at,
            test_url: testUrl,
            supabase_error: supabaseError,
          } : null,
        },
        backend_public_url: process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get('host')}`,
      },
    })
  } catch (err) { next(err) }
})

export default router
