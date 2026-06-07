import { Pool } from 'pg'
import { logger } from '../utils/logger'

const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL

logger.info('pool init', {
  databasePublicUrl: process.env.DATABASE_PUBLIC_URL ? `${process.env.DATABASE_PUBLIC_URL.slice(0, 50)}...` : 'NOT FOUND',
  databaseUrl:       process.env.DATABASE_URL        ? `${process.env.DATABASE_URL.slice(0, 50)}...`        : 'NOT FOUND',
  usingConnectionString: !!connectionString,
})

// ─────────────────────────────────────────────────────────────────────────────
// Pool config explícito (audit Fix A1)
// ─────────────────────────────────────────────────────────────────────────────
// Defaults de `pg` son max=10 / idleTimeout=10s / connectionTimeout=0 (espera infinita).
// Con 2 réplicas backend + dashboard que dispara 9 queries en paralelo + kioskos
// polleando cada 25s + rate-limit store compartiendo el pool, max=10 se agota en
// picos y aparecen timeouts inexplicables.
//
// Valores razonables para Railway con Postgres compartido:
//   - max=20:                    capacidad para ~5 admins simultáneos + jobs
//   - idleTimeoutMillis=10000:   libera conexiones inactivas rápido para evitar idle-in-tx
//   - connectionTimeoutMillis=3000: falla rápido si no hay conexiones disponibles
//                                   (mejor 503 explícito que cuelgue de 60s)
//   - statement_timeout=30000:   safety net contra queries runaway (SET en cada client)
// ─────────────────────────────────────────────────────────────────────────────
const POOL_CONFIG = {
  max: parseInt(process.env.DB_POOL_MAX || '20'),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 3_000,
}

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      ...POOL_CONFIG,
    })
  : new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME     || 'centralmillwork',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      ...POOL_CONFIG,
    })

// Safety net: cada client recién obtenido aplica un statement_timeout de 30s.
// Si una query corre más de 30s, Postgres la cancela. Previene runaway queries
// que dejan el pool muerto.
pool.on('connect', (client) => {
  client.query('SET statement_timeout = 30000').catch((err) => {
    logger.warn('pool: SET statement_timeout failed', { err: String(err) })
  })
})

pool.on('error', (err) => {
  logger.error('pool idle client error', { err })
})

logger.info('pool configured', POOL_CONFIG)

export default pool
