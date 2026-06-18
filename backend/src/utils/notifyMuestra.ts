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
import { sendEmail, muestraEnQCEmail, muestraEnviadaEmail } from './mailer'

type QueryRunner = PoolClient | typeof pool

interface DestinatarioRow { email: string; nombre: string }

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
    const destinatarios = await buscarDestinatariosPorRol(runner, 'SHOP_MANAGER')
    if (destinatarios.length === 0) {
      logger.warn('notifyMuestraEnQC: sin SHOP_MANAGER activos con email', {
        muestraId: input.muestraId, codigo: input.codigo,
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
      to: destinatarios.map((u) => u.email),
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
      destinatarios: destinatarios.length,
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
    const destinatarios = await buscarDestinatariosPorRol(runner, 'ENGINEERING')
    if (destinatarios.length === 0) {
      logger.warn('notifyMuestraEnviada: sin ENGINEERING activos con email', {
        muestraId: input.muestraId, codigo: input.codigo,
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
      to: destinatarios.map((u) => u.email),
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
      destinatarios: destinatarios.length,
      passthrough: result.passthrough ?? false,
      ok: result.ok,
    })
  } catch (err) {
    logger.error('notifyMuestraEnviada: throw inesperado', {
      muestraId: input.muestraId, codigo: input.codigo, err: String(err),
    })
  }
}
