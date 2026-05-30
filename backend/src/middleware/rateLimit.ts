import rateLimit from 'express-rate-limit'
import { PostgresStore } from '@acpr/rate-limit-postgresql'
import { Client } from 'pg'
import { migrate } from 'postgres-migrations'
import path from 'path'
import { logger } from '../utils/logger'

// Config de conexión para la store: misma lógica que el pool principal,
// para que en Railway use DATABASE_URL y en local caiga a las vars individuales.
const rlDbConfig = (() => {
  const cs = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL
  if (cs) return { connectionString: cs, ssl: { rejectUnauthorized: false } }
  return {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'centralmillwork',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  }
})()

// Global limiter: aplica a todas las rutas de /api/*. Generoso para no
// molestar a usuarios reales del equipo, pero corta abusos automatizados.
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Necesario porque app.set('trust proxy', true) en index.ts dispara la
  // validación "ERR_ERL_PERMISSIVE_TRUST_PROXY" del módulo. La aceptamos
  // conscientemente: confiamos en que Railway sanitiza X-Forwarded-For.
  validate: { trustProxy: false, xForwardedForHeader: false },
  // Store compartido en Postgres: evita que distintas réplicas del backend
  // service tengan contadores fragmentados. La librería crea sus tablas sola.
  store: new PostgresStore(rlDbConfig, 'rl_global'),
  message: { message: 'Demasiadas solicitudes — esperá un momento e intentá de nuevo.' },
  handler: (req, res, _next, options) => {
    logger.warn('ratelimit hit (global)', { requestId: req.id, ip: req.ip, path: req.path })
    res.status(options.statusCode).json(options.message)
  },
})

// Login limiter: estricto para defender contra brute-force de credenciales.
// 5 intentos por 15 min por IP. Después de eso, 429 hasta que pase la ventana.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  store: new PostgresStore(rlDbConfig, 'rl_login'),
  message: { message: 'Demasiados intentos de login — esperá 15 minutos e intentá de nuevo.' },
  handler: (req, res, _next, options) => {
    logger.warn('ratelimit hit (login)', { requestId: req.id, ip: req.ip, email: req.body?.email ?? '?' })
    res.status(options.statusCode).json(options.message)
  },
  // No contar intentos exitosos: si vos te logueás bien 6 veces seguidas, no
  // quedás bloqueado. Solo contamos los fallidos (4xx/5xx).
  skipSuccessfulRequests: true,
})

// ─── Setup del store de rate_limit al boot ──────────────────────────────────
//
// El library @acpr/rate-limit-postgresql tiene un bug de raíz: en el
// constructor de PostgresStore llama `applyMigrations(config)` SIN await
// (fire-and-forget). El constructor retorna inmediatamente, el server arranca,
// y las requests pueden llegar ANTES de que las migraciones terminen → 500
// con "relation does not exist". Además, si el schema viene en estado
// inconsistente (ej. pg_dump clone de otra DB), las migraciones fallan
// silenciosamente y el server queda crasheando en cada request al limiter.
//
// Fix: hacemos el setup nosotros antes de aceptar tráfico:
//   1. DROP schema rate_limit + DROP public.migrations (la tabla de tracking
//      que usa postgres-migrations) — garantiza estado limpio
//   2. await migrate() con el folder de migraciones del library — espera a que
//      todas las migraciones se apliquen
//   3. Recién después de esto el server hace app.listen()
//
// Trade-off: contadores de rate limit se pierden en cada restart. Aceptable:
//   - Restarts son poco frecuentes (deploys, reboots manuales)
//   - Ventanas cortas (1 min global, 15 min login/kiosk)
//   - Un atacante que aproveche un restart para resetear su ventana es un
//     riesgo chico vs el costo del server caído al boot.
//
// Si el setup falla (DB inaccesible, etc.) se loguea como ERROR pero el boot
// sigue — el library va a fallar más tarde y queda visible en logs en vez de
// un crash silencioso al startup.
export async function initRateLimitStore(): Promise<void> {
  const client = new Client(rlDbConfig as any)
  try {
    await client.connect()
    await client.query('DROP SCHEMA IF EXISTS rate_limit CASCADE')
    await client.query('DROP TABLE IF EXISTS public.migrations')

    // Resolvemos el folder de migraciones en runtime. NO podemos hacer
    // require.resolve(.../package.json) porque el package tiene un "exports"
    // field que solo expone el entry point (subpath imports bloqueados con
    // ERR_PACKAGE_PATH_NOT_EXPORTED). Por eso resolvemos el main entry y de
    // ahí derivamos el folder hermano de migrations.
    const mainEntry = require.resolve('@acpr/rate-limit-postgresql')
    // mainEntry → .../node_modules/@acpr/rate-limit-postgresql/dist/index.cjs
    // migrationsDir → .../node_modules/@acpr/rate-limit-postgresql/dist/migrations
    const migrationsDir = path.join(path.dirname(mainEntry), 'migrations')
    await migrate({ client }, migrationsDir)

    logger.info('rate-limit store init OK')
  } catch (err) {
    logger.error('rate-limit store init FAILED — el limiter va a crashear', {
      err: String(err),
    })
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }
}
// Kiosk login limiter: PIN de 4 dígitos = 10K combinaciones, fácil de
// brute-forcear sin rate limit. Más permisivo que login (operarios reales se
// equivocan tipeando) pero igual corta abusos. 10 intentos por 15 min por IP.
export const kioskLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  store: new PostgresStore(rlDbConfig, 'rl_kiosk_login'),
  message: { message: 'Demasiados intentos. Esperá 15 minutos antes de volver a intentar.' },
  handler: (req, res, _next, options) => {
    logger.warn('ratelimit hit (kiosk login)', { requestId: req.id, ip: req.ip, dispositivo: req.body?.dispositivo ?? '?' })
    res.status(options.statusCode).json(options.message)
  },
  skipSuccessfulRequests: true,
})
