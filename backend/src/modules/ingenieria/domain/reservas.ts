// ─────────────────────────────────────────────────────────────────────────────
// Domain — Reserva de capacidad de Ingeniería
// ─────────────────────────────────────────────────────────────────────────────
// Cuando Estimados crea un proyecto factible, RESERVA los espacios de Ingeniería
// (tareas provisionales, origen='reserva'). Consumen capacidad → la próxima
// cotización cuenta con eso. El PM las CONFIRMA y asigna el ingeniero real.
// Se liberan (DELETE) si el proyecto se rechaza y no fueron confirmadas.
//
// Duraciones: hoy del catálogo (dur_dias_tipico). Cuando llegue el modelo por
// tamaño (histórico), solo cambia `duracionesPara`. Un único punto de cambio.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { calcularPlaneadas, HitoDef, DepDef } from '../../schedule/domain/motor'
import { loadFeriados, subBusinessDays, ISODate } from '../../schedule/domain/calendario'

type QueryRunner = PoolClient | typeof pool

// Tipos de tarea que se reservan (el esfuerzo de Ingeniería que consume capacidad).
const RESERVA_CLAVES = ['shop_drawings', 'cnc']

async function dryRun(runner: QueryRunner, plantillaId: number, fecha: string): Promise<Map<string, ISODate>> {
  const { rows: h } = await runner.query<{ codigo: string; dur_dias_default: number; es_ancla: boolean }>(
    `SELECT codigo, dur_dias_default, es_ancla FROM schedule_plantilla_hitos WHERE plantilla_id = $1`, [plantillaId])
  const { rows: d } = await runner.query<{ hito_codigo: string; depende_de_codigo: string }>(
    `SELECT hito_codigo, depende_de_codigo FROM schedule_plantilla_dependencias WHERE plantilla_id = $1`, [plantillaId])
  const hitos: HitoDef[] = h.map((x) => ({ codigo: x.codigo, dur: x.dur_dias_default, es_ancla: x.es_ancla }))
  const deps: DepDef[] = d.map((x) => ({ hito: x.hito_codigo, dependeDe: x.depende_de_codigo }))
  const feriados = await loadFeriados(runner)
  return calcularPlaneadas(hitos, deps, fecha, feriados).planeadas
}

/** Duraciones (días hábiles) por tipo de tarea de la reserva. Hoy: catálogo.
 *  Mañana: función del presupuesto/tamaño (histórico). Único punto de cambio. */
async function duracionesPara(runner: QueryRunner, _presupuesto: number | null): Promise<Map<string, { id: number; nombre: string; hito: string | null; dur: number }>> {
  const { rows } = await runner.query<{ id: number; clave: string; nombre: string; hito_codigo: string | null; dur_dias_tipico: number | null }>(
    `SELECT id, clave, nombre, hito_codigo, dur_dias_tipico FROM ing_tarea_tipos WHERE clave = ANY($1)`, [RESERVA_CLAVES])
  const m = new Map<string, { id: number; nombre: string; hito: string | null; dur: number }>()
  for (const r of rows) m.set(r.clave, { id: r.id, nombre: r.nombre, hito: r.hito_codigo, dur: Math.max(1, r.dur_dias_tipico ?? 3) })
  return m
}

/** Crea la reserva de Ingeniería para un proyecto (idempotente). */
export async function crearReserva(runner: QueryRunner, proyectoId: number): Promise<{ creadas: number }> {
  const { rows: ya } = await runner.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ing_tareas WHERE proyecto_id = $1 AND origen = 'reserva'`, [proyectoId])
  if ((ya[0]?.n ?? 0) > 0) return { creadas: 0 }

  const { rows: planes } = await runner.query<{ plantilla_id: number; fecha: string; codigo: string; presupuesto: number | null }>(
    `SELECT sp.plantilla_id, to_char(sp.fecha_objetivo,'YYYY-MM-DD') AS fecha, p.codigo, p.presupuesto
       FROM schedule_planes sp JOIN proyectos p ON p.id = sp.proyecto_id
      WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto' LIMIT 1`, [proyectoId])
  if (!planes[0]) return { creadas: 0 }
  const { plantilla_id, fecha, codigo, presupuesto } = planes[0]

  const planeadas = await dryRun(runner, plantilla_id, fecha)
  const feriados = await loadFeriados(runner)
  const tipos = await duracionesPara(runner, presupuesto)

  // recurso de CNC (el único que hoy hace CNC = el cuello)
  const { rows: cncEng } = await runner.query<{ asignado_nombre: string }>(
    `SELECT DISTINCT t.asignado_nombre FROM ing_tareas t JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
      WHERE tt.clave = 'cnc' AND t.asignado_nombre IS NOT NULL`)
  const cncRecurso = cncEng.length === 1 ? cncEng[0].asignado_nombre : null

  let creadas = 0
  for (const clave of RESERVA_CLAVES) {
    const t = tipos.get(clave)
    if (!t || !t.hito) continue
    const deadline = planeadas.get(t.hito)
    if (!deadline) continue
    const inicio = subBusinessDays(deadline, t.dur, feriados)
    const asignado = clave === 'cnc' ? cncRecurso : null // los demás: el PM asigna al confirmar
    await runner.query(
      `INSERT INTO ing_tareas (proyecto_ext, proyecto_id, tipo_id, nombre, asignado_nombre, allocation_pct, dur_dias, fecha_inicio, fecha_fin, estado, origen)
         VALUES ($1,$2,$3,$4,$5,1.0,$6,$7,$8,'pendiente','reserva')`,
      [codigo, proyectoId, t.id, `${t.nombre} (reserva)`, asignado, t.dur, inicio, deadline])
    creadas++
  }
  return { creadas }
}

