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
  estado: string
  status_ext: string | null
  comentario: string | null
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
            t.estado, t.status_ext, t.comentario
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

// ── Edición (MVP: que el creador la pruebe y la corrijamos) ──
export interface TareaInput {
  proyecto_ext?: string | null; nombre: string; asignado_nombre?: string | null
  allocation_pct?: number; dur_dias?: number; fecha_inicio?: string | null; fecha_fin?: string | null
  estado?: string; comentario?: string | null
}

export async function crearTarea(runner: QueryRunner, t: TareaInput): Promise<{ id: number }> {
  const { rows } = await runner.query<{ id: number }>(
    `INSERT INTO ing_tareas (proyecto_ext, nombre, asignado_nombre, allocation_pct, dur_dias, fecha_inicio, fecha_fin, estado, comentario, origen)
       VALUES ($1,$2,$3,COALESCE($4,1.0),COALESCE($5,1),$6,$7,COALESCE($8,'pendiente'),$9,'manual') RETURNING id`,
    [t.proyecto_ext ?? null, t.nombre, t.asignado_nombre ?? null, t.allocation_pct ?? null, t.dur_dias ?? null,
     t.fecha_inicio ?? null, t.fecha_fin ?? null, t.estado ?? null, t.comentario ?? null])
  return rows[0]
}

export async function actualizarTarea(runner: QueryRunner, id: number, t: TareaInput): Promise<boolean> {
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
    [id, t.nombre ?? null, t.asignado_nombre ?? null, t.allocation_pct ?? null, t.dur_dias ?? null,
     t.fecha_inicio ?? null, t.fecha_fin ?? null, t.estado ?? null, t.comentario ?? null])
  return (rowCount ?? 0) > 0
}

export async function borrarTarea(runner: QueryRunner, id: number): Promise<boolean> {
  const { rowCount } = await runner.query(`DELETE FROM ing_tareas WHERE id = $1`, [id])
  return (rowCount ?? 0) > 0
}
