// ─────────────────────────────────────────────────────────────────────────────
// Test #1: Numerador atómico bajo concurrencia
// ─────────────────────────────────────────────────────────────────────────────
// Verifica que las sequences Postgres creadas en migración 035 garantizan
// IDs únicos cuando hay múltiples requests concurrentes — exactamente el
// bug 23505 duplicate key que el A2 arregló.
//
// Sin este test, una regresión silenciosa (alguien vuelve al patrón
// SELECT MAX + parseInt + 1) pasaría desapercibida hasta que pasara en prod
// con 2 réplicas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import {
  nextOcNumero,
  nextRecepcionFolio,
  nextCotizacionFolio,
} from '../../src/utils/numeradorAtomico'

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://test:test@localhost:5433/cm_test'

const pool = new Pool({ connectionString: TEST_DB_URL })

describe('numeradorAtomico — concurrencia', () => {
  beforeAll(async () => {
    // Resetear sequences a 0 para que los IDs empiecen en 1 predictibles
    await pool.query("SELECT setval('oc_numero_seq', 1, false)")
    await pool.query("SELECT setval('recepcion_folio_seq', 1, false)")
    await pool.query("SELECT setval('cotizacion_folio_seq', 1, false)")
  })

  afterAll(async () => {
    await pool.end()
  })

  it('nextOcNumero genera 50 números únicos bajo concurrencia', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () => nextOcNumero(pool))
    )

    // Todos únicos
    expect(new Set(results).size).toBe(50)

    // Formato OC-YYYY-NNNN
    const year = new Date().getFullYear()
    const expectedFormat = new RegExp(`^OC-${year}-\\d{4}$`)
    for (const r of results) {
      expect(r).toMatch(expectedFormat)
    }
  })

  it('nextRecepcionFolio genera 50 folios únicos bajo concurrencia', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () => nextRecepcionFolio(pool))
    )
    expect(new Set(results).size).toBe(50)
    const year = new Date().getFullYear()
    expect(results.every((r) => new RegExp(`^REC-${year}-\\d{4}$`).test(r))).toBe(true)
  })

  it('nextCotizacionFolio genera 50 folios únicos bajo concurrencia', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () => nextCotizacionFolio(pool))
    )
    expect(new Set(results).size).toBe(50)
    const year = new Date().getFullYear()
    expect(results.every((r) => new RegExp(`^COT-${year}-\\d{4}$`).test(r))).toBe(true)
  })

  it('cada sequence avanza independiente (sin cross-contamination)', async () => {
    // Resetear a un valor conocido
    await pool.query("SELECT setval('oc_numero_seq', 1000)")
    await pool.query("SELECT setval('recepcion_folio_seq', 2000)")

    const oc = await nextOcNumero(pool)
    const rec = await nextRecepcionFolio(pool)

    const year = new Date().getFullYear()
    expect(oc).toBe(`OC-${year}-1001`)
    expect(rec).toBe(`REC-${year}-2001`)
  })

  it('formato numérico se padded a 4 dígitos correctamente', async () => {
    await pool.query("SELECT setval('oc_numero_seq', 4, false)")  // próximo: 4
    const oc1 = await nextOcNumero(pool)
    const oc2 = await nextOcNumero(pool)
    const year = new Date().getFullYear()
    expect(oc1).toBe(`OC-${year}-0004`)
    expect(oc2).toBe(`OC-${year}-0005`)

    // Boundary: cuando supere 9999, no se trunca
    await pool.query("SELECT setval('oc_numero_seq', 9999, false)")
    const ocBig = await nextOcNumero(pool)
    expect(ocBig).toBe(`OC-${year}-9999`)
    const ocOver = await nextOcNumero(pool)
    expect(ocOver).toBe(`OC-${year}-10000`)  // 5 dígitos, NO se trunca
  })
})
