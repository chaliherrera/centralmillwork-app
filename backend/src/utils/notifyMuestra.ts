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
import { sendEmail, muestraEnQCEmail, muestraEnviadaEmail, muestraQCAprobadoEmail, muestraAprobadaEmail, muestraRechazadaEmail } from './mailer'

type QueryRunner = PoolClient | typeof pool

interface DestinatarioRow { email: string; nombre: string }

/**
 * Trae un usuario por id (uuid) si está activo y tiene email. Helper interno.
 * Usado para resolver el "owner" (solicitante) de una muestra cuando una
 * notificación debe ir SOLO a ese ingeniero (F5 envío).
 */
async function buscarUserPorId(
  runner: QueryRunner,
  userId: string | null | undefined
): Promise<DestinatarioRow | null> {
  if (!userId) return null
  const { rows } = await runner.query<DestinatarioRow>(
    `SELECT email, nombre FROM usuarios
       WHERE id = $1 AND activo = true AND email IS NOT NULL AND email <> ''`,
    [userId]
  )
  return rows[0] ?? null
}

/**
 * Deduplica destinatarios por email (case-insensitive). Útil cuando combinamos
 * varios roles + owner para una misma notificación.
 */
function dedupePorEmail(users: DestinatarioRow[]): DestinatarioRow[] {
  const seen = new Set<string>()
  const out: DestinatarioRow[] = []
  for (const u of users) {
    const key = u.email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(u)
  }
  return out
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
  /** @deprecated F8 v2 (2026-06-17): owner no entra en EN_QC. Campo se ignora
   *  para mantener compat con callsites; se elimina cuando migren todos. */
  ownerId?: string | null
}

/**
 * Notifica al rol SHOP_MANAGER que una muestra completó fabricación y está
 * pendiente de QC. F8 v2 (2026-06-17): solo SHOP_MANAGER, sin CC al owner
 * (regla de negocio: durante fabricación/QC el solicitante no necesita
 * tracking en tiempo real).
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
      logger.warn('notifyMuestraEnQC: sin destinatarios SHOP_MANAGER', {
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
      to: destinatarios.length,
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
  /** Owner de la muestra (ingeniero solicitante). Único destinatario.
   *  F8 v2 (2026-06-17): solo el solicitante se entera del envío, no toda
   *  ENGINEERING. Si no hay owner activo → fallback a rol ENGINEERING. */
  ownerId?: string | null
}

/**
 * Notifica al INGENIERO SOLICITANTE (owner) que su muestra fue enviada al
 * cliente. F8 v2 (2026-06-17): solo al owner, no broadcast a ENGINEERING.
 * Fallback al rol ENGINEERING solo si el owner no está activo o no hay
 * owner_id (muestras huérfanas).
 *
 * No bloquea. Failures van a logger + Sentry pero no propagan.
 */
