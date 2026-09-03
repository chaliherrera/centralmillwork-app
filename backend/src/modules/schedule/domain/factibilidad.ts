// ─────────────────────────────────────────────────────────────────────────────
// Domain — Chequeo de factibilidad (READ-ONLY / dry-run, no persiste nada)
// ─────────────────────────────────────────────────────────────────────────────
// Responde lo que pidió Chali: cuando Estimados verifica una fecha, el sistema
//   (1) arma el plan REAL en seco (mismo catálogo de 18 pasos, mismas duraciones
//       por ítem y el mismo motor CPM que el generador `generarPlanIngenieria`),
//       así factibilidad y plan NUNCA se contradicen; y
//   (2) busca en la carga de los ingenieros quién tiene DISPONIBILIDAD (por % de
//       carga, como el Workload Schedule del Smartsheet) para la ventana de
//       ingeniería del proyecto — "un ingeniero por proyecto".
// Si la cadena no entra o ningún ingeniero tiene cupo, propone la fecha real más
// temprana. Es una PROPUESTA: el PM la confirma o la modifica.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { calcularHolgura, TareaCPM, AristaCPM } from '../../ingenieria/domain/holgura'
import { loadFeriados, addBusinessDays, businessDaysBetween, ISODate } from './calendario'

type QueryRunner = PoolClient | typeof pool

// Roles cuyas tareas consumen la capacidad del "un ingeniero" del proyecto.
const ROLES_INGENIERO = new Set(['ingenieria', 'field'])
const STONE_CLAVES = ['stone_measure', 'stone_fab', 'stone_install']
// Umbral de saturación: un ingeniero no puede pasar de este % de carga. 100 = lleno.
const UMBRAL_PCT = 100
// Cuánto SUMA un proyecto nuevo a la carga del ingeniero (default; el PM lo ajusta por
// proyecto, como en Smartsheet). Un ingeniero tiene cupo si su carga actual + esto ≤ 100%.
const CARGA_PROYECTO_PCT = 50

export interface CargaIngeniero { nombre: string; pico_pct: number; disponible: boolean }
export interface FactibilidadResult {
  fecha_pedida: string
  factible: boolean
  fecha_real_mas_temprana: string
  dias_slip: number
  // Ingeniería (por % de carga, "un ingeniero por proyecto"):
  ingeniero_propuesto: string | null   // el de MÁS cupo para la ventana
  carga_pct: number | null             // su pico de carga % en la ventana (sin este proyecto)
  capacidad_ok: boolean                // ¿el propuesto tiene cupo (< umbral)?
  ventana_ing: { inicio: string; fin: string } | null
  cargas: CargaIngeniero[]             // ranking de todos, para la pantalla
  motivo: 'ok' | 'cadena' | 'capacidad' // por qué la fecha real (si no factible)
  provisional: true
}

function hoyISO(): string { return new Date().toISOString().slice(0, 10) }

// Lunes de la semana ISO de una fecha (para bucketear la carga por semana).
function lunesDe(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7 // 0 = lunes
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}
function addDias(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}

interface TareaCarga { nombre: string; ini: string; fin: string; alloc: number }

/** Pico de carga % de un ingeniero en la ventana [w0,w1]: la semana más cargada,
 *  sumando el allocation_pct de sus tareas solapadas. Puro (sobre datos ya leídos). */
function picoPct(tareas: TareaCarga[], nombre: string, w0: string, w1: string): number {
  const suyas = tareas.filter((t) => t.nombre === nombre)
  if (!suyas.length) return 0
  let pico = 0
  for (let semana = lunesDe(w0); semana <= w1; semana = addDias(semana, 7)) {
    const finSemana = addDias(semana, 6)
    let suma = 0
    for (const t of suyas) if (t.ini <= finSemana && t.fin >= semana) suma += t.alloc
    if (suma > pico) pico = suma
  }
  return Math.round(pico * 100) // alloc es fracción (0-1) → %
}

