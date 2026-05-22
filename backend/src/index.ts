import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import router from './routes'
import authRouter from './routes/auth'
import webhooksRouter from './routes/webhooks'
import { authenticate } from './middleware/auth'
import { errorHandler, notFound } from './middleware/errorHandler'
import { globalLimiter, loginLimiter } from './middleware/rateLimit'
import { requestId } from './middleware/requestId'
import { logger } from './utils/logger'

// Load .env only in development — Railway injects env vars directly into process.env
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../.env') })
}

logger.info('boot', { jwtSecret: process.env.JWT_SECRET ? 'configurado' : 'MISSING — auth will fail' })

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

app.listen(PORT, () => {
  logger.info('server listening', { port: PORT, url: `http://localhost:${PORT}` })
})

export default app
