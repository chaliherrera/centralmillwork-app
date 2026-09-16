// ─── Guardas de proceso ──────────────────────────────────────────────────────
//
// ESTE MÓDULO SE IMPORTA PRIMERO en index.ts (justo después de dotenv), ANTES
// que cualquier otro módulo, a propósito: registra el handler de
// `unhandledRejection` antes de que se evalúe el import de middleware/rateLimit,
// que dispara trabajo async al cargarse.
//
// EL PROBLEMA QUE RESUELVE (recrea el fix d36b754, que quedó solo en la Windows)
// El library @acpr/rate-limit-postgresql tiene un bug de raíz: el constructor de
// `PostgresStore` llama `applyMigrations(config)` SIN await (fire-and-forget).
// Como en rateLimit.ts creamos tres stores (global, login, kiosk) en el tope del
// módulo, esos tres `applyMigrations` quedan corriendo sueltos. Corren en
// paralelo con `initRateLimitStore()`, que hace DROP TABLE public.migrations +
// migrate() para rehacer el schema del limiter bien. Si la promesa suelta
// consulta la tabla justo después del DROP → error 42P01 (relation does not
// exist) → unhandledRejection → con el default de Node (`throw`) MATA el proceso
// al arrancar. Es una CARRERA, y se pierde según la velocidad de la máquina: en
// la MacBook (Apple Silicon) crasheaba en TODOS los boots; en Railway suele
// ganar la promesa suelta y pasa inadvertido, pero el riesgo está latente (más
// con 2 réplicas).
//
// EL FIX — DIRIGIDO, NO GENERAL. Ignoramos SOLO los rechazos que tienen la firma
// de esa carrera Y solo durante la ventana de boot. Cualquier otro rechazo (o
// uno de esta firma pero pasada la ventana) mantiene el crash por defecto de
// Node, para NO esconder bugs reales. Cada rechazo ignorado se loguea a ERROR y
// se manda a Sentry, así queda visible en vez de ser un crash silencioso.
import { logger } from './logger'
import { captureException } from './sentry'

// La carrera solo ocurre en el arranque. Pasada esta ventana, un
// unhandledRejection es un bug real y tiene que crashear.
const BOOT_GRACE_MS = 30_000
const bootStart = Date.now()

// Firma de la carrera del fire-and-forget del limiter contra initRateLimitStore:
// tablas del tracker (public.migrations / schema del rate_limit) que aparecen o
// desaparecen mientras se rehace el schema.
function esCarreraDelRateLimiter(reason: unknown): boolean {
  const code = (reason as { code?: string } | null)?.code
  const msg = reason instanceof Error ? reason.message : String(reason)
  return (
    code === '42P01' || // undefined_table (relation does not exist tras el DROP)
    code === '42P07' || // duplicate_table (creación concurrente de public.migrations)
    code === '23505' || // unique_violation (idem, carrera creando el tracker)
    /\bmigrations\b|rate_limit/i.test(msg)
  )
}

let installed = false

export function installProcessGuards(): void {
  if (installed) return
  installed = true

  process.on('unhandledRejection', (reason: unknown) => {
    const detalle =
      reason instanceof Error
        ? { name: reason.name, message: reason.message, stack: reason.stack, code: (reason as any).code }
        : String(reason)

    const enVentanaDeBoot = Date.now() - bootStart < BOOT_GRACE_MS
    if (enVentanaDeBoot && esCarreraDelRateLimiter(reason)) {
      logger.error('unhandledRejection del rate-limiter en el boot — ignorado, el proceso sigue', { reason: detalle })
      try {
        captureException(reason, { tags: { source: 'unhandledRejection', ignorado: 'rate-limiter-boot' } })
      } catch {
        /* nunca dejar que el propio handler tire otro rejection */
      }
      return
    }

    // Cualquier otro rechazo: NO lo escondemos. Lo re-lanzamos para que Node
    // haga su crash por defecto (queda como uncaughtException con stack), igual
    // que sin este handler — así no tapamos bugs reales.
    logger.error('unhandledRejection NO esperado — se re-lanza (crash por defecto de Node)', { reason: detalle })
    throw reason
  })
}

// Registrar sincrónicamente al importar, para ganarle a cualquier trabajo async
// de los imports que vienen después.
installProcessGuards()
