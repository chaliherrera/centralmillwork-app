// ─────────────────────────────────────────────────────────────────────────────
// Controller HTTP — Iniciar fabricación de muestras (F3, 2026-06-09)
// ─────────────────────────────────────────────────────────────────────────────
// Wrappers HTTP delgados sobre la lógica de domain/fabricacion.ts.
// Validación con zod, errores normalizados al middleware errorHandler.
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import pool from '../../../db/pool'
import { createError } from '../../../middleware/errorHandler'
import { getProcesosDefaultPorTipo, iniciarFabricacion } from '../domain/fabricacion'

const procesoSchema = z.object({
  estacion: z.string().min(1).max(64),
  tiempo_estimado_minutos: z.number().int().positive().nullable().optional(),
  operador_id: z.number().int().positive().nullable().optional(),
})

const iniciarFabricacionSchema = z.object({
  procesos: z.array(procesoSchema).min(1).max(20),
  notas: z.string().max(2000).nullable().optional(),
})

/**
 * GET /api/muestras/:id/procesos-default
 *
 * Devuelve la ruta default de procesos según el tipo de la muestra.
 * El frontend lo usa para pre-llenar el modal "Iniciar fabricación".
 * Si la muestra es OTRO, devuelve array vacío (cliente arma a mano).
 */
export async function getProcesosDefault(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id))
    if (Number.isNaN(id)) return next(createError('id inválido', 400))

    const { rows: [muestra] } = await pool.query<{ id: number; tipo: string; codigo: string }>(
      `SELECT id, tipo, codigo FROM muestras WHERE id = $1`,
      [id]
    )
    if (!muestra) return next(createError('Muestra no encontrada', 404))

    const procesos = await getProcesosDefaultPorTipo(muestra.tipo)
    res.json({
      data: {
        muestra_id: muestra.id,
        codigo: muestra.codigo,
        tipo: muestra.tipo,
        procesos,
      },
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/muestras/:id/iniciar-fabricacion
 *
 * Crea la OP de producción con los procesos enviados y transiciona la
 * muestra a EN_FABRICACION en la misma transacción. Reemplaza el flujo
 * de hacer transicion → OP vacía → editar procesos a mano.
 *
 * Body:
 *   {
 *     procesos: [{ estacion, tiempo_estimado_minutos?, operador_id? }, ...],
 *     notas?: string
 *   }
 */
export async function iniciarFabricacionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id))
    if (Number.isNaN(id)) return next(createError('id inválido', 400))

    const parsed = iniciarFabricacionSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(createError('Body inválido: ' + parsed.error.issues.map((i) => i.message).join('; '), 400))
    }

    const result = await iniciarFabricacion({
      muestraId: id,
      procesos: parsed.data.procesos,
      notas: parsed.data.notas ?? null,
      usuarioId: req.user?.id ?? null,
    })

    res.status(201).json({
      data: result,
      message: `Fabricación iniciada — OP ${result.op_numero} con ${result.procesos_creados} proceso(s).`,
    })
  } catch (err: any) {
    // Errores de dominio vienen con statusCode pre-seteado
    if (err?.statusCode && err?.message) {
      return next(createError(err.message, err.statusCode))
    }
    next(err)
  }
}
