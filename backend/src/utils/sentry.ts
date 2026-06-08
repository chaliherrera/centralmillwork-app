// ─────────────────────────────────────────────────────────────────────────────
// Sentry wrapper backend — Audit roadmap "ahora #1"
// ─────────────────────────────────────────────────────────────────────────────
// Passthrough silencioso si SENTRY_DSN no está configurado en env. Cuando se
// agregue la DSN en Railway → backend → Variables, el módulo se activa
// automáticamente y empieza a reportar errores 500 + hot paths críticos.
//
// Para activar:
//   1. sentry.io → crear proyecto "centralmillwork-backend" tipo Node.js
//   2. Copiar DSN
//   3. Railway → centralmillwork-backend (production) → Variables → SENTRY_DSN=<dsn>
//   4. (opcional) Mismo en staging
//   5. Esperar redeploy
//
// Hasta entonces, captureException loggea via Winston (que ya hace estructurado).
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from './logger'

let sentryInitialized = false
let Sentry: typeof import('@sentry/node') | null = null

/**
 * Inicializa Sentry si la DSN está configurada. Se llama UNA vez desde
 * index.ts antes de iniciar el servidor Express.
 *
 * Lazy import para que el SDK no se cargue (ni memoria ni warm-up) cuando
 * no hay DSN — útil en dev y CI.
 */
export async function initSentry(): Promise<void> {
  if (sentryInitialized) return

  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    logger.info('sentry: SENTRY_DSN no configurada, modo passthrough')
    return
  }

  try {
    Sentry = await import('@sentry/node')
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      // Conservador: 10% de transacciones tracedadas (mantener bajo 5k events/mes free tier)
      tracesSampleRate: 0.1,
      // Solo errores significativos al inicio — sin replays ni profiling
      sendDefaultPii: false,
      // Ignorar errores esperados del flow normal
      ignoreErrors: [
        // Rate limit hits son esperados, no son bugs
        'Too many requests',
        // 4xx genéricos que ya manejamos
        /AbortError/i,
      ],
      beforeSend(event, hint) {
        // No mandar errores 4xx genéricos (client errors) — solo 500+
        const status = (hint?.originalException as any)?.statusCode
        if (typeof status === 'number' && status < 500) return null
        return event
      },
    })
    sentryInitialized = true
    logger.info('sentry: inicializado', { environment: process.env.NODE_ENV })
  } catch (err) {
    logger.warn('sentry: no se pudo inicializar', { err: String(err) })
  }
}

interface CaptureContext {
  /** Tags estructurados para filtrar en Sentry. */
  tags?: Record<string, string | number | boolean>
  /** Extra context (no indexable pero visible). */
  extra?: Record<string, unknown>
  /** Usuario asociado al request (si está disponible). */
  user?: { id: string; email?: string; rol?: string }
  /** Request ID para correlación con logs. */
  requestId?: string
}

/**
 * Reporta una excepción a Sentry con tags estructurados. Si Sentry no está
 * inicializado, loggea a Winston (que ya estructura).
 *
 * Llamar desde: errorHandler middleware, catches estratégicos en hot paths.
 */
export function captureException(err: unknown, ctx: CaptureContext = {}): void {
  if (sentryInitialized && Sentry) {
    Sentry.withScope((scope) => {
      if (ctx.tags) {
        for (const [k, v] of Object.entries(ctx.tags)) {
          scope.setTag(k, String(v))
        }
      }
      if (ctx.extra) {
        for (const [k, v] of Object.entries(ctx.extra)) {
          scope.setExtra(k, v)
        }
      }
      if (ctx.user) {
        scope.setUser({ id: ctx.user.id, email: ctx.user.email })
      }
      if (ctx.requestId) {
        scope.setTag('requestId', ctx.requestId)
      }
      Sentry!.captureException(err)
    })
  } else {
    // Passthrough: Winston ya tiene shape estructurado, le pasamos todo
    logger.error('captureException (sentry off)', {
      err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
      ...ctx,
    })
  }
}

/**
 * Reporta un mensaje (no excepción) a Sentry. Útil para warnings de business
 * que vale la pena ver (ej: "ningún operario asignado en estación X").
 */
export function captureMessage(
  message: string,
  level: 'warning' | 'error' = 'warning',
  ctx: CaptureContext = {}
): void {
  if (sentryInitialized && Sentry) {
    Sentry.withScope((scope) => {
      if (ctx.tags) for (const [k, v] of Object.entries(ctx.tags)) scope.setTag(k, String(v))
      if (ctx.extra) for (const [k, v] of Object.entries(ctx.extra)) scope.setExtra(k, v)
      if (ctx.user) scope.setUser({ id: ctx.user.id, email: ctx.user.email })
      if (ctx.requestId) scope.setTag('requestId', ctx.requestId)
      Sentry!.captureMessage(message, level)
    })
  } else {
    logger.warn(message, ctx)
  }
}
