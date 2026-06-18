// ─────────────────────────────────────────────────────────────────────────────
// notifyMuestra — Notificaciones por email para el módulo Muestras
// ─────────────────────────────────────────────────────────────────────────────
// A diferencia de notifyTarea, este helper NO crea registro en `tareas` ni
// depende de email_sent_at — manda email directo a los destinatarios según
// rol. El motivo: el módulo de Tareas hoy solo lo ve el ADMIN. Para notificar
// a SHOP_MANAGER / INGENIERIA, mandar email directo es lo más útil hasta que
// Tareas se abra a otros roles.
//
// Diseño:
//  - Una función por evento de muestra (en_qc, enviada, aprobada, etc).
//  - Cada una resuelve destinatarios por rol y dispara sendEmail.
//  - Nunca rompe el flow del caller (try/catch + log).
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../db/pool'
import { logger } from './logger'
import { sendEmail, muestraEnQCEmail, muestraEnviadaEmail, muestraQCAprobadoEmail } from './mailer'

type QueryRunner = PoolClient | typeof pool

interface DestinatarioRow { email: string; nombre: string }

interface RecipientPlan {
  to: DestinatarioRow[]
  cc: DestinatarioRow[]
  /** Para logging: motivo del plan ('owner-in-role' | 'owner-out-role' | 'broadcast-no-owner' | 'fallback-admin'). */
  motivo: string
}

/**
 * Trae un usuario por id (uuid) si está activo y tiene email. Helper interno.
 */
async function buscarUserPorId(
  runner: QueryRunner,
  userId: string | null | undefined
): Promise<(DestinatarioRow & { rol: string }) | null> {
  if (!userId) return null
  const { rows } = await runner.query<DestinatarioRow & { rol: string }>(
    `SELECT email, nombre, rol FROM usuarios
       WHERE id = $1 AND activo = true AND email IS NOT NULL AND email <> ''`,
    [userId]
  )
  return rows[0] ?? null
}

/**
 * Arma el plan de destinatarios "owner + CC al rol":
 *   - Si el owner pertenece al rol receptor: to=[owner], cc=[resto del rol]
 *   - Si el owner NO pertenece al rol receptor: to=[todos del rol], cc=[owner]
 *     (mantiene al owner informado de su muestra aunque no actúe)
 *   - Si no hay owner activo: to=[todos del rol], cc=[] (fallback broadcast)
 *
 * Mantiene el fallback a ADMIN del helper anterior (cuando el rol no tiene
 * users activos).
 */
async function planRecipientesOwnerCC(
  runner: QueryRunner,
  rolReceptor: string,
  ownerId: string | null | undefined
): Promise<RecipientPlan> {
  const rolUsers = await buscarDestinatariosPorRol(runner, rolReceptor)
  const owner = await buscarUserPorId(runner, ownerId)

  if (!owner) {
    return { to: rolUsers, cc: [], motivo: rolUsers.length === 0 ? 'sin-destinatarios' : 'broadcast-no-owner' }
  }

  const ownerEnRol = rolUsers.some((u) => u.email.toLowerCase() === owner.email.toLowerCase())
  if (ownerEnRol) {
    const resto = rolUsers.filter((u) => u.email.toLowerCase() !== owner.email.toLowerCase())
    return { to: [owner], cc: resto, motivo: 'owner-in-role' }
  }

  // Owner es de otro rol → notificar al rol primary, con owner en copia
  return { to: rolUsers, cc: [owner], motivo: 'owner-out-role' }
}

