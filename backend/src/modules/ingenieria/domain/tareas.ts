// ─────────────────────────────────────────────────────────────────────────────
// Domain — Plan de Ingeniería (schedule con recursos)
// ─────────────────────────────────────────────────────────────────────────────
// Réplica nativa del Master.Sched de Smartsheet: tareas con ingeniero asignado,
// % de asignación de su capacidad, duración, fechas y dependencias, multi-proyecto.
// La CARGA de un ingeniero en una semana = suma de allocation_pct de sus tareas
// (no cerradas) cuyo rango [inicio, fin] solapa esa semana. >1.0 = sobreasignado.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { loadFeriados } from '../../schedule/domain/calendario'
import { calcularHolgura, type TareaCPM, type AristaCPM } from './holgura'
import { estadoDeposito, type EstadoDeposito } from './deposito'
import { estadoMuestras, type EstadoMuestras } from './muestras'
import { estadoCompras, type EstadoCompras } from './compras'
import { estadoInstalacion, type EstadoInstalacion } from './instalacion'

type QueryRunner = PoolClient | typeof pool

export interface Tarea {
  id: number
  proyecto_ext: string | null
  fase: string | null
  tipo_clave: string | null
  hito_codigo: string | null
  nombre: string
  asignado_nombre: string | null
  allocation_pct: number
  dur_dias: number
  fecha_inicio: string | null
  fecha_fin: string | null
  fecha_compromiso: string | null   // patrón "comprometida + cumplida": cuándo se hará
  fecha_fin_real: string | null     // cuándo se cumplió realmente
  estado: string
  status_ext: string | null
  comentario: string | null
  reprogramacion_pedida: boolean    // el ingeniero pidió reprogramación al PM (#2)
  reprogramacion_motivo: string | null  // por qué / cuándo podría
  decision: string | null           // respuesta del cliente en la revisión (#7): aprobado|rechazado|con_comentarios
  decision_comentarios: string | null  // qué dijo el cliente en la revisión
  envio_metodo: string | null       // cómo se envió al cliente (#5): correo|portal|ambos
}

export interface ProyectoResumen {
  proyecto_ext: string
  n_tareas: number
  fecha_inicio: string | null
  fecha_fin: string | null
  status_ext: string | null
}

/** Resumen general del plan de Ingeniería. */
export async function getResumen(runner: QueryRunner) {
  const { rows } = await runner.query<{ tareas: string; proyectos: string; ingenieros: string; con_tipo: string }>(
    `SELECT count(*) AS tareas,
            count(DISTINCT proyecto_ext) AS proyectos,
            count(DISTINCT asignado_nombre) FILTER (WHERE asignado_nombre IS NOT NULL) AS ingenieros,
            count(*) FILTER (WHERE tipo_id IS NOT NULL) AS con_tipo
       FROM ing_tareas`)
  const r = rows[0]
  return { tareas: +r.tareas, proyectos: +r.proyectos, ingenieros: +r.ingenieros, con_tipo: +r.con_tipo }
}

/** Proyectos del plan (agrupados), con conteo y ventana de fechas. */
export async function listProyectos(runner: QueryRunner): Promise<ProyectoResumen[]> {
  const { rows } = await runner.query<ProyectoResumen & { n_tareas: string }>(
    `SELECT proyecto_ext,
            count(*) AS n_tareas,
            to_char(min(fecha_inicio),'YYYY-MM-DD') AS fecha_inicio,
            to_char(max(fecha_fin),'YYYY-MM-DD') AS fecha_fin,
            max(status_ext) AS status_ext
       FROM ing_tareas
      WHERE proyecto_ext IS NOT NULL
      GROUP BY proyecto_ext
      ORDER BY min(fecha_inicio) NULLS LAST, proyecto_ext`)
  return rows.map((r) => ({ ...r, n_tareas: +r.n_tareas }))
}

