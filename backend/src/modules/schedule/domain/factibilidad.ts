// ─────────────────────────────────────────────────────────────────────────────
// Chequeo de factibilidad (READ-ONLY / dry-run) — ADAPTADOR del planificador.
// ─────────────────────────────────────────────────────────────────────────────
// NO tiene lógica propia: llama al MISMO `planificarProyecto` que usa el generador
// del plan y traduce el resultado a lo que muestra Estimados. Así factibilidad y
// plan NUNCA se contradicen (misma cola, mismo ingeniero, mismas fechas).
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { planificarProyecto, type RankingIng } from '../../ingenieria/domain/planificador'

type QueryRunner = PoolClient | typeof pool

export type { RankingIng }
export interface FactibilidadResult {
  fecha_pedida: string
  factible: boolean
  fecha_real_mas_temprana: string
  dias_slip: number
  ingeniero_propuesto: string | null   // el que se libera antes (o null si no hay activos)
  disponible_desde: string             // cuándo se libera el propuesto
  ventana_ing: { inicio: string; fin: string } | null
  ranking: RankingIng[]                // todos los ingenieros, por fecha de disponibilidad
  motivo: 'ok' | 'cadena' | 'capacidad' | 'sin_ingenieros'
  provisional: true
}

export async function chequearFactibilidad(
  runner: QueryRunner,
  fechaPedida: string,
  opts?: { itemsQty?: number | null; hayStone?: boolean; incluyeInstalacion?: boolean },
): Promise<FactibilidadResult> {
  const u = await planificarProyecto(runner, {
    itemsQty: opts?.itemsQty ?? null,
    hayStone: opts?.hayStone ?? false,
    incluyeInstalacion: opts?.incluyeInstalacion ?? true,
    fechaEntrega: fechaPedida,
  })
  // holgura_dias = días hábiles entre fin_proyectado y la fecha pedida; negativo = se pasa.
  return {
    fecha_pedida: fechaPedida,
    factible: u.entra,
    fecha_real_mas_temprana: u.entra ? fechaPedida : u.fin_proyectado,
    dias_slip: u.entra ? 0 : -u.holgura_dias,
    ingeniero_propuesto: u.ingeniero,
    disponible_desde: u.disponible_desde,
    ventana_ing: u.ventana_ing,
    ranking: u.ranking,
    motivo: u.motivo,
    provisional: true,
  }
}
