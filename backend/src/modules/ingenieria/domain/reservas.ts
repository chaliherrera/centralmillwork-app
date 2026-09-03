// ─────────────────────────────────────────────────────────────────────────────
// Domain — Planes sugeridos pendientes de aceptación del PM.
// ─────────────────────────────────────────────────────────────────────────────
// El generador (plan_inicial.ts) crea el plan COMPLETO con origen='sugerencia'
// usando el planificador (cola serial). Estas dos funciones alimentan la bandeja
// del PM (los planes por aceptar) y el "cancelar" del deal.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'

type QueryRunner = PoolClient | typeof pool

export interface ReservaTarea { id: number; nombre: string; asignado_nombre: string | null; fecha_inicio: string | null; fecha_fin: string | null; tipo_clave: string | null }
export interface ReservaProyecto { proyecto_id: number; proyecto_codigo: string; proyecto_nombre: string; proyecto_ext: string | null; fecha_objetivo: string | null; tareas: ReservaTarea[] }

/** Planes SUGERIDOS pendientes de aceptación del PM (el deal está en 'esperando_pm').
 *  Son el plan completo (origen='sugerencia'); el PM los revisa/poda y acepta. */
export async function listReservasPendientes(runner: QueryRunner): Promise<ReservaProyecto[]> {
  const { rows } = await runner.query<ReservaTarea & { proyecto_id: number; proyecto_codigo: string; proyecto_nombre: string; proyecto_ext: string | null; fecha_objetivo: string | null }>(
    `SELECT t.id, t.nombre, t.asignado_nombre, tt.clave AS tipo_clave,
            to_char(t.fecha_inicio,'YYYY-MM-DD') AS fecha_inicio, to_char(t.fecha_fin,'YYYY-MM-DD') AS fecha_fin,
            p.id AS proyecto_id, p.codigo AS proyecto_codigo, p.nombre AS proyecto_nombre, t.proyecto_ext,
            to_char(sp.fecha_objetivo,'YYYY-MM-DD') AS fecha_objetivo
       FROM ing_tareas t
       JOIN proyectos p ON p.id = t.proyecto_id
       LEFT JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
       LEFT JOIN schedule_planes sp ON sp.proyecto_id = t.proyecto_id AND sp.scope = 'proyecto'
      WHERE t.origen = 'sugerencia'
      ORDER BY p.codigo, t.fecha_inicio`)
  const byP = new Map<number, ReservaProyecto>()
  for (const r of rows) {
    let g = byP.get(r.proyecto_id)
    if (!g) { g = { proyecto_id: r.proyecto_id, proyecto_codigo: r.proyecto_codigo, proyecto_nombre: r.proyecto_nombre, proyecto_ext: r.proyecto_ext, fecha_objetivo: r.fecha_objetivo, tareas: [] }; byP.set(r.proyecto_id, g) }
    g.tareas.push({ id: r.id, nombre: r.nombre, asignado_nombre: r.asignado_nombre, fecha_inicio: r.fecha_inicio, fecha_fin: r.fecha_fin, tipo_clave: r.tipo_clave })
  }
  return [...byP.values()]
}

/** Cancela el plan SUGERIDO de un proyecto (si el deal se descarta antes de aceptarse). */
export async function liberarReserva(runner: QueryRunner, proyectoId: number): Promise<{ liberadas: number }> {
  const { rowCount } = await runner.query(
    `DELETE FROM ing_tareas WHERE proyecto_id = $1 AND origen = 'sugerencia'`, [proyectoId])
  return { liberadas: rowCount ?? 0 }
}
