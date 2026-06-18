// ─────────────────────────────────────────────────────────────────────────────
// Mailer wrapper — Muestras Fase 7
// ─────────────────────────────────────────────────────────────────────────────
// Passthrough silencioso si RESEND_API_KEY o EMAIL_FROM no están configuradas.
// Cuando se agreguen ambas en Railway, el módulo se activa automáticamente
// y empieza a mandar emails reales.
//
// Para activar:
//   1. resend.com → crear cuenta + verificar dominio centralmillwork.com
//      (3 DNS records: SPF + DKIM + DMARC, Resend te muestra los exactos)
//   2. Copiar API key
//   3. Railway → backend (production) → Variables:
//      RESEND_API_KEY=re_...
//      EMAIL_FROM=Central Millwork <noreply@centralmillwork.com>
//   4. (opcional) Mismo en staging con DOMAIN_VERIFICADO=false → usa
//      onboarding@resend.dev como sender
//   5. Esperar redeploy
//
// Hasta entonces, sendEmail loggea via Winston (estructurado).
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from './logger'
import { captureException } from './sentry'

let resendClient: any = null
let mailerEnabled = false
let mailerFrom = ''

/**
 * Inicializa Resend si la API KEY + EMAIL_FROM están configurados.
 * Se llama una vez desde index.ts. Lazy import para no cargar el SDK
 * cuando no hay env vars (dev y CI).
 */
export async function initMailer(): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!apiKey || !from) {
    logger.info('mailer: RESEND_API_KEY/EMAIL_FROM no configurados, modo passthrough', {
      hasApiKey: !!apiKey,
      hasFrom: !!from,
    })
    return
  }

  try {
    const { Resend } = await import('resend')
    resendClient = new Resend(apiKey)
    mailerFrom = from
    mailerEnabled = true
    logger.info('mailer: Resend inicializado', { from: mailerFrom })
  } catch (err) {
    logger.error('mailer: no se pudo inicializar Resend', { err: String(err) })
  }
}

export interface SendEmailParams {
  to: string | string[]
  /** Destinatarios en copia (visibilidad sin acción requerida). */
  cc?: string | string[]
  subject: string
  /** Cuerpo HTML del mail. */
  html?: string
  /** Cuerpo plain-text (fallback para clientes que no renderizan HTML). */
  text?: string
  /** Tags para filtrado en Resend dashboard. */
  tags?: Array<{ name: string; value: string }>
}

export interface SendEmailResult {
  ok: boolean
  /** ID que Resend devuelve para tracking. Solo presente si ok=true. */
  id?: string
  /** Mensaje de error si ok=false. */
  error?: string
  /** True si el sender está en passthrough — no se mandó email real. */
  passthrough?: boolean
}

/**
 * Manda un email. Si el mailer no está inicializado (sin env vars), loggea
 * via Winston y devuelve `{ ok: true, passthrough: true }` para que el caller
 * pueda asumir "no falla" y marcar email_sent_at igual (evita re-intentos).
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (!mailerEnabled || !resendClient) {
    // Passthrough: log estructurado para visibilidad
    logger.info('mailer: passthrough (no enviado)', {
      to: params.to,
      cc: params.cc,
      subject: params.subject,
      tags: params.tags,
    })
    return { ok: true, passthrough: true }
  }

  try {
    const { data, error } = await resendClient.emails.send({
      from: mailerFrom,
      to: params.to,
      cc: params.cc,
      subject: params.subject,
      html: params.html,
      text: params.text,
      tags: params.tags,
    })

    if (error) {
      logger.error('mailer: Resend error', { error, to: params.to, subject: params.subject })
      captureException(new Error(`Resend email failed: ${error.message}`), {
        tags: { hot_path: 'sendEmail' },
        extra: { to: params.to, subject: params.subject, resendError: error },
      })
      return { ok: false, error: error.message }
    }

    logger.info('mailer: enviado', { to: params.to, subject: params.subject, id: data?.id })
    return { ok: true, id: data?.id }
  } catch (err: any) {
    logger.error('mailer: throw', { err: String(err), to: params.to, subject: params.subject })
    captureException(err, {
      tags: { hot_path: 'sendEmail' },
      extra: { to: params.to, subject: params.subject },
    })
    return { ok: false, error: err?.message ?? 'unknown' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates simples
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Template básico para notificar tarea nueva. Plain HTML + text fallback.
 * Diseño minimalista — más adelante podemos extraer a templates con MJML.
 */
