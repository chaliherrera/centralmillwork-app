// ─────────────────────────────────────────────────────────────────────────────
// Domain — Registro de hitos por su responsable (interno)
// ─────────────────────────────────────────────────────────────────────────────
// El área dueña de un hito registra que ocurrió, con evidencia real: fecha +
// nota (+ archivo en el futuro). Es la contracara interna de la aprobación del
// cliente por el portal. Respeta P2: es un hecho real con autor, no un tilde.
//
// Solo se pueden registrar a mano los hitos NO instrumentados (manual_futuro)
// que NO son acciones del cliente (esos llegan por el portal) ni se capturan
// solos (M-*, P-*, QC-* vienen de compras/producción/QC).
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { recomputeScheduleForProyecto } from './recompute'
import { APROBABLES } from './portal'
import { bloqueoPorPredecesores } from './gates'

type QueryRunner = PoolClient | typeof pool

export interface RegistroResult { ok: boolean; error?: string }

/**
 * Registra (o des-registra) un hito manualmente por su responsable.
 * @param fecha  'YYYY-MM-DD' del hecho real, o null para des-registrar.
 */
export async function registrarHito(
  runner: QueryRunner,
  proyectoId: number,
  codigo: string,
  fecha: string | null,
  nota: string | null,
  usuarioNombre: string | null,
  importe?: number | null
): Promise<RegistroResult> {
  // El hito debe existir en el plan y ser manual (no instrumentado ni del cliente)
  const { rows } = await runner.query<{ id: number; fuente_dato: string }>(
    `SELECT sh.id, ph.fuente_dato
       FROM schedule_hitos sh
       JOIN schedule_planes sp ON sp.id = sh.plan_id
       JOIN schedule_plantilla_hitos ph ON ph.plantilla_id = sp.plantilla_id AND ph.codigo = sh.codigo
      WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = $2`,
    [proyectoId, codigo])
  const h = rows[0]
  if (!h) return { ok: false, error: 'hito no encontrado en el plan' }
  if (h.fuente_dato !== 'manual_futuro')
    return { ok: false, error: 'este hito se completa solo con la operación, no se registra a mano' }
  if (APROBABLES[codigo])
    return { ok: false, error: 'este hito lo aprueba el cliente desde el portal' }

  if (fecha === null) {
    // des-registrar (corregir un error)
    await runner.query(
      `UPDATE schedule_hitos SET fecha_real = NULL, evidencia_ref = NULL, updated_at = NOW() WHERE id = $1`,
      [h.id])
  } else {
    // Freno hacia adelante: no completar si faltan pasos previos.
    const bloqueo = await bloqueoPorPredecesores(runner, proyectoId, codigo)
    if (bloqueo) return { ok: false, error: bloqueo }
    const evidencia = JSON.stringify(
      importe != null
        ? { source: 'pago', importe, usuario: usuarioNombre || undefined, nota: nota || undefined }
        : { source: 'registro', usuario: usuarioNombre || undefined, nota: nota || undefined })
    await runner.query(
      `UPDATE schedule_hitos SET fecha_real = $2::timestamptz, evidencia_ref = $3::jsonb, updated_at = NOW() WHERE id = $1`,
      [h.id, `${fecha} 12:00:00`, evidencia])
  }

  await recomputeScheduleForProyecto(runner, proyectoId, 'manual')
  return { ok: true }
}
