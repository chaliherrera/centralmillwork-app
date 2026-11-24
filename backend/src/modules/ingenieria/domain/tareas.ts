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
import { loadFeriados, addBusinessDays, subBusinessDays, businessDaysBetween, isBusinessDay, type ISODate } from '../../schedule/domain/calendario'
import { cargarColaIngenieros, ROLES_INGENIERO } from './planificador'
import { capturarFechasReales } from '../../schedule/domain/captura'
import { proyectarHitos, esInferida, type HitoPlantilla, type PasoFechas } from '../../schedule/domain/proyeccion'
import { calcularHolgura, normalizarTipoDep, type TareaCPM, type AristaCPM, type HolguraTarea, type HolguraProyecto } from './holgura'
import { logger } from '../../../utils/logger'
import { captureException } from '../../../utils/sentry'
import { parsearPredecesores, resolverPredecesores, formatearPredecesores, type ErrorPred } from './predecesores'
import { tieneCiclo, planificarMovimiento, type CambioArista, type AristaRe, type TareaRe } from './reordenar'
import { estadoDeposito, type EstadoDeposito } from './deposito'
import { estadoMuestras, type EstadoMuestras } from './muestras'
import { estadoCompras, type EstadoCompras } from './compras'
import { estadoInstalacion, type EstadoInstalacion } from './instalacion'
import { estadoProduccion } from './produccion'

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
  orden_visual: number | null       // orden de la FILA en la lista (drag visual, no toca fechas)
  fecha_inicio: string | null
  fecha_fin: string | null
  fecha_compromiso: string | null   // patrón "comprometida + cumplida": cuándo se hará
  fecha_fin_real: string | null     // cuándo se cumplió realmente
  no_antes_de: string | null        // piso explícito (planificador: disponibilidad del ingeniero)
  avance_pct: number | null         // % de avance MANUAL (0..1) para pasos de diseño
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
            t.nombre, t.asignado_nombre, t.allocation_pct, t.dur_dias, t.orden_visual,
            to_char(t.fecha_inicio,'YYYY-MM-DD') AS fecha_inicio,
            to_char(t.fecha_fin,'YYYY-MM-DD') AS fecha_fin,
            to_char(t.fecha_compromiso,'YYYY-MM-DD') AS fecha_compromiso,
            to_char(t.fecha_fin_real,'YYYY-MM-DD') AS fecha_fin_real,
            to_char(t.no_antes_de,'YYYY-MM-DD') AS no_antes_de, t.avance_pct,
            t.estado, t.status_ext, t.comentario, t.reprogramacion_pedida, t.reprogramacion_motivo,
            t.decision, t.decision_comentarios, t.envio_metodo
       FROM ing_tareas t
       LEFT JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
      WHERE ($1::text IS NULL OR t.proyecto_ext = $1)
      ORDER BY t.proyecto_ext, t.orden_visual NULLS LAST, t.fecha_inicio NULLS LAST, t.id`,
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
       LEFT JOIN ing_ingenieros i ON i.nombre = t.asignado_nombre
      WHERE t.asignado_nombre IS NOT NULL AND t.estado <> 'hecha'
        AND (i.nombre IS NULL OR i.activo = true)
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

// ── Lookahead: una ETAPA, un rango de semanas, DÍA A DÍA across proyectos ──
// Qué proyectos deben trabajarse cada día en esa etapa, cuántos simultáneos, y la
// cantidad de ítems por proyecto. (Los montos $ quedan fuera: los costos reales no
// están en main — ver [[project_estimados_costeo_2026_09_30]].)
export interface LookaheadProyecto {
  proyecto_ext: string | null; nombre: string; asignado_nombre: string | null
  inicio: string | null; fin: string | null; n_items: number | null
  dias: boolean[]   // activo cada día del rango (alineado con `dias`)
}
export interface LookaheadResp {
  etapa: { clave: string; nombre: string } | null
  dias: string[]          // días hábiles del rango
  simultaneos: number[]   // cuántos proyectos activos cada día
  proyectos: LookaheadProyecto[]
}

export async function getLookaheadEtapa(runner: QueryRunner, clave: string, desde: string, hasta: string): Promise<LookaheadResp> {
  const { rows: [tt] } = await runner.query<{ nombre: string }>(`SELECT nombre FROM ing_tarea_tipos WHERE clave = $1`, [clave])
  const etapa = tt ? { clave, nombre: tt.nombre } : null
  const feriados = await loadFeriados(runner)
  // Días HÁBILES del rango (lun-vie menos feriados), con tope de seguridad.
  const dias: string[] = []
  const DAY = 86_400_000
  let cur = Date.parse(desde + 'T00:00:00Z'); const end = Date.parse(hasta + 'T00:00:00Z')
  while (cur <= end && dias.length < 90) {
    const iso = new Date(cur).toISOString().slice(0, 10)
    if (isBusinessDay(iso, feriados)) dias.push(iso)
    cur += DAY
  }
  const { rows } = await runner.query<{ proyecto_ext: string | null; nombre: string; asignado_nombre: string | null; inicio: string | null; fin: string | null; n_items: number | null }>(
    `SELECT t.proyecto_ext, t.nombre, t.asignado_nombre,
            to_char(t.fecha_inicio,'YYYY-MM-DD') AS inicio, to_char(t.fecha_fin,'YYYY-MM-DD') AS fin, ip.n_items
       FROM ing_tareas t JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
       LEFT JOIN ing_proyectos ip ON ip.proyecto_ext = t.proyecto_ext
      WHERE tt.clave = $1 AND t.estado <> 'hecha' AND t.origen IN ('import_excel','app')
        AND t.fecha_inicio <= $3::date AND t.fecha_fin >= $2::date
      ORDER BY t.fecha_inicio NULLS LAST, t.proyecto_ext`, [clave, desde, hasta])
  const simultaneos = dias.map(() => 0)
  const proyectos: LookaheadProyecto[] = rows.map((r) => {
    const activos = dias.map((dia, i) => {
      const on = !!(r.inicio && r.fin && dia >= r.inicio && dia <= r.fin)
      if (on) simultaneos[i]++
      return on
    })
    return { proyecto_ext: r.proyecto_ext, nombre: r.nombre, asignado_nombre: r.asignado_nombre, inicio: r.inicio, fin: r.fin, n_items: r.n_items, dias: activos }
  })
  return { etapa, dias, simultaneos, proyectos }
}

// ── Plan de UN proyecto: tareas + dependencias + holgura/riesgo (CPM) ──
export interface TareaPlan extends Tarea {
  early_start: string | null
  early_finish: string | null
  late_finish: string | null
  holgura_dias: number | null
  critico: boolean
  fila: number                  // posición 1..N en la lista (el "número" de MS Project)
  predecesores_txt: string      // columna estilo MS Project ("5FF+2d,3SS"), derivada
  baseline_inicio: string | null  // inicio congelado en la línea base activa
  baseline_fin: string | null     // fin congelado en la línea base activa
  variance_dias: number | null    // fin calculado − fin de la línea base (días hábiles; >0 = atrasada)
  avance_auto: boolean            // true = el % de avance lo calcula el sistema (read-only); false = manual
}
export interface AristaPlan { tarea_id: number; depende_de_id: number; tipo: string; lag_dias: number; ignorada_at?: string | null }
export interface PlanProyecto {
  proyecto_ext: string
  fecha_inicio: string | null   // inicio del proyecto (ancla hacia adelante)
  fecha_entrega: string | null  // entrega FIJA (ancla hacia atrás) — sagrada
  status_ext: string | null
  proyecto_estado: string | null // estado del proyecto (prospecto|activo…): gates de UI solo cuando activo
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
  error_cpm: string | null       // si hay un ciclo de dependencias, el CPM no recalcula y acá va el aviso
}

/** Devuelve el plan completo de un proyecto con la holgura de cada tarea. */
export async function getPlanProyecto(runner: QueryRunner, proyectoExt: string): Promise<PlanProyecto> {
  const { rows: hdr } = await runner.query<{ ini: string | null; entrega: string | null; status: string | null; n_items: number | null; presupuesto: string | null; estado: string | null }>(
    `SELECT to_char(ip.fecha_inicio,'YYYY-MM-DD') AS ini, to_char(ip.fecha_entrega,'YYYY-MM-DD') AS entrega,
            ip.status_ext AS status, ip.n_items, ip.presupuesto, p.estado
       FROM ing_proyectos ip LEFT JOIN proyectos p ON p.id = ip.proyecto_id
      WHERE ip.proyecto_ext = $1`, [proyectoExt])
  const h = hdr[0] ?? { ini: null, entrega: null, status: null, n_items: null, presupuesto: null, estado: null }

  const tareas = await listTareas(runner, proyectoExt)
  // Orden ESTABLE de la FILA: por orden_visual (el drag del scheduler) y, si falta,
  // por id (orden de creación). NUNCA por fecha → cambiar una dependencia mueve la
  // BARRA (fechas) pero NO la fila (pedido del scheduler 2026-11-23). `fila` se deriva
  // de este orden, así que queda estable salvo que el scheduler reordene a mano.
  tareas.sort((a, b) => (a.orden_visual ?? 1e9) - (b.orden_visual ?? 1e9) || a.id - b.id)
  const ids = tareas.map((t) => t.id)
  const { rows: deps } = ids.length
    ? await runner.query<AristaPlan>(
        `SELECT tarea_id, depende_de_id, tipo, lag_dias, to_char(ignorada_at,'YYYY-MM-DD') AS ignorada_at
           FROM ing_tarea_deps
          WHERE tarea_id = ANY($1) AND depende_de_id = ANY($1)`, [ids])
    : { rows: [] as AristaPlan[] }

  // Línea base ACTIVA (la más reciente del proyecto): inicio/fin congelados por tarea.
  const { rows: baseRows } = ids.length
    ? await runner.query<{ tarea_id: number; inicio: string | null; fin: string | null }>(
        `SELECT bt.tarea_id, to_char(bt.inicio,'YYYY-MM-DD') AS inicio, to_char(bt.fin,'YYYY-MM-DD') AS fin
           FROM ing_baseline_tareas bt
          WHERE bt.baseline_id = (SELECT id FROM ing_baselines WHERE proyecto_ext = $1 ORDER BY created_at DESC LIMIT 1)
            AND bt.tarea_id = ANY($2)`, [proyectoExt, ids])
    : { rows: [] as { tarea_id: number; inicio: string | null; fin: string | null }[] }
  const baseMap = new Map(baseRows.map((r) => [r.tarea_id, r]))

  // Los hechos reales de los módulos con dueño se leen ANTES del CPM: son pisos "no antes
  // de" (depósito confirmado por Finanzas, long leads ordenados en Compras…) que empujan.
  const deposito = await estadoDeposito(runner, proyectoExt)
  const compras = await estadoCompras(runner, proyectoExt)
  const muestras = await estadoMuestras(runner, proyectoExt)
  const instalacion = await estadoInstalacion(runner, proyectoExt)
  const depClave = new Map(tareas.map((t) => [t.id, t.tipo_clave]))

  // Fila (número 1..N) y texto de predecesoras estilo MS Project, derivados del orden
  // y de las aristas. Son columnas de solo lectura para la grilla; la fila alimenta el
  // parser (el "5" = fila 5).
  const filaPorId = new Map(tareas.map((t, i) => [t.id, i + 1]))
  const predsPorTarea = new Map<number, { depende_de_id: number; tipo: ReturnType<typeof normalizarTipoDep>; lag: number }[]>()
  for (const d of deps) {
    if (!predsPorTarea.has(d.tarea_id)) predsPorTarea.set(d.tarea_id, [])
    predsPorTarea.get(d.tarea_id)!.push({ depende_de_id: d.depende_de_id, tipo: normalizarTipoDep(d.tipo), lag: d.lag_dias })
  }
  const txtDe = (id: number) => formatearPredecesores(predsPorTarea.get(id) ?? [], filaPorId)
  // Avance efectivo (0..1), SIEMPRE REAL (nunca tipeado a mano):
  //  · 'hecha' = 100%, 'na' = s/d. material_proc = recibidos/total (Compras). installation
  //    = instalados/total (Campo). long_leads = 100% si ya hay 1ª OC.
  //  · Diseño / resto = BINARIO por estado: 0% hasta que el ingeniero la completa (→ 100%).
  const avanceDe = (t: typeof tareas[number]): { pct: number | null; auto: boolean } => {
    if (t.estado === 'na') return { pct: null, auto: true }
    if (t.estado === 'hecha') return { pct: 1, auto: true }
    const k = t.tipo_clave
    if (k === 'material_proc' && compras.hay && compras.n_materiales > 0) return { pct: compras.pct_disponible, auto: true }
    if (k === 'installation' && instalacion.hay && instalacion.total > 0) return { pct: instalacion.pct, auto: true }
    if (k === 'long_leads' && compras.hay) return { pct: compras.fecha_primera_oc ? 1 : 0, auto: true }
    return { pct: 0, auto: true }
  }
  const extra = (t: typeof tareas[number]) => {
    const av = avanceDe(t)
    return {
      fila: filaPorId.get(t.id)!, predecesores_txt: txtDe(t.id),
      baseline_inicio: baseMap.get(t.id)?.inicio ?? null, baseline_fin: baseMap.get(t.id)?.fin ?? null,
      avance_pct: av.pct, avance_auto: av.auto,
    }
  }

  // Holgura: solo si el proyecto tiene inicio + entrega (ancla en ambas puntas).
  let holgura: PlanProyecto['tareas'] = tareas.map((t) => ({ ...t, early_start: null, early_finish: null, late_finish: null, holgura_dias: null, critico: false, ...extra(t), variance_dias: null }))
  let finProyectado: string | null = null, holguraProyecto = 0, enRiesgo = false
  let errorCpm: string | null = null
  if (h.ini && h.entrega) {
    const feriados = await loadFeriados(runner)
    const cpmTareas: TareaCPM[] = tareas.map((t) => ({ id: t.id, dur: t.dur_dias, noAntesDe: pisoTarea(depClave.get(t.id) ?? null, deposito, compras, t.no_antes_de) }))
    // Las aristas se mantienen SIEMPRE; el candado del PM actúa por el piso "no antes de"
    // de material_deposit (fecha de apertura), no borrando la dependencia. La marca
    // ignorada_at se sigue devolviendo (abajo) para dibujar el gate abierto en la UI.
    const cpmAristas: AristaCPM[] = deps
      .map((d) => ({ tareaId: d.tarea_id, dependeDeId: d.depende_de_id, lag: d.lag_dias, tipo: normalizarTipoDep(d.tipo) }))
    try {
      const r = calcularHolgura(cpmTareas, cpmAristas, h.ini, h.entrega, feriados)
      finProyectado = r.finProyectado; holguraProyecto = r.holguraProyecto; enRiesgo = r.enRiesgo
      holgura = tareas.map((t) => {
        const c = r.tareas.get(t.id)
        const bFin = baseMap.get(t.id)?.fin ?? null
        // Variación = fin calculado − fin de la línea base (días hábiles). >0 = atrasada vs plan congelado.
        const variance = (bFin && c?.earlyFinish) ? businessDaysBetween(bFin, c.earlyFinish, feriados) : null
        return { ...t, early_start: c?.earlyStart ?? null, early_finish: c?.earlyFinish ?? null,
          late_finish: c?.lateFinish ?? null, holgura_dias: c?.holguraDias ?? null, critico: c?.critico ?? false, ...extra(t), variance_dias: variance }
      })
    } catch (err) {
      // Ciclo en dependencias: el CPM no puede recalcular. En vez de tragarlo en
      // silencio (dejaba fechas viejas sin avisar), se loguea y se expone el aviso
      // para que la UI lo muestre. Las validaciones pre-escritura hacen esto raro.
      errorCpm = (err as Error)?.message ?? 'El plan tiene un ciclo de dependencias; las fechas no se recalculan hasta corregirlo.'
      logger.error('CPM no recalculó (ciclo?)', { proyectoExt, err: (err as Error)?.message })
      captureException(err, { tags: { area: 'ingenieria_cpm' }, extra: { proyectoExt } })
    }
  }

  return {
    proyecto_ext: proyectoExt, fecha_inicio: h.ini, fecha_entrega: h.entrega, status_ext: h.status,
    proyecto_estado: h.estado,
    n_items: h.n_items, presupuesto: h.presupuesto != null ? +h.presupuesto : null,
    fin_proyectado: finProyectado, holgura_proyecto: holguraProyecto, en_riesgo: enRiesgo,
    deposito, muestras, compras, instalacion, tareas: holgura, aristas: deps,
    error_cpm: errorCpm,
  }
}

/** Piso "no antes de" por tarea = el HECHO real que la ancla, leído de los módulos con dueño.
 *  Único punto del mapeo hecho→piso (reusable para cada tarea que se maneje sola):
 *   · material_deposit → resolución del depósito (pago de Finanzas o apertura del candado).
 *   · long_leads       → fecha de la 1ª OC emitida (long leads ORDENADOS, del módulo de
 *     Compras). Si se ordena tarde, empuja; si aún no se ordenó, no ancla (plan estimado). */
function pisoTarea(tipoClave: string | null, deposito: EstadoDeposito, compras: EstadoCompras, noAntesDe?: string | null): string | undefined {
  // Puede haber más de un piso (hecho del módulo + piso explícito de la cola del
  // ingeniero). Gana el MÁS TARDÍO (comparación de fechas ISO = orden lexicográfico).
  const pisos: string[] = []
  if (tipoClave === 'material_deposit' && deposito.fecha_resolucion) pisos.push(deposito.fecha_resolucion)
  if (tipoClave === 'long_leads' && compras.fecha_primera_oc) pisos.push(compras.fecha_primera_oc)
  if (noAntesDe) pisos.push(noAntesDe)
  return pisos.length ? pisos.reduce((a, b) => (a > b ? a : b)) : undefined
}

/** Recalcula el CPM (con candado del PM + piso del depósito) y GUARDA fecha_inicio/fin de
 *  cada tarea. Se llama en cada mutación que mueve el schedule (re-anclaje, confirmación del
 *  depósito, candado) para que las fechas guardadas —que lee el heatmap— sigan al Gantt. */
/**
 * RECONCILIADOR módulo→ruta (el cimiento del escritorio por rol). Las tareas "automáticas"
 * (po_execution, material_deposit, long_leads, material_proc, approval, fabrication,
 * installation) NO las cierra nadie a mano: su estado se DERIVA del hecho real del módulo
 * (OC emitida, material recibido, OP completa, depósito pagado, aprobación del cliente…).
 * EL MÓDULO GANA (decisión de Chali): el estado se re-deriva en cada recompute, así que
 * una marca a mano se autocorrige. Reversible (si el hecho desaparece, la tarea vuelve a
 * pendiente). Preserva 'na'. Sin esto, filtrar el escritorio por predecesores trabaría todo.
 */
export async function cerrarTareasAutomaticas(
  runner: QueryRunner, proyectoExt: string,
  pre?: { deposito: Awaited<ReturnType<typeof estadoDeposito>>; compras: Awaited<ReturnType<typeof estadoCompras>> }
): Promise<void> {
  const { rows: pr } = await runner.query<{ pid: number | null }>(
    `SELECT proyecto_id AS pid FROM ing_proyectos WHERE proyecto_ext = $1`, [proyectoExt])
  const pid = pr[0]?.pid ?? null

  // Secuencial (no Promise.all): con un client en transacción no se pueden correr
  // queries concurrentes sobre el mismo client. deposito/compras se pueden pasar ya
  // calculados (recomputarYGuardar los reusa para el CPM) para no computarlos dos veces
  // por pasada; cerrarTareasAutomaticas no modifica esas tablas, así que da lo mismo.
  const deposito = pre?.deposito ?? await estadoDeposito(runner, proyectoExt)
  const compras = pre?.compras ?? await estadoCompras(runner, proyectoExt)
  const muestras = await estadoMuestras(runner, proyectoExt)
  const produccion = await estadoProduccion(runner, proyectoExt)

  // Hechos del journey (schedule_hitos) que USA el reconciliador: C-03 (contrato) y
  // E-07 (planos aprobados por el portal). Fabricación (P-05/P-06) e instalación (I-07)
  // se leen de sus módulos directo, no de acá. Solo si el proyecto tiene journey.
  const hito = new Map<string, string | null>()
  if (pid) {
    const { rows } = await runner.query<{ codigo: string; f: string | null }>(
      `SELECT sh.codigo, to_char(sh.fecha_real,'YYYY-MM-DD') AS f
         FROM schedule_hitos sh JOIN schedule_planes sp ON sp.id = sh.plan_id
        WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto'
          AND sh.codigo = ANY($2) AND sh.fecha_real IS NOT NULL`,
      [pid, ['C-03', 'E-07']])
    for (const r of rows) hito.set(r.codigo, r.f)
  }
  // approval también cierra por la vía manual (el ingeniero registró la decisión del cliente).
  const { rows: cr } = await runner.query<{ decision: string | null }>(
    `SELECT t.decision FROM ing_tareas t JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
      WHERE t.proyecto_ext = $1 AND tt.clave = 'client_review'`, [proyectoExt])
  const reviewOk = ['aprobado', 'con_comentarios'].includes(cr[0]?.decision ?? '')

  const comprasCompleto = compras.n_materiales > 0 && compras.pct_disponible >= 1
  // regla por tipo: done (→hecha), enCurso (→en_curso), fecha del hecho
  const reglas: Record<string, { done: boolean; enCurso?: boolean; fecha: string | null }> = {
    po_execution:     { done: hito.has('C-03'), fecha: hito.get('C-03') ?? null },
    material_deposit: { done: !!deposito.fecha_resolucion, fecha: deposito.fecha_resolucion },
    long_leads:       { done: !!compras.fecha_primera_oc, fecha: compras.fecha_primera_oc },
    material_proc:    { done: comprasCompleto, enCurso: compras.n_materiales > 0, fecha: compras.fecha_ultima_recepcion },
    approval:         { done: hito.has('E-07') || reviewOk, fecha: hito.get('E-07') ?? null },
    // Fabricación: lee producción DIRECTO (no el hito P-06 del journey, que se actualiza
    // después → desfase de un recompute). Cierra cuando todas las OPs de producción están
    // Completada; en_curso si alguna arrancó. (Las OPs de MUESTRA no cuentan.)
    fabrication:      { done: produccion.completa, enCurso: produccion.en_curso, fecha: produccion.fecha_completa },
    // installation: NO auto-cierra. Handoff de 3 etapas del PM (Chali 2026-09-08): el PM
    // inicia (pendiente→en_curso) → Campo verifica en el móvil (ítems+punch+firma=I-07) →
    // el PM completa (en_curso→hecha). El reconciliador no la toca; la mueven las acciones
    // del PM (avanceTarea) y la verificación. Ver listInstalacionesPM + gate de listInstallQueue.
  }
  // samples (paso #6, señal E-05): DERIVADO del módulo de Muestras (Q1). La APROBADA lo
  // cierra (decisión de Chali 2026-09-07): cierra cuando hay ≥1 muestra APROBADA y NINGUNA
  // en proceso; una RECHAZADA queda como historial y NO bloquea (su estado no cambia). Si
  // a una rechazada se le hace una versión nueva, vuelve a "en proceso" → reabre samples
  // y el recompute reprograma. Solo deriva si el proyecto tiene muestras (si no, se respeta
  // lo que haya). Corre en paralelo, no bloquea el gate del cliente.
  if (muestras.hay) reglas.samples = {
    done: muestras.samples_listo, enCurso: !muestras.samples_listo,
    fecha: muestras.samples_listo ? muestras.fecha_aprobacion : null,
  }

  for (const [clave, r] of Object.entries(reglas)) {
    const target = r.done ? 'hecha' : (r.enCurso ? 'en_curso' : 'pendiente')
    const fecha = r.done ? (r.fecha ?? null) : null
    await runner.query(
      `UPDATE ing_tareas t SET estado = $3, fecha_fin_real = $4::date, updated_at = NOW()
         FROM ing_tarea_tipos tt
        WHERE tt.id = t.tipo_id AND t.proyecto_ext = $1 AND tt.clave = $2
          AND t.estado <> 'na' AND t.estado IS DISTINCT FROM $3`,
      [proyectoExt, clave, target, fecha])
  }
}

export async function recomputarYGuardar(runner: QueryRunner, proyectoExt: string): Promise<void> {
  // deposito/compras se calculan UNA vez por pasada y se reusan: el reconciliador los
  // necesita y el CPM (pisoTarea) también. Se leen antes del reconciliador (no dependen
  // de sus escrituras) para no duplicar la lectura.
  const deposito = await estadoDeposito(runner, proyectoExt)
  const compras = await estadoCompras(runner, proyectoExt)
  // Primero reconciliar las tareas auto desde los hechos de módulos (el módulo gana),
  // así el estado de la ruta refleja la realidad antes de recalcular/leer.
  await cerrarTareasAutomaticas(runner, proyectoExt, { deposito, compras })
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
  // deposito/compras ya calculados arriba (reusados por el CPM).
  const clave = new Map(tareas.map((t) => [t.id, t.tipo_clave]))
  const feriados = await loadFeriados(runner)
  const cpmTareas: TareaCPM[] = tareas.map((t) => ({ id: t.id, dur: t.dur_dias, noAntesDe: pisoTarea(clave.get(t.id) ?? null, deposito, compras, t.no_antes_de) }))
  const aristas: AristaCPM[] = deps.map((d) => ({ tareaId: d.tarea_id, dependeDeId: d.depende_de_id, lag: d.lag_dias, tipo: normalizarTipoDep(d.tipo) }))
  try {
    const r = calcularHolgura(cpmTareas, aristas, h.ini, h.entrega, feriados)
    for (const t of tareas) {
      const c = r.tareas.get(t.id)
      if (c) await runner.query(
        `UPDATE ing_tareas SET fecha_inicio = $2, fecha_fin = $3, es_critico = $4, holgura_dias = $5 WHERE id = $1`,
        [t.id, c.earlyStart, c.earlyFinish, c.critico, c.holguraDias])
    }
    // Proyección al journey (fuente única = el Gantt): cada hito toma su fecha del PASO
    // del Gantt al que mapea (schedule_plantilla_hitos.gantt_clave/gantt_ancla). Reemplaza
    // al motor teórico del Life of a Deal. Es un cache derivado, refrescado en cada
    // recompute — nunca se edita solo.
    await proyectarJourney(runner, proyectoExt, tareas, r, h.entrega, feriados)
  } catch (err) {
    // Ciclo improbable (las validaciones pre-escritura lo evitan): se deja el plan
    // como está, pero NO en silencio — se loguea para detectar datos legados. No se
    // relanza: los 15 llamadores (submittals/materiales/muestras…) no esperan excepción.
    logger.error('recomputarYGuardar no recalculó (ciclo?)', { proyectoExt, err: (err as Error)?.message })
    captureException(err, { tags: { area: 'ingenieria_cpm' }, extra: { proyectoExt, fase: 'recomputarYGuardar' } })
  }
}

// Variantes de piedra que comparten milestone con su paso base (para plegar sus fechas).
const BASE_CLAVE: Record<string, string> = {
  stone_measure: 'field_measurements', stone_fab: 'fabrication', stone_install: 'installation',
}
function hoyISOd(): ISODate {
  const t = new Date(); const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}

/** Proyecta el journey del proyecto DESDE el Gantt (fuente única). Captura los hechos
 *  reales de los módulos, corre la proyección pura (proyeccion.ts) y persiste hitos +
 *  salud del plan. No-op si el proyecto no tiene journey (schedule_plan). */
async function proyectarJourney(
  runner: QueryRunner, proyectoExt: string,
  tareas: Array<{ id: number; tipo_clave: string | null; estado: string; fecha_fin_real: string | null }>,
  cpm: ReturnType<typeof calcularHolgura>, fechaEntrega: string, feriados: Set<ISODate>,
): Promise<void> {
  const { rows: pr } = await runner.query<{ proyecto_id: number | null }>(
    `SELECT proyecto_id FROM ing_proyectos WHERE proyecto_ext = $1`, [proyectoExt])
  const pid = pr[0]?.proyecto_id
  if (!pid) return
  const { rows: pl } = await runner.query<{ id: number; plantilla_id: number }>(
    `SELECT id, plantilla_id FROM schedule_planes WHERE proyecto_id = $1 AND scope = 'proyecto' LIMIT 1`, [pid])
  if (!pl[0]) return
  const planId = pl[0].id, plantillaId = pl[0].plantilla_id

  // Plantilla de hitos + dependencias del journey.
  const { rows: hitos } = await runner.query<HitoPlantilla>(
    `SELECT codigo, tipo, gantt_clave, gantt_ancla, gantt_lag_dias, rol_responsable, fuente_dato, es_ancla
       FROM schedule_plantilla_hitos WHERE plantilla_id = $1`, [plantillaId])
  const { rows: hdeps } = await runner.query<{ hito: string; dependeDe: string }>(
    `SELECT hito_codigo AS hito, depende_de_codigo AS "dependeDe"
       FROM schedule_plantilla_dependencias WHERE plantilla_id = $1`, [plantillaId])

  // Fechas de cada paso del Gantt (plegando variantes de piedra al paso base).
  const pasos = new Map<string, PasoFechas>()
  for (const t of tareas) {
    const c = cpm.tareas.get(t.id); if (!c) continue
    const clave = BASE_CLAVE[t.tipo_clave ?? ''] ?? t.tipo_clave
    if (!clave) continue
    const cur = pasos.get(clave)
    if (!cur) pasos.set(clave, { es: c.earlyStart, ef: c.earlyFinish, ls: c.lateStart, lf: c.lateFinish })
    else pasos.set(clave, {
      es: c.earlyStart < cur.es ? c.earlyStart : cur.es,
      ef: c.earlyFinish > cur.ef ? c.earlyFinish : cur.ef,
      ls: c.lateStart < cur.ls ? c.lateStart : cur.ls,
      lf: c.lateFinish > cur.lf ? c.lateFinish : cur.lf,
    })
  }

  // Estado REAL de cada paso del Gantt (Fase 1: el journey deriva el "cumplido" de acá,
  // no de la inferencia). Se pliegan las variantes de piedra: el paso está 'hecha' solo
  // si TODAS sus tareas están hechas; 'en_curso' si alguna arrancó.
  const acc = new Map<string, { total: number; hechas: number; iniciadas: number; finReal: string | null }>()
  for (const t of tareas) {
    const clave = BASE_CLAVE[t.tipo_clave ?? ''] ?? t.tipo_clave
    if (!clave) continue
    const a = acc.get(clave) ?? { total: 0, hechas: 0, iniciadas: 0, finReal: null }
    a.total++
    if (t.estado === 'hecha') { a.hechas++; if (t.fecha_fin_real && (!a.finReal || t.fecha_fin_real > a.finReal)) a.finReal = t.fecha_fin_real }
    if (t.estado === 'hecha' || t.estado === 'en_curso') a.iniciadas++
    acc.set(clave, a)
  }
  const estadoPaso = new Map<string, { estado: 'hecha' | 'en_curso' | 'pendiente'; finReal: string | null }>()
  for (const [clave, a] of acc) estadoPaso.set(clave, {
    estado: a.hechas === a.total ? 'hecha' : a.iniciadas > 0 ? 'en_curso' : 'pendiente', finReal: a.finReal,
  })

  // Fechas reales, por precedencia: (1) hecho de módulo (compras/producción/QC);
  // (2) registro manual/portal/pago/submittal ya guardado (no inferido); (3) FALLBACK:
  // estado de la tarea del Gantt (para los pasos manual_futuro que se cierran en el
  // escritorio/portal sin escribir el hito). C-04/X-03/I-07 no derivan (son de Finanzas/entrega).
  const capt = await capturarFechasReales(runner, pid)
  const { rows: ex } = await runner.query<{ codigo: string; fecha_real: string | null; evidencia_ref: unknown }>(
    `SELECT codigo, to_char(fecha_real,'YYYY-MM-DD') AS fecha_real, evidencia_ref FROM schedule_hitos WHERE plan_id = $1`, [planId])
  const exMap = new Map(ex.map((e) => [e.codigo, e]))
  const DERIVA_NO = new Set(['C-04', 'X-03'])
  const reales = new Map<string, { fecha_real: ISODate | null; evidencia: unknown }>()
  for (const h of hitos) {
    let fr = capt.get(h.codigo)?.fecha_real ?? null
    let evi: unknown = capt.get(h.codigo)?.evidencia ?? null
    if (fr === null && h.fuente_dato === 'manual_futuro') {
      const e = exMap.get(h.codigo)
      // Preservar SOLO hechos reales (registro/portal/pago/submittal). Un valor derivado
      // del Gantt (source:'gantt') NO se preserva: se RE-DERIVA abajo desde el estado
      // actual del paso — si el paso reabrió (p.ej. samples tras rechazar una muestra),
      // el hito debe soltar su fecha vieja y volver a pendiente, no quedar cumplido stale.
      const evSrc = (e?.evidencia_ref as { source?: string } | null)?.source
      if (e?.fecha_real && !esInferida(e.evidencia_ref) && evSrc !== 'gantt') { fr = e.fecha_real; evi = e.evidencia_ref ?? null }
      if (fr === null && h.gantt_clave && !h.es_ancla && !DERIVA_NO.has(h.codigo)) {
        const ep = estadoPaso.get(h.gantt_clave)
        const listo = ep && (h.gantt_ancla === 'inicio' ? ep.estado !== 'pendiente' : ep.estado === 'hecha')
        if (ep && listo) {
          fr = ep.finReal ?? pasos.get(h.gantt_clave)?.es ?? null
          evi = { source: 'gantt', nota: `paso del Gantt ${h.gantt_clave} = ${ep.estado}` }
        }
      }
    }
    reales.set(h.codigo, { fecha_real: fr, evidencia: evi })
  }

  const res = proyectarHitos({
    hitos, deps: hdeps, pasos, reales, hoy: hoyISOd(), feriados,
    fechaEntrega, finProyectado: cpm.finProyectado, holguraProyecto: cpm.holguraProyecto,
  })

  for (const ph of res.hitos) {
    await runner.query(
      `INSERT INTO schedule_hitos
         (plan_id, codigo, fecha_planeada, fecha_baseline, fecha_real, fecha_proyectada,
          estado, semaforo, holgura_dias, atribucion_atraso, evidencia_ref, updated_at)
       VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (plan_id, codigo) DO UPDATE SET
         fecha_planeada    = EXCLUDED.fecha_planeada,
         fecha_baseline    = COALESCE(schedule_hitos.fecha_baseline, EXCLUDED.fecha_planeada),
         fecha_real        = EXCLUDED.fecha_real,
         fecha_proyectada  = EXCLUDED.fecha_proyectada,
         estado            = EXCLUDED.estado,
         semaforo          = EXCLUDED.semaforo,
         holgura_dias      = EXCLUDED.holgura_dias,
         atribucion_atraso = EXCLUDED.atribucion_atraso,
         evidencia_ref     = EXCLUDED.evidencia_ref,
         updated_at        = NOW()`,
      [planId, ph.codigo, ph.fecha_planeada, ph.fecha_real ? `${ph.fecha_real} 12:00:00` : null, ph.fecha_proyectada,
       ph.estado, ph.semaforo, ph.holgura_dias, ph.atribucion_atraso, ph.evidencia_ref ? JSON.stringify(ph.evidencia_ref) : null])
  }
  await runner.query(
    `UPDATE schedule_planes SET semaforo = $2, holgura_dias = $3, updated_at = NOW() WHERE id = $1`,
    [planId, res.semaforoPlan, res.holguraPlan])
}

// ── Edición (MVP: que el creador la pruebe y la corrijamos) ──
export interface TareaInput {
  proyecto_ext?: string | null; nombre: string; asignado_nombre?: string | null
  allocation_pct?: number; dur_dias?: number; fecha_inicio?: string | null; fecha_fin?: string | null
  estado?: string; comentario?: string | null; avance_pct?: number | null
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
        avance_pct = COALESCE($10, avance_pct),
        updated_at = NOW()
      WHERE id = $1`,
    [id, t.nombre ?? null, asignado, t.allocation_pct ?? null, t.dur_dias ?? null,
     t.fecha_inicio ?? null, t.fecha_fin ?? null, t.estado ?? null, t.comentario ?? null,
     t.avance_pct ?? null])
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

