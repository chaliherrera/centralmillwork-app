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

/**
 * Une la consola de Usuarios con la lista de recursos del planificador (2.3).
 * Un usuario con rol ENGINEERING queda dado de alta / linkeado en ing_ingenieros
 * (por usuario_id o email), así aparece en las propuestas del planificador sin SQL.
 * Reglas:
 *  · usuario NO-ENGINEERING o inactivo → su ficha de recurso LINKEADA se marca inactiva
 *    (no se borra: conserva historial y tareas pasadas).
 *  · usuario ENGINEERING activo, sin ficha → alta (adopta una ficha del Excel del MISMO
 *    nombre si todavía no tiene usuario, si no inserta una nueva; activa).
 *  · usuario ENGINEERING activo, con ficha ya linkeada → refresca email/usuario_id pero
 *    NO toca `activo`: respeta que el PM lo haya desactivado a mano (licencia/vacaciones).
 *  NUNCA cambia el `nombre` de una ficha existente (es la clave que usa el Gantt en
 *  ing_tareas.asignado_nombre): sólo el alta nueva usa el nombre del usuario.
 */
export async function sincronizarIngenieroDesdeUsuario(
  runner: QueryRunner,
  u: { id: string; nombre: string; email: string | null; rol: string; activo: boolean }
): Promise<void> {
  const esIng = u.rol === 'ENGINEERING'
  const email = u.email ? u.email.toLowerCase().trim() : null

  const { rows: link } = await runner.query<{ nombre: string }>(
    `SELECT nombre FROM ing_ingenieros
      WHERE usuario_id = $1 OR ($2 IS NOT NULL AND lower(email) = $2) LIMIT 1`, [u.id, email])

  // No-ingeniero o usuario inactivo: apagar la ficha linkeada (si existe).
  if (!esIng || !u.activo) {
    if (link[0]) await runner.query(`UPDATE ing_ingenieros SET activo = false WHERE nombre = $1`, [link[0].nombre])
    return
  }

  // Ya linkeado: refrescar el vínculo, sin pisar el `activo` que maneja el PM.
  if (link[0]) {
    await runner.query(
      `UPDATE ing_ingenieros SET email = $2, usuario_id = $1 WHERE nombre = $3`,
      [u.id, email, link[0].nombre])
    return
  }

  // Sin link: adoptar una ficha del Excel del mismo nombre (sin usuario), si existe.
  const { rows: porNombre } = await runner.query<{ nombre: string }>(
    `SELECT nombre FROM ing_ingenieros WHERE lower(nombre) = lower($1) AND usuario_id IS NULL LIMIT 1`, [u.nombre.trim()])
  if (porNombre[0]) {
    await runner.query(
      `UPDATE ing_ingenieros SET email = $2, usuario_id = $1, activo = true WHERE nombre = $3`,
      [u.id, email, porNombre[0].nombre])
    return
  }

  // Nada: alta nueva (activa).
  await runner.query(
    `INSERT INTO ing_ingenieros (nombre, email, usuario_id, activo) VALUES ($1,$2,$3,true)
     ON CONFLICT (nombre) DO UPDATE SET email = EXCLUDED.email, usuario_id = EXCLUDED.usuario_id`,
    [u.nombre.trim(), email, u.id])
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
