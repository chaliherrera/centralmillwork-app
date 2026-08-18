// ─────────────────────────────────────────────────────────────────────────────
// Domain — Captura de fechas reales desde los módulos ya instrumentados
// ─────────────────────────────────────────────────────────────────────────────
// El "reloj hacia adelante": lee de las tablas que el sistema YA mantiene
// (compras, recepciones, producción, QC) y determina, para cada hito
// instrumentado en la Etapa 1, si ya se cumplió y en qué fecha.
//
// Principio P2: la fecha sale de la evidencia (una OC emitida, una recepción
// cerrada, una OP terminada), NUNCA de un tilde manual. Los hitos con
// fuente_dato='manual_futuro' no se capturan acá — quedan en null hasta que
// se construya su etapa.
//
// Etapa 1 — hitos instrumentados:
//   M-03 long-lead ordenados · M-04 MTO cotizado · M-05 OCs emitidas
//   M-07 material 100% · P-05 fabricación en curso · P-06 fabricación completa
//   QC-01 controles · QC-02 QC final · QC-03 reproceso
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import type { ISODate } from './calendario'

type QueryRunner = PoolClient | typeof pool

export interface Captura {
  fecha_real: ISODate | null
  evidencia: Record<string, unknown> | null
}

async function scalarDate(runner: QueryRunner, sql: string, params: unknown[]): Promise<ISODate | null> {
  const { rows } = await runner.query<{ d: string | null }>(sql, params)
  return rows[0]?.d ?? null
}

async function tableExists(runner: QueryRunner, table: string): Promise<boolean> {
  const { rows } = await runner.query<{ e: boolean }>(
    `SELECT to_regclass('public.' || $1) IS NOT NULL AS e`, [table])
  return rows[0]?.e === true
}

/**
 * Devuelve, por código de hito, la fecha real capturada (o null si aún no se
 * cumplió). Solo cubre los hitos instrumentados de la Etapa 1.
 */