/** Tareas (todas, o de un proyecto). */
export async function listTareas(runner: QueryRunner, proyectoExt?: string): Promise<Tarea[]> {
  const { rows } = await runner.query<Tarea & { allocation_pct: string; dur_dias: string }>(
    `SELECT t.id, t.proyecto_ext, t.fase, tt.clave AS tipo_clave, tt.hito_codigo,
            t.nombre, t.asignado_nombre, t.allocation_pct, t.dur_dias,
            to_char(t.fecha_inicio,'YYYY-MM-DD') AS fecha_inicio,
            to_char(t.fecha_fin,'YYYY-MM-DD') AS fecha_fin,
            to_char(t.fecha_compromiso,'YYYY-MM-DD') AS fecha_compromiso,
            to_char(t.fecha_fin_real,'YYYY-MM-DD') AS fecha_fin_real,
            t.estado, t.status_ext, t.comentario, t.reprogramacion_pedida, t.reprogramacion_motivo,
            t.decision, t.decision_comentarios, t.envio_metodo
       FROM ing_tareas t
       LEFT JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
      WHERE ($1::text IS NULL OR t.proyecto_ext = $1)
      ORDER BY t.proyecto_ext, t.fecha_inicio NULLS LAST, t.id`,
    [proyectoExt ?? null])
  return rows.map((r) => ({ ...r, allocation_pct: +r.allocation_pct, dur_dias: +r.dur_dias }))
}

export interface CargaIngeniero {
  nombre: string
  cargas: number[]      // % por semana, alineado a `semanas`
  n_tareas: number[]    // # tareas por semana
  pico: number
  promedio: number
}
export interface CargaResult {
  semanas: string[]     // lunes de cada semana (YYYY-MM-DD)
  ingenieros: CargaIngeniero[]
  tope: number          // umbral de sobrecarga (1.0 = 100%)
}

/** Matriz de carga por ingeniero por semana (la pieza estrella). */
export async function getCargaPorIngeniero(runner: QueryRunner): Promise<CargaResult> {
  const { rows: sem } = await runner.query<{ wk: string }>(
    `WITH bounds AS (
       SELECT date_trunc('week', min(fecha_inicio))::date AS d0, max(fecha_fin)::date AS d1
         FROM ing_tareas WHERE fecha_inicio IS NOT NULL)
     SELECT to_char(generate_series((SELECT d0 FROM bounds), (SELECT d1 FROM bounds), interval '7 day')::date,'YYYY-MM-DD') AS wk`)
  const semanas = sem.map((s) => s.wk)
  const wkIdx = new Map(semanas.map((w, i) => [w, i]))

  const { rows } = await runner.query<{ ing: string; wk: string; load_pct: string; n: string }>(
    `WITH bounds AS (
       SELECT date_trunc('week', min(fecha_inicio))::date AS d0, max(fecha_fin)::date AS d1
         FROM ing_tareas WHERE fecha_inicio IS NOT NULL),
     semanas AS (
       SELECT generate_series((SELECT d0 FROM bounds), (SELECT d1 FROM bounds), interval '7 day')::date AS wk)
     SELECT t.asignado_nombre AS ing, to_char(s.wk,'YYYY-MM-DD') AS wk,
            SUM(t.allocation_pct) AS load_pct, COUNT(*) AS n
       FROM ing_tareas t
       JOIN semanas s ON t.fecha_inicio <= s.wk + 6 AND t.fecha_fin >= s.wk
      WHERE t.asignado_nombre IS NOT NULL AND t.estado <> 'hecha'
      GROUP BY 1, 2`)

  const byIng = new Map<string, CargaIngeniero>()
  for (const r of rows) {
    let g = byIng.get(r.ing)
    if (!g) { g = { nombre: r.ing, cargas: new Array(semanas.length).fill(0), n_tareas: new Array(semanas.length).fill(0), pico: 0, promedio: 0 }; byIng.set(r.ing, g) }
    const i = wkIdx.get(r.wk); if (i === undefined) continue
    g.cargas[i] = +(+r.load_pct).toFixed(2)
    g.n_tareas[i] = +r.n
  }
  const ingenieros = [...byIng.values()]
  for (const g of ingenieros) {
    g.pico = +Math.max(0, ...g.cargas).toFixed(2)
    const activos = g.cargas.filter((c) => c > 0)
    g.promedio = activos.length ? +(activos.reduce((a, b) => a + b, 0) / activos.length).toFixed(2) : 0
  }
  ingenieros.sort((a, b) => b.pico - a.pico)
  return { semanas, ingenieros, tope: 1.0 }
}

