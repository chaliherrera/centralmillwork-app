// ─────────────────────────────────────────────────────────────────────────────
// notifyTarea — Helper para mandar email de notificación de tarea pendiente
// ─────────────────────────────────────────────────────────────────────────────
// Llamado desde: jobs/tareasFromSystem (cron), muestrasController.createMuestra,
// modules/muestras/domain/ocsStatus (cerrarProcurementYCrearShopManager).
//
// Idempotencia: si la tarea ya tiene email_sent_at IS NOT NULL, NO se manda
// email de nuevo. Solo se setea email_sent_at = NOW() cuando sendEmail()
// devuelve ok=true (incluye passthrough).
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../db/pool'
import { logger } from './logger'
import { sendEmail, tareaNuevaEmail } from './mailer'

type QueryRunner = PoolClient | typeof pool

// Mapeo area → rol de usuario receptor
const AREA_ROLE: Record<string, string> = {
  procurement: 'PROCUREMENT',
  recepcion:   'PROCUREMENT',     // recepciones las maneja procurement
  shop_manager: 'SHOP_MANAGER',
  ingenieria:  'ENGINEERING',
  admin:       'ADMIN',
}

// Mapeo source_ref → link relativo al frontend para que el email tenga botón "Abrir"
function deriveLinkFromSourceRef(sourceRef: string | null): string | undefined {
  if (!sourceRef) return undefined
  if (sourceRef.startsWith('muestra:')) return '/muestras'
  if (sourceRef.startsWith('oc:'))      return '/ordenes-compra'
  if (sourceRef.startsWith('recep:'))   return '/recepciones'
  if (sourceRef.startsWith('material:')) return '/materiales'
  return '/tareas'
}

interface TareaRow {
  id: number
  area: string
  title: string
  description: string | null
  priority: 'high' | 'medium' | 'low' | null
  source_ref: string | null
  email_sent_at: string | null
}

/**
 * Notifica via email una tarea pendiente. Idempotente — no se manda si
 * email_sent_at ya está seteado. Se llama DENTRO de la misma transacción
 * cuando es posible para consistencia.
 *
 * NO bloquea el caller: si falla el envío, loggea + Sentry pero devuelve
 * silenciosamente. El caller no debería abortar su flow por un email.
 */
export async function notifyTareaPending(
  runner: QueryRunner,
  tareaId: number
): Promise<void> {
  try {
    // 1. Cargar tarea — verificar que no esté ya notificada
    const { rows: [t] } = await runner.query<TareaRow>(
      `SELECT id, area, title, description, priority, source_ref, email_sent_at
         FROM tareas
        WHERE id = $1`,
      [tareaId]
    )
    if (!t) {
      logger.warn('notifyTareaPending: tarea no encontrada', { tareaId })
      return
    }
    if (t.email_sent_at !== null) {
      // Ya se mandó — no-op (esperado en reactivaciones)
      return
    }

    // 2. Resolver destinatarios por rol
    const rol = AREA_ROLE[t.area]
    if (!rol) {
      logger.warn('notifyTareaPending: area sin mapping de rol', { tareaId, area: t.area })
      return
    }
    let { rows: users } = await runner.query<{ email: string; nombre: string }>(
      `SELECT email, nombre FROM usuarios WHERE rol = $1 AND activo = true`,
      [rol]
    )
    // Fallback: si el rol primario no tiene users activos, mandar a ADMIN para
    // que la notificación no se pierda. Útil en setups donde algún rol
    // (ej. PROCUREMENT) todavía no está asignado a nadie pero el cron lo invoca.
    if (users.length === 0 && rol !== 'ADMIN') {
      const { rows: adminUsers } = await runner.query<{ email: string; nombre: string }>(
        `SELECT email, nombre FROM usuarios WHERE rol = 'ADMIN' AND activo = true`
      )
      if (adminUsers.length > 0) {
        logger.warn('notifyTareaPending: sin users del rol primario, fallback a ADMIN', {
          tareaId, area: t.area, rol, fallbackCount: adminUsers.length,
        })
        users = adminUsers
      }
    }
    if (users.length === 0) {
      logger.warn('notifyTareaPending: sin destinatarios (ni siquiera ADMIN)', { tareaId, area: t.area, rol })
      return
    }

    // 3. Enviar email
    const { subject, html, text } = tareaNuevaEmail({
      titulo: t.title,
      descripcion: t.description ?? '',
      prioridad: (t.priority as 'high' | 'medium' | 'low') ?? 'medium',
      link: deriveLinkFromSourceRef(t.source_ref),
    })
    const result = await sendEmail({
      to: users.map((u) => u.email),
      subject,
      html,
      text,
      tags: [
        { name: 'area', value: t.area },
        { name: 'tarea_id', value: String(t.id) },
      ],
    })

    // 4. Marcar email_sent_at — incluso en passthrough (para no reintentar
    // mañana cuando se active el mailer y mandar emails atrasados).
    if (result.ok) {
      await runner.query(
        `UPDATE tareas SET email_sent_at = NOW() WHERE id = $1`,
        [tareaId]
      )
    }
  } catch (err) {
    // Catch-all: notify failures NUNCA deben romper el flow del caller
    logger.error('notifyTareaPending: throw inesperado', { tareaId, err: String(err) })
  }
}

/**
 * Versión por source_ref — más conveniente desde callers que acaban de
 * insertar la tarea y conocen el source_ref pero no el ID.
 */
export async function notifyTareaBySourceRef(
  runner: QueryRunner,
  sourceRef: string
): Promise<void> {
  const { rows: [t] } = await runner.query<{ id: number }>(
    `SELECT id FROM tareas WHERE source_ref = $1 AND origen = 'sistema'`,
    [sourceRef]
  )
  if (!t) {
    logger.warn('notifyTareaBySourceRef: tarea no encontrada', { sourceRef })
    return
  }
  await notifyTareaPending(runner, t.id)
}
