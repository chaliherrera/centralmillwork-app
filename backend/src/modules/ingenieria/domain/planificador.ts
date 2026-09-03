// ─────────────────────────────────────────────────────────────────────────────
// Planificador — LA FUENTE ÚNICA de "quién hace este proyecto y cuándo".
// ─────────────────────────────────────────────────────────────────────────────
// Un solo cálculo que usan TANTO la factibilidad (en seco, para Estimados) COMO
// el generador del plan (para persistir). Así nunca se contradicen.
//
// Modelo (decidido con Chali): COLA SERIAL por ingeniero — una tarea a la vez.
//   · El bloque de ingeniería del proyecto nuevo arranca cuando el ingeniero se
//     LIBERA (fin de su última tarea pendiente + 1 día hábil), no hoy.
//   · Se elige al ingeniero ACTIVO que se libera ANTES (da la fecha más temprana).
//   · El "%" de asignación es informativo, no decide (la cola decide).
// El motor de fechas es el CPM existente (holgura.ts); acá solo lo alimentamos
// con el piso "no antes de" = la disponibilidad del ingeniero.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { calcularHolgura, TareaCPM, AristaCPM, HolguraProyecto } from './holgura'
import { addBusinessDays, businessDaysBetween, loadFeriados, ISODate } from '../../schedule/domain/calendario'

type QueryRunner = PoolClient | typeof pool

// Roles cuyas tareas consumen la capacidad del "un ingeniero" del proyecto.
export const ROLES_INGENIERO = new Set(['ingenieria', 'field'])
const STONE_CLAVES = ['stone_measure', 'stone_fab', 'stone_install']

export interface PasoRuta { clave: string; tipoId: number; nombre: string; rol: string | null; dur: number }
export interface AristaRuta { clave: string; dependeDe: string; tipo: 'FS' | 'SS'; lag: number }
export interface PlantillaRuta { pasos: PasoRuta[]; aristas: AristaRuta[] }

export interface ColaIngeniero { nombre: string; hace_cnc: boolean; n_pendientes: number; fin_ultima: ISODate | null }

export interface FechaPaso { clave: string; es: ISODate; ef: ISODate; rol: string | null; tipoId: number; dur: number }
export interface RankingIng { nombre: string; hace_cnc: boolean; disponible_desde: ISODate; n_pendientes: number; fin_proyectado: ISODate; entra: boolean }
export interface Ubicacion {
  ingeniero: string | null            // null si no hay ingenieros activos
  disponible_desde: ISODate           // cuándo se libera el elegido (o hoy)
  fechas: Map<string, FechaPaso>      // ES/EF de cada paso (clave → fechas)
  ventana_ing: { inicio: ISODate; fin: ISODate } | null
  fin_proyectado: ISODate
  entra: boolean                      // fin_proyectado ≤ fechaEntrega
  holgura_dias: number
  fin_desde_hoy: ISODate              // fin si el ingeniero estuviera libre hoy (distingue cadena/capacidad)
  motivo: 'ok' | 'cadena' | 'capacidad' | 'sin_ingenieros'
  ranking: RankingIng[]
}

// ── Capa 1: carga desde la base ──────────────────────────────────────────────

/** Plantilla de la ruta (18 pasos) con duraciones por ítem, filtrada por stone/instalación. */
export async function cargarPlantillaRuta(
  runner: QueryRunner, opts: { itemsQty: number | null; hayStone: boolean; incluyeInstalacion: boolean }
): Promise<PlantillaRuta> {
  const { rows: tipos } = await runner.query<{ id: number; clave: string; nombre: string; rol: string | null; dur_dias_tipico: number | null; dias_por_item: number | null }>(
    `SELECT id, clave, nombre, rol, dur_dias_tipico, dias_por_item FROM ing_tarea_tipos`)
  const incluir = tipos.filter((t) =>
    (opts.hayStone || !STONE_CLAVES.includes(t.clave)) &&
    (opts.incluyeInstalacion || t.clave !== 'installation'))
  const claves = new Set(incluir.map((t) => t.clave))
  const pasos: PasoRuta[] = incluir.map((t) => {
    let dur = Math.max(0, t.dur_dias_tipico ?? 3)
    if (opts.itemsQty != null && opts.itemsQty > 0 && t.dias_por_item != null && Number(t.dias_por_item) > 0)
      dur = Math.max(1, Math.round(opts.itemsQty * Number(t.dias_por_item)))
    return { clave: t.clave, tipoId: t.id, nombre: t.nombre, rol: t.rol, dur }
  })
  const { rows: deps } = await runner.query<{ tipo_clave: string; depende_de_clave: string; tipo: string; lag_dias: number }>(
    `SELECT tipo_clave, depende_de_clave, tipo, lag_dias FROM ing_tipo_deps`)
  const aristas: AristaRuta[] = deps
    .filter((d) => claves.has(d.tipo_clave) && claves.has(d.depende_de_clave))
    .map((d) => ({ clave: d.tipo_clave, dependeDe: d.depende_de_clave, tipo: d.tipo === 'SS' ? 'SS' : 'FS', lag: d.lag_dias }))
  return { pasos, aristas }
}