export interface TareaCelda {
  nombre: string; proyecto_ext: string | null; tipo_clave: string | null
  fecha_inicio: string | null; fecha_fin: string | null; allocation_pct: number
}
/** Tareas de un ingeniero activas en una semana (detalle al hacer click en el heatmap). */
export async function getTareasDeCelda(runner: QueryRunner, ingeniero: string, semanaLunes: string): Promise<TareaCelda[]> {
  const { rows } = await runner.query<TareaCelda>(
    `SELECT t.nombre, t.proyecto_ext, tt.clave AS tipo_clave,
            to_char(t.fecha_inicio,'YYYY-MM-DD') AS fecha_inicio, to_char(t.fecha_fin,'YYYY-MM-DD') AS fecha_fin,
            COALESCE(t.allocation_pct,1)::float AS allocation_pct
       FROM ing_tareas t LEFT JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
      WHERE t.asignado_nombre = $1 AND t.estado <> 'hecha'
        AND t.fecha_inicio <= ($2::date + 6) AND t.fecha_fin >= $2::date
      ORDER BY t.proyecto_ext, t.fecha_inicio`, [ingeniero, semanaLunes])
  return rows
}

// ── Mapa de calor de ETAPAS del portafolio (herramienta de negociación de Estimados) ──
// Cuántos proyectos están en cada etapa cada semana. Solo planes REALES (Excel + aceptados
// por el PM); las sugerencias (deals sin confirmar) no cuentan.
export interface EtapaCarga { clave: string; nombre: string; orden: number; hito: string | null; counts: number[]; overlay?: number[] }
export interface CargaEtapasResult { semanas: string[]; etapas: EtapaCarga[]; sugerencia?: string }

// Rango de semanas = plan FIRME (import_excel/app) + el plan SUGERIDO del proyecto en
// negociación (si se pasa), para que el overlay tenga columnas donde caer aunque el
// proyecto nuevo se agende más allá del portafolio actual. $1 = proyecto_ext sugerido (o null).
const BOUNDS_CTE = `
  base_span AS (
    SELECT fecha_inicio, fecha_fin FROM ing_tareas
     WHERE fecha_inicio IS NOT NULL AND origen IN ('import_excel','app')
    UNION ALL
    SELECT fecha_inicio, fecha_fin FROM ing_tareas
     WHERE fecha_inicio IS NOT NULL AND origen = 'sugerencia' AND proyecto_ext = $1
  ),
  bounds AS (SELECT date_trunc('week', min(fecha_inicio))::date AS d0, max(fecha_fin)::date AS d1 FROM base_span),
  semanas AS (SELECT generate_series((SELECT d0 FROM bounds), (SELECT d1 FROM bounds), interval '7 day')::date AS wk)`

export async function getCargaPorEtapa(runner: QueryRunner, opts?: { sugerenciaExt?: string }): Promise<CargaEtapasResult> {
  const sug = opts?.sugerenciaExt ?? null

  const { rows: sem } = await runner.query<{ wk: string }>(
    `WITH ${BOUNDS_CTE} SELECT to_char(wk,'YYYY-MM-DD') AS wk FROM semanas`, [sug])
  const semanas = sem.map((s) => s.wk)
  const wkIdx = new Map(semanas.map((w, i) => [w, i]))

  // Carga base = proyectos FIRMES en cada etapa/semana (lo que ya está comprometido).
  const { rows } = await runner.query<{ clave: string; nombre: string; orden: number; hito: string | null; wk: string; n: string }>(
    `WITH ${BOUNDS_CTE}
     SELECT tt.clave, tt.nombre, tt.orden, tt.hito_codigo AS hito, to_char(s.wk,'YYYY-MM-DD') AS wk,
            COUNT(DISTINCT t.proyecto_ext) AS n
       FROM ing_tareas t
       JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
       JOIN semanas s ON t.fecha_inicio <= s.wk + 6 AND t.fecha_fin >= s.wk
      WHERE t.estado <> 'hecha' AND t.origen IN ('import_excel','app')
      GROUP BY tt.clave, tt.nombre, tt.orden, tt.hito_codigo, s.wk`, [sug])

  const byE = new Map<string, EtapaCarga>()
  const ensure = (clave: string, nombre: string, orden: number, hito: string | null): EtapaCarga => {
    let g = byE.get(clave)
    if (!g) {
      g = { clave, nombre, orden, hito, counts: new Array(semanas.length).fill(0) }
      if (sug) g.overlay = new Array(semanas.length).fill(0)
      byE.set(clave, g)
    }
    return g
  }
  for (const r of rows) {
    const g = ensure(r.clave, r.nombre, r.orden, r.hito)
    const i = wkIdx.get(r.wk); if (i !== undefined) g.counts[i] = +r.n
  }

  // Overlay = huella del plan SUGERIDO del proyecto en negociación (dónde caería, encima de lo firme).
  if (sug) {
    const { rows: ov } = await runner.query<{ clave: string; nombre: string; orden: number; hito: string | null; wk: string; n: string }>(
      `WITH ${BOUNDS_CTE}
       SELECT tt.clave, tt.nombre, tt.orden, tt.hito_codigo AS hito, to_char(s.wk,'YYYY-MM-DD') AS wk,
              COUNT(DISTINCT t.id) AS n
         FROM ing_tareas t
         JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
         JOIN semanas s ON t.fecha_inicio <= s.wk + 6 AND t.fecha_fin >= s.wk
        WHERE t.estado <> 'hecha' AND t.origen = 'sugerencia' AND t.proyecto_ext = $1
        GROUP BY tt.clave, tt.nombre, tt.orden, tt.hito_codigo, s.wk`, [sug])
    for (const r of ov) {
      const g = ensure(r.clave, r.nombre, r.orden, r.hito)
      const i = wkIdx.get(r.wk); if (i !== undefined && g.overlay) g.overlay[i] = +r.n
    }
  }

  const etapas = [...byE.values()].sort((a, b) => a.orden - b.orden)
  return { semanas, etapas, sugerencia: sug ?? undefined }
}

