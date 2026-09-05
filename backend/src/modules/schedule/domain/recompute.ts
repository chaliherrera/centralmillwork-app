// ─────────────────────────────────────────────────────────────────────────────
// Domain — Generación y recálculo del plan de un proyecto
// ─────────────────────────────────────────────────────────────────────────────
// FUENTE ÚNICA = el Gantt de ingeniería. El motor teórico (motor.ts, tiempos del
// Life of a Deal) fue eliminado: recomputeScheduleForProyecto delega en el pipeline
// de ingeniería (recomputarYGuardar), que captura los hechos reales, corre el CPM y
// proyecta el journey (schedule_hitos/schedule_planes) desde las fechas reales del
// Gantt. Este archivo conserva la creación del plan, el cambio de fecha objetivo, la
// atribución por área y los wrappers "safe" que llaman otros módulos post-commit.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { type ISODate } from './calendario'
import { logger } from '../../../utils/logger'

type QueryRunner = PoolClient | typeof pool
type Disparador = 'recepcion' | 'op' | 'oc' | 'manual' | 'cron'

/** Mapea el rol responsable del hito al área para atribución de atrasos.
 *  (La proyección real vive en proyeccion.ts; esto se conserva para "Mi trabajo".) */
export function areaFromRol(rol: string | null): string {
  const r = (rol ?? '').toLowerCase()
  if (r.includes('estimat')) return 'estimating'
  if (r.includes('engineer')) return 'engineering'
  if (r.includes('procurement')) return 'procurement'
  if (r.includes('production') || r.includes('shop')) return 'production'
  if (r.includes('logistics')) return 'logistics'
  if (r.includes('field')) return 'field'
  if (r.includes('cfo') || r.includes('financial') || r.includes('office')) return 'finance'
  if (r.includes('pm')) return 'pm'
  return r || 'sin_asignar'
}

/**
 * Crea el plan de schedule de un proyecto a partir de una plantilla.
 * @returns el id del plan creado.
 * @throws si el proyecto ya tiene plan (scope proyecto) o la plantilla no existe.
 */
export async function generarPlan(
  runner: QueryRunner,
  proyectoId: number,
  fechaObjetivo: ISODate,
  plantillaNombre = 'Millwork estándar'
): Promise<number> {
  const { rows: pl } = await runner.query<{ id: number }>(
    `SELECT id FROM schedule_plantillas WHERE nombre = $1 AND activa = true`, [plantillaNombre])
  if (!pl[0]) throw new Error(`Plantilla "${plantillaNombre}" no encontrada.`)
  const plantillaId = pl[0].id

  const { rows: existing } = await runner.query<{ id: number }>(
    `SELECT id FROM schedule_planes WHERE proyecto_id = $1 AND scope = 'proyecto'`, [proyectoId])
  if (existing[0]) throw new Error('El proyecto ya tiene un plan de schedule.')

  const { rows: plan } = await runner.query<{ id: number }>(
    `INSERT INTO schedule_planes (proyecto_id, plantilla_id, scope, fecha_objetivo, fecha_objetivo_original)
       VALUES ($1, $2, 'proyecto', $3, $3) RETURNING id`,
    [proyectoId, plantillaId, fechaObjetivo])
  const planId = plan[0].id

  // Esqueleto de hitos (uno por hito de la plantilla). Las fechas las pone la
  // proyección desde el Gantt en el recompute (o quedan NULL si aún no hay Gantt).
  await runner.query(
    `INSERT INTO schedule_hitos (plan_id, codigo)
       SELECT $1, codigo FROM schedule_plantilla_hitos WHERE plantilla_id = $2`,
    [planId, plantillaId])

  await recomputeScheduleForProyecto(runner, proyectoId, 'manual')
  return planId
}

/**
 * Mueve la fecha de entrega comprometida (P1: es sagrada — moverla es una decisión
 * humana que queda registrada). Actualiza también el ancla del Gantt
 * (ing_proyectos.fecha_entrega) para que el plan de ingeniería se recalcule con ella.
 */