/** La cola de cada ingeniero ACTIVO: sus tareas firmes no cerradas (lo que lo ocupa)
 *  y el fin de su última tarea. `excluirProyectoExt` = no contarse a sí mismo al regenerar. */
export async function cargarColaIngenieros(
  runner: QueryRunner, opts?: { excluirProyectoExt?: string }
): Promise<ColaIngeniero[]> {
  const ex = opts?.excluirProyectoExt ?? null
  const { rows } = await runner.query<{ nombre: string; hace_cnc: boolean; n: string; fin: ISODate | null }>(
    `SELECT i.nombre, i.hace_cnc, count(t.id)::int AS n,
            to_char(max(t.fecha_fin),'YYYY-MM-DD') AS fin
       FROM ing_ingenieros i
       LEFT JOIN ing_tareas t
              ON t.asignado_nombre = i.nombre
             AND t.estado NOT IN ('hecha','na')
             AND t.origen IN ('app','import_excel','manual')
             AND t.dur_dias > 0
             AND t.fecha_fin IS NOT NULL
             AND ($1::text IS NULL OR t.proyecto_ext <> $1)
      WHERE i.activo
      GROUP BY i.nombre, i.hace_cnc
      ORDER BY i.nombre`, [ex])
  return rows.map((r) => ({ nombre: r.nombre, hace_cnc: r.hace_cnc, n_pendientes: +r.n, fin_ultima: r.fin }))
}

// ── Capa 2: PURA — la decisión (misma para factibilidad y generador) ─────────

function ventanaIng(pasos: PasoRuta[], clavesIng: Set<string>, res: HolguraProyecto, idPorClave: Map<string, number>) {
  let ini: ISODate | null = null, fin: ISODate | null = null
  for (const x of pasos) {
    if (!clavesIng.has(x.clave)) continue
    const c = res.tareas.get(idPorClave.get(x.clave)!)
    if (!c) continue
    if (ini === null || c.earlyStart < ini) ini = c.earlyStart
    if (fin === null || c.earlyFinish > fin) fin = c.earlyFinish
  }
  return ini && fin ? { inicio: ini, fin } : null
}

function fechasDe(pasos: PasoRuta[], res: HolguraProyecto, idPorClave: Map<string, number>): Map<string, FechaPaso> {
  const m = new Map<string, FechaPaso>()
  for (const x of pasos) {
    const c = res.tareas.get(idPorClave.get(x.clave)!)
    if (c) m.set(x.clave, { clave: x.clave, es: c.earlyStart, ef: c.earlyFinish, rol: x.rol, tipoId: x.tipoId, dur: x.dur })
  }
  return m
}

