import fs from 'fs'
import path from 'path'
import pool from './pool'

async function migrate() {
  const migrationsDir = path.join(__dirname, '../../../database/migrations')
  const files = fs.readdirSync(migrationsDir).sort()

  for (const file of files) {
    if (!file.endsWith('.sql')) continue
    console.log(`Running migration: ${file}`)
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    await pool.query(sql)
    console.log(`✓ ${file}`)
  }

  console.log('All migrations completed.')
  await pool.end()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