export async function chequearFactibilidad(
  runner: QueryRunner,
  fechaPedida: string,
  opts?: { itemsQty?: number | null; hayStone?: boolean; incluyeInstalacion?: boolean },
): Promise<FactibilidadResult> {
  const itemsQty = opts?.itemsQty ?? null
  const hayStone = opts?.hayStone ?? false
  const incluyeInstalacion = opts?.incluyeInstalacion ?? true
  const hoy = hoyISO()
  const feriados = await loadFeriados(runner)

  // 1) Catálogo real (18 pasos) + duraciones por ítem, mismo criterio que el generador.
  const { rows: tipos } = await runner.query<{ clave: string; rol: string | null; dur_dias_tipico: number | null; dias_por_item: number | null }>(
    `SELECT clave, rol, dur_dias_tipico, dias_por_item FROM ing_tarea_tipos`)
  const incluir = tipos.filter((t) =>
    (hayStone || !STONE_CLAVES.includes(t.clave)) &&
    (incluyeInstalacion || t.clave !== 'installation'))
  const idPorClave = new Map<string, number>()  // id sintético por clave (índice)
  const durPorClave = new Map<string, number>()
  const rolPorClave = new Map<string, string | null>()
  incluir.forEach((t, i) => {
    let dur = Math.max(0, t.dur_dias_tipico ?? 3)
    if (itemsQty != null && itemsQty > 0 && t.dias_por_item != null && Number(t.dias_por_item) > 0)
      dur = Math.max(1, Math.round(itemsQty * Number(t.dias_por_item)))
    idPorClave.set(t.clave, i + 1)
    durPorClave.set(t.clave, dur)
    rolPorClave.set(t.clave, t.rol)
  })

  // 2) Dependencias de la plantilla (solo entre tipos incluidos).
  const { rows: tdeps } = await runner.query<{ tipo_clave: string; depende_de_clave: string; tipo: string; lag_dias: number }>(
    `SELECT tipo_clave, depende_de_clave, tipo, lag_dias FROM ing_tipo_deps`)
  const aristas: AristaCPM[] = []
  for (const d of tdeps) {
    const t = idPorClave.get(d.tipo_clave), dd = idPorClave.get(d.depende_de_clave)
    if (t && dd) aristas.push({ tareaId: t, dependeDeId: dd, lag: d.lag_dias, tipo: d.tipo === 'SS' ? 'SS' : 'FS' })
  }
  const cpmTareas: TareaCPM[] = [...idPorClave.entries()].map(([clave, id]) => ({ id, dur: durPorClave.get(clave)! }))

  // 3) CPM en seco desde HOY: dónde caen las tareas y si la cadena entra antes de la fecha.
  let finProyectado: ISODate = fechaPedida
  let ventanaIng: { inicio: string; fin: string } | null = null
  try {
    const r = calcularHolgura(cpmTareas, aristas, hoy, fechaPedida, feriados)
    finProyectado = r.finProyectado ?? fechaPedida
    // Ventana de ingeniería = span de las tareas rol ingeniería/field.
    let w0: string | null = null, w1: string | null = null
    for (const [clave, id] of idPorClave) {
      if (!ROLES_INGENIERO.has(rolPorClave.get(clave) ?? '')) continue
      const c = r.tareas.get(id); if (!c) continue
      if (w0 === null || c.earlyStart < w0) w0 = c.earlyStart
      if (w1 === null || c.earlyFinish > w1) w1 = c.earlyFinish
    }
    if (w0 && w1) ventanaIng = { inicio: w0, fin: w1 }
  } catch { /* ciclo improbable: cae a los defaults */ }

  // ¿la cadena entra antes de la fecha pedida? (finProyectado ≤ pedida)
  const holguraCadena = businessDaysBetween(finProyectado, fechaPedida, feriados)
  const cadenaEntra = holguraCadena >= 0

  // 4) Carga real de los ingenieros (por % — Workload Schedule). Lee UNA vez.
  const { rows: engRows } = await runner.query<{ nombre: string }>(
    `SELECT nombre FROM ing_ingenieros WHERE activo
      UNION
     SELECT DISTINCT asignado_nombre FROM ing_tareas
       WHERE asignado_nombre IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ing_ingenieros)`)
  const ingenieros = engRows.map((e) => e.nombre)
  const { rows: cargaRows } = await runner.query<{ nombre: string; ini: string; fin: string; alloc: number }>(
    `SELECT asignado_nombre AS nombre, to_char(fecha_inicio,'YYYY-MM-DD') ini,
            to_char(fecha_fin,'YYYY-MM-DD') fin, COALESCE(allocation_pct,1)::float AS alloc
       FROM ing_tareas
      WHERE asignado_nombre IS NOT NULL AND estado NOT IN ('hecha','na')
        AND origen <> 'sugerencia' AND fecha_inicio IS NOT NULL AND fecha_fin IS NOT NULL`)
  const cargaTareas: TareaCarga[] = cargaRows.map((r) => ({ nombre: r.nombre, ini: r.ini, fin: r.fin, alloc: Number(r.alloc) }))

  // Ranking de disponibilidad en la ventana de ingeniería (el de MÁS cupo primero).
  const w = ventanaIng ?? { inicio: hoy, fin: finProyectado }
  const cargas: CargaIngeniero[] = ingenieros
    .map((nombre) => { const pico = picoPct(cargaTareas, nombre, w.inicio, w.fin); return { nombre, pico_pct: pico, disponible: pico + CARGA_PROYECTO_PCT <= UMBRAL_PCT } })
    .sort((a, b) => a.pico_pct - b.pico_pct || a.nombre.localeCompare(b.nombre))

  const propuesto = cargas[0] ?? null
  const capacidadOk = !!propuesto?.disponible

  // 5) Veredicto + fecha real más temprana.
  //   Si la cadena no entra → fecha real = fin proyectado (arrancando hoy).
  //   Si además NO hay cupo → deslizar la ventana hacia adelante semana a semana hasta
  //   que el ingeniero de más cupo se libere (< umbral), y tomar la más tardía.
  let fechaReal = fechaPedida
  let motivo: 'ok' | 'cadena' | 'capacidad' = 'ok'
  if (!cadenaEntra) { fechaReal = finProyectado; motivo = 'cadena' }
  if (!capacidadOk && ventanaIng && propuesto) {
    let corr = 0
    const dur = businessDaysBetween(ventanaIng.inicio, ventanaIng.fin, feriados)
    for (let sem = 1; sem <= 26; sem++) {
      const ini = addBusinessDays(ventanaIng.inicio, sem * 5, feriados)
      const fin = addBusinessDays(ini, dur, feriados)
      if (picoPct(cargaTareas, propuesto.nombre, ini, fin) + CARGA_PROYECTO_PCT <= UMBRAL_PCT) { corr = sem * 5; break }
    }
    const fechaCap = addBusinessDays(fechaPedida, corr || 5, feriados)
    if (fechaCap > fechaReal) { fechaReal = fechaCap; motivo = 'capacidad' }
  }
  const factible = cadenaEntra && capacidadOk
  const diasSlip = factible ? 0 : businessDaysBetween(fechaPedida, fechaReal, feriados)

  return {
    fecha_pedida: fechaPedida,
    factible,
    fecha_real_mas_temprana: fechaReal,
    dias_slip: diasSlip,
    ingeniero_propuesto: propuesto?.nombre ?? null,
    carga_pct: propuesto?.pico_pct ?? null,
    capacidad_ok: capacidadOk,
    ventana_ing: ventanaIng,
    cargas,
    motivo,
    provisional: true,
  }
}
