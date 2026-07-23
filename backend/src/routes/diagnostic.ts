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
import { captureMessage, captureException } from '../utils/sentry'
import { logger } from '../utils/logger'

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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/sentry-test — Validación de Sentry backend
// ─────────────────────────────────────────────────────────────────────────────
// Captura un mensaje + un evento de error simulado y los manda a Sentry.
// Útil para confirmar que SENTRY_DSN está bien configurada en el environment
// activo. Solo ADMIN. Si Sentry está en passthrough, devuelve passthrough=true.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/sentry-test', requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stamp = new Date().toISOString()

    // 1) Mensaje informativo (level=warning para que aparezca prominente)
    captureMessage(
      `Sentry backend test desde ${req.user?.email ?? 'admin'} — ${stamp}`,
      'warning',
      {
        tags: { hot_path: 'sentry_test' },
        extra: { initiated_by: req.user?.id ?? null, timestamp: stamp },
      }
    )

    // 2) Excepción simulada (no se tira al cliente — solo a Sentry)
    try {
      throw new Error(`Sentry backend test exception — ${stamp}`)
    } catch (err) {
      captureException(err, {
        tags: { hot_path: 'sentry_test' },
        extra: { simulated: true, timestamp: stamp },
      })
    }

    logger.info('sentry-test invocado', {
      requestId: req.id, userId: req.user?.id ?? null, stamp,
    })

    res.json({
      ok: true,
      message: 'Si SENTRY_DSN está bien, vas a ver 2 eventos en el proyecto `node`: 1 message + 1 exception.',
      timestamp: stamp,
      env: process.env.NODE_ENV,
      sentryDsnConfigured: !!process.env.SENTRY_DSN,
    })
  } catch (err) { next(err) }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/apply-mig-044-fotos-cnc-edge (2026-07-17)
// ─────────────────────────────────────────────────────────────────────────────
// Aplica la migración 044 (activar foto_obligatoria=true + fotos_minimas=3
// en estaciones cnc + edge_banding). Idempotente: si ya está aplicada, no
// cambia nada y devuelve el estado actual.
//
// Endpoint temporal — se agregó porque la conexión directa a la BD desde
// el entorno de dev falla ("Connection terminated unexpectedly"), y no
// queremos setear auto-migrate en el startCommand por riesgo. Se puede
// borrar después de aplicar.
//
// Solo ADMIN. GET para poder abrir directo en el navegador logueado.
router.get('/apply-mig-044-fotos-cnc-edge', requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows: before } = await pool.query<{ nombre: string; foto_obligatoria: boolean; fotos_minimas: number }>(
      `SELECT nombre, foto_obligatoria, fotos_minimas
         FROM estaciones_config
        WHERE nombre IN ('cnc', 'edge_banding')
        ORDER BY nombre`
    )

    const { rowCount } = await pool.query(
      `UPDATE estaciones_config
          SET foto_obligatoria = true, fotos_minimas = 3
        WHERE nombre IN ('cnc', 'edge_banding')`
    )

    const { rows: after } = await pool.query<{ nombre: string; foto_obligatoria: boolean; fotos_minimas: number }>(
      `SELECT nombre, foto_obligatoria, fotos_minimas
         FROM estaciones_config
        WHERE foto_obligatoria = true
        ORDER BY nombre`
    )

    logger.info('mig 044 aplicada', { requestId: req.id, rowCount, before, after })

    res.json({
      ok: true,
      message: `Migración 044 aplicada. Filas actualizadas: ${rowCount}`,
      before,
      after,
      estacionesConFotoObligatoria: after.map((r) => r.nombre),
    })
  } catch (err) { next(err) }
})

export default router