/** Proyectos en una etapa una semana (detalle al hacer click en el heatmap de etapas). */
export async function getProyectosDeEtapa(runner: QueryRunner, clave: string, semanaLunes: string): Promise<{ proyecto_ext: string | null; nombre: string; asignado_nombre: string | null; fecha_inicio: string | null; fecha_fin: string | null }[]> {
  const { rows } = await runner.query(
    `SELECT t.proyecto_ext, t.nombre, t.asignado_nombre,
            to_char(t.fecha_inicio,'YYYY-MM-DD') AS fecha_inicio, to_char(t.fecha_fin,'YYYY-MM-DD') AS fecha_fin
       FROM ing_tareas t JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
      WHERE tt.clave = $1 AND t.estado <> 'hecha' AND t.origen IN ('import_excel','app')
        AND t.fecha_inicio <= ($2::date + 6) AND t.fecha_fin >= $2::date
      ORDER BY t.proyecto_ext`, [clave, semanaLunes])
  return rows as any
}

// ── Plan de UN proyecto: tareas + dependencias + holgura/riesgo (CPM) ──
export interface TareaPlan extends Tarea {
  early_start: string | null
  early_finish: string | null
  late_finish: string | null
  holgura_dias: number | null
  critico: boolean
}
export interface AristaPlan { tarea_id: number; depende_de_id: number; tipo: string; lag_dias: number; ignorada_at?: string | null }
export interface PlanProyecto {
  proyecto_ext: string
  fecha_inicio: string | null   // inicio del proyecto (ancla hacia adelante)
  fecha_entrega: string | null  // entrega FIJA (ancla hacia atrás) — sagrada
  status_ext: string | null
  n_items: number | null
  presupuesto: number | null
  fin_proyectado: string | null // cuándo termina la cadena
  holgura_proyecto: number      // días hábiles de holgura del proyecto (< 0 = riesgo)
  en_riesgo: boolean
  deposito: EstadoDeposito       // gate del depósito: confirmación de Finanzas + candado del PM
  muestras: EstadoMuestras       // estado del módulo de Muestras (señal E-05, no bloquea)
  compras: EstadoCompras         // 5 hitos del módulo de Compras (MTO→cotiz→precio→OC→recepción)
  instalacion: EstadoInstalacion // avance del módulo de instalación de campo (I-04/I-07)
  tareas: TareaPlan[]
  aristas: AristaPlan[]
}

