import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import pool from './pool'

// ─────────────────────────────────────────────────────────────────────────────
// Puente seguro tracker viejo (public.migrations) → schema_migrations (Fase 0/merge)
// ─────────────────────────────────────────────────────────────────────────────
// Prod usa el tracker viejo `public.migrations` (id/name/hash) y está ATRASADA en la
// frontera del refactor, SIN `schema_migrations`. Correr el runner tal cual dispara
// maybeBootstrap, que —ahora con guardrail— ABORTA en vez de blanquear. Este tool
// prepara el terreno: siembra `schema_migrations` con las migraciones YA aplicadas
// (000..frontera) para que el runner aplique 046..NN DE VERDAD.
//
// Uso (contra el entorno que apunte pool.ts):
//   inspect                → muestra la frontera real de prod (public.migrations) + repo. NO escribe.
//   seed --upto=045        → DRY-RUN: lista qué sembraría (repo files con prefijo <= 045).
//   seed --upto=045 --apply→ siembra de verdad en schema_migrations.
//
// SIEMPRE correr `inspect` primero, confirmar la frontera, `seed` en dry-run, revisar,
// y recién entonces `--apply`. Hace backup lógico ANTES (pg_dump) — este tool no borra nada.
// ─────────────────────────────────────────────────────────────────────────────

function sha256(s: string): string { return crypto.createHash('sha256').update(s).digest('hex') }

function readRepoMigrations(): Array<{ filename: string; prefixNum: number; sha256: string }> {
  const dir = path.join(__dirname, '../../../database/migrations')
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((filename) => {
    const m = filename.match(/^(\d+)/)
    const prefixNum = m ? parseInt(m[1], 10) : NaN
    return { filename, prefixNum, sha256: sha256(fs.readFileSync(path.join(dir, filename), 'utf-8')) }
  })
}

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS ok`, [name])
  return rows[0].ok
}

async function inspect(): Promise<void> {
  const hasLegacy = await tableExists('migrations')
  const hasNew = await tableExists('schema_migrations')
  console.log(`tracker viejo public.migrations: ${hasLegacy ? 'EXISTE' : 'no existe'}`)
  console.log(`tracker nuevo schema_migrations: ${hasNew ? 'EXISTE' : 'no existe'}`)
  if (hasLegacy) {
    const { rows } = await pool.query<{ n: string; mx: string | null }>(`SELECT count(*)::text n, max(name) mx FROM public.migrations`)
    console.log(`public.migrations: ${rows[0].n} filas, max(name)=${rows[0].mx}`)
    const sample = await pool.query<{ name: string }>(`SELECT name FROM public.migrations ORDER BY name DESC LIMIT 8`)
    console.log('últimos names:', JSON.stringify(sample.rows.map((r) => r.name)))
  }
  if (hasNew) {
    const { rows } = await pool.query<{ n: string }>(`SELECT count(*)::text n FROM schema_migrations`)
    console.log(`schema_migrations: ${rows[0].n} filas`)
  }
  const repo = readRepoMigrations()
  console.log(`repo: ${repo.length} migraciones (${repo[0]?.filename} .. ${repo[repo.length - 1]?.filename})`)
  // objetos del refactor (para saber si el schema está al día)
  const schedule = await tableExists('schedule_planes')
  const { rows: cierre } = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ing_tarea_tipos' AND column_name='cierre') AS ok`)
  console.log(`schema del refactor presente: schedule_planes=${schedule}, ing_tarea_tipos.cierre=${cierre[0].ok}`)
}

async function seed(upto: number, apply: boolean): Promise<void> {
  const repo = readRepoMigrations()
  const yaAplicadas = repo.filter((r) => !isNaN(r.prefixNum) && r.prefixNum <= upto)
  const pendientes = repo.filter((r) => isNaN(r.prefixNum) || r.prefixNum > upto)
  console.log(`\n== SEED hasta prefijo ${String(upto).padStart(3, '0')} ==`)
  console.log(`Se marcarán como YA aplicadas (sin ejecutar): ${yaAplicadas.length} archivos`)
  console.log(`  ${yaAplicadas[0]?.filename} .. ${yaAplicadas[yaAplicadas.length - 1]?.filename}`)
  console.log(`El runner luego aplicará DE VERDAD: ${pendientes.length} archivos`)
  console.log(`  ${pendientes.map((p) => p.filename).join(', ')}`)
  if (!apply) { console.log('\n(DRY-RUN — nada escrito. Agregá --apply para sembrar.)'); return }
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, sha256 TEXT NOT NULL, executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
  let n = 0
  for (const r of yaAplicadas) {
    const res = await pool.query(`INSERT INTO schema_migrations (filename, sha256) VALUES ($1,$2) ON CONFLICT (filename) DO NOTHING`, [r.filename, r.sha256])
    n += res.rowCount ?? 0
  }
  console.log(`\n✓ Sembradas ${n} filas en schema_migrations. Ahora sí correr el runner (npm run db:migrate) para aplicar ${pendientes.length}.`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const cmd = args[0] ?? 'inspect'
  const uptoArg = args.find((a) => a.startsWith('--upto='))
  const apply = args.includes('--apply')
  if (cmd === 'inspect') await inspect()
  else if (cmd === 'seed') {
    if (!uptoArg) { console.error('Falta --upto=<prefijo> (ej: --upto=045). Corré `inspect` primero para confirmar la frontera.'); process.exit(1) }
    await seed(parseInt(uptoArg.split('=')[1], 10), apply)
  } else { console.error(`Comando desconocido: ${cmd}. Usá: inspect | seed --upto=NNN [--apply]`); process.exit(1) }
  await pool.end()
}

main().catch((e) => { console.error('bridge failed:', e); process.exit(1) })
