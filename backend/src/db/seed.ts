import fs from 'fs'
import path from 'path'
import pool from './pool'

async function seed() {
  const seedsDir = path.join(__dirname, '../../../database/seeds')
  const files = fs.readdirSync(seedsDir).sort()

  for (const file of files) {
    if (!file.endsWith('.sql')) continue
    console.log(`Running seed: ${file}`)
    const sql = fs.readFileSync(path.join(seedsDir, file), 'utf-8')
    await pool.query(sql)
    console.log(`✓ ${file}`)
  }

  console.log('All seeds completed.')
  await pool.end()
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