export interface ReservaTarea { id: number; nombre: string; asignado_nombre: string | null; fecha_inicio: string | null; fecha_fin: string | null; tipo_clave: string | null }
export interface ReservaProyecto { proyecto_id: number; proyecto_codigo: string; proyecto_nombre: string; fecha_objetivo: string | null; tareas: ReservaTarea[] }

/** Reservas SIN confirmar (para el escritorio del PM). */
export async function listReservasPendientes(runner: QueryRunner): Promise<ReservaProyecto[]> {
  const { rows } = await runner.query<ReservaTarea & { proyecto_id: number; proyecto_codigo: string; proyecto_nombre: string; fecha_objetivo: string | null }>(
    `SELECT t.id, t.nombre, t.asignado_nombre, tt.clave AS tipo_clave,
            to_char(t.fecha_inicio,'YYYY-MM-DD') AS fecha_inicio, to_char(t.fecha_fin,'YYYY-MM-DD') AS fecha_fin,
            p.id AS proyecto_id, p.codigo AS proyecto_codigo, p.nombre AS proyecto_nombre,
            to_char(sp.fecha_objetivo,'YYYY-MM-DD') AS fecha_objetivo
       FROM ing_tareas t
       JOIN proyectos p ON p.id = t.proyecto_id
       LEFT JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
       LEFT JOIN schedule_planes sp ON sp.proyecto_id = t.proyecto_id AND sp.scope = 'proyecto'
      WHERE t.origen = 'reserva' AND t.reserva_confirmada_at IS NULL
      ORDER BY p.codigo, t.fecha_inicio`)
  const byP = new Map<number, ReservaProyecto>()
  for (const r of rows) {
    let g = byP.get(r.proyecto_id)
    if (!g) { g = { proyecto_id: r.proyecto_id, proyecto_codigo: r.proyecto_codigo, proyecto_nombre: r.proyecto_nombre, fecha_objetivo: r.fecha_objetivo, tareas: [] }; byP.set(r.proyecto_id, g) }
    g.tareas.push({ id: r.id, nombre: r.nombre, asignado_nombre: r.asignado_nombre, fecha_inicio: r.fecha_inicio, fecha_fin: r.fecha_fin, tipo_clave: r.tipo_clave })
  }
  return [...byP.values()]
}

/** El PM confirma la reserva de un proyecto y (opcional) asigna ingenieros. */
export async function confirmarReserva(
  runner: QueryRunner, proyectoId: number, usuarioId: string | null,
  asignaciones?: { id: number; asignado_nombre: string }[]
): Promise<{ confirmadas: number }> {
  if (asignaciones?.length) {
    for (const a of asignaciones) {
      await runner.query(`UPDATE ing_tareas SET asignado_nombre = $2, updated_at = NOW() WHERE id = $1 AND proyecto_id = $3 AND origen = 'reserva'`,
        [a.id, a.asignado_nombre || null, proyectoId])
    }
  }
  const { rowCount } = await runner.query(
    `UPDATE ing_tareas SET reserva_confirmada_at = NOW(), reserva_confirmada_por = $2, updated_at = NOW()
      WHERE proyecto_id = $1 AND origen = 'reserva' AND reserva_confirmada_at IS NULL`,
    [proyectoId, usuarioId])
  return { confirmadas: rowCount ?? 0 }
}

/** Libera (borra) la reserva NO confirmada de un proyecto (si se rechaza). */
export async function liberarReserva(runner: QueryRunner, proyectoId: number): Promise<{ liberadas: number }> {
  const { rowCount } = await runner.query(
    `DELETE FROM ing_tareas WHERE proyecto_id = $1 AND origen = 'reserva' AND reserva_confirmada_at IS NULL`, [proyectoId])
  return { liberadas: rowCount ?? 0 }
}
