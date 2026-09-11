// ─────────────────────────────────────────────────────────────────────────────
// Tests de integración: máquina de estados del deal + activación + handoff a Ingeniería
// ─────────────────────────────────────────────────────────────────────────────
// Cubre el "corazón" que la auditoría marcó sin red: el flujo Estimados → PM →
// cliente → activación (plan_inicial.ts) y que al activar la ruta entra al
// escritorio del rol correcto (escritorio.ts + reconciliador). Requieren la DB de
// tests efímera (Docker :5433); si no está, cada caso se saltea (no falla la suite).
//
// Validado además a mano contra staging (misma secuencia, mismos asserts).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { Pool } from 'pg'
import { dbAvailable, truncateAll } from './setup'
import { generarPlan } from '../src/modules/schedule/domain/recompute'
import {
  generarPlanIngenieria, aceptarPlanPM, enviarAClienteDeal,
  registrarAprobacionCliente, activarProyecto,
} from '../src/modules/ingenieria/domain/plan_inicial'
import { getEscritorio } from '../src/modules/ingenieria/domain/escritorio'

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgres://test:test@localhost:5433/cm_test'
const pool = new Pool({ connectionString: TEST_DB_URL })

async function crearProyecto(): Promise<{ pid: number; cod: string }> {
  const cod = 'TEST-DEAL-' + Math.random().toString(36).slice(2, 8)
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO proyectos (codigo, nombre, cliente, estado, presupuesto, millwork_total, stone_total, items_qty, incluye_instalacion)
       VALUES ($1, 'test deal', 'cliente test', 'prospecto', 1000, 900, 100, 5, true) RETURNING id`, [cod])
  return { pid: rows[0].id, cod }
}
async function dealEstado(pid: number): Promise<string | null> {
  const { rows } = await pool.query<{ deal_estado: string | null }>(`SELECT deal_estado FROM proyectos WHERE id = $1`, [pid])
  return rows[0]?.deal_estado ?? null
}
async function proyectoEstado(pid: number): Promise<string | null> {
  const { rows } = await pool.query<{ estado: string | null }>(`SELECT estado FROM proyectos WHERE id = $1`, [pid])
  return rows[0]?.estado ?? null
}
async function contarPorOrigen(cod: string, origen: string): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(`SELECT count(*)::int n FROM ing_tareas WHERE proyecto_ext = $1 AND origen = $2`, [cod, origen])
  return rows[0].n
}
/** Lleva un proyecto recién creado hasta "listo para activar" (deal aprobado). */
async function hastaAprobado(): Promise<{ pid: number; cod: string; creadas: number }> {
  const { pid, cod } = await crearProyecto()
  await generarPlan(pool, pid, '2026-12-15')
  const g = await generarPlanIngenieria(pool, pid, { origen: 'sugerencia' })
  await aceptarPlanPM(pool, pid)
  await enviarAClienteDeal(pool, pid, null)
  await registrarAprobacionCliente(pool, pid)
  return { pid, cod, creadas: g.creadas }
}

describe('deal machine — Estimados → PM → cliente → activación', () => {
  beforeEach(async () => { if (dbAvailable) await truncateAll(pool) })
  afterAll(async () => { await pool.end() })

  it('happy path: crear → sugerir → aceptar → enviar → aprobar → activar', async (ctx) => {
    if (!dbAvailable) return ctx.skip()
    const { pid, cod } = await crearProyecto()
    await generarPlan(pool, pid, '2026-12-15')

    const g = await generarPlanIngenieria(pool, pid, { origen: 'sugerencia' })
    expect(g.creadas).toBeGreaterThan(0)
    expect(await contarPorOrigen(cod, 'sugerencia')).toBe(g.creadas)   // plan sugerido en bandeja

    await aceptarPlanPM(pool, pid)
    expect(await dealEstado(pid)).toBe('plan_propuesto')
    expect(await contarPorOrigen(cod, 'app')).toBe(g.creadas)          // se endureció a firme
    expect(await contarPorOrigen(cod, 'sugerencia')).toBe(0)

    const env = await enviarAClienteDeal(pool, pid, null)
    expect(env.ok).toBe(true)
    expect(env.token).toBeTruthy()                                     // token de portal generado
    expect(await dealEstado(pid)).toBe('esperando_cliente')

    const apr = await registrarAprobacionCliente(pool, pid)
    expect(apr.ok).toBe(true)
    expect(await dealEstado(pid)).toBe('aprobado')

    const act = await activarProyecto(pool, pid)
    expect(act.ok).toBe(true)
    expect(await proyectoEstado(pid)).toBe('activo')
  })

  it('guardas: la máquina no deja saltear pasos', async (ctx) => {
    if (!dbAvailable) return ctx.skip()
    const { pid } = await crearProyecto()
    await generarPlan(pool, pid, '2026-12-15')
    await generarPlanIngenieria(pool, pid, { origen: 'sugerencia' })

    expect((await activarProyecto(pool, pid)).ok).toBe(false)          // no activar sin aprobación
    expect((await enviarAClienteDeal(pool, pid, null)).ok).toBe(false) // no enviar sin aceptar
    expect((await registrarAprobacionCliente(pool, pid)).ok).toBe(false) // no aprobar sin enviar

    await aceptarPlanPM(pool, pid)
    expect((await enviarAClienteDeal(pool, pid, null)).ok).toBe(true)  // ahora sí
    expect((await activarProyecto(pool, pid)).ok).toBe(false)          // pero activar todavía no (falta cliente)

    await registrarAprobacionCliente(pool, pid)
    expect((await activarProyecto(pool, pid)).ok).toBe(true)
  })

  it('un proyecto en prospecto NO aparece en el escritorio; al activar entra Meeting with Designer', async (ctx) => {
    if (!dbAvailable) return ctx.skip()
    const { pid, cod } = await hastaAprobado()

    // Antes de activar (prospecto), la ruta no está en el escritorio.
    const antes = await getEscritorio(pool, { roles: ['ingenieria', 'field'] })
    expect(antes.tareas.some((t) => t.proyecto_ext === cod)).toBe(false)

    await activarProyecto(pool, pid)

    // Al activar, la frontera (Meeting with Designer) entra al escritorio de Ingeniería.
    const desp = await getEscritorio(pool, { roles: ['ingenieria', 'field'] })
    const mias = desp.tareas.filter((t) => t.proyecto_ext === cod).map((t) => t.tipo_clave)
    expect(mias).toContain('meeting_designer')
  })
})
