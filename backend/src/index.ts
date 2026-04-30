import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import router from './routes'
import authRouter from './routes/auth'
import { authenticate } from './middleware/auth'
import { errorHandler, notFound } from './middleware/errorHandler'

// Load .env only in development — Railway injects env vars directly into process.env
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../.env') })
}

console.log('[boot] JWT_SECRET:', process.env.JWT_SECRET ? 'configurado' : 'MISSING — auth will fail')

const app  = express()
const PORT = process.env.PORT ?? 4000

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

// Public auth routes — must come before authenticate middleware
app.use('/api/auth', authRouter)

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
  console.log(`🚀 Central Millwork API — http://localhost:${PORT}`)
})

export default app