/** Devuelve el plan completo de un proyecto con la holgura de cada tarea. */
export async function getPlanProyecto(runner: QueryRunner, proyectoExt: string): Promise<PlanProyecto> {
  const { rows: hdr } = await runner.query<{ ini: string | null; entrega: string | null; status: string | null; n_items: number | null; presupuesto: string | null }>(
    `SELECT to_char(fecha_inicio,'YYYY-MM-DD') AS ini, to_char(fecha_entrega,'YYYY-MM-DD') AS entrega,
            status_ext AS status, n_items, presupuesto
       FROM ing_proyectos WHERE proyecto_ext = $1`, [proyectoExt])
  const h = hdr[0] ?? { ini: null, entrega: null, status: null, n_items: null, presupuesto: null }

  const tareas = await listTareas(runner, proyectoExt)
  const ids = tareas.map((t) => t.id)
  const { rows: deps } = ids.length
    ? await runner.query<AristaPlan>(
        `SELECT tarea_id, depende_de_id, tipo, lag_dias, to_char(ignorada_at,'YYYY-MM-DD') AS ignorada_at
           FROM ing_tarea_deps
          WHERE tarea_id = ANY($1) AND depende_de_id = ANY($1)`, [ids])
    : { rows: [] as AristaPlan[] }

  // Los hechos reales de los módulos con dueño se leen ANTES del CPM: son pisos "no antes
  // de" (depósito confirmado por Finanzas, long leads ordenados en Compras…) que empujan.
  const deposito = await estadoDeposito(runner, proyectoExt)
  const compras = await estadoCompras(runner, proyectoExt)
  const depClave = new Map(tareas.map((t) => [t.id, t.tipo_clave]))

  // Holgura: solo si el proyecto tiene inicio + entrega (ancla en ambas puntas).
  let holgura: PlanProyecto['tareas'] = tareas.map((t) => ({ ...t, early_start: null, early_finish: null, late_finish: null, holgura_dias: null, critico: false }))
  let finProyectado: string | null = null, holguraProyecto = 0, enRiesgo = false
  if (h.ini && h.entrega) {
    const feriados = await loadFeriados(runner)
    const cpmTareas: TareaCPM[] = tareas.map((t) => ({ id: t.id, dur: t.dur_dias, noAntesDe: pisoTarea(depClave.get(t.id) ?? null, deposito, compras) }))
    // Las aristas se mantienen SIEMPRE; el candado del PM actúa por el piso "no antes de"
    // de material_deposit (fecha de apertura), no borrando la dependencia. La marca
    // ignorada_at se sigue devolviendo (abajo) para dibujar el gate abierto en la UI.
    const cpmAristas: AristaCPM[] = deps
      .map((d) => ({ tareaId: d.tarea_id, dependeDeId: d.depende_de_id, lag: d.lag_dias, tipo: d.tipo === 'SS' ? 'SS' : 'FS' }))
    try {
      const r = calcularHolgura(cpmTareas, cpmAristas, h.ini, h.entrega, feriados)
      finProyectado = r.finProyectado; holguraProyecto = r.holguraProyecto; enRiesgo = r.enRiesgo
      holgura = tareas.map((t) => {
        const c = r.tareas.get(t.id)
        return { ...t, early_start: c?.earlyStart ?? null, early_finish: c?.earlyFinish ?? null,
          late_finish: c?.lateFinish ?? null, holgura_dias: c?.holguraDias ?? null, critico: c?.critico ?? false }
      })
    } catch { /* ciclo en dependencias: se devuelve el plan sin holgura */ }
  }

  const muestras = await estadoMuestras(runner, proyectoExt)
  const instalacion = await estadoInstalacion(runner, proyectoExt)

  return {
    proyecto_ext: proyectoExt, fecha_inicio: h.ini, fecha_entrega: h.entrega, status_ext: h.status,
    n_items: h.n_items, presupuesto: h.presupuesto != null ? +h.presupuesto : null,
    fin_proyectado: finProyectado, holgura_proyecto: holguraProyecto, en_riesgo: enRiesgo,
    deposito, muestras, compras, instalacion, tareas: holgura, aristas: deps,
  }
}

/** Piso "no antes de" por tarea = el HECHO real que la ancla, leído de los módulos con dueño.
 *  Único punto del mapeo hecho→piso (reusable para cada tarea que se maneje sola):
 *   · material_deposit → resolución del depósito (pago de Finanzas o apertura del candado).
 *   · long_leads       → fecha de la 1ª OC emitida (long leads ORDENADOS, del módulo de
 *     Compras). Si se ordena tarde, empuja; si aún no se ordenó, no ancla (plan estimado). */
function pisoTarea(tipoClave: string | null, deposito: EstadoDeposito, compras: EstadoCompras): string | undefined {
  if (tipoClave === 'material_deposit') return deposito.fecha_resolucion ?? undefined
  if (tipoClave === 'long_leads') return compras.fecha_primera_oc ?? undefined
  return undefined
}

/** Recalcula el CPM (con candado del PM + piso del depósito) y GUARDA fecha_inicio/fin de
 *  cada tarea. Se llama en cada mutación que mueve el schedule (re-anclaje, confirmación del
 *  depósito, candado) para que las fechas guardadas —que lee el heatmap— sigan al Gantt. */
