// ─────────────────────────────────────────────────────────────────────────────
// Notificaciones al cliente (portal) — Fase 1
// ─────────────────────────────────────────────────────────────────────────────
// Capa fina entre los eventos del flujo (plan listo / algo por aprobar / acuse)
// y el mailer. Resuelve el token ACTIVO del proyecto (para el link) y su email
// de contacto, arma la URL del portal y manda el email correspondiente.
//
// DEGRADACIÓN SEGURA (doble gate): esto es 100% inerte hasta que
//   (1) el token del cliente tenga contacto_email cargado, Y
//   (2) el mailer esté configurado (RESEND_API_KEY + EMAIL_FROM) — si no,
//       sendEmail hace passthrough (solo loguea).
// Por eso se puede deployar sin riesgo antes de activar Resend: no manda nada.
//
// SIEMPRE best-effort: cualquier fallo se loguea y se traga — un email no puede
// tumbar una transición del deal ni una aprobación.

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { logger } from '../../../utils/logger'
import {
  sendEmail,
  portalPlanListoEmail,
  portalAlgoPorAprobarEmail,
  portalDecisionRecibidaEmail,
} from '../../../utils/mailer'

type QueryRunner = PoolClient | typeof pool

export type PortalNotifTipo = 'plan_listo' | 'algo_por_aprobar' | 'decision_recibida'

// Etiqueta EN, para el cliente, de cada hito aprobable (los emails van en inglés).
export const PORTAL_LABEL_EN: Record<string, string> = {
  PLAN: 'your project schedule',
  'E-05': 'Samples',
  'E-07': 'Shop drawings',
  'I-07': 'Final delivery',
}

interface PortalNotifExtra {
  /** Para 'algo_por_aprobar' y 'decision_recibida': qué es (p.ej. "Shop drawings"). */
  que?: string
  /** Para 'decision_recibida': si el cliente aprobó (vs. rechazó/comentó). */
  aprobado?: boolean
}

function portalBaseUrl(): string {
  return process.env.FRONTEND_URL || 'https://centralmillwork-frontend-production.up.railway.app'
}

/**
 * Manda (si corresponde) el email del portal al contacto del cliente. No lanza:
 * loguea y sigue. No manda si el proyecto no tiene token activo con email.
 */
export async function notifyPortalCliente(
  runner: QueryRunner,
  proyectoId: number,
  tipo: PortalNotifTipo,
  extra: PortalNotifExtra = {}
): Promise<void> {
  try {
    const { rows } = await runner.query<{ token: string; contacto_nombre: string | null; contacto_email: string | null }>(
      `SELECT token, contacto_nombre, contacto_email
         FROM schedule_portal_tokens
        WHERE proyecto_id = $1 AND activo = true
        ORDER BY created_at DESC LIMIT 1`, [proyectoId])
    const tok = rows[0]
    if (!tok?.contacto_email) {
      // Sin email del cliente → no hay a quién mandarle. Silencioso a nivel info.
      logger.info('notifyPortal: sin email de contacto, no se envía', { proyectoId, tipo })
      return
    }

    const { rows: pr } = await runner.query<{ nombre: string | null }>(
      `SELECT nombre FROM proyectos WHERE id = $1`, [proyectoId])
    const proyecto = pr[0]?.nombre ?? 'your project'
    const portalUrl = `${portalBaseUrl()}/portal/${tok.token}`
    const contacto = tok.contacto_nombre

    let mail: { subject: string; html: string; text: string }
    switch (tipo) {
      case 'plan_listo':
        mail = portalPlanListoEmail({ proyecto, contacto, portalUrl })
        break
      case 'algo_por_aprobar':
        mail = portalAlgoPorAprobarEmail({ proyecto, contacto, que: extra.que ?? 'An item', portalUrl })
        break
      case 'decision_recibida':
        mail = portalDecisionRecibidaEmail({ proyecto, contacto, que: extra.que ?? 'your review', aprobado: extra.aprobado ?? true, portalUrl })
        break
    }

    const res = await sendEmail({
      to: tok.contacto_email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tags: [{ name: 'kind', value: `portal_${tipo}` }],
    })
    if (!res.ok) logger.warn('notifyPortal: sendEmail falló', { proyectoId, tipo, error: res.error })
  } catch (err) {
    logger.warn('notifyPortal: excepción (best-effort, se ignora)', { proyectoId, tipo, err: String(err) })
  }
}
