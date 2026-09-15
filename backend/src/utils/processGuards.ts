// ─── Guardas de proceso ──────────────────────────────────────────────────────
//
// ESTE MÓDULO SE IMPORTA PRIMERO en index.ts (justo después de dotenv), ANTES
// que cualquier otro módulo, a propósito: registra el handler de
// `unhandledRejection` antes de que se evalúe el import de middleware/rateLimit,
// que dispara trabajo async al cargarse.
//
// EL PROBLEMA QUE RESUELVE
// El library @acpr/rate-limit-postgresql tiene un bug de raíz: el constructor de
// `PostgresStore` llama `applyMigrations(config)` SIN await (fire-and-forget).
// Como en rateLimit.ts creamos tres stores (global, login, kiosk) en el tope del
// módulo, esos tres `applyMigrations` quedan corriendo sueltos. Si alguno
// rechaza —típicamente porque `initRateLimitStore()` está haciendo
// DROP SCHEMA rate_limit + migrate() en paralelo, o porque la DB tarda en el
// boot— la promesa rechazada no tiene `.catch` (no tenemos la referencia, es
// interna del library). Con el comportamiento por defecto de Node
// (`--unhandled-rejections=throw`), un unhandledRejection MATA el proceso.
//
// En Railway eso se ve como un backend que crashea en cada restart/deploy hasta
// que, por suerte, una corrida gana la carrera. El workaround temporal era
// arrancar con `NODE_OPTIONS=--unhandled-rejections=warn`, que degrada TODOS los
// rejections de throw→warn a nivel de proceso. Este handler hace lo mismo pero
// desde el código (no depende de una env var que se puede olvidar) y además:
//   - loguea el rejection a nivel ERROR (winston, estructurado)
//   - lo manda a Sentry si está configurado
// así el crash silencioso pasa a ser un error visible con el proceso vivo.
//
// TRADE-OFF (leer): esto NO distingue el rejection del library de un rejection
// real de un bug nuestro — igual que hacía la env var. Un rejection no manejado
// que antes habría tumbado el proceso ahora queda logueado y el server sigue.
// Es aceptable para este sistema (un solo equipo, prod chica) y estrictamente
// mejor que la env var porque queda registrado. Si algún día aparece un
// rejection recurrente que NO sea del rate-limiter, va a estar en los logs/Sentry
// con su stack para investigarlo. `uncaughtException` se deja con el
// comportamiento por defecto de Node (crash), que es lo correcto: ahí el proceso
// sí puede estar en estado inconsistente.
import { logger } from './logger'
import { captureException } from './sentry'

let installed = false

export function installProcessGuards(): void {
  if (installed) return
  installed = true

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('unhandledRejection capturado — el proceso sigue vivo', {
      reason:
        reason instanceof Error
          ? { name: reason.name, message: reason.message, stack: reason.stack }
          : String(reason),
    })
    // No await: captureException es fire-and-forget seguro (tiene su propio
    // passthrough a winston si Sentry está apagado).
    try {
      captureException(reason, { tags: { source: 'unhandledRejection' } })
    } catch {
      /* nunca dejar que el propio handler tire otro rejection */
    }
  })
}

// Registrar en el momento en que se importa el módulo, sincrónicamente, para
// ganarle a cualquier trabajo async de los imports que vienen después.
installProcessGuards()