async function buscarDestinatariosPorRol(
  runner: QueryRunner,
  rol: string
): Promise<DestinatarioRow[]> {
  const { rows } = await runner.query<DestinatarioRow>(
    `SELECT email, nombre FROM usuarios
       WHERE rol = $1 AND activo = true AND email IS NOT NULL AND email <> ''`,
    [rol]
  )
  if (rows.length > 0 || rol === 'ADMIN') return rows

  // Fallback: si el rol primario no tiene users activos, mandar a ADMIN para
  // que la notificación llegue a alguien. Útil en setups donde algún rol
  // (ej. PROCUREMENT) todavía no fue asignado a nadie pero el flujo lo invoca.
  const { rows: adminRows } = await runner.query<DestinatarioRow>(
    `SELECT email, nombre FROM usuarios
       WHERE rol = 'ADMIN' AND activo = true AND email IS NOT NULL AND email <> ''`
  )
  if (adminRows.length > 0) {
    logger.warn('notifyMuestra: sin users del rol primario, fallback a ADMIN', { rol, fallbackCount: adminRows.length })
  }
  return adminRows
}

interface NotifyMuestraEnQCInput {
  muestraId: number
  codigo: string
  descripcion: string
  versionNumero?: number
  opNumero?: string | null
  /** Owner de la muestra (típicamente ENGINEERING). Si está activo, recibe en
   *  CC para mantener visibilidad del progreso de su muestra. */
  ownerId?: string | null
}

/**
 * Notifica al/los SHOP_MANAGER que una muestra completó fabricación y está
 * pendiente de QC. Idempotencia: el caller decide cuándo invocar (típicamente
 * justo después del COMMIT que setea estado='EN_QC'); no hay flag interno
 * porque la transición es la fuente de verdad — si vuelven a transicionar
 * EN_FABRICACION → EN_QC tras un rollback, es OK mandar email de nuevo.
 *
 * No bloquea — fallos van a logger + Sentry pero no propagan.
 */
export async function notifyMuestraEnQC(
  input: NotifyMuestraEnQCInput,
  runner: QueryRunner = pool
): Promise<void> {
  try {
    const plan = await planRecipientesOwnerCC(runner, 'SHOP_MANAGER', input.ownerId)
    if (plan.to.length === 0) {
      logger.warn('notifyMuestraEnQC: sin destinatarios', {
        muestraId: input.muestraId, codigo: input.codigo, motivo: plan.motivo,
      })
      return
    }

    const { subject, html, text } = muestraEnQCEmail({
      codigo: input.codigo,
      descripcion: input.descripcion,
      versionNumero: input.versionNumero,
      opNumero: input.opNumero,
    })

    const result = await sendEmail({
      to: plan.to.map((u) => u.email),
      cc: plan.cc.length > 0 ? plan.cc.map((u) => u.email) : undefined,
      subject,
      html,
      text,
      tags: [
        { name: 'evento', value: 'muestra_en_qc' },
        { name: 'muestra_id', value: String(input.muestraId) },
      ],
    })

    logger.info('notifyMuestraEnQC: dispatched', {
      muestraId: input.muestraId,
      codigo: input.codigo,
      to: plan.to.length,
      cc: plan.cc.length,
      motivo: plan.motivo,
      passthrough: result.passthrough ?? false,
      ok: result.ok,
    })
  } catch (err) {
    // Nunca propagar: el callsite NO debe abortar la transición por un email.
    logger.error('notifyMuestraEnQC: throw inesperado', {
      muestraId: input.muestraId, codigo: input.codigo, err: String(err),
    })
  }
}

interface NotifyMuestraEnviadaInput {
  muestraId: number
  codigo: string
  descripcion: string
  versionNumero?: number
  destinatario: string
  carrier?: string | null
  trackingNumber?: string | null
  /** Owner de la muestra. Si es ENGINEERING, va en to; si no, en cc. */
  ownerId?: string | null
}

/**
 * Notifica a INGENIERIA que una muestra fue enviada al cliente y hay que
 * estar atento a la respuesta. F5 (2026-06-09): reemplaza la creación de
 * tarea INGENIERIA por email puro, consistente con el patrón de F4.
 *
 * No bloquea. Failures van a logger + Sentry pero no propagan.
 */
