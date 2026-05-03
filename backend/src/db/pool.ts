import { Pool } from 'pg'
import { logger } from '../utils/logger'

const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL

logger.info('pool init', {
  databasePublicUrl: process.env.DATABASE_PUBLIC_URL ? `${process.env.DATABASE_PUBLIC_URL.slice(0, 50)}...` : 'NOT FOUND',
  databaseUrl:       process.env.DATABASE_URL        ? `${process.env.DATABASE_URL.slice(0, 50)}...`        : 'NOT FOUND',
  usingConnectionString: !!connectionString,
})

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME     || 'centralmillwork',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    })

pool.on('error', (err) => {
  logger.error('pool idle client error', { err })
})

export default pool
