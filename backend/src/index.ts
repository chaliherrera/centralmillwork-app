// Carga .env ANTES de importar pool.ts u otros módulos que lean process.env.
// Sin esto, pool.ts (importado más abajo) leía process.env vacío y caía a
// defaults hardcoded ('centralmillwork', 'postgres'), funcionando solo por
// coincidencia en setups locales. En ambientes con DB_NAME distinto al default
// (staging, dev fresh, prodtest), el server se conectaba a la DB equivocada.
// Mismo patrón ya aplicado en migrate.ts, seed.ts, seedAdmin.ts (commit 77c299d).
import 'dotenv/config'

import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import router from './routes'
import authRouter from './routes/auth'
import kioskRouter from './routes/kiosk'
import webhooksRouter from './routes/webhooks'
import { syncSystemTareas } from './jobs/tareasFromSystem'
import { authenticate } from './middleware/auth'
import { errorHandler, notFound } from './middleware/errorHandler'
import { globalLimiter, loginLimiter, initRateLimitStore } from './middleware/rateLimit'
import cron from 'node-cron'
import pool from './db/pool'
import { requestId } from './middleware/requestId'
import { logger } from './utils/logger'
import { initSentry } from './utils/sentry'

// Load .env only in development — Railway injects env vars directly into process.env
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../.env') })
}

logger.info('boot', { jwtSecret: process.env.JWT_SECRET ? 'configurado' : 'MISSING — auth will fail' })

// Audit roadmap "ahora #1": Sentry init lazy (passthrough si SENTRY_DSN no
// está configurada). Fire-and-forget para no bloquear el boot.
initSentry().catch((err) => logger.warn('sentry init failed', { err: String(err) }))

const app  = express()
const PORT = process.env.PORT ?? 4000

// Railway corre detrás de varios proxies (Fastly CDN + Railway edge), no uno solo.
// 'trust proxy=true' hace que Express tome el primer IP del X-Forwarded-For
// (el cliente real) en vez de un IP de proxy intermedio.
// Sin esto, el rate-limit cuenta por proxy en vez de por cliente, lo que en
// pruebas se traducía en contadores fragmentados (cada request "frescaba" la
// ventana porque cada proxy tenía su propio counter).
app.set('trust proxy', true)

// Asignar request ID muy temprano para que esté disponible en todos los logs.
app.use(requestId)

// Headers de seguridad HTTP estándar (defense-in-depth):
//   - X-Content-Type-Options: nosniff (anti MIME sniffing)
//   - X-Frame-Options: DENY (anti clickjacking)
//   - Strict-Transport-Security (forzar HTTPS — ya lo hace Railway pero es bueno tenerlo)
//   - Referrer-Policy, X-DNS-Prefetch-Control, etc.
// contentSecurityPolicy desactivado porque interfiere con el SPA de Vite/React en dev
// y los reportes HTML dinámicos. Si queremos CSP estricto, hay que configurarlo
// con allowlist específico para el dominio.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}))

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Serve uploaded files
const uploadsDir = path.join(__dirname, '../uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
app.use('/uploads', express.static(uploadsDir))

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }))

// Rate limiting global a todo /api/* (incluye auth y rutas autenticadas).
// Stricter limit en /api/auth/login para defender contra brute-force.
app.use('/api', globalLimiter)
app.use('/api/auth/login', loginLimiter)

// Public auth routes — must come before authenticate middleware
app.use('/api/auth', authRouter)

// Kiosk routes — sistema de auth separado (PIN → JWT con shape distinto).
// El router maneja sus propias rutas públicas (login) y protegidas
// (todo lo demás vía authenticateKiosk).
app.use('/api/kiosk', kioskRouter)

// Webhooks (machine-to-machine, autenticados con WEBHOOK_API_TOKEN, no JWT).
// Deben ir ANTES del authenticate global para que no exija JWT de usuario.
app.use('/api/webhooks', webhooksRouter)

// All other API routes require a valid JWT
app.use('/api', authenticate, router)

// In production: serve the compiled React frontend from frontend/dist/
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../../frontend/dist')
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')))
} else {
  app.use(notFound)
}

app.use(errorHandler)

// Startup async: setup completo del store de rate_limit ANTES de aceptar
// tráfico. Ver el comentario gigante en middleware/rateLimit.ts — el library
// tiene un fire-and-forget en su constructor que causa crashes silenciosos.
// initRateLimitStore() corre las migraciones del library con AWAIT, así
// garantizamos que el schema está listo antes de app.listen.
;(async () => {
  await initRateLimitStore()

  app.listen(PORT, () => {
    logger.info('server listening', { port: PORT, url: `http://localhost:${PORT}` })

    // Sistema de tareas auto-generadas desde la DB (cotizaciones estancadas,
    // ETAs, etc.). Corre dos veces al día: 07:00 y 14:00 hora local.
    //
    // Antes corría cada 30 min (excesivo para el ritmo del taller). Cambio
    // motivado por el bump a 2 réplicas del backend — con setInterval
    // ambas réplicas dispararían el job en paralelo. Ahora:
    //   1. Cron expresado en cron-syntax con timezone explícito
    //   2. Advisory lock vía pg_try_advisory_lock antes de correr — solo
    //      UNA réplica gana el lock por fire; las otras skippean limpio
    //   3. Lock liberado en finally para evitar deadlocks si el job tira
    //
    // Si querés cambiar la zona horaria, settealo en la env var TZ del
    // servicio en Railway. Por defecto usa America/Mexico_City.
    const SYNC_TIMEZONE = process.env.SYSTEM_SYNC_TZ || 'America/Mexico_City'
    const SYNC_CRON     = '0 7,13 * * *'   // minuto 0 de las horas 7 (AM) y 13 (1 PM)
    const LEADER_LOCK_KEY = 4751923         // arbitrario, cualquier int único
    const runSystemSync = async () => {
      const client = await pool.connect()
      let gotLock = false
      try {
        const { rows } = await client.query(
          'SELECT pg_try_advisory_lock($1) AS got', [LEADER_LOCK_KEY]
        )
        gotLock = rows[0].got
        if (!gotLock) {
          logger.info('system tareas sync skipped (otra replica tiene el lock)')
          return
        }
        const result = await syncSystemTareas()
        logger.info('system tareas sync', result)
      } catch (err) {
        logger.error('system tareas sync failed', { err: String(err) })
      } finally {
        if (gotLock) {
          try {
            await client.query('SELECT pg_advisory_unlock($1)', [LEADER_LOCK_KEY])
          } catch { /* ignore */ }
        }
        client.release()
      }
    }
    cron.schedule(SYNC_CRON, runSystemSync, { timezone: SYNC_TIMEZONE })
    logger.info('system tareas sync scheduled', { cron: SYNC_CRON, timezone: SYNC_TIMEZONE })
  })
})()

export default app
