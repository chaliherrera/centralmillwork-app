// ─────────────────────────────────────────────────────────────────────────────
// Estado de Muestras para la ruta de ingeniería (pasos #6 samples y señal E-05)
// ─────────────────────────────────────────────────────────────────────────────
// Regla de arquitectura (Chali): un dato con dueño se LEE, no se copia. El proceso de
// muestras lo dueña el MÓDULO DE MUESTRAS (tabla `muestras`, ligada por proyecto_id).
// Acá agregamos su estado y lo colgamos de la tarea `samples` del plan — sin duplicar.
//
// Recordar: samples corre en PARALELO (SS con shop_drawings) y NO bloquea el gate #8
// (la aprobación del cliente solo depende de la revisión de SD). Por eso este estado es
// una SEÑAL DE SALUD (E-05), informativa, no una traba del schedule.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'

type QueryRunner = PoolClient | typeof pool

export interface EstadoMuestras {
  hay: boolean               // el proyecto tiene muestras
  total: number              // activas (no archivadas)
  aprobadas: number
  rechazadas: number
  pendientes: number         // en vuelo (solicitada/fabricación/qc/enviada)
  todas_aprobadas: boolean   // señal E-05 (informativa, no bloquea el gate)
  fecha_solicitud: string | null   // la más temprana
  fecha_aprobacion: string | null  // la más tardía (aprobación del cliente)
}

export interface MuestrasProyecto {
  proyecto_ext: string
  total: number
  aprobadas: number
  rechazadas: number
  pendientes: number
  todas_aprobadas: boolean
}

/** Estado de muestras por proyecto (para el escritorio del ingeniero: badge en el paso #6).
 *  Solo proyectos que tienen muestras cargadas en el módulo. */
export async function listMuestrasPorProyecto(runner: QueryRunner): Promise<MuestrasProyecto[]> {
  const { rows } = await runner.query<{ proyecto_ext: string; total: string; aprobadas: string; rechazadas: string; pendientes: string }>(
    `SELECT ip.proyecto_ext,
            count(*) FILTER (WHERE m.estado <> 'ARCHIVADA')::int AS total,
            count(*) FILTER (WHERE m.estado = 'APROBADA')::int AS aprobadas,
            count(*) FILTER (WHERE m.estado = 'RECHAZADA')::int AS rechazadas,
            count(*) FILTER (WHERE m.estado IN ('SOLICITADA','EN_FABRICACION','EN_QC','ENVIADA'))::int AS pendientes
       FROM muestras m
       JOIN ing_proyectos ip ON ip.proyecto_id = m.proyecto_id
      GROUP BY ip.proyecto_ext
     HAVING count(*) FILTER (WHERE m.estado <> 'ARCHIVADA') > 0`)
  return rows.map((r) => ({
    proyecto_ext: r.proyecto_ext,
    total: +r.total, aprobadas: +r.aprobadas, rechazadas: +r.rechazadas, pendientes: +r.pendientes,
    todas_aprobadas: +r.total > 0 && +r.aprobadas === +r.total,
  }))
}

/** Lee el estado agregado de las muestras de un proyecto (dato del módulo de Muestras). */
export async function estadoMuestras(runner: QueryRunner, proyectoExt: string): Promise<EstadoMuestras> {
  const { rows } = await runner.query<{
    total: string; aprobadas: string; rechazadas: string; pendientes: string
    fecha_solicitud: string | null; fecha_aprobacion: string | null
  }>(
    `SELECT
        count(*) FILTER (WHERE m.estado <> 'ARCHIVADA')::int AS total,
        count(*) FILTER (WHERE m.estado = 'APROBADA')::int AS aprobadas,
        count(*) FILTER (WHERE m.estado = 'RECHAZADA')::int AS rechazadas,
        count(*) FILTER (WHERE m.estado IN ('SOLICITADA','EN_FABRICACION','EN_QC','ENVIADA'))::int AS pendientes,
        to_char(min(m.fecha_solicitud),'YYYY-MM-DD') AS fecha_solicitud,
        to_char(max(m.fecha_aprobacion_cliente),'YYYY-MM-DD') AS fecha_aprobacion
       FROM muestras m
       JOIN ing_proyectos ip ON ip.proyecto_id = m.proyecto_id
      WHERE ip.proyecto_ext = $1`, [proyectoExt])
  const r = rows[0]
  const total = r ? +r.total : 0
  const aprobadas = r ? +r.aprobadas : 0
  return {
    hay: total > 0,
    total,
    aprobadas,
    rechazadas: r ? +r.rechazadas : 0,
    pendientes: r ? +r.pendientes : 0,
    todas_aprobadas: total > 0 && aprobadas === total,
    fecha_solicitud: r?.fecha_solicitud ?? null,
    fecha_aprobacion: r?.fecha_aprobacion ?? null,
  }
}