export function tareaNuevaEmail(input: {
  titulo: string
  descripcion: string
  prioridad: 'high' | 'medium' | 'low'
  link?: string  // URL relativa al frontend, ej: /muestras
}): { subject: string; html: string; text: string } {
  const prioLabel = input.prioridad === 'high' ? '🔴 Alta'
                  : input.prioridad === 'medium' ? '🟡 Media'
                  : '⚪ Baja'

  const baseUrl = process.env.FRONTEND_URL || 'https://centralmillwork-frontend-production.up.railway.app'
  const fullLink = input.link ? `${baseUrl}${input.link}` : null

  const subject = `[Central Millwork] ${input.titulo}`

  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f8f6f0;">
  <div style="background: white; border-radius: 12px; padding: 24px; border-left: 4px solid #9B7200;">
    <div style="font-size: 12px; color: #6B6356; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
      Central Millwork · Nueva tarea
    </div>
    <h1 style="font-size: 18px; color: #2C3126; margin: 0 0 12px;">${escapeHtml(input.titulo)}</h1>
    <div style="font-size: 13px; color: #6B6356; margin-bottom: 16px;">Prioridad: ${prioLabel}</div>
    <div style="font-size: 14px; color: #1F1B14; white-space: pre-wrap; line-height: 1.5;">${escapeHtml(input.descripcion)}</div>
    ${fullLink ? `
    <div style="margin-top: 24px;">
      <a href="${fullLink}" style="display: inline-block; background: #4A5240; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Abrir en la app
      </a>
    </div>` : ''}
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #ECE7DC; font-size: 11px; color: #B0A89A;">
      Este es un email automático del sistema. No respondas a esta dirección.
    </div>
  </div>
</body>
</html>`.trim()

  const text = [
    `[Central Millwork] ${input.titulo}`,
    `Prioridad: ${prioLabel}`,
    '',
    input.descripcion,
    '',
    fullLink ? `Abrir: ${fullLink}` : '',
    '',
    '--',
    'Email automático del sistema.',
  ].filter((l) => l !== '').join('\n')

  return { subject, html, text }
}

/**
 * Template "Muestra enviada al cliente — esperar respuesta" — F5 Muestras
 * (2026-06-09). Se dispara cuando PROCUREMENT/ADMIN registra el envío.
 * Va al/los ENGINEERING para que estén atentos a la respuesta del cliente
 * (aprobación o rechazo) y la registren en la app cuando llegue.
 *
 * Como F4: email puro, sin crear tarea (el módulo Tareas hoy solo lo ve
 * ADMIN; ENGINEERING no entra al inbox).
 */
export function muestraEnviadaEmail(input: {
  codigo: string
  descripcion: string
  versionNumero?: number
  destinatario: string
  carrier?: string | null
  trackingNumber?: string | null
}): { subject: string; html: string; text: string } {
  const baseUrl = process.env.FRONTEND_URL || 'https://centralmillwork-frontend-production.up.railway.app'
  const link = `${baseUrl}/muestras`
  const versionTxt = input.versionNumero ? `V${input.versionNumero}` : ''
  const tracking = [input.carrier, input.trackingNumber].filter(Boolean).join(' · ')

  const subject = `[Central Millwork] Muestra ${input.codigo} enviada — esperar respuesta`

  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f8f6f0;">
  <div style="background: white; border-radius: 12px; padding: 24px; border-left: 4px solid #3B82F6;">
    <div style="font-size: 12px; color: #6B6356; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
      Central Millwork · Muestra enviada
    </div>
    <h1 style="font-size: 18px; color: #2C3126; margin: 0 0 12px;">
      ${escapeHtml(input.codigo)} ${escapeHtml(versionTxt)}
    </h1>
    <div style="font-size: 14px; color: #1F1B14; line-height: 1.5; margin-bottom: 16px;">
      ${escapeHtml(input.descripcion)}
    </div>
    <table style="width: 100%; font-size: 13px; color: #1F1B14; border-collapse: collapse; margin-bottom: 16px;">
      <tr>
        <td style="padding: 4px 0; color: #6B6356; width: 110px;">Destinatario:</td>
        <td style="padding: 4px 0;"><strong>${escapeHtml(input.destinatario)}</strong></td>
      </tr>
      ${tracking ? `
      <tr>
        <td style="padding: 4px 0; color: #6B6356;">Tracking:</td>
        <td style="padding: 4px 0;">${escapeHtml(tracking)}</td>
      </tr>` : ''}
    </table>
    <div style="font-size: 13px; color: #4A5240; background: #EBF1FB; padding: 12px 14px; border-radius: 8px; margin-bottom: 20px;">
      Cuando el cliente responda con <strong>aprobación</strong> o <strong>rechazo</strong>,
      registralo en la app transicionando la muestra al estado correspondiente.
    </div>
    <div style="margin-top: 20px;">
      <a href="${link}" style="display: inline-block; background: #4A5240; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Abrir Muestras
      </a>
    </div>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #ECE7DC; font-size: 11px; color: #B0A89A;">
      Email automático del sistema. No respondas a esta dirección.
    </div>
  </div>
</body>
</html>`.trim()

  const text = [
    `[Central Millwork] Muestra ${input.codigo} enviada — esperar respuesta`,
    '',
    `${input.codigo} ${versionTxt}`,
    input.descripcion,
    '',
    `Destinatario: ${input.destinatario}`,
    tracking ? `Tracking: ${tracking}` : '',
    '',
    'Cuando el cliente responda con aprobación o rechazo, registralo en la app transicionando la muestra al estado correspondiente.',
    '',
    `Abrir: ${link}`,
    '',
    '--',
    'Email automático del sistema.',
  ].filter((l) => l !== '').join('\n')

  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Template para "Muestra lista para QC" — Fase 4 Muestras (2026-06-09).
 *
 * Se dispara cuando una OP de tipo='MUESTRA' completa su último proceso de
 * producción y la muestra transiciona automáticamente a EN_QC. Va al/los
 * SHOP_MANAGER para que arranquen el control de calidad.
 *
 * Nota: el módulo de Tareas hoy solo lo ve el ADMIN — por eso no creamos
 * tarea sino que mandamos email directo al rol responsable.
 */
export function muestraEnQCEmail(input: {
  codigo: string
  descripcion: string
  versionNumero?: number
  opNumero?: string | null
}): { subject: string; html: string; text: string } {
  const baseUrl = process.env.FRONTEND_URL || 'https://centralmillwork-frontend-production.up.railway.app'
  const link = `${baseUrl}/muestras`
  const versionTxt = input.versionNumero ? `V${input.versionNumero}` : ''
  const opTxt = input.opNumero ? ` (OP ${input.opNumero})` : ''

  const subject = `[Central Millwork] Muestra ${input.codigo} lista para QC`

  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f8f6f0;">
  <div style="background: white; border-radius: 12px; padding: 24px; border-left: 4px solid #10B981;">
    <div style="font-size: 12px; color: #6B6356; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
      Central Millwork · Muestra lista para QC
    </div>
    <h1 style="font-size: 18px; color: #2C3126; margin: 0 0 12px;">
      ${escapeHtml(input.codigo)} ${escapeHtml(versionTxt)}${escapeHtml(opTxt)}
    </h1>
    <div style="font-size: 14px; color: #1F1B14; line-height: 1.5; margin-bottom: 16px;">
      ${escapeHtml(input.descripcion)}
    </div>
    <div style="font-size: 13px; color: #4A5240; background: #ECF8F1; padding: 12px 14px; border-radius: 8px; margin-bottom: 20px;">
      Esta muestra completó el último proceso de producción y pasó automáticamente a
      <strong>EN QC</strong>. Por favor revisá la calidad y registrá la decisión en el sistema.
    </div>
    <div style="margin-top: 20px;">
      <a href="${link}" style="display: inline-block; background: #4A5240; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Abrir Muestras
      </a>
    </div>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #ECE7DC; font-size: 11px; color: #B0A89A;">
      Email automático del sistema. No respondas a esta dirección.
    </div>
  </div>
</body>
</html>`.trim()

  const text = [
    `[Central Millwork] Muestra ${input.codigo} lista para QC`,
    '',
    `${input.codigo} ${versionTxt}${opTxt}`,
    input.descripcion,
    '',
    'Esta muestra completó el último proceso de producción y pasó automáticamente a EN QC.',
    'Por favor revisá la calidad y registrá la decisión en el sistema.',
    '',
    `Abrir: ${link}`,
    '',
    '--',
    'Email automático del sistema.',
  ].filter((l) => l !== '').join('\n')

  return { subject, html, text }
}

/**
 * Template "Muestra aprobada por QC — registrar envío al cliente" — F4.5
 * (2026-06-17). Disparado cuando SHOP_MANAGER aprueba el QC de una muestra
 * en estado EN_QC. Va a PROCUREMENT para que prepare el envío al cliente.
 *
 * El estado de la muestra se mantiene en EN_QC; la transición a ENVIADA la
 * dispara registrarEnvio cuando Procurement carga los datos del envío.
 */
export function muestraQCAprobadoEmail(input: {
  codigo: string
  descripcion: string
  versionNumero?: number
  opNumero?: string | null
  aprobadoPor?: string | null
}): { subject: string; html: string; text: string } {
  const baseUrl = process.env.FRONTEND_URL || 'https://centralmillwork-frontend-production.up.railway.app'
  const link = `${baseUrl}/muestras`
  const versionTxt = input.versionNumero ? `V${input.versionNumero}` : ''
  const opTxt = input.opNumero ? ` (OP ${input.opNumero})` : ''
  const aprobadoTxt = input.aprobadoPor ? `Aprobada por ${input.aprobadoPor}` : 'QC aprobado por Shop Manager'

  const subject = `[Central Millwork] Muestra ${input.codigo} aprobó QC — registrar envío`

  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f8f6f0;">
  <div style="background: white; border-radius: 12px; padding: 24px; border-left: 4px solid #2563EB;">
    <div style="font-size: 12px; color: #6B6356; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
      Central Millwork · Lista para envío al cliente
    </div>
    <h1 style="font-size: 18px; color: #2C3126; margin: 0 0 12px;">
      ${escapeHtml(input.codigo)} ${escapeHtml(versionTxt)}${escapeHtml(opTxt)}
    </h1>
    <div style="font-size: 14px; color: #1F1B14; line-height: 1.5; margin-bottom: 16px;">
      ${escapeHtml(input.descripcion)}
    </div>
    <div style="font-size: 13px; color: #1E40AF; background: #DBEAFE; padding: 12px 14px; border-radius: 8px; margin-bottom: 20px;">
      <strong>${escapeHtml(aprobadoTxt)}.</strong><br/>
      La muestra pasó el control de calidad. Por favor preparar y registrar el envío
      al cliente desde el sistema.
    </div>
    <div style="margin-top: 20px;">
      <a href="${link}" style="display: inline-block; background: #4A5240; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Abrir Muestras
      </a>
    </div>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #ECE7DC; font-size: 11px; color: #B0A89A;">
      Email automático del sistema. No respondas a esta dirección.
    </div>
  </div>
</body>
</html>`.trim()

  const text = [
    `[Central Millwork] Muestra ${input.codigo} aprobó QC — registrar envío`,
    '',
    `${input.codigo} ${versionTxt}${opTxt}`,
    input.descripcion,
    '',
    `${aprobadoTxt}.`,
    'La muestra pasó el control de calidad. Por favor preparar y registrar el envío al cliente.',
    '',
    `Abrir: ${link}`,
    '',
    '--',
    'Email automático del sistema.',
  ].filter((l) => l !== '').join('\n')

  return { subject, html, text }
}

/**
 * F6 (2026-06-17): Template "Muestra APROBADA por el cliente".
 * Va a PROCUREMENT + SHOP_MANAGER — cierre del ciclo de muestras.
 */
export function muestraAprobadaEmail(input: {
  codigo: string
  descripcion: string
  versionNumero?: number
  aprobadaPor?: string | null
  proyectoCodigo?: string | null
}): { subject: string; html: string; text: string } {
  const baseUrl = process.env.FRONTEND_URL || 'https://centralmillwork-frontend-production.up.railway.app'
  const link = `${baseUrl}/muestras`
  const versionTxt = input.versionNumero ? `V${input.versionNumero}` : ''
  const aprobadaTxt = input.aprobadaPor ? `Aprobada por ${input.aprobadaPor}` : 'Cliente aprobó la muestra'
  const proyectoTxt = input.proyectoCodigo ? ` · Proyecto ${input.proyectoCodigo}` : ''

  const subject = `[Central Millwork] Muestra ${input.codigo} APROBADA por el cliente`

  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f8f6f0;">
  <div style="background: white; border-radius: 12px; padding: 24px; border-left: 4px solid #10B981;">
    <div style="font-size: 12px; color: #6B6356; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
      Central Millwork · Muestra aprobada${escapeHtml(proyectoTxt)}
    </div>
    <h1 style="font-size: 18px; color: #2C3126; margin: 0 0 12px;">
      ✅ ${escapeHtml(input.codigo)} ${escapeHtml(versionTxt)}
    </h1>
    <div style="font-size: 14px; color: #1F1B14; line-height: 1.5; margin-bottom: 16px;">
      ${escapeHtml(input.descripcion)}
    </div>
    <div style="font-size: 13px; color: #047857; background: #D1FAE5; padding: 12px 14px; border-radius: 8px; margin-bottom: 20px;">
      <strong>${escapeHtml(aprobadaTxt)}.</strong><br/>
      El ciclo de muestras cerró exitosamente. La muestra queda registrada en el
      catálogo de muestras aprobadas del proyecto.
    </div>
    <div style="margin-top: 20px;">
      <a href="${link}" style="display: inline-block; background: #4A5240; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Abrir Muestras
      </a>
    </div>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #ECE7DC; font-size: 11px; color: #B0A89A;">
      Email automático del sistema. No respondas a esta dirección.
    </div>
  </div>
</body>
</html>`.trim()

  const text = [
    `[Central Millwork] Muestra ${input.codigo} APROBADA por el cliente`,
    '',
    `${input.codigo} ${versionTxt}${proyectoTxt}`,
    input.descripcion,
    '',
    `${aprobadaTxt}.`,
    'El ciclo de muestras cerró exitosamente. La muestra queda registrada en el catálogo del proyecto.',
    '',
    `Abrir: ${link}`,
    '',
    '--',
    'Email automático del sistema.',
  ].filter((l) => l !== '').join('\n')

  return { subject, html, text }
}

/**
 * F6 (2026-06-17): Template "Muestra RECHAZADA por el cliente".
 * Va a PROCUREMENT + SHOP_MANAGER + owner (para crear V+1).
 */
export function muestraRechazadaEmail(input: {
  codigo: string
  descripcion: string
  versionNumero?: number
  razonRevision?: string | null
  rechazadaPor?: string | null
}): { subject: string; html: string; text: string } {
  const baseUrl = process.env.FRONTEND_URL || 'https://centralmillwork-frontend-production.up.railway.app'
  const link = `${baseUrl}/muestras`
  const versionTxt = input.versionNumero ? `V${input.versionNumero}` : ''
  const rechazadaTxt = input.rechazadaPor ? `Rechazada por ${input.rechazadaPor}` : 'Cliente rechazó la muestra'
  const razonTxt = input.razonRevision?.trim() || '(sin razón especificada)'

  const subject = `[Central Millwork] Muestra ${input.codigo} RECHAZADA — preparar V${(input.versionNumero ?? 1) + 1}`

  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f8f6f0;">
  <div style="background: white; border-radius: 12px; padding: 24px; border-left: 4px solid #9F3818;">
    <div style="font-size: 12px; color: #6B6356; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
      Central Millwork · Muestra rechazada — preparar próxima versión
    </div>
    <h1 style="font-size: 18px; color: #2C3126; margin: 0 0 12px;">
      ❌ ${escapeHtml(input.codigo)} ${escapeHtml(versionTxt)}
    </h1>
    <div style="font-size: 14px; color: #1F1B14; line-height: 1.5; margin-bottom: 16px;">
      ${escapeHtml(input.descripcion)}
    </div>
    <div style="font-size: 13px; color: #9F3818; background: #FEE2E2; padding: 12px 14px; border-radius: 8px; margin-bottom: 12px;">
      <strong>${escapeHtml(rechazadaTxt)}.</strong>
    </div>
    <div style="font-size: 13px; color: #4A5240; background: #FFF7DC; padding: 12px 14px; border-radius: 8px; margin-bottom: 20px;">
      <div style="font-weight: 600; margin-bottom: 4px;">Razón de revisión:</div>
      <div style="white-space: pre-wrap;">${escapeHtml(razonTxt)}</div>
    </div>
    <div style="margin-top: 20px;">
      <a href="${link}" style="display: inline-block; background: #4A5240; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Abrir Muestras
      </a>
    </div>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #ECE7DC; font-size: 11px; color: #B0A89A;">
      Email automático del sistema. No respondas a esta dirección.
    </div>
  </div>
</body>
</html>`.trim()

  const text = [
    `[Central Millwork] Muestra ${input.codigo} RECHAZADA — preparar V${(input.versionNumero ?? 1) + 1}`,
    '',
    `${input.codigo} ${versionTxt}`,
    input.descripcion,
    '',
    `${rechazadaTxt}.`,
    '',
    `Razón de revisión: ${razonTxt}`,
    '',
    `Abrir: ${link}`,
    '',
    '--',
    'Email automático del sistema.',
  ].filter((l) => l !== '').join('\n')

  return { subject, html, text }
}