export async function notifyMuestraEnviada(
  input: NotifyMuestraEnviadaInput,
  runner: QueryRunner = pool
): Promise<void> {
  try {
    const plan = await planRecipientesOwnerCC(runner, 'ENGINEERING', input.ownerId)
    if (plan.to.length === 0) {
      logger.warn('notifyMuestraEnviada: sin destinatarios', {
        muestraId: input.muestraId, codigo: input.codigo, motivo: plan.motivo,
      })
      return
    }

    const { subject, html, text } = muestraEnviadaEmail({
      codigo: input.codigo,
      descripcion: input.descripcion,
      versionNumero: input.versionNumero,
      destinatario: input.destinatario,
      carrier: input.carrier,
      trackingNumber: input.trackingNumber,
    })

    const result = await sendEmail({
      to: plan.to.map((u) => u.email),
      cc: plan.cc.length > 0 ? plan.cc.map((u) => u.email) : undefined,
      subject,
      html,
      text,
      tags: [
        { name: 'evento', value: 'muestra_enviada' },
        { name: 'muestra_id', value: String(input.muestraId) },
      ],
    })

    logger.info('notifyMuestraEnviada: dispatched', {
      muestraId: input.muestraId,
      codigo: input.codigo,
      to: plan.to.length,
      cc: plan.cc.length,
      motivo: plan.motivo,
      passthrough: result.passthrough ?? false,
      ok: result.ok,
    })
  } catch (err) {
    logger.error('notifyMuestraEnviada: throw inesperado', {
      muestraId: input.muestraId, codigo: input.codigo, err: String(err),
    })
  }
}

interface NotifyMuestraQCAprobadoInput {
  muestraId: number
  codigo: string
  descripcion: string
  versionNumero?: number
  opNumero?: string | null
  aprobadoPor?: string | null
  /** Owner de la muestra. Si no es PROCUREMENT, va en CC (visibilidad). */
  ownerId?: string | null
}

/**
 * Notifica a PROCUREMENT que una muestra fue aprobada por Shop Manager en QC
 * y está lista para envío al cliente. F4.5 (2026-06-17): handoff explícito
 * Shop Manager → Procurement, antes hoy era implícito.
 *
 * No bloquea. Failures van a logger + Sentry pero no propagan.
 */
export async function notifyMuestraQCAprobado(
  input: NotifyMuestraQCAprobadoInput,
  runner: QueryRunner = pool
): Promise<void> {
  try {
    const plan = await planRecipientesOwnerCC(runner, 'PROCUREMENT', input.ownerId)
    if (plan.to.length === 0) {
      logger.warn('notifyMuestraQCAprobado: sin destinatarios', {
        muestraId: input.muestraId, codigo: input.codigo, motivo: plan.motivo,
      })
      return
    }

    const { subject, html, text } = muestraQCAprobadoEmail({
      codigo: input.codigo,
      descripcion: input.descripcion,
      versionNumero: input.versionNumero,
      opNumero: input.opNumero,
      aprobadoPor: input.aprobadoPor,
    })

    const result = await sendEmail({
      to: plan.to.map((u) => u.email),
      cc: plan.cc.length > 0 ? plan.cc.map((u) => u.email) : undefined,
      subject,
      html,
      text,
      tags: [
        { name: 'evento', value: 'muestra_qc_aprobado' },
        { name: 'muestra_id', value: String(input.muestraId) },
      ],
    })

    logger.info('notifyMuestraQCAprobado: dispatched', {
      muestraId: input.muestraId,
      codigo: input.codigo,
      to: plan.to.length,
      cc: plan.cc.length,
      motivo: plan.motivo,
      passthrough: result.passthrough ?? false,
      ok: result.ok,
    })
  } catch (err) {
    logger.error('notifyMuestraQCAprobado: throw inesperado', {
      muestraId: input.muestraId, codigo: input.codigo, err: String(err),
    })
  }
}