export async function capturarFechasReales(
  runner: QueryRunner,
  proyectoId: number
): Promise<Map<string, Captura>> {
  const out = new Map<string, Captura>()
  const set = (codigo: string, fecha: ISODate | null, ev: Record<string, unknown>) =>
    out.set(codigo, { fecha_real: fecha, evidencia: fecha ? ev : null })

  // ── M-03 · Long-lead ordenados ≈ primera OC emitida del proyecto ───────────
  const m03 = await scalarDate(runner,
    `SELECT to_char(MIN(fecha_emision),'YYYY-MM-DD') AS d
       FROM ordenes_compra
      WHERE proyecto_id = $1 AND estado NOT IN ('borrador','cancelada')`, [proyectoId])
  set('M-03', m03, { source: 'oc_emitida', regla: 'primera OC emitida' })

  // ── M-04 · MTO cotizado = última cotización recibida ───────────────────────
  const m04 = await scalarDate(runner,
    `SELECT to_char(MAX(fecha_respuesta),'YYYY-MM-DD') AS d
       FROM solicitudes_cotizacion
      WHERE proyecto_id = $1 AND estado = 'recibida' AND fecha_respuesta IS NOT NULL`, [proyectoId])
  set('M-04', m04, { source: 'cotizacion' })

  // ── M-05 · OCs emitidas = última OC emitida (hay al menos una) ─────────────
  {
    const { rows } = await runner.query<{ d: string | null; n: string }>(
      `SELECT to_char(MAX(fecha_emision),'YYYY-MM-DD') AS d, COUNT(*)::text AS n
         FROM ordenes_compra
        WHERE proyecto_id = $1 AND estado NOT IN ('borrador','cancelada')`, [proyectoId])
    const n = Number(rows[0]?.n ?? 0)
    set('M-05', n > 0 ? (rows[0]?.d ?? null) : null, { source: 'oc_emitida', ocs: n })
  }

  // ── M-07 · Material recibido y stockeado 100% (readiness) ──────────────────
  {
    const { rows } = await runner.query<{ relevantes: string; faltan: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE cotizar IS DISTINCT FROM 'NO')::text AS relevantes,
         COUNT(*) FILTER (WHERE cotizar IS DISTINCT FROM 'NO'
                            AND estado_cotiz NOT IN ('RECIBIDO','EN_STOCK'))::text AS faltan
         FROM materiales_mto WHERE proyecto_id = $1`, [proyectoId])
    const relevantes = Number(rows[0]?.relevantes ?? 0)
    const faltan = Number(rows[0]?.faltan ?? 0)
    if (relevantes > 0 && faltan === 0) {
      const d = await scalarDate(runner,
        `SELECT to_char(MAX(r.fecha_recepcion),'YYYY-MM-DD') AS d
           FROM recepciones r JOIN ordenes_compra o ON o.id = r.orden_compra_id
          WHERE o.proyecto_id = $1`, [proyectoId])
      set('M-07', d, { source: 'readiness', relevantes })
    } else {
      set('M-07', null, { source: 'readiness', relevantes, faltan })
    }
  }

  // Producción/QC pueden no existir en deployments parciales o entornos de dev:
  // si faltan, esos hitos quedan sin capturar (null) en vez de romper.
  const hasOP = await tableExists(runner, 'ordenes_produccion')
  const hasQC = hasOP && (await tableExists(runner, 'qc_inspecciones'))
  if (!hasOP) {
    for (const c of ['P-01', 'P-05', 'P-06']) set(c, null, { source: 'op_estacion', motivo: 'tabla ausente' })
  }
  if (!hasQC) {
    for (const c of ['QC-01', 'QC-02', 'QC-03']) set(c, null, { source: 'qc', motivo: 'tabla ausente' })
  }
  if (!hasOP) return out

  // ── P-01 · Producción iniciada = primera OP creada ─────────────────────────
  const p01 = await scalarDate(runner,
    `SELECT to_char(MIN(created_at),'YYYY-MM-DD') AS d
       FROM ordenes_produccion
      WHERE proyecto_id = $1 AND status <> 'Cancelada'`, [proyectoId])
  set('P-01', p01, { source: 'op_creada' })

  // ── P-05 · Fabricación en curso = primera OP arrancada ─────────────────────
  const p05 = await scalarDate(runner,
    `SELECT to_char(MIN(fecha_inicio),'YYYY-MM-DD') AS d
       FROM ordenes_produccion
      WHERE proyecto_id = $1 AND fecha_inicio IS NOT NULL AND status <> 'Cancelada'`, [proyectoId])
  set('P-05', p05, { source: 'op_estacion' })

  // ── P-06 · Fabricación completa = todas las OPs activas completadas ────────
  {
    const { rows } = await runner.query<{ activas: string; pendientes: string; d: string | null }>(
      `SELECT
         COUNT(*) FILTER (WHERE status <> 'Cancelada')::text AS activas,
         COUNT(*) FILTER (WHERE status NOT IN ('Completada','Cancelada'))::text AS pendientes,
         to_char(MAX(fecha_completada),'YYYY-MM-DD') AS d
         FROM ordenes_produccion WHERE proyecto_id = $1`, [proyectoId])
    const activas = Number(rows[0]?.activas ?? 0)
    const pendientes = Number(rows[0]?.pendientes ?? 0)
    set('P-06', activas > 0 && pendientes === 0 ? (rows[0]?.d ?? null) : null,
        { source: 'op_estacion', activas, pendientes })
  }

  if (hasQC) {
    // ── QC-01 · Controles por etapa = primera inspección registrada ──────────
    const qc01 = await scalarDate(runner,
      `SELECT to_char(MIN(q.fecha_inspeccion),'YYYY-MM-DD') AS d
         FROM qc_inspecciones q JOIN ordenes_produccion op ON op.id = q.orden_id
        WHERE op.proyecto_id = $1`, [proyectoId])
    set('QC-01', qc01, { source: 'qc' })

    // ── QC-02 · QC final aprobado = última inspección con decisión Aprobar ───
    const qc02 = await scalarDate(runner,
      `SELECT to_char(MAX(q.fecha_inspeccion),'YYYY-MM-DD') AS d
         FROM qc_inspecciones q JOIN ordenes_produccion op ON op.id = q.orden_id
        WHERE op.proyecto_id = $1 AND q.decision = 'Aprobar'`, [proyectoId])
    set('QC-02', qc02, { source: 'qc', regla: 'última inspección aprobada' })

    // ── QC-03 · Reproceso por defecto = existe decisión Reprocesar/Scrap ─────
    const qc03 = await scalarDate(runner,
      `SELECT to_char(MAX(q.fecha_inspeccion),'YYYY-MM-DD') AS d
         FROM qc_inspecciones q JOIN ordenes_produccion op ON op.id = q.orden_id
        WHERE op.proyecto_id = $1 AND q.decision IN ('Reprocesar','Scrap')`, [proyectoId])
    set('QC-03', qc03, { source: 'qc' })
  }

  return out
}
