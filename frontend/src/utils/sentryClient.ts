// ─────────────────────────────────────────────────────────────────────────────
// Sentry client wrapper — Audit Fix A6
// ─────────────────────────────────────────────────────────────────────────────
// Passthrough silencioso si VITE_SENTRY_DSN no está configurado. Cuando se
// agregue la DSN como env var en Railway frontend, este módulo se activa
// automáticamente y empieza a reportar.
//
// Para activar:
//   1. Crear cuenta en sentry.io (free tier — 5k events/mes)
//   2. Crear proyecto "centralmillwork-frontend" tipo React
//   3. Copiar la DSN
//   4. Railway → frontend → Variables → VITE_SENTRY_DSN=<dsn>
//   5. Redeploy frontend
//
// Hasta entonces, captureException loggea a consola.
// ─────────────────────────────────────────────────────────────────────────────

const DSN = import.meta.env.VITE_SENTRY_DSN

let sentryInitialized = false
let sentryModule: any = null

/**
 * Inicializa Sentry si la DSN está configurada. Se llama una vez desde main.tsx
 * antes de renderizar la app.
 */
export async function initSentry(): Promise<void> {
  if (sentryInitialized) return
  if (!DSN) {
    console.log('[sentry] DSN no configurada, modo passthrough')
    return
  }

  try {
    sentryModule = await import('@sentry/react')
    sentryModule.init({
      dsn: DSN,
      environment: import.meta.env.MODE,
      // Conservador para evitar spam de eventos
      tracesSampleRate: 0.1,
      // Capturar replays solo en errores
      replaysOnErrorSampleRate: 1.0,
      replaysSessionSampleRate: 0,
      // No mandar errores cancelados por router/navegación
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        /AbortError/i,
      ],
    })
    sentryInitialized = true
    console.log('[sentry] inicializado en', import.meta.env.MODE)
  } catch (err) {
    console.warn('[sentry] no se pudo inicializar:', err)
  }
}

/**
 * Reporta un error a Sentry. Si no está inicializado, loggea a consola.
 * Llamado desde ErrorBoundary y desde catches estratégicos en mutations.
 */
export function captureException(
  error: unknown,
  context?: { tags?: Record<string, string>; extra?: Record<string, unknown> }
): void {
  if (sentryInitialized && sentryModule) {
    sentryModule.captureException(error, context)
  } else {
    console.error('[captureException]', error, context)
  }
}

/**
 * Establece el usuario actual para correlacionar errores con accounts.
 * Llamado desde AuthContext al loguear / desloguear.
 */
export function setUser(user: { id: string; email: string; rol?: string } | null): void {
  if (!sentryInitialized || !sentryModule) return
  if (user) {
    sentryModule.setUser({ id: user.id, email: user.email, rol: user.rol })
  } else {
    sentryModule.setUser(null)
  }
}
