// ─────────────────────────────────────────────────────────────────────────────
// Domain — Freno hacia adelante (guarda de predecesores)
// ─────────────────────────────────────────────────────────────────────────────
// No se puede completar un hito a mano si sus pasos previos todavía no están
// cumplidos. Evita marcar cosas imposibles (ej.: registrar el despacho cuando
// la producción y el QC no terminaron). Complementa el "cierre hacia atrás":
// juntos mantienen la cadena siempre coherente.
//
// Se chequea contra la fecha_real YA persistida (que incluye las completadas
// por inferencia), así los pasos administrativos inferidos cuentan como hechos.
// Solo aplica a las acciones MANUALES del schedule; los hechos reales de otros
// módulos (recepciones, producción) nunca se frenan.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'

type QueryRunner = PoolClient | typeof pool

export interface PredPendiente { codigo: string; nombre: string }

/** Devuelve los predecesores directos de `codigo` que aún NO están cumplidos. */
export async function predecesoresPendientes(
  runner: QueryRunner, proyectoId: number, codigo: string
): Promise<PredPendiente[]> {
  const { rows } = await runner.query<PredPendiente>(
    `SELECT dep.depende_de_codigo AS codigo, ph.nombre
       FROM schedule_planes sp
       JOIN schedule_plantilla_dependencias dep
         ON dep.plantilla_id = sp.plantilla_id AND dep.hito_codigo = $2
       JOIN schedule_hitos sh
         ON sh.plan_id = sp.id AND sh.codigo = dep.depende_de_codigo
       JOIN schedule_plantilla_hitos ph
         ON ph.plantilla_id = sp.plantilla_id AND ph.codigo = dep.depende_de_codigo
      WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.fecha_real IS NULL
        -- Un condicional que NO aplica (no_aplica) cuenta como satisfecho: no frena.
        AND NOT (ph.tipo = 'cond' AND sh.estado = 'no_aplica')
      ORDER BY ph.orden`, [proyectoId, codigo])
  return rows
}

/** Mensaje de error listando los pasos previos que faltan, o null si está OK. */
export async function bloqueoPorPredecesores(
  runner: QueryRunner, proyectoId: number, codigo: string
): Promise<string | null> {
  const faltan = await predecesoresPendientes(runner, proyectoId, codigo)
  if (faltan.length === 0) return null
  const lista = faltan.map((p) => p.nombre).join(', ')
  return `No se puede completar todavía: faltan pasos previos (${lista}).`
}
