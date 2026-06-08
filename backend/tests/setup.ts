// ─────────────────────────────────────────────────────────────────────────────
// Vitest setup global — Audit roadmap "ahora #3"
// ─────────────────────────────────────────────────────────────────────────────
// Corre ANTES de cualquier test. Verifica que:
//   1. TEST_DATABASE_URL apunta a la DB efímera (Docker en puerto 5433)
//   2. El schema está creado (corre migraciones si la DB está vacía)
//   3. Hay conexión disponible
//
// Si Docker no está corriendo o la DB no responde, falla rápido con mensaje
// claro en vez de timeout silencioso.
// ─────────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll } from 'vitest'
import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'

// Default points to Docker compose service (puerto 5433 → contenedor 5432).
// Override con TEST_DATABASE_URL si querés usar otra DB.
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://test:test@localhost:5433/cm_test'

// Inyectar al env para que pool.ts lo lea
process.env.DATABASE_URL = TEST_DB_URL
process.env.NODE_ENV = 'test'

const setupPool = new Pool({ connectionString: TEST_DB_URL })

// Exportado para que tests que SÍ necesitan DB la validen antes de correr.
// Tests puros (sin DB) corren igual aunque la DB no esté disponible.
export let dbAvailable = false

beforeAll(async () => {
  // 1. Verificar conexión — modo soft: warn si falla, no throw
  try {
    await setupPool.query('SELECT 1')
    dbAvailable = true
  } catch (err: any) {
    console.warn(
      `\n⚠ DB de tests no disponible (${TEST_DB_URL})\n` +
      `  Tests que requieren DB van a fallar. Levantala con:\n` +
      `  docker compose -f docker-compose.test.yml up -d postgres-test\n` +
      `  Error: ${err.message}\n`
    )
    return
  }

  // 2. Verificar si el schema existe (tabla proyectos como canary)
  const { rows: [{ has_schema }] } = await setupPool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'proyectos'
     ) AS has_schema`
  )

  if (!has_schema) {
    console.log('🔧 DB de tests vacía — aplicando baseline + migraciones...')
    const migrationsDir = path.join(__dirname, '../../database/migrations')
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
      try {
        await setupPool.query(sql)
      } catch (err: any) {
        // Migración con DROP/RECREATE puede fallar si baseline ya las trajo.
        // Solo abortamos en errores no esperados.
        if (
          !err.message.includes('already exists') &&
          !err.message.includes('does not exist')
        ) {
          throw new Error(`Migración ${file} falló: ${err.message}`)
        }
      }
    }
    console.log('✓ Migraciones aplicadas')
  }
}, 60_000)

afterAll(async () => {
  await setupPool.end().catch(() => {})
})

/**
 * Helper: TRUNCATE de tablas de negocio entre tests (preserva schema y
 * sequences). Llamar desde beforeEach en los archivos de test que lo necesiten.
 *
 * NO usar en tests que verifican concurrencia de sequences (esos manejan
 * setval explícito).
 */
export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE
      orden_avance_fotos, orden_documentos, orden_historial, orden_procesos,
      time_proyectos, time_pausas, time_registros, time_resumen_diario,
      ordenes_produccion,
      muestras_archivos, muestras_envios, muestras_eventos, muestras_versiones, muestras,
      items_recepcion, recepciones,
      items_orden_compra_backup_2026_05_11, items_orden_compra, oc_imagenes,
      ordenes_compra_backup_2026_05_11, ordenes_compra,
      tareas,
      mto_freight, materiales_mto_backup_2026_05_11, materiales_mto,
      solicitudes_cotizacion,
      personal_estaciones, personal_taller,
      proyectos, proveedores
    RESTART IDENTITY CASCADE
  `)
}