/** Gate del cliente (#8): cuando el cliente APRUEBA la revisión, se cierra el gate
 *  approval (E-07) con la fecha de aprobación — el hito queda cumplido y (por la
 *  dependencia) arrancan 9-13. Solo lo abre la aprobación de SD; las muestras no bloquean. */
export async function cerrarGatePorAprobacion(runner: QueryRunner, clientReviewId: number, fechaAprobacion: string | null): Promise<boolean> {
  const { rows } = await runner.query<{ ext: string | null }>(
    `SELECT proyecto_ext AS ext FROM ing_tareas WHERE id = $1`, [clientReviewId])
  const ext = rows[0]?.ext
  if (!ext) return false
  const { rowCount } = await runner.query(
    `UPDATE ing_tareas t SET estado = 'hecha', fecha_fin_real = COALESCE($2::date, CURRENT_DATE), updated_at = NOW()
       FROM ing_tarea_tipos tt
      WHERE t.tipo_id = tt.id AND tt.clave = 'approval' AND t.proyecto_ext = $1`, [ext, fechaAprobacion])
  return (rowCount ?? 0) > 0
}

/**
 * Cableado PORTAL → RUTA (pieza 4): la decisión del cliente en el portal sobre un hito
 * aprobable (E-07 planos, E-05 muestras) se refleja en la RUTA (el escritorio del rol que
 * sigue), no solo en el journey.
 *  · E-07 rechazado → reabre shop_drawings (el ingeniero re-dibuja) + registra la decisión.
 *  · E-07 aprobado / con comentarios → cierra el gate approval (habilita 9-13); con comentarios
 *    los copia a sd_update para que el ingeniero los incorpore (Chali: cierra el gate igual,
 *    el ingeniero trabaja las correcciones camino al paso 11).
 *  · E-05 muestras aprobadas → avisa al ingeniero (tarea) para que lo registre en Muestras.
 * Al final reconcilia + recomputa la ruta.
 */
