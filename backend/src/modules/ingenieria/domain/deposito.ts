// ─────────────────────────────────────────────────────────────────────────────
// Gate del depósito (paso 3 → frena 4 y 9)
// ─────────────────────────────────────────────────────────────────────────────
// Regla de arquitectura (Chali): un dato con dueño se LEE, no se copia. El hecho
// "depósito confirmado" lo dueña FINANZAS en el módulo schedule (hito C-04 "Down
// Payment", schedule_hitos.fecha_real). Acá lo LEEMOS. Lo único propio de la ruta
// es la decisión del PM de ABRIR el gate a mano antes de que el pago llegue
// (candado ing_tarea_deps.ignorada_at/por) — nadie más dueña ese hecho.
//
// El motor (holgura, en tareas.ts) ya excluye del cálculo las aristas con
// ignorada_at: abrir el gate suelta a long_leads/material_proc del depósito.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'

type QueryRunner = PoolClient | typeof pool

export interface EstadoDeposito {
  confirmado_finanzas: boolean   // Finanzas registró el hito C-04
  fecha_confirmacion: string | null
  override_pm: boolean           // el PM abrió el gate a mano
  override_por: string | null    // nombre/email de quién lo abrió
  override_at: string | null
  abierto: boolean               // confirmado por finanzas O abierto por el PM
}

/** Lee el estado del gate del depósito de un proyecto (dato de Finanzas + candado del PM). */
export async function estadoDeposito(runner: QueryRunner, proyectoExt: string): Promise<EstadoDeposito> {
  // (1) Confirmación de Finanzas: hito C-04 del plan de schedule de este proyecto.
  const { rows: fin } = await runner.query<{ fecha: string | null }>(
    `SELECT to_char(h.fecha_real,'YYYY-MM-DD') AS fecha
       FROM ing_proyectos ip
       JOIN schedule_planes sp ON sp.proyecto_id = ip.proyecto_id AND sp.scope = 'proyecto'
       JOIN schedule_hitos  h  ON h.plan_id = sp.id AND h.codigo = 'C-04'
      WHERE ip.proyecto_ext = $1 AND h.fecha_real IS NOT NULL
      ORDER BY h.fecha_real ASC
      LIMIT 1`, [proyectoExt])
  const confirmado = fin.length > 0
  const fechaConf = fin[0]?.fecha ?? null

  // (2) Candado del PM: alguna arista que depende de material_deposit está ignorada.
  const { rows: ov } = await runner.query<{ at: string | null; por: string | null }>(
    `SELECT to_char(d.ignorada_at,'YYYY-MM-DD') AS at, u.email AS por
       FROM ing_tarea_deps d
       JOIN ing_tareas t   ON t.id = d.depende_de_id
       JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id AND tt.clave = 'material_deposit'
       LEFT JOIN usuarios u ON u.id = d.ignorada_por
      WHERE t.proyecto_ext = $1 AND d.ignorada_at IS NOT NULL
      ORDER BY d.ignorada_at ASC
      LIMIT 1`, [proyectoExt])
  const overridePm = ov.length > 0

  return {
    confirmado_finanzas: confirmado,
    fecha_confirmacion: fechaConf,
    override_pm: overridePm,
    override_por: ov[0]?.por ?? null,
    override_at: ov[0]?.at ?? null,
    abierto: confirmado || overridePm,
  }
}

/** El PM abre (o cierra) el gate del depósito a mano: pone/saca el candado en TODAS las
 *  aristas que dependen de material_deposit. Reusable para cualquier gate vía tipoClave. */
export async function overrideGate(
  runner: QueryRunner, proyectoExt: string, tipoClave: string, abrir: boolean, usuarioId: string | null
): Promise<{ ok: boolean; afectadas: number }> {
  const { rowCount } = await runner.query(
    `UPDATE ing_tarea_deps d
        SET ignorada_at  = CASE WHEN $3 THEN NOW() ELSE NULL END,
            ignorada_por = CASE WHEN $3 THEN $4::uuid ELSE NULL END
       FROM ing_tareas t, ing_tarea_tipos tt
      WHERE d.depende_de_id = t.id AND t.tipo_id = tt.id
        AND tt.clave = $2 AND t.proyecto_ext = $1`,
    [proyectoExt, tipoClave, abrir, usuarioId])
  return { ok: true, afectadas: rowCount ?? 0 }
}
