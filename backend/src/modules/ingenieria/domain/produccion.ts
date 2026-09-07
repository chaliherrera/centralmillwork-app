// ─────────────────────────────────────────────────────────────────────────────
// Estado de Producción para la ruta de ingeniería (#14 fabricación)
// ─────────────────────────────────────────────────────────────────────────────
// El reconciliador lee este estado DIRECTO de ordenes_produccion (como hace con
// compras/instalación), no del hito P-06 del journey — que se actualiza recién en
// proyectarJourney, DESPUÉS de que el reconciliador corrió, causando un desfase de
// un recompute (fabricación no cerraba en la misma pasada). Las OPs de MUESTRA no
// cuentan (no son fabricación del millwork).
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'

type QueryRunner = PoolClient | typeof pool

export interface EstadoProduccion {
  hay: boolean            // hay OPs de producción (no muestra) del proyecto
  en_curso: boolean       // alguna OP arrancó (En Proceso/Pausada/Completada)
  completa: boolean       // hay OPs y TODAS las activas están Completada
  fecha_inicio: string | null   // primera OP que arrancó
  fecha_completa: string | null  // última OP completada (si completa)
}

export async function estadoProduccion(runner: QueryRunner, proyectoExt: string): Promise<EstadoProduccion> {
  const { rows } = await runner.query<{
    activas: string; pendientes: string; iniciadas: string; ini: string | null; comp: string | null
  }>(
    `SELECT
        COUNT(*) FILTER (WHERE op.status <> 'Cancelada')::text AS activas,
        COUNT(*) FILTER (WHERE op.status NOT IN ('Completada','Cancelada'))::text AS pendientes,
        COUNT(*) FILTER (WHERE op.status IN ('En Proceso','Pausada','Completada'))::text AS iniciadas,
        to_char(MIN(COALESCE(op.fecha_inicio, op.updated_at)),'YYYY-MM-DD') AS ini,
        to_char(MAX(op.fecha_completada),'YYYY-MM-DD') AS comp
       FROM ordenes_produccion op
       JOIN ing_proyectos ip ON ip.proyecto_id = op.proyecto_id
      WHERE ip.proyecto_ext = $1 AND op.tipo IS DISTINCT FROM 'MUESTRA'`, [proyectoExt])
  const r = rows[0]
  const activas = r ? +r.activas : 0
  const pendientes = r ? +r.pendientes : 0
  const iniciadas = r ? +r.iniciadas : 0
  return {
    hay: activas > 0,
    en_curso: iniciadas > 0,
    completa: activas > 0 && pendientes === 0,
    fecha_inicio: r?.ini ?? null,
    fecha_completa: r?.comp ?? null,
  }
}
