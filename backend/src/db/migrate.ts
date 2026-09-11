import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import pool from './pool'

// ─────────────────────────────────────────────────────────────────────────────
// Migration runner (Audit Fix A3 — hardening)
// ─────────────────────────────────────────────────────────────────────────────
// Antes: corría todos los .sql en orden alfabético, SIN tracking, SIN check
// de duplicados. Riesgos:
//   - Migraciones con DROP TABLE re-ejecutadas en disaster recovery
//   - Dos archivos con el mismo número (ej: 010_a.sql + 010_b.sql) ejecutados
//     en orden no determinístico según OS
//   - Sin forma de saber qué se aplicó
//
// Ahora:
//   - Tabla schema_migrations que registra: filename, sha256, executed_at
//   - Skip de migraciones ya aplicadas (idempotente al re-correr)
//   - Detecta duplicados de número y aborta con mensaje claro
//   - Detecta drift: si una migración aplicada cambió su hash, warn (no aborta)
// ─────────────────────────────────────────────────────────────────────────────

interface MigrationFile {
  filename: string
  prefix: string   // ej: "010", "010b", "035"
  sql: string
  sha256: string
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function readMigrations(dir: string): MigrationFile[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((filename) => {
      const sql = fs.readFileSync(path.join(dir, filename), 'utf-8')
      // Extract numeric prefix (allows suffixes like "010b" or "035_a")
      const match = filename.match(/^(\d+[a-z]?)_/)
      const prefix = match?.[1] ?? filename
      return { filename, prefix, sql, sha256: sha256(sql) }
    })
}

function assertNoDuplicatePrefixes(migrations: MigrationFile[]): void {
  const seen = new Map<string, string>()
  for (const m of migrations) {
    const existing = seen.get(m.prefix)
    if (existing) {
      throw new Error(
        `❌ Duplicate migration number "${m.prefix}":\n` +
        `   - ${existing}\n` +
        `   - ${m.filename}\n` +
        `Renombrá una para que tenga un prefijo único (ej: 010b_*.sql).`
      )
    }
    seen.set(m.prefix, m.filename)
  }
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename     TEXT PRIMARY KEY,
      sha256       TEXT NOT NULL,
      executed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

/**
 * Bootstrap: si la DB tiene schema ya creado (proyectos existe) PERO
 * schema_migrations está vacía, marca TODAS las migraciones del repo como
 * "ya aplicadas" sin ejecutarlas. Esto cubre el caso de prod existente
 * donde las migraciones ya se aplicaron con el runner viejo (sin tracking).
 *
 * GUARDA (Fase 0, 2026-09-10): blanquear TODAS las migraciones solo es seguro
 * si el schema ya está al día. Si prod quedó atrás en la frontera del refactor
 * (o usa el tracker viejo public.migrations), marcar todo esconde migraciones
 * SIN aplicar y el backend nuevo consulta tablas del refactor inexistentes y cae.
 * Por eso, antes de blanquear, exigimos prueba de que el schema del refactor
 * está presente; si no, ABORTAMOS con instrucciones en vez de romper en silencio.
 *
 * Después del bootstrap, los siguientes runs trabajan normal: solo aplican
 * migraciones nuevas, skip las ya registradas.
 */
async function maybeBootstrap(migrations: MigrationFile[]): Promise<boolean> {
  const { rows: [{ has_schema }] } = await pool.query<{ has_schema: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'proyectos'
    ) AS has_schema
  `)
  if (!has_schema) return false

  const { rows: [{ count }] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM schema_migrations`
  )
  if (parseInt(count) > 0) return false

  // Centinela: ¿el schema contiene el refactor? schedule_planes (migr. 046) +
  // la columna ing_tarea_tipos.cierre (migr. 083, el último cambio de estructura).
  // Si faltan, el schema NO está al día → blanquear sería catastrófico.
  // NOTA: al agregar futuras migraciones de ESTRUCTURA, actualizar este centinela.
  const { rows: [sent] } = await pool.query<{ tip: boolean; legacy: boolean }>(`
    SELECT
      (EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name='schedule_planes')
       AND EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='ing_tarea_tipos'
                  AND column_name='cierre')) AS tip,
      EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='migrations') AS legacy
  `)
  if (!sent.tip) {
    throw new Error(
      '❌ Bootstrap ABORTADO: hay schema (proyectos existe) pero FALTAN objetos del ' +
      'refactor (schedule_planes / ing_tarea_tipos.cierre) y schema_migrations está vacía.\n' +
      '   Blanquear marcaría migraciones SIN aplicar → el backend caería consultando tablas inexistentes.\n' +
      (sent.legacy
        ? '   Detecté el tracker viejo public.migrations: sembrá schema_migrations con las filas YA aplicadas\n' +
          '   (según public.migrations) ANTES de correr el runner, para que aplique 046-085 de verdad.\n'
        : '   Sembrá schema_migrations con la frontera real ANTES de correr el runner.\n') +
      '   Ver el checklist de merge de la auditoría de integridad (Fase 1).'
    )
  }

  console.log('🔧 Bootstrap: schema al día pero schema_migrations vacía.')
  console.log(`   Registrando ${migrations.length} migraciones como aplicadas sin ejecutarlas...`)

  for (const m of migrations) {
    await pool.query(
      `INSERT INTO schema_migrations (filename, sha256) VALUES ($1, $2)
       ON CONFLICT (filename) DO NOTHING`,
      [m.filename, m.sha256]
    )
  }
  console.log('✓ Bootstrap completado. Próximas migraciones se aplican normal.')
  return true
}

async function getApplied(): Promise<Map<string, string>> {
  const { rows } = await pool.query<{ filename: string; sha256: string }>(
    `SELECT filename, sha256 FROM schema_migrations`
  )
  return new Map(rows.map((r) => [r.filename, r.sha256]))
}

async function migrate(): Promise<void> {
  const migrationsDir = path.join(__dirname, '../../../database/migrations')
  const migrations = readMigrations(migrationsDir)

  console.log(`Encontradas ${migrations.length} migraciones en ${migrationsDir}`)

  // 1. Detectar colisión de prefijo (Fix A3 core)
  assertNoDuplicatePrefixes(migrations)
  console.log('✓ Sin colisiones de número')

  // 2. Setup table de tracking
  await ensureMigrationsTable()

  // 2b. Bootstrap si schema ya existe pero no hay tracking (DBs viejas)
  const bootstrapped = await maybeBootstrap(migrations)
  const applied = await getApplied()
  if (!bootstrapped) {
    console.log(`${applied.size} migraciones ya registradas como aplicadas`)
  }

  // 3. Aplicar las que falten + detectar drift
  let appliedCount = 0
  let skippedCount = 0
  let driftWarnings = 0

  for (const m of migrations) {
    const previousHash = applied.get(m.filename)
    if (previousHash) {
      // Ya aplicada — skip pero alertar si el contenido cambió
      if (previousHash !== m.sha256) {
        console.warn(
          `⚠ DRIFT: ${m.filename} ya está aplicada pero el archivo cambió ` +
          `(was ${previousHash.slice(0, 8)}, now ${m.sha256.slice(0, 8)}). ` +
          `Revisar manualmente — no re-ejecuto.`
        )
        driftWarnings++
      }
      skippedCount++
      continue
    }

    // Nueva migración: aplicar dentro de transacción
    console.log(`▶ Aplicando ${m.filename}...`)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(m.sql)
      await client.query(
        `INSERT INTO schema_migrations (filename, sha256) VALUES ($1, $2)`,
        [m.filename, m.sha256]
      )
      await client.query('COMMIT')
      console.log(`✓ ${m.filename}`)
      appliedCount++
    } catch (err) {
      await client.query('ROLLBACK')
      console.error(`✗ ${m.filename} falló — ROLLBACK`)
      throw err
    } finally {
      client.release()
    }
  }

  console.log(
    `\nResumen: ${appliedCount} aplicadas, ${skippedCount} skipped, ` +
    `${driftWarnings} drift warnings`
  )
  await pool.end()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
