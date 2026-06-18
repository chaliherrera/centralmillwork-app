import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import pool from '../db/pool'

// ─── Schemas ────────────────────────────────────────────────────────────────

const taskDataSchema = z.object({
  area:        z.enum(['procurement', 'despachos', 'recepcion', 'administracion', 'shop_manager']),
  title:       z.string().trim().min(1, 'requerido').max(200),
  description: z.string().max(2000).nullable().optional(),
  priority:    z.enum(['low', 'medium', 'high']),
  from:        z.string().max(200).nullable().optional(),
  subject:     z.string().max(500).nullable().optional(),
})

export const emailWebhookSchema = z.object({
  email_id:  z.string().trim().min(1, 'requerido').max(500),
  task_data: taskDataSchema,
})

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/email
 *
 * Recibe una tarea desde el Task Agent. Idempotente: si source_email_id ya
 * existe, devuelve 200 con { status: 'exists' } sin duplicar.
 *
 * Body validado por emailWebhookSchema via validateBody middleware.
 */
export async function createTaskFromEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const { email_id, task_data } = req.body as z.infer<typeof emailWebhookSchema>

    // ON CONFLICT (source_email_id) DO NOTHING devuelve 0 filas si ya existía.
    // Hacemos un SELECT extra solo cuando hubo conflicto para devolver el id existente.
    const insert = await pool.query(
      `INSERT INTO tareas (area, title, description, priority, from_email, subject, source_email_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (source_email_id) DO NOTHING
       RETURNING id, created_at`,
      [
        task_data.area,
        task_data.title,
        task_data.description ?? null,
        task_data.priority,
        task_data.from ?? null,
        task_data.subject ?? null,
        email_id,
      ],
    )

    if (insert.rows[0]) {
      return res.status(201).json({
        status: 'created',
        id: insert.rows[0].id,
        created_at: insert.rows[0].created_at,
      })
    }

    // Ya existía — devolver el id de la tarea existente
    const existing = await pool.query(
      `SELECT id, created_at FROM tareas WHERE source_email_id = $1`,
      [email_id],
    )
    return res.status(200).json({
      status: 'exists',
      id: existing.rows[0]?.id ?? null,
      created_at: existing.rows[0]?.created_at ?? null,
    })
  } catch (err) {
    next(err)
  }
}