export async function recomputarYGuardar(runner: QueryRunner, proyectoExt: string): Promise<void> {
  const { rows: hdr } = await runner.query<{ ini: string | null; entrega: string | null }>(
    `SELECT to_char(fecha_inicio,'YYYY-MM-DD') AS ini, to_char(fecha_entrega,'YYYY-MM-DD') AS entrega
       FROM ing_proyectos WHERE proyecto_ext = $1`, [proyectoExt])
  const h = hdr[0]
  if (!h?.ini || !h?.entrega) return
  const tareas = await listTareas(runner, proyectoExt)
  if (!tareas.length) return
  const ids = tareas.map((t) => t.id)
  const { rows: deps } = await runner.query<{ tarea_id: number; depende_de_id: number; tipo: string; lag_dias: number }>(
    `SELECT tarea_id, depende_de_id, tipo, lag_dias FROM ing_tarea_deps
      WHERE tarea_id = ANY($1) AND depende_de_id = ANY($1)`, [ids])
  const deposito = await estadoDeposito(runner, proyectoExt)
  const compras = await estadoCompras(runner, proyectoExt)
  const clave = new Map(tareas.map((t) => [t.id, t.tipo_clave]))
  const feriados = await loadFeriados(runner)
  const cpmTareas: TareaCPM[] = tareas.map((t) => ({ id: t.id, dur: t.dur_dias, noAntesDe: pisoTarea(clave.get(t.id) ?? null, deposito, compras) }))
  const aristas: AristaCPM[] = deps.map((d) => ({ tareaId: d.tarea_id, dependeDeId: d.depende_de_id, lag: d.lag_dias, tipo: d.tipo === 'SS' ? 'SS' : 'FS' }))
  try {
    const r = calcularHolgura(cpmTareas, aristas, h.ini, h.entrega, feriados)
    for (const t of tareas) {
      const c = r.tareas.get(t.id)
      if (c) await runner.query(`UPDATE ing_tareas SET fecha_inicio = $2, fecha_fin = $3 WHERE id = $1`, [t.id, c.earlyStart, c.earlyFinish])
    }
  } catch { /* ciclo improbable: se deja como está */ }
}

// ── Edición (MVP: que el creador la pruebe y la corrijamos) ──
export interface TareaInput {
  proyecto_ext?: string | null; nombre: string; asignado_nombre?: string | null
  allocation_pct?: number; dur_dias?: number; fecha_inicio?: string | null; fecha_fin?: string | null
  estado?: string; comentario?: string | null
}

/** Normaliza el nombre del ingeniero: trim + reusa la forma canónica ya existente si
 *  hay un match sin distinguir mayúsculas ("ADRIANA MENDEZ" → "Adriana Mendez"). Evita
 *  que un ingeniero quede partido en dos por diferencias de tipeo. */
async function canonicalIngeniero(runner: QueryRunner, nombre: string | null | undefined): Promise<string | null> {
  const n = (nombre ?? '').trim()
  if (!n) return null
  const { rows } = await runner.query<{ asignado_nombre: string }>(
    `SELECT asignado_nombre FROM ing_tareas
      WHERE asignado_nombre IS NOT NULL AND lower(asignado_nombre) = lower($1)
      GROUP BY asignado_nombre
      ORDER BY count(*) DESC, asignado_nombre
      LIMIT 1`, [n])
  return rows[0]?.asignado_nombre ?? n
}

export async function crearTarea(runner: QueryRunner, t: TareaInput): Promise<{ id: number }> {
  const asignado = await canonicalIngeniero(runner, t.asignado_nombre)
  const { rows } = await runner.query<{ id: number }>(
    `INSERT INTO ing_tareas (proyecto_ext, nombre, asignado_nombre, allocation_pct, dur_dias, fecha_inicio, fecha_fin, estado, comentario, origen)
       VALUES ($1,$2,$3,COALESCE($4,1.0),COALESCE($5,1),$6,$7,COALESCE($8,'pendiente'),$9,'manual') RETURNING id`,
    [t.proyecto_ext ?? null, t.nombre, asignado, t.allocation_pct ?? null, t.dur_dias ?? null,
     t.fecha_inicio ?? null, t.fecha_fin ?? null, t.estado ?? null, t.comentario ?? null])
  return rows[0]
}

export async function actualizarTarea(runner: QueryRunner, id: number, t: TareaInput): Promise<boolean> {
  const asignado = await canonicalIngeniero(runner, t.asignado_nombre)
  const { rowCount } = await runner.query(
    `UPDATE ing_tareas SET
        nombre = COALESCE($2, nombre),
        asignado_nombre = $3,
        allocation_pct = COALESCE($4, allocation_pct),
        dur_dias = COALESCE($5, dur_dias),
        fecha_inicio = $6, fecha_fin = $7,
        estado = COALESCE($8, estado),
        comentario = $9,
        updated_at = NOW()
      WHERE id = $1`,
    [id, t.nombre ?? null, asignado, t.allocation_pct ?? null, t.dur_dias ?? null,
     t.fecha_inicio ?? null, t.fecha_fin ?? null, t.estado ?? null, t.comentario ?? null])
  return (rowCount ?? 0) > 0
}

