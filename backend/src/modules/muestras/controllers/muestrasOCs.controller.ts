// ─────────────────────────────────────────────────────────────────────────────
// Controller — Endpoints F2 de Muestras (OCs status + sin compras)
// ─────────────────────────────────────────────────────────────────────────────
// Endpoints HTTP delgados: parsean input, abren tx si hace falta, delegan al
// dominio (modules/muestras/domain/), serializan respuesta. NO contienen
// lógica de negocio — eso vive en domain/.
//
// Este controller NO duplica los CRUD de muestrasController.ts (legacy).
// Solo agrega los endpoints NUEVOS de la fase 2.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import pool from '../../../db/pool'
import { createError } from '../../../middleware/errorHandler'
import { logger } from '../../../utils/logger'
import {
  getMuestraOCsStatus,
  cerrarProcurementYCrearShopManager,
} from '../domain/ocsStatus'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/muestras/:id/ocs-status
// Devuelve estado de OCs + flag puede_fabricar. Usado por el frontend para
// pintar badges y decidir si mostrar botón "Iniciar fabricación".
// ─────────────────────────────────────────────────────────────────────────────
export async function getOCsStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const muestraId = parseInt(String(req.params.id))
    if (Number.isNaN(muestraId)) return next(createError('id inválido', 400))

    const status = await getMuestraOCsStatus(pool, muestraId)
    res.json({ data: status })
  } catch (err) { next(err) }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/muestras/:id/sin-compras
// PROCUREMENT marca "no requiere compras" (todo en stock). Genera evento en
// timeline + cierra tarea procurement + crea tarea SHOP_MANAGER.
// ─────────────────────────────────────────────────────────────────────────────
const sinComprasSchema = z.object({
  motivo: z.string().trim().max(500).optional(),
})

export async function marcarSinCompras(req: Request, res: Response, next: NextFunction) {
  const muestraId = parseInt(String(req.params.id))
  if (Number.isNaN(muestraId)) return next(createError('id inválido', 400))

  // Validar input
  const parsed = sinComprasSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return next(createError('Body inválido: ' + JSON.stringify(parsed.error.issues), 400))
  }
  const { motivo } = parsed.data

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. Verificar que la muestra existe y está en estado válido para esto
    const { rows: [muestra] } = await client.query<{ id: number; codigo: string; estado: string }>(
      `SELECT id, codigo, estado FROM muestras WHERE id = $1 FOR UPDATE`,
      [muestraId]
    )
    if (!muestra) {
      await client.query('ROLLBACK')
      return next(createError('Muestra no encontrada', 404))
    }
    if (muestra.estado !== 'SOLICITADA') {
      await client.query('ROLLBACK')
      return next(createError(
        `Solo se puede marcar "sin compras" en estado SOLICITADA. Actual: ${muestra.estado}`,
        400
      ))
    }

    // 2. Verificar que NO haya OCs ya asociadas (sería contradictorio)
    const { rows: [{ count }] } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ordenes_compra WHERE muestra_id = $1`,
      [muestraId]
    )
    if (parseInt(count) > 0) {
      await client.query('ROLLBACK')
      return next(createError(
        `Hay ${count} OCs asociadas a esta muestra. No se puede marcar "sin compras". ` +
        `Cancelá las OCs primero o esperá su recepción.`,
        400
      ))
    }

    // 3. Insertar evento de timeline
    await client.query(
      `INSERT INTO muestras_eventos (muestra_id, version_numero, tipo, detalle, usuario_id)
       VALUES ($1, 1, 'sin_compras', $2, $3)`,
      [muestraId, motivo || 'Materiales confirmados en stock', req.user?.id ?? null]
    )

    // 4. Cerrar tarea procurement + crear tarea SHOP_MANAGER (idempotente)
    await cerrarProcurementYCrearShopManager(
      client, muestraId, muestra.codigo, 'sin_compras'
    )

    await client.query('COMMIT')

    logger.info('muestra marcada sin_compras', {
      requestId: req.id, muestraId, codigo: muestra.codigo, usuario: req.user?.email,
    })

    // Devolver status actualizado para que el frontend refresque
    const status = await getMuestraOCsStatus(pool, muestraId)
    res.json({ data: status, message: 'Marcado sin compras necesarias' })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
}