export async function notifyMuestraEnviada(
  input: NotifyMuestraEnviadaInput,
  runner: QueryRunner = pool
): Promise<void> {
  try {
    let destinatarios: DestinatarioRow[] = []
    let motivo = 'owner-only'
    const owner = await buscarUserPorId(runner, input.ownerId)
    if (owner) {
      destinatarios = [owner]
    } else {
      destinatarios = await buscarDestinatariosPorRol(runner, 'ENGINEERING')
      motivo = 'fallback-rol-engineering'
    }
    if (destinatarios.length === 0) {
      logger.warn('notifyMuestraEnviada: sin destinatarios', {
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
      to: destinatarios.length,
      motivo,
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
  /** @deprecated F8 v2 (2026-06-17): owner no entra en QC aprobado. */
  ownerId?: string | null
}

/**
 * Notifica al rol PROCUREMENT que una muestra fue aprobada por Shop Manager
 * en QC y está lista para envío al cliente. F8 v2 (2026-06-17): solo
 * PROCUREMENT (con fallback a ADMIN del helper si no hay users del rol),
 * sin CC al owner.
 *
 * No bloquea. Failures van a logger + Sentry pero no propagan.
 */
export async function notifyMuestraQCAprobado(
  input: NotifyMuestraQCAprobadoInput,
  runner: QueryRunner = pool
): Promise<void> {
  try {
    const destinatarios = await buscarDestinatariosPorRol(runner, 'PROCUREMENT')
    if (destinatarios.length === 0) {
      logger.warn('notifyMuestraQCAprobado: sin destinatarios PROCUREMENT', {
        muestraId: input.muestraId, codigo: input.codigo,
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
      to: destinatarios.map((u) => u.email),
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
      to: destinatarios.length,
      passthrough: result.passthrough ?? false,
      ok: result.ok,
    })
  } catch (err) {
    logger.error('notifyMuestraQCAprobado: throw inesperado', {
      muestraId: input.muestraId, codigo: input.codigo, err: String(err),
    })
  }
}

// ─── F6: Aprobada / Rechazada — notifica el cierre del ciclo ─────────────────

interface NotifyMuestraAprobadaInput {
  muestraId: number
  codigo: string
  descripcion: string
  versionNumero?: number
  aprobadaPor?: string | null
  proyectoCodigo?: string | null
  /** Owner del solicitante. Incluido para evitar asimetría con RECHAZADA:
   *  el solicitante también merece saber el veredicto cuando es positivo. */
  ownerId?: string | null
}

/**
 * F6 v3 (2026-06-17, fix asimetría): Notifica a PROCUREMENT + SHOP_MANAGER +
 * OWNER cuando el cliente aprueba la muestra. Antes del fix el owner quedaba
 * fuera con el argumento "él aprobó, ya sabe", pero ese asumption es frágil:
 * el clic-aprobador puede ser otro ENGINEERING distinto al solicitante.
 * Mantiene paridad con RECHAZADA.
 *
 * Para PROCUREMENT: el ciclo cerró exitosamente; pueden archivar y avanzar a
 * la OP real del proyecto si corresponde. Para SHOP_MANAGER: confirmación
 * de que la calidad fue aceptada por el cliente. Para OWNER: cierre del ciclo
 * que él inició.
 */
export async function notifyMuestraAprobada(
  input: NotifyMuestraAprobadaInput,
  runner: QueryRunner = pool
): Promise<void> {
  try {
    const [procurement, shopManager, owner] = await Promise.all([
      buscarDestinatariosPorRol(runner, 'PROCUREMENT'),
      buscarDestinatariosPorRol(runner, 'SHOP_MANAGER'),
      buscarUserPorId(runner, input.ownerId),
    ])
    const destinatarios = dedupePorEmail([
      ...procurement,
      ...shopManager,
      ...(owner ? [owner] : []),
    ])
    if (destinatarios.length === 0) {
      logger.warn('notifyMuestraAprobada: sin destinatarios', {
        muestraId: input.muestraId, codigo: input.codigo,
      })
      return
    }

    const { subject, html, text } = muestraAprobadaEmail({
      codigo: input.codigo,
      descripcion: input.descripcion,
      versionNumero: input.versionNumero,
      aprobadaPor: input.aprobadaPor,
      proyectoCodigo: input.proyectoCodigo,
    })

    const result = await sendEmail({
      to: destinatarios.map((u) => u.email),
      subject,
      html,
      text,
      tags: [
        { name: 'evento', value: 'muestra_aprobada' },
        { name: 'muestra_id', value: String(input.muestraId) },
      ],
    })

    logger.info('notifyMuestraAprobada: dispatched', {
      muestraId: input.muestraId,
      codigo: input.codigo,
      includeOwner: owner != null,
      to: destinatarios.length,
      procurement: procurement.length,
      shopManager: shopManager.length,
      passthrough: result.passthrough ?? false,
      ok: result.ok,
    })
  } catch (err) {
    logger.error('notifyMuestraAprobada: throw inesperado', {
      muestraId: input.muestraId, codigo: input.codigo, err: String(err),
    })
  }
}

interface NotifyMuestraRechazadaInput {
  muestraId: number
  codigo: string
  descripcion: string
  versionNumero?: number
  razonRevision?: string | null
  rechazadaPor?: string | null
  /** Owner del solicitante — incluido para que pueda crear V2. */
  ownerId?: string | null
}

/**
 * F6 v2 (2026-06-17): Notifica a PROCUREMENT + SHOP_MANAGER + owner que el
 * cliente rechazó la muestra. PROCUREMENT/SHOP_MANAGER: para frenar el ciclo
 * de esta versión y prepararse para una próxima. Owner: para que prepare la
 * V+1 con los ajustes pedidos en razon_revision.
 */
export async function notifyMuestraRechazada(
  input: NotifyMuestraRechazadaInput,
  runner: QueryRunner = pool
): Promise<void> {
  try {
    const [procurement, shopManager, owner] = await Promise.all([
      buscarDestinatariosPorRol(runner, 'PROCUREMENT'),
      buscarDestinatariosPorRol(runner, 'SHOP_MANAGER'),
      buscarUserPorId(runner, input.ownerId),
    ])
    const destinatarios = dedupePorEmail([
      ...procurement,
      ...shopManager,
      ...(owner ? [owner] : []),
    ])
    if (destinatarios.length === 0) {
      logger.warn('notifyMuestraRechazada: sin destinatarios', {
        muestraId: input.muestraId, codigo: input.codigo,
      })
      return
    }

    const { subject, html, text } = muestraRechazadaEmail({
      codigo: input.codigo,
      descripcion: input.descripcion,
      versionNumero: input.versionNumero,
      razonRevision: input.razonRevision,
      rechazadaPor: input.rechazadaPor,
    })

    const result = await sendEmail({
      to: destinatarios.map((u) => u.email),
      subject,
      html,
      text,
      tags: [
        { name: 'evento', value: 'muestra_rechazada' },
        { name: 'muestra_id', value: String(input.muestraId) },
      ],
    })

    logger.info('notifyMuestraRechazada: dispatched', {
      muestraId: input.muestraId,
      codigo: input.codigo,
      to: destinatarios.length,
      includeOwner: owner != null,
      passthrough: result.passthrough ?? false,
      ok: result.ok,
    })
  } catch (err) {
    logger.error('notifyMuestraRechazada: throw inesperado', {
      muestraId: input.muestraId, codigo: input.codigo, err: String(err),
    })
  }
}
