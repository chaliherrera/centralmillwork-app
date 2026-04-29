import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import bcrypt from 'bcryptjs'
import pool from './pool'

async function main() {
  const hash = await bcrypt.hash('CentralMillwork2026!', 10)
  const { rowCount } = await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     VALUES ('Chali Herrera', 'chali@centralmillwork.com', $1, 'ADMIN')
     ON CONFLICT (email) DO NOTHING`,
    [hash]
  )
  console.log(rowCount ? 'Admin user created.' : 'Admin user already exists — skipped.')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