/** Reporte de AVANCE (Ingeniería): toca SOLO estado/comentario, con updates
 *  parciales — nunca pisa asignado_nombre, fechas, allocation ni dur (eso es
 *  estructura del plan, del PM). Distinto de actualizarTarea (edición completa). */
export async function reportarAvance(
  runner: QueryRunner, id: number,
  data: {
    estado?: string; comentario?: string | null; fecha_compromiso?: string | null; fecha_fin_real?: string | null
    reprogramacion_pedida?: boolean; reprogramacion_motivo?: string | null; decision?: string | null
    decision_comentarios?: string | null; envio_metodo?: string | null
  }
): Promise<boolean> {
  const sets: string[] = []
  const vals: unknown[] = [id]
  if (data.estado !== undefined) { vals.push(data.estado); sets.push(`estado = $${vals.length}`) }
  if (data.comentario !== undefined) { vals.push(data.comentario); sets.push(`comentario = $${vals.length}`) }
  // Patrón "comprometida + cumplida": ambas parciales, aceptan null para limpiar.
  if (data.fecha_compromiso !== undefined) { vals.push(data.fecha_compromiso); sets.push(`fecha_compromiso = $${vals.length}`) }
  if (data.fecha_fin_real !== undefined) { vals.push(data.fecha_fin_real); sets.push(`fecha_fin_real = $${vals.length}`) }
  // Cierre de capturas: pedido de reprogramación (#2) y decisión del cliente (#7).
  if (data.reprogramacion_pedida !== undefined) { vals.push(data.reprogramacion_pedida); sets.push(`reprogramacion_pedida = $${vals.length}`) }
  if (data.reprogramacion_motivo !== undefined) { vals.push(data.reprogramacion_motivo); sets.push(`reprogramacion_motivo = $${vals.length}`) }
  if (data.decision !== undefined) { vals.push(data.decision); sets.push(`decision = $${vals.length}`) }
  if (data.decision_comentarios !== undefined) { vals.push(data.decision_comentarios); sets.push(`decision_comentarios = $${vals.length}`) }
  if (data.envio_metodo !== undefined) { vals.push(data.envio_metodo); sets.push(`envio_metodo = $${vals.length}`) }
  if (!sets.length) return false
  sets.push('updated_at = NOW()')
  const { rowCount } = await runner.query(`UPDATE ing_tareas SET ${sets.join(', ')} WHERE id = $1`, vals)
  return (rowCount ?? 0) > 0
}

/** Reject-loop del paso #7: cuando el cliente RECHAZA la revisión, shop_drawings vuelve a
 *  "pendiente" (hay que re-dibujar), con el motivo del rechazo, para que el ingeniero lo vea
 *  en su escritorio. El PM extiende los días de shop_drawings/review → el schedule recalcula. */
export async function reabrirShopDrawingsPorRechazo(runner: QueryRunner, clientReviewId: number, comentarios: string | null): Promise<boolean> {
  const { rows } = await runner.query<{ ext: string | null }>(
    `SELECT proyecto_ext AS ext FROM ing_tareas WHERE id = $1`, [clientReviewId])
  const ext = rows[0]?.ext
  if (!ext) return false
  const motivo = comentarios ? `Cliente rechazó la revisión: ${comentarios}` : 'Cliente rechazó la revisión — re-dibujar'
  const { rowCount } = await runner.query(
    `UPDATE ing_tareas t SET estado = 'pendiente', fecha_fin_real = NULL, comentario = $2, updated_at = NOW()
       FROM ing_tarea_tipos tt
      WHERE t.tipo_id = tt.id AND tt.clave = 'shop_drawings' AND t.proyecto_ext = $1`, [ext, motivo])
  return (rowCount ?? 0) > 0
}

export interface Reprogramacion {
  id: number
  proyecto_ext: string | null
  nombre: string
  tipo_clave: string | null
  asignado_nombre: string | null
  motivo: string | null
  fecha_inicio: string | null
}