/** El corazón. Puro (no toca DB): dada la plantilla y las colas, decide ingeniero + fechas. */
export function ubicarProyecto(
  plantilla: PlantillaRuta, colas: ColaIngeniero[],
  p: { hoy: ISODate; diaCero: ISODate; fechaEntrega: ISODate; feriados: Set<ISODate> },
): Ubicacion {
  const { pasos, aristas } = plantilla
  const idPorClave = new Map<string, number>()
  pasos.forEach((x, i) => idPorClave.set(x.clave, i + 1))
  const cpmAristas: AristaCPM[] = aristas
    .filter((a) => idPorClave.has(a.clave) && idPorClave.has(a.dependeDe))
    .map((a) => ({ tareaId: idPorClave.get(a.clave)!, dependeDeId: idPorClave.get(a.dependeDe)!, lag: a.lag, tipo: a.tipo }))
  const clavesIng = new Set(pasos.filter((x) => ROLES_INGENIERO.has(x.rol ?? '')).map((x) => x.clave))

  // Corre el CPM anclando la INGENIERÍA en un piso "no antes de" (la disponibilidad del ing).
  const correr = (pisoIng: ISODate | null): HolguraProyecto => {
    const tareas: TareaCPM[] = pasos.map((x) => ({
      id: idPorClave.get(x.clave)!, dur: x.dur,
      noAntesDe: (pisoIng && clavesIng.has(x.clave)) ? pisoIng : undefined,
    }))
    return calcularHolgura(tareas, cpmAristas, p.diaCero, p.fechaEntrega, p.feriados)
  }

  // Con el ingeniero libre HOY (solo la cadena manda) → para distinguir cadena vs capacidad.
  const libre = correr(null)
  const finDesdeHoy = libre.finProyectado ?? p.fechaEntrega

  // Disponibilidad = fin de su última tarea + 1 hábil (nunca antes de hoy).
  const disponible = (c: ColaIngeniero): ISODate =>
    c.fin_ultima && c.fin_ultima >= p.hoy ? addBusinessDays(c.fin_ultima, 1, p.feriados) : p.hoy

  const evaluados = colas.map((c) => {
    const desde = disponible(c)
    const res = correr(desde)
    const fin = res.finProyectado ?? p.fechaEntrega
    return { cola: c, desde, fin, res, entra: fin <= p.fechaEntrega, holgura: businessDaysBetween(fin, p.fechaEntrega, p.feriados) }
  }).sort((a, b) =>
    a.desde.localeCompare(b.desde) || a.cola.n_pendientes - b.cola.n_pendientes || a.cola.nombre.localeCompare(b.cola.nombre))

  const ranking: RankingIng[] = evaluados.map((e) => ({
    nombre: e.cola.nombre, hace_cnc: e.cola.hace_cnc, disponible_desde: e.desde,
    n_pendientes: e.cola.n_pendientes, fin_proyectado: e.fin, entra: e.entra,
  }))

  if (!evaluados.length) {
    return {
      ingeniero: null, disponible_desde: p.hoy, fechas: fechasDe(pasos, libre, idPorClave),
      ventana_ing: ventanaIng(pasos, clavesIng, libre, idPorClave),
      fin_proyectado: finDesdeHoy, entra: finDesdeHoy <= p.fechaEntrega,
      holgura_dias: businessDaysBetween(finDesdeHoy, p.fechaEntrega, p.feriados),
      fin_desde_hoy: finDesdeHoy, motivo: 'sin_ingenieros', ranking,
    }
  }

  const elegido = evaluados[0]
  const motivo: Ubicacion['motivo'] = elegido.entra ? 'ok' : (finDesdeHoy <= p.fechaEntrega ? 'capacidad' : 'cadena')
  return {
    ingeniero: elegido.cola.nombre, disponible_desde: elegido.desde,
    fechas: fechasDe(pasos, elegido.res, idPorClave),
    ventana_ing: ventanaIng(pasos, clavesIng, elegido.res, idPorClave),
    fin_proyectado: elegido.fin, entra: elegido.entra, holgura_dias: elegido.holgura,
    fin_desde_hoy: finDesdeHoy, motivo, ranking,
  }
}

// ── Capa 3: orquestación (lo que llaman factibilidad y generador) ────────────

export async function planificarProyecto(
  runner: QueryRunner,
  p: { itemsQty: number | null; hayStone: boolean; incluyeInstalacion: boolean; fechaEntrega: ISODate; diaCero?: ISODate; excluirProyectoExt?: string },
): Promise<Ubicacion> {
  const hoy = new Date().toISOString().slice(0, 10)
  const feriados = await loadFeriados(runner)
  const plantilla = await cargarPlantillaRuta(runner, p)
  const colas = await cargarColaIngenieros(runner, { excluirProyectoExt: p.excluirProyectoExt })
  return ubicarProyecto(plantilla, colas, { hoy, diaCero: p.diaCero ?? hoy, fechaEntrega: p.fechaEntrega, feriados })
}