export async function cambiarFechaObjetivo(
  runner: QueryRunner,
  proyectoId: number,
  nuevaFecha: ISODate,
  usuarioNombre: string | null
): Promise<{ ok: boolean; error?: string; anterior?: string }> {
  const { rows } = await runner.query<{ id: number; actual: string }>(
    `SELECT id, to_char(fecha_objetivo,'YYYY-MM-DD') AS actual
       FROM schedule_planes WHERE proyecto_id = $1 AND scope = 'proyecto'`, [proyectoId])
  if (!rows[0]) return { ok: false, error: 'el proyecto no tiene plan de schedule' }
  const anterior = rows[0].actual
  if (anterior === nuevaFecha) return { ok: true, anterior }

  await runner.query(
    `UPDATE schedule_planes SET fecha_objetivo = $2, updated_at = NOW() WHERE id = $1`,
    [rows[0].id, nuevaFecha])
  // El Gantt se ancla en ing_proyectos.fecha_entrega: moverla acá mueve todo el plan.
  await runner.query(
    `UPDATE ing_proyectos SET fecha_entrega = $2, updated_at = NOW() WHERE proyecto_id = $1`,
    [proyectoId, nuevaFecha])
  await runner.query(
    `INSERT INTO schedule_eventos (plan_id, tipo, descripcion, disparado_por)
       VALUES ($1, 'fecha_objetivo', $2, 'manual')`,
    [rows[0].id, `Fecha de entrega movida de ${anterior} a ${nuevaFecha}${usuarioNombre ? ` por ${usuarioNombre}` : ''}.`])

  await recomputeScheduleForProyecto(runner, proyectoId, 'manual')
  return { ok: true, anterior }
}

export interface RecomputeResult {
  skipped: boolean
  planId?: number
  semaforo?: string
  holguraDias?: number | null
}

/**
 * Recalcula el journey del proyecto. Delega en el pipeline de ingeniería
 * (recomputarYGuardar), que es la ÚNICA fuente de fechas (el Gantt). No hace nada si
 * el proyecto no tiene plan de schedule, o si no tiene Gantt (ing_proyectos) todavía.
 */
export async function recomputeScheduleForProyecto(
  runner: QueryRunner,
  proyectoId: number,
  _disparadoPor: 'recepcion' | 'op' | 'oc' | 'manual' | 'cron' = 'manual'
): Promise<RecomputeResult> {
  const { rows: planes } = await runner.query<{ id: number }>(
    `SELECT id FROM schedule_planes WHERE proyecto_id = $1 AND scope = 'proyecto' LIMIT 1`, [proyectoId])
  if (!planes[0]) return { skipped: true }
  const planId = planes[0].id

  // Resolver el proyecto del Gantt y delegar al pipeline único.
  const { rows: pe } = await runner.query<{ proyecto_ext: string }>(
    `SELECT proyecto_ext FROM ing_proyectos WHERE proyecto_id = $1`, [proyectoId])
  const ext = pe[0]?.proyecto_ext
  if (!ext) return { skipped: true } // journey sin Gantt: se deja como está (fechas NULL)

  const { recomputarYGuardar } = await import('../../ingenieria/domain/tareas')
  await recomputarYGuardar(runner, ext)

  const { rows: sp } = await runner.query<{ semaforo: string; holgura_dias: number | null }>(
    `SELECT semaforo, holgura_dias FROM schedule_planes WHERE id = $1`, [planId])
  return { skipped: false, planId, semaforo: sp[0]?.semaforo, holguraDias: sp[0]?.holgura_dias ?? null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrappers "safe" para llamar POST-COMMIT desde otros módulos (fire-and-forget).
// Abren su propia conexión y transacción; si algo falla, loguean pero NO propagan el
// error — el flujo principal (recepción/OP) ya commiteó y no debe romperse por el
// schedule. Proyectos sin plan salen por el early-return barato.
// ─────────────────────────────────────────────────────────────────────────────

/** Recalcula el journey de un proyecto en su propia txn. Best-effort. */
export async function recomputeScheduleSafe(proyectoId: number, disparadoPor: Disparador): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await recomputeScheduleForProyecto(client, proyectoId, disparadoPor)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    logger.error('recomputeScheduleSafe error', { proyectoId, err })
  } finally {
    client.release()
  }
}

/** Idem, resolviendo el proyecto desde una OC. Best-effort. */
export async function recomputeScheduleForOCSafe(ocId: number, disparadoPor: Disparador): Promise<void> {
  try {
    const { rows } = await pool.query<{ proyecto_id: number | null }>(
      `SELECT proyecto_id FROM ordenes_compra WHERE id = $1`, [ocId])
    const pid = rows[0]?.proyecto_id
    if (pid) await recomputeScheduleSafe(pid, disparadoPor)
  } catch (err) {
    logger.error('recomputeScheduleForOCSafe error', { ocId, err })
  }
}

/** Idem, resolviendo el proyecto desde una OP (orden de producción). Best-effort. */
export async function recomputeScheduleForOPSafe(ordenId: number, disparadoPor: Disparador): Promise<void> {
  try {
    const { rows } = await pool.query<{ proyecto_id: number | null }>(
      `SELECT proyecto_id FROM ordenes_produccion WHERE id = $1`, [ordenId])
    const pid = rows[0]?.proyecto_id
    if (pid) await recomputeScheduleSafe(pid, disparadoPor)
  } catch (err) {
    logger.error('recomputeScheduleForOPSafe error', { ordenId, err })
  }
}