/** Tareas que piden reprogramación, en todos los proyectos — para la bandeja del PM. */
export async function listReprogramaciones(runner: QueryRunner): Promise<Reprogramacion[]> {
  const { rows } = await runner.query<Reprogramacion>(
    `SELECT t.id, t.proyecto_ext, t.nombre, tt.clave AS tipo_clave, t.asignado_nombre,
            t.reprogramacion_motivo AS motivo,
            to_char(t.fecha_inicio,'YYYY-MM-DD') AS fecha_inicio
       FROM ing_tareas t
       LEFT JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
      WHERE t.reprogramacion_pedida = TRUE
      ORDER BY t.fecha_inicio NULLS LAST, t.proyecto_ext`)
  return rows
}

/**
 * Borra una tarea RECONECTANDO la cadena: cada sucesor pasa a depender de cada
 * predecesor de la tarea borrada (lag 0). Así, borrar "Muestras" no rompe la
 * secuencia — los días liberados se vuelven holgura (decisión de Chali).
 */
export async function borrarTareaConReconexion(runner: QueryRunner, id: number): Promise<{ ok: boolean; reconectadas: number }> {
  // sucesor de X depende de predecesor de X (evita self-loop y duplicados)
  const { rowCount: rec } = await runner.query(
    `INSERT INTO ing_tarea_deps (tarea_id, depende_de_id, tipo, lag_dias)
       SELECT s.tarea_id, p.depende_de_id, 'FS', 0
         FROM ing_tarea_deps s
         JOIN ing_tarea_deps p ON p.tarea_id = $1
        WHERE s.depende_de_id = $1 AND s.tarea_id <> p.depende_de_id
     ON CONFLICT (tarea_id, depende_de_id) DO NOTHING`, [id])
  const { rowCount } = await runner.query(`DELETE FROM ing_tareas WHERE id = $1`, [id]) // cascade borra sus aristas
  return { ok: (rowCount ?? 0) > 0, reconectadas: rec ?? 0 }
}

// ── Dependencias (aristas) editables ──
/** ¿Agregar (tareaId depende de dependeDeId) crearía un ciclo? */
async function crearíaCiclo(runner: QueryRunner, proyectoExt: string | null, tareaId: number, dependeDeId: number): Promise<boolean> {
  if (tareaId === dependeDeId) return true
  const { rows } = await runner.query<{ tarea_id: number; depende_de_id: number }>(
    `SELECT d.tarea_id, d.depende_de_id FROM ing_tarea_deps d
       JOIN ing_tareas t ON t.id = d.tarea_id
      WHERE t.proyecto_ext IS NOT DISTINCT FROM $1`, [proyectoExt])
  // flujo: depende_de_id -> tarea_id. Ciclo si dependeDeId es alcanzable desde tareaId.
  const succ = new Map<number, number[]>()
  for (const r of rows) { if (!succ.has(r.depende_de_id)) succ.set(r.depende_de_id, []); succ.get(r.depende_de_id)!.push(r.tarea_id) }
  const seen = new Set<number>([tareaId]); const stack = [tareaId]
  while (stack.length) { const n = stack.pop()!; for (const s of succ.get(n) ?? []) { if (s === dependeDeId) return true; if (!seen.has(s)) { seen.add(s); stack.push(s) } } }
  return false
}

export async function agregarDep(runner: QueryRunner, tareaId: number, dependeDeId: number, lag = 0, tipo = 'FS'): Promise<{ ok: boolean; error?: string }> {
  const { rows } = await runner.query<{ proyecto_ext: string | null }>(`SELECT proyecto_ext FROM ing_tareas WHERE id = $1`, [tareaId])
  if (!rows[0]) return { ok: false, error: 'tarea no encontrada' }
  if (await crearíaCiclo(runner, rows[0].proyecto_ext, tareaId, dependeDeId)) return { ok: false, error: 'esa dependencia crearía un ciclo' }
  await runner.query(
    `INSERT INTO ing_tarea_deps (tarea_id, depende_de_id, tipo, lag_dias) VALUES ($1,$2,$3,$4)
     ON CONFLICT (tarea_id, depende_de_id) DO UPDATE SET tipo = EXCLUDED.tipo, lag_dias = EXCLUDED.lag_dias`,
    [tareaId, dependeDeId, tipo, lag])
  return { ok: true }
}

export async function borrarDep(runner: QueryRunner, tareaId: number, dependeDeId: number): Promise<boolean> {
  const { rowCount } = await runner.query(`DELETE FROM ing_tarea_deps WHERE tarea_id = $1 AND depende_de_id = $2`, [tareaId, dependeDeId])
  return (rowCount ?? 0) > 0
}
