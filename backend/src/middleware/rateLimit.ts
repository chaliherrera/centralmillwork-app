import rateLimit from 'express-rate-limit'

// Global limiter: aplica a todas las rutas de /api/*. Generoso para no
// molestar a usuarios reales del equipo, pero corta abusos automatizados.
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Demasiadas solicitudes — esperá un momento e intentá de nuevo.' },
  handler: (req, res, _next, options) => {
    console.warn(`[ratelimit] global hit | ip=${req.ip} | path=${req.path}`)
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
  message: { message: 'Demasiados intentos de login — esperá 15 minutos e intentá de nuevo.' },
  handler: (req, res, _next, options) => {
    console.warn(`[ratelimit] login hit | ip=${req.ip} | email=${req.body?.email ?? '?'}`)
    res.status(options.statusCode).json(options.message)
  },
  // No contar intentos exitosos: si vos te logueás bien 6 veces seguidas, no
  // quedás bloqueado. Solo contamos los fallidos (4xx/5xx).
  skipSuccessfulRequests: true,
})
