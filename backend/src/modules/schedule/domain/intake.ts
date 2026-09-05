// ─────────────────────────────────────────────────────────────────────────────
// Domain — Intake de Estimación (la puerta de entrada del "Life of a Deal")
// ─────────────────────────────────────────────────────────────────────────────
// Estimación arranca el proyecto en el schedule: carga la fecha de entrega
// comprometida con el cliente (genera el plan hacia atrás) y sube el contrato
// firmado, que cierra C-03 "Contrato firmado (día cero)" — el arranque operativo.
//
// C-03 es el punto de nacimiento: no tiene sentido frenarlo por sus predecesores
// (C-01 negociación, C-02 revisión), que ocurrieron sí o sí antes de firmar. Se
// completa directo y el cierre hacia atrás infiere C-01/C-02. Evidencia real (P2).
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { generarPlan, recomputeScheduleForProyecto } from './recompute'
import { reanclarPlanAFirma } from '../../ingenieria/domain/plan_inicial'

type QueryRunner = PoolClient | typeof pool

export interface IntakeResult { ok: boolean; error?: string; planNuevo: boolean }

/**
 * Arranca (o completa el arranque de) un proyecto en el schedule.
 * @param fechaObjetivo  'YYYY-MM-DD' entrega comprometida con el cliente.
 * @param contrato       archivo del contrato firmado ya subido a storage, o null.
 */
export async function intakeProyecto(
  runner: QueryRunner,
  proyectoId: number,
  fechaObjetivo: string,
  contrato: { filename: string; original_name: string; size: number } | null,
  usuarioId: string | null,
  usuarioNombre: string | null,
  firma?: { fechaFirma: string | null; fechaEnvio: string | null }
): Promise<IntakeResult> {
  // ¿Ya tiene plan? Si no, generarlo (calcula todo hacia atrás desde la fecha).
  const { rows: pl } = await runner.query<{ id: number }>(
    `SELECT id FROM schedule_planes WHERE proyecto_id = $1 AND scope = 'proyecto'`, [proyectoId])
  const planNuevo = !pl[0]
  if (planNuevo) {
    await generarPlan(runner, proyectoId, fechaObjetivo)
  }

  // Verificar que C-03 exista. Se graba el contrato salvo que YA tenga una
  // evidencia REAL (no inferida): el contrato real pisa a la inferencia.
  const { rows: sh } = await runner.query<{ fecha_real: string | null; evidencia_ref: unknown }>(
    `SELECT sh.fecha_real, sh.evidencia_ref
       FROM schedule_hitos sh JOIN schedule_planes sp ON sp.id = sh.plan_id
      WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = 'C-03'`, [proyectoId])
  if (!sh[0]) return { ok: false, error: 'el plan no tiene el hito C-03', planNuevo }
  const ev = sh[0].evidencia_ref as { source?: string } | null
  const yaTieneReal = !!sh[0].fecha_real && ev?.source !== 'inferido'

  if (!yaTieneReal) {
    // Guardar el contrato como archivo del hito (si vino) para trazabilidad.
    if (contrato) {
      await runner.query(
        `INSERT INTO schedule_hito_archivos (proyecto_id, hito_codigo, filename, original_name, size_bytes, subido_por)
           VALUES ($1,'C-03',$2,$3,$4,$5)`,
        [proyectoId, contrato.filename, contrato.original_name, contrato.size, usuarioId])
    }
    // Retraso atribuible al cliente = días entre que se le envió el contrato y que
    // lo firmó. Se documenta como evidencia (no se usa para mover la fecha sagrada;
    // sirve para justificar una renegociación si comprometió la entrega).
    const fechaFirma = firma?.fechaFirma || null
    const fechaEnvio = firma?.fechaEnvio || null
    const diasCliente = fechaFirma && fechaEnvio
      ? Math.max(0, Math.round((new Date(fechaFirma).getTime() - new Date(fechaEnvio).getTime()) / 86400000))
      : null
    const evidencia = JSON.stringify({
      source: 'contrato', archivo: contrato?.original_name, usuario: usuarioNombre || undefined,
      fecha_firma: fechaFirma || undefined, fecha_envio: fechaEnvio || undefined,
      dias_atribuibles_cliente: diasCliente ?? undefined,
    })
    // Día cero = la firma del cliente (si se registró); si no, la fecha de hoy.
    await runner.query(
      `UPDATE schedule_hitos sh SET fecha_real = COALESCE($3::timestamptz, NOW()), evidencia_ref = $2::jsonb, updated_at = NOW()
         FROM schedule_planes sp
        WHERE sp.id = sh.plan_id AND sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = 'C-03'`,
      [proyectoId, evidencia, fechaFirma])
  }

  // Re-anclar el día cero del plan de ingeniería a la firma (si el plan lo generó el
  // PM en la app) ANTES de recalcular, para que el journey refleje el Gantt re-anclado.
  // La holgura se achica por lo que tardó el cliente en firmar; el inicio original queda
  // guardado para documentar la demora.
  if (firma?.fechaFirma) {
    try { await reanclarPlanAFirma(runner, proyectoId, firma.fechaFirma) } catch { /* best-effort */ }
  }

  await recomputeScheduleForProyecto(runner, proyectoId, 'manual')

  return { ok: true, planNuevo }
}