export async function sincronizarDecisionCliente(
  runner: QueryRunner, proyectoId: number, codigo: string,
  decision: string, comentario: string | null,
): Promise<void> {
  const { rows: pe } = await runner.query<{ ext: string | null }>(
    `SELECT proyecto_ext AS ext FROM ing_proyectos WHERE proyecto_id = $1`, [proyectoId])
  const ext = pe[0]?.ext
  if (!ext) return

  if (codigo === 'E-07') {
    const { rows: cr } = await runner.query<{ id: number }>(
      `SELECT t.id FROM ing_tareas t JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
        WHERE t.proyecto_ext = $1 AND tt.clave = 'client_review'`, [ext])
    const crId = cr[0]?.id
    if (decision.includes('rechaz')) {
      if (crId) {
        await reabrirShopDrawingsPorRechazo(runner, crId, comentario)
        await runner.query(`UPDATE ing_tareas SET decision = 'rechazado', decision_comentarios = $2, updated_at = NOW() WHERE id = $1`, [crId, comentario])
      }
    } else {
      const dec = decision.includes('comentarios') ? 'con_comentarios' : 'aprobado'
      if (crId) {
        await cerrarGatePorAprobacion(runner, crId, null)
        await runner.query(`UPDATE ing_tareas SET decision = $2, decision_comentarios = $3, estado = 'hecha', fecha_fin_real = COALESCE(fecha_fin_real, CURRENT_DATE), updated_at = NOW() WHERE id = $1`, [crId, dec, comentario])
      }
      if (dec === 'con_comentarios' && comentario) {
        await runner.query(
          `UPDATE ing_tareas t SET comentario = concat_ws(' - ', NULLIF(t.comentario, ''), $2::text), updated_at = NOW()
             FROM ing_tarea_tipos tt WHERE tt.id = t.tipo_id AND t.proyecto_ext = $1 AND tt.clave = 'sd_update'`,
          [ext, `Cliente aprobo con comentarios: ${comentario}`])
      }
    }
  } else if (codigo === 'E-05' && !decision.includes('rechaz')) {
    await runner.query(
      `INSERT INTO tareas (area, title, description, priority, estado, origen)
       VALUES ('ingenieria', $1, $2, 'medium', 'pendiente', 'sistema')`,
      [`Cliente aprobó las muestras — ${ext}`,
       `El cliente aprobó las muestras del proyecto ${ext} desde el portal. Reflejalo en el módulo de Muestras.${comentario ? ' Comentario: ' + comentario : ''}`])
  }

  await recomputarYGuardar(runner, ext)
}

