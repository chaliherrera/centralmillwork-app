// ─────────────────────────────────────────────────────────────────────────────
// Gestión de ingenieros (ing_ingenieros) — el PM administra el recurso.
// ─────────────────────────────────────────────────────────────────────────────
// ing_ingenieros es la FUENTE DE VERDAD de quién está activo. La factibilidad y el
// generador solo consideran los `activo`. Marcar a alguien inactivo (ej. deja la
// empresa) lo saca de las propuestas SIN borrar su historial ni sus tareas pasadas.
// hace_cnc es informativo: quién puede generar sus propios CNC.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'

type QueryRunner = PoolClient | typeof pool

export interface IngenieroRow {
  nombre: string
  activo: boolean
  hace_cnc: boolean
  usuario_id: string | null
  tareas_activas: number   // tareas asignadas no cerradas (para avisar antes de desactivar)
}

export async function listIngenieros(runner: QueryRunner): Promise<IngenieroRow[]> {
  const { rows } = await runner.query<IngenieroRow>(
    `SELECT i.nombre, i.activo, i.hace_cnc, i.usuario_id::text AS usuario_id,
            (SELECT count(*)::int FROM ing_tareas t
              WHERE t.asignado_nombre = i.nombre AND t.estado NOT IN ('hecha','na')) AS tareas_activas
       FROM ing_ingenieros i
      ORDER BY i.activo DESC, i.nombre`)
  return rows
}

/** Actualiza flags de un ingeniero (activo / hace_cnc). Idempotente. */
export async function actualizarIngeniero(
  runner: QueryRunner, nombre: string, campos: { activo?: boolean; hace_cnc?: boolean }
): Promise<boolean> {
  const sets: string[] = []
  const vals: unknown[] = [nombre]
  if (campos.activo !== undefined) { vals.push(campos.activo); sets.push(`activo = $${vals.length}`) }
  if (campos.hace_cnc !== undefined) { vals.push(campos.hace_cnc); sets.push(`hace_cnc = $${vals.length}`) }
  if (!sets.length) return false
  const { rowCount } = await runner.query(`UPDATE ing_ingenieros SET ${sets.join(', ')} WHERE nombre = $1`, vals)
  return (rowCount ?? 0) > 0
}
