import rateLimit from 'express-rate-limit'
import { PostgresStore } from '@acpr/rate-limit-postgresql'
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