/** Release to Production (#12, E-10, 0d): AUTO por defecto — cuando el SD update / final set
 *  (#11) se completa, el release se cierra con la misma fecha (handoff a producción). El
 *  ingeniero conserva la OPCIÓN MANUAL: puede reabrirlo o marcarlo con los botones de estado
 *  (no se vuelve a cerrar solo salvo que se re-complete #11). cnc (#13) depende de release. */
export async function cerrarReleasePorSdUpdate(runner: QueryRunner, sdUpdateTaskId: number): Promise<boolean> {
  const { rows } = await runner.query<{ ext: string | null; fecha: string | null }>(
    `SELECT t.proyecto_ext AS ext, to_char(t.fecha_fin_real,'YYYY-MM-DD') AS fecha
       FROM ing_tareas t JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
      WHERE t.id = $1 AND tt.clave = 'sd_update' AND t.estado = 'hecha'`, [sdUpdateTaskId])
  const ext = rows[0]?.ext
  if (!ext) return false
  const { rowCount } = await runner.query(
    `UPDATE ing_tareas t SET estado = 'hecha', fecha_fin_real = COALESCE($2::date, CURRENT_DATE), updated_at = NOW()
       FROM ing_tarea_tipos tt
      WHERE t.tipo_id = tt.id AND tt.clave = 'release' AND t.proyecto_ext = $1 AND t.estado <> 'hecha'`,
    [ext, rows[0].fecha])
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
/** Si agregar (tareaId depende de dependeDeId) cierra un ciclo, devuelve la RUTA
 *  de ids (tareaId → … → dependeDeId) que ya existe; si no, null. El flujo de las
 *  aristas es depende_de_id → tarea_id, así que hay ciclo si dependeDeId ya es
 *  alcanzable desde tareaId. BFS con mapa de padres para reconstruir la ruta. */
async function rutaDeCiclo(runner: QueryRunner, proyectoExt: string | null, tareaId: number, dependeDeId: number): Promise<number[] | null> {
  if (tareaId === dependeDeId) return [tareaId]
  const { rows } = await runner.query<{ tarea_id: number; depende_de_id: number }>(
    `SELECT d.tarea_id, d.depende_de_id FROM ing_tarea_deps d
       JOIN ing_tareas t ON t.id = d.tarea_id
      WHERE t.proyecto_ext IS NOT DISTINCT FROM $1`, [proyectoExt])
  const succ = new Map<number, number[]>()
  for (const r of rows) { if (!succ.has(r.depende_de_id)) succ.set(r.depende_de_id, []); succ.get(r.depende_de_id)!.push(r.tarea_id) }
  const padre = new Map<number, number>()
  const seen = new Set<number>([tareaId]); const q = [tareaId]
  while (q.length) {
    const n = q.shift()!
    for (const s of succ.get(n) ?? []) {
      if (seen.has(s)) continue
      seen.add(s); padre.set(s, n)
      if (s === dependeDeId) {
        const ruta = [s]; let x = s
        while (x !== tareaId) { x = padre.get(x)!; ruta.push(x) }
        return ruta.reverse()   // tareaId → … → dependeDeId
      }
      q.push(s)
    }
  }
  return null
}

/** Mapa id → nombre para las tareas pedidas (para mensajes de error legibles). */
async function nombresDeTareas(runner: QueryRunner, ids: number[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map()
  const { rows } = await runner.query<{ id: number; nombre: string }>(
    `SELECT id, nombre FROM ing_tareas WHERE id = ANY($1)`, [ids])
  return new Map(rows.map((r) => [r.id, r.nombre]))
}

const TIPOS_DEP_OK = new Set(['FS', 'SS', 'FF', 'SF'])

export async function agregarDep(runner: QueryRunner, tareaId: number, dependeDeId: number, lag = 0, tipo = 'FS'): Promise<{ ok: boolean; error?: string }> {
  // Tipo válido (los 4 de MS Project).
  const tnorm = String(tipo ?? '').trim().toUpperCase()
  if (!TIPOS_DEP_OK.has(tnorm)) return { ok: false, error: `tipo de dependencia inválido: "${tipo}" (usá FS, SS, FF o SF)` }
  // Auto-dependencia (mensaje propio, antes del chequeo de ciclo).
  if (tareaId === dependeDeId) return { ok: false, error: 'Una tarea no puede depender de sí misma.' }
  // La tarea existe.
  const { rows } = await runner.query<{ proyecto_ext: string | null }>(`SELECT proyecto_ext FROM ing_tareas WHERE id = $1`, [tareaId])
  if (!rows[0]) return { ok: false, error: 'tarea no encontrada' }
  const proyectoExt = rows[0].proyecto_ext
  // La predecesora existe y es del MISMO proyecto (evita dependencias "colgadas").
  const { rows: dep } = await runner.query<{ proyecto_ext: string | null }>(`SELECT proyecto_ext FROM ing_tareas WHERE id = $1`, [dependeDeId])
  if (!dep[0]) return { ok: false, error: 'la tarea predecesora no existe' }
  if (dep[0].proyecto_ext !== proyectoExt) return { ok: false, error: 'la predecesora pertenece a otro proyecto' }
  // Sin ciclos: si lo crea, mostrar la cadena con nombres.
  const ruta = await rutaDeCiclo(runner, proyectoExt, tareaId, dependeDeId)
  if (ruta) {
    const nombres = await nombresDeTareas(runner, ruta)
    const cadena = [...ruta, tareaId].map((id) => nombres.get(id) ?? `#${id}`).join(' → ')
    return { ok: false, error: `Esa dependencia crearía un ciclo: ${cadena}.` }
  }
  await runner.query(
    `INSERT INTO ing_tarea_deps (tarea_id, depende_de_id, tipo, lag_dias) VALUES ($1,$2,$3,$4)
     ON CONFLICT (tarea_id, depende_de_id) DO UPDATE SET tipo = EXCLUDED.tipo, lag_dias = EXCLUDED.lag_dias`,
    [tareaId, dependeDeId, tnorm, lag])
  return { ok: true }
}

export async function borrarDep(runner: QueryRunner, tareaId: number, dependeDeId: number): Promise<boolean> {
  const { rowCount } = await runner.query(`DELETE FROM ing_tarea_deps WHERE tarea_id = $1 AND depende_de_id = $2`, [tareaId, dependeDeId])
  return (rowCount ?? 0) > 0
}

/** Reordena la FILA de la lista del Gantt (orden visual), sin tocar dependencias ni
 *  fechas. `ordenIds` es la lista completa de tareas del proyecto en el nuevo orden.
 *  Solo escribe orden_visual = posición (1..N) para las tareas que pertenecen al
 *  proyecto (ignora ids ajenos por seguridad). No dispara recompute: las fechas no
 *  cambian. Devuelve cuántas filas se actualizaron. */
export async function reordenarVisual(runner: QueryRunner, proyectoExt: string, ordenIds: number[]): Promise<{ ok: boolean; actualizadas: number }> {
  const { rows } = await runner.query<{ id: number }>(`SELECT id FROM ing_tareas WHERE proyecto_ext = $1`, [proyectoExt])
  const propias = new Set(rows.map((r) => r.id))
  let n = 0, pos = 0
  for (const id of ordenIds) {
    if (!propias.has(id)) continue
    pos++
    const { rowCount } = await runner.query(`UPDATE ing_tareas SET orden_visual = $2 WHERE id = $1`, [id, pos])
    n += rowCount ?? 0
  }
  return { ok: true, actualizadas: n }
}

export interface ReasignarPreview {
  ok: boolean; error?: string
  ingeniero_actual: string | null; ingeniero_nuevo: string; disponible_desde: string
  fin_actual: string | null; fin_nuevo: string; entrega: string
  holgura_dias: number; entra: boolean; n_tareas: number
}

/** Cambia el ingeniero PROPUESTO del proyecto: reasigna TODAS las tareas de rol
 *  ingeniería/field al nuevo y re-ancla su piso `no_antes_de` = cuándo se libera el nuevo
 *  (cola serial, excluyendo este proyecto). El CPM recalcula respetando la entrega fija.
 *  Con dry_run devuelve el preview (fin antes/después, holgura, cuántas tareas) sin escribir. */
export async function reasignarIngeniero(
  runner: QueryRunner, proyectoExt: string, nuevoIng: string, dryRun = false,
): Promise<ReasignarPreview> {
  const base: ReasignarPreview = { ok: false, ingeniero_actual: null, ingeniero_nuevo: nuevoIng, disponible_desde: '', fin_actual: null, fin_nuevo: '', entrega: '', holgura_dias: 0, entra: false, n_tareas: 0 }
  const { rows: hdr } = await runner.query<{ ini: string | null; entrega: string | null }>(
    `SELECT to_char(fecha_inicio,'YYYY-MM-DD') AS ini, to_char(fecha_entrega,'YYYY-MM-DD') AS entrega
       FROM ing_proyectos WHERE proyecto_ext = $1`, [proyectoExt])
  const h = hdr[0]
  if (!h?.ini || !h?.entrega) return { ...base, error: 'el proyecto no tiene plan' }

  const feriados = await loadFeriados(runner)
  const colas = await cargarColaIngenieros(runner, { excluirProyectoExt: proyectoExt })
  const cola = colas.find((c) => c.nombre === nuevoIng)
  if (!cola) return { ...base, error: 'ingeniero no encontrado o inactivo' }
  const hoy = hoyISOd()
  // Cuándo se libera el nuevo: fin de su última tarea + 1 hábil (nunca antes de hoy).
  const disponible = cola.fin_ultima && cola.fin_ultima >= hoy ? addBusinessDays(cola.fin_ultima, 1, feriados) : hoy

  const rolesIng = [...ROLES_INGENIERO]
  const { rows: ingRows } = await runner.query<{ id: number; asignado_nombre: string | null }>(
    `SELECT t.id, t.asignado_nombre FROM ing_tareas t JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
      WHERE t.proyecto_ext = $1 AND tt.rol = ANY($2)`, [proyectoExt, rolesIng])
  const ingIds = new Set(ingRows.map((r) => r.id))
  if (!ingIds.size) return { ...base, error: 'el proyecto no tiene tareas de ingeniería' }
  const freq = new Map<string, number>()
  for (const r of ingRows) if (r.asignado_nombre) freq.set(r.asignado_nombre, (freq.get(r.asignado_nombre) ?? 0) + 1)
  const ingeniero_actual = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // Preview: corre el CPM con el piso actual (antes) y con el piso del nuevo ingeniero (después).
  const tareas = await listTareas(runner, proyectoExt)
  const ids = tareas.map((t) => t.id)
  const { rows: deps } = await runner.query<{ tarea_id: number; depende_de_id: number; tipo: string; lag_dias: number }>(
    `SELECT tarea_id, depende_de_id, tipo, lag_dias FROM ing_tarea_deps WHERE tarea_id = ANY($1) AND depende_de_id = ANY($1)`, [ids])
  const deposito = await estadoDeposito(runner, proyectoExt)
  const compras = await estadoCompras(runner, proyectoExt)
  const clave = new Map(tareas.map((t) => [t.id, t.tipo_clave]))
  const aristas: AristaCPM[] = deps.map((d) => ({ tareaId: d.tarea_id, dependeDeId: d.depende_de_id, lag: d.lag_dias, tipo: normalizarTipoDep(d.tipo) }))
  const correr = (pisoNuevo: boolean): string => {
    const cpmTareas: TareaCPM[] = tareas.map((t) => ({
      id: t.id, dur: t.dur_dias,
      noAntesDe: pisoTarea(clave.get(t.id) ?? null, deposito, compras, pisoNuevo && ingIds.has(t.id) ? disponible : t.no_antes_de),
    }))
    return calcularHolgura(cpmTareas, aristas, h.ini!, h.entrega!, feriados).finProyectado ?? h.entrega!
  }
  let fin_actual: string, fin_nuevo: string
  try { fin_actual = correr(false); fin_nuevo = correr(true) }
  catch { return { ...base, error: 'no se pudo calcular (ciclo en dependencias)' } }

  const preview: ReasignarPreview = {
    ok: true, ingeniero_actual, ingeniero_nuevo: nuevoIng, disponible_desde: disponible,
    fin_actual, fin_nuevo, entrega: h.entrega, holgura_dias: businessDaysBetween(fin_nuevo, h.entrega, feriados),
    entra: fin_nuevo <= h.entrega, n_tareas: ingIds.size,
  }
  if (dryRun) return preview

  await runner.query(
    `UPDATE ing_tareas t SET asignado_nombre = $2, no_antes_de = $3::date, updated_at = NOW()
       FROM ing_tarea_tipos tt
      WHERE t.tipo_id = tt.id AND t.proyecto_ext = $1 AND tt.rol = ANY($4)`,
    [proyectoExt, nuevoIng, disponible, rolesIng])
  await recomputarYGuardar(runner, proyectoExt)
  return preview
}

// ─────────────────────────────────────────────────────────────────────────────
// Drag & drop: aplicar cambios de dependencias en bloque (atómico) + mover tarea
// ─────────────────────────────────────────────────────────────────────────────

/** CPM del proyecto con un conjunto DADO de aristas (para preview/dry-run del reorder). */
async function cpmConAristas(runner: QueryRunner, ext: string, aristas: Array<{ tarea_id: number; depende_de_id: number; tipo: string; lag_dias: number }>): Promise<HolguraProyecto | null> {
  const { rows: hdr } = await runner.query<{ ini: string | null; entrega: string | null }>(
    `SELECT to_char(fecha_inicio,'YYYY-MM-DD') AS ini, to_char(fecha_entrega,'YYYY-MM-DD') AS entrega FROM ing_proyectos WHERE proyecto_ext = $1`, [ext])
  const h = hdr[0]; if (!h?.ini || !h?.entrega) return null
  const tareas = await listTareas(runner, ext); if (!tareas.length) return null
  const deposito = await estadoDeposito(runner, ext)
  const compras = await estadoCompras(runner, ext)
  const clave = new Map(tareas.map((t) => [t.id, t.tipo_clave]))
  const feriados = await loadFeriados(runner)
  const cpmTareas: TareaCPM[] = tareas.map((t) => ({ id: t.id, dur: t.dur_dias, noAntesDe: pisoTarea(clave.get(t.id) ?? null, deposito, compras, t.no_antes_de) }))
  const cpmAristas: AristaCPM[] = aristas.map((a) => ({ tareaId: a.tarea_id, dependeDeId: a.depende_de_id, lag: a.lag_dias, tipo: normalizarTipoDep(a.tipo) }))
  try { return calcularHolgura(cpmTareas, cpmAristas, h.ini, h.entrega, feriados) } catch { return null }
}

export interface CambioDepsResult {
  ok: boolean; error?: string; dryRun: boolean; noop?: boolean
  diffs: Array<{ id: number; nombre: string; ef_antes: string | null; ef_despues: string | null }>
  fin_antes: string | null; fin_despues: string | null; holgura: number; en_riesgo: boolean
  inverso: { remove: CambioArista[]; add: CambioArista[] }
  explicacion?: { quita: string[]; agrega: string[] }
}

function errDeps(dryRun: boolean, error: string): CambioDepsResult {
  return { ok: false, error, dryRun, diffs: [], fin_antes: null, fin_despues: null, holgura: 0, en_riesgo: false, inverso: { remove: [], add: [] } }
}

/** Aplica un conjunto de cambios de dependencias de forma ATÓMICA: valida ciclo,
 *  corre el CPM antes/después (preview) y, si no es dry-run, escribe + recalcula. */
export async function aplicarCambiosDeps(
  runner: QueryRunner, ext: string, remove: CambioArista[], add: CambioArista[], dryRun: boolean,
  explicacion?: { quita: string[]; agrega: string[] },
): Promise<CambioDepsResult> {
  const tareas = await listTareas(runner, ext)
  const idset = new Set(tareas.map((t) => t.id))
  for (const c of [...remove, ...add]) if (!idset.has(c.tarea_id) || !idset.has(c.depende_de_id)) return errDeps(dryRun, 'una dependencia queda fuera del proyecto')
  const ids = [...idset]
  const { rows: cur } = await runner.query<{ tarea_id: number; depende_de_id: number; tipo: string; lag_dias: number }>(
    `SELECT tarea_id, depende_de_id, tipo, lag_dias FROM ing_tarea_deps WHERE tarea_id = ANY($1) AND depende_de_id = ANY($1)`, [ids])
  const rmSet = new Set(remove.map((r) => `${r.tarea_id}<${r.depende_de_id}`))
  const nueva = [...cur.filter((a) => !rmSet.has(`${a.tarea_id}<${a.depende_de_id}`)),
    ...add.map((a) => ({ tarea_id: a.tarea_id, depende_de_id: a.depende_de_id, tipo: a.tipo ?? 'FS', lag_dias: a.lag_dias ?? 0 }))]
  if (tieneCiclo(nueva, ids)) return errDeps(dryRun, 'ese cambio crearía un ciclo de dependencias')

  const antes = await cpmConAristas(runner, ext, cur)
  const despues = await cpmConAristas(runner, ext, nueva)
  const diffs = tareas.map((t) => {
    const a = antes?.tareas.get(t.id), d = despues?.tareas.get(t.id)
    return { id: t.id, nombre: t.nombre, ef_antes: a?.earlyFinish ?? null, ef_despues: d?.earlyFinish ?? null }
  }).filter((x) => x.ef_antes !== x.ef_despues)

  const curMap = new Map(cur.map((a) => [`${a.tarea_id}<${a.depende_de_id}`, a]))
  const inverso = {
    remove: add.map((a) => ({ tarea_id: a.tarea_id, depende_de_id: a.depende_de_id })),
    add: remove.map((r) => { const o = curMap.get(`${r.tarea_id}<${r.depende_de_id}`); return { tarea_id: r.tarea_id, depende_de_id: r.depende_de_id, tipo: o?.tipo ?? 'FS', lag_dias: o?.lag_dias ?? 0 } }),
  }

  if (!dryRun) {
    for (const r of remove) await borrarDep(runner, r.tarea_id, r.depende_de_id)
    for (const a of add) await agregarDep(runner, a.tarea_id, a.depende_de_id, a.lag_dias ?? 0, a.tipo ?? 'FS')
    await recomputarYGuardar(runner, ext)
  }
  return { ok: true, dryRun, diffs, fin_antes: antes?.finProyectado ?? null, fin_despues: despues?.finProyectado ?? null,
    holgura: despues?.holguraProyecto ?? 0, en_riesgo: despues?.enRiesgo ?? false, inverso, explicacion }
}

export type SetPredecesoresResult =
  | { ok: false; errores: ErrorPred[] }                                  // texto inválido (→ 422)
  | (CambioDepsResult & { texto_normalizado: string })                   // preview/aplicado

/** Reemplaza TODOS los predecesores de una tarea a partir del texto estilo MS Project
 *  ("5FF+2d,3SS"): parsea, resuelve fila→id, calcula el diff contra las aristas actuales
 *  y lo aplica con aplicarCambiosDeps (preview si dryRun). Las deps con candado abierto
 *  (ignorada_at) NO se quitan aunque el texto las omita. */
export async function setPredecesores(
  runner: QueryRunner, tareaId: number, texto: string, dryRun: boolean,
): Promise<SetPredecesoresResult> {
  const { rows } = await runner.query<{ proyecto_ext: string | null }>(`SELECT proyecto_ext FROM ing_tareas WHERE id = $1`, [tareaId])
  if (!rows[0]) return { ok: false, errores: [{ codigo: 'REF_INEXISTENTE', mensaje: 'La tarea no existe.' }] }
  const ext = rows[0].proyecto_ext
  if (!ext) return { ok: false, errores: [{ codigo: 'REF_INEXISTENTE', mensaje: 'La tarea no pertenece a un proyecto.' }] }

  const parsed = parsearPredecesores(texto)
  if (!parsed.ok) return { ok: false, errores: parsed.errores }

  const tareas = await listTareas(runner, ext)
  const ordenIds = tareas.map((t) => t.id)
  const resolved = resolverPredecesores(parsed.items, ordenIds, tareaId)
  if (!resolved.ok) return { ok: false, errores: resolved.errores }
  const desired = resolved.aristas

  const { rows: cur } = await runner.query<{ depende_de_id: number; tipo: string; lag_dias: number; ignorada_at: string | null }>(
    `SELECT depende_de_id, tipo, lag_dias, to_char(ignorada_at,'YYYY-MM-DD') AS ignorada_at FROM ing_tarea_deps WHERE tarea_id = $1`, [tareaId])
  const desByDep = new Map(desired.map((a) => [a.depende_de_id, a]))
  const curByDep = new Map(cur.map((c) => [c.depende_de_id, c]))

  // add = nuevas o con tipo/lag cambiado (agregarDep hace upsert). remove = las que el
  // texto saca, pero NUNCA una con candado abierto (ignorada_at).
  const add = desired
    .filter((a) => { const c = curByDep.get(a.depende_de_id); return !c || c.tipo !== a.tipo || c.lag_dias !== a.lag })
    .map((a) => ({ tarea_id: tareaId, depende_de_id: a.depende_de_id, tipo: a.tipo, lag_dias: a.lag }))
  const remove = cur
    .filter((c) => !desByDep.has(c.depende_de_id) && !c.ignorada_at)
    .map((c) => ({ tarea_id: tareaId, depende_de_id: c.depende_de_id }))

  const res = await aplicarCambiosDeps(runner, ext, remove, add, dryRun)
  const filaPorId = new Map(ordenIds.map((id, i) => [id, i + 1]))
  return { ...res, texto_normalizado: formatearPredecesores(desired, filaPorId) }
}

/** Congela una LÍNEA BASE del proyecto: una foto (inicio/fin/duración) de cada
 *  tarea en este momento. Queda archivada (histórico); la más reciente es la activa
 *  y alimenta la columna Variación. Se puede re-guardar cuando el scheduler quiera. */
export async function guardarBaseline(
  runner: QueryRunner, proyectoExt: string, userId: string | null, nota?: string | null,
): Promise<{ ok: boolean; baseline_id: number; n: number }> {
  const { rows: [b] } = await runner.query<{ id: number }>(
    `INSERT INTO ing_baselines (proyecto_ext, nota, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [proyectoExt, nota ?? null, userId])
  const { rowCount } = await runner.query(
    `INSERT INTO ing_baseline_tareas (baseline_id, tarea_id, inicio, fin, dur_dias)
       SELECT $1, id, fecha_inicio, fecha_fin, dur_dias FROM ing_tareas WHERE proyecto_ext = $2`,
    [b.id, proyectoExt])
  return { ok: true, baseline_id: b.id, n: rowCount ?? 0 }
}

/** Fija (o libera) una tarea a una fecha, estilo restricción de MS Project, usando el
 *  piso `no_antes_de` del CPM. campo='inicio' → "no empieza antes de X" (SNET). campo='fin'
 *  → piso = inicioDe(X, dur) para que "no termine antes de X" (FNET aproximado). fecha=null
 *  libera la restricción. Si un predecesor empuja más tarde, manda el predecesor (correcto). */
export async function fijarFechaTarea(
  runner: QueryRunner, id: number, campo: 'inicio' | 'fin', fecha: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { rows } = await runner.query<{ proyecto_ext: string | null; dur_dias: number }>(
    `SELECT proyecto_ext, dur_dias FROM ing_tareas WHERE id = $1`, [id])
  if (!rows[0]) return { ok: false, error: 'tarea no encontrada' }
  const ext = rows[0].proyecto_ext
  let piso: string | null = fecha
  if (fecha && campo === 'fin') {
    const feriados = await loadFeriados(runner)
    const dur = Math.max(0, Math.round(rows[0].dur_dias))
    piso = dur <= 0 ? fecha : subBusinessDays(fecha, dur - 1, feriados)   // inicioDe(fin, dur)
  }
  await runner.query(`UPDATE ing_tareas SET no_antes_de = $2::date, updated_at = NOW() WHERE id = $1`, [id, piso])
  if (ext) await recomputarYGuardar(runner, ext)
  return { ok: true }
}

/** Mueve una tarea al slot (afterId = fila de arriba, beforeId = fila de abajo),
 *  recableando dependencias con planificarMovimiento (puro) y aplicando el resultado. */
export async function moverTarea(
  runner: QueryRunner, tareaId: number, afterId: number | null, beforeId: number | null, dryRun: boolean,
): Promise<CambioDepsResult> {
  const { rows: pe } = await runner.query<{ ext: string | null }>(`SELECT proyecto_ext AS ext FROM ing_tareas WHERE id = $1`, [tareaId])
  const ext = pe[0]?.ext
  if (!ext) return errDeps(dryRun, 'tarea no encontrada')
  const plan = await getPlanProyecto(runner, ext)
  // orden_visual = orden topológico aproximado (por early_start; desempate por id).
  const ordenadas = [...plan.tareas].sort((a, b) => {
    const ka = a.early_start ?? a.fecha_inicio ?? '9999-12-31', kb = b.early_start ?? b.fecha_inicio ?? '9999-12-31'
    return ka < kb ? -1 : ka > kb ? 1 : a.id - b.id
  })
  const T: TareaRe[] = ordenadas.map((t, i) => ({ id: t.id, nombre: t.nombre, estado: t.estado, orden_visual: i + 1 }))
  const AR: AristaRe[] = plan.aristas.map((a) => ({ tarea_id: a.tarea_id, depende_de_id: a.depende_de_id, tipo: a.tipo, lag_dias: a.lag_dias, ignorada_at: a.ignorada_at }))
  const mov = planificarMovimiento(T, AR, tareaId, afterId, beforeId)
  if (!mov.ok) return errDeps(dryRun, mov.error ?? 'no se pudo mover')
  if (mov.noop) return { ok: true, dryRun, noop: true, diffs: [], fin_antes: null, fin_despues: null, holgura: 0, en_riesgo: false, inverso: { remove: [], add: [] }, explicacion: { quita: [], agrega: [] } }
  return aplicarCambiosDeps(runner, ext, mov.remove, mov.add, dryRun, mov.explicacion)
}
