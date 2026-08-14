// ─────────────────────────────────────────────────────────────────────────────
// Controller — Portal de cliente (PÚBLICO, acceso por token, sin JWT)
// ─────────────────────────────────────────────────────────────────────────────
// Se monta ANTES del authenticate global (como kiosk/webhooks). La autorización
// es el token en la URL. Nunca expone costos ni información interna.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import pool from '../../../db/pool'
import { getVistaPublica, aplicarAprobacion } from '../domain/portal'

// GET /api/portal/:token — vista de solo-lectura del proyecto + pendientes
export async function portalVista(req: Request, res: Response, next: NextFunction) {
  try {
    const vista = await getVistaPublica(pool, String(req.params.token))
    if (!vista) return res.status(404).json({ message: 'Link inválido o desactivado' })
    res.json({ data: vista })
  } catch (err) { next(err) }
}

// POST /api/portal/:token/aprobar — el cliente aprueba/rechaza un hito
const aprobarSchema = z.object({
  codigo: z.string().trim().min(1).max(12),
  decision: z.enum(['aprobado', 'aprobado_con_comentarios', 'rechazado']),
  comentario: z.string().trim().max(1000).optional(),
})
export async function portalAprobar(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const { codigo, decision, comentario } = aprobarSchema.parse(req.body)
    await client.query('BEGIN')
    const r = await aplicarAprobacion(client, String(req.params.token), codigo, decision, comentario ?? null)
    await client.query('COMMIT')
    if (!r.ok) return res.status(400).json({ message: r.error })
    res.json({ data: { ok: true } })
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {})
    if (err?.issues) return res.status(400).json({ message: 'datos inválidos' })
    next(err)
  } finally {
    client.release()
  }
}
