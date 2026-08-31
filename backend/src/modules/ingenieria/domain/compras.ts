// ─────────────────────────────────────────────────────────────────────────────
// Estado de Compras para la ruta de ingeniería (#4 long leads / #9 material proc)
// ─────────────────────────────────────────────────────────────────────────────
// Regla de arquitectura (Chali): un dato con dueño se LEE, no se copia. El flujo de
// compras lo dueña el MÓDULO DE COMPRAS. Los 5 hitos del proceso (Chali):
//   1. Importación del MTO      → materiales_mto.fecha_importacion
//   2. Solicitud de cotización  → solicitudes_cotizacion
//   3. Captura del precio        → estado_cotiz deja de ser PENDIENTE (COTIZADO+)
//   4. Creación de la OC         → estado_cotiz ORDENADO (material en una OC)
//   5. Recepción                 → estado_cotiz RECIBIDO
// (EN_STOCK = se resolvió desde stock, sin compra.)
//
// Las fechas de recepción alimentan Fabricación (#14). Este estado es una lectura,
// sin duplicar nada del módulo de Compras.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'

type QueryRunner = PoolClient | typeof pool

export interface EstadoCompras {
  hay: boolean                 // MTO importado (hay materiales del proyecto)
  fecha_mto: string | null     // hito 1: importación del MTO (la más temprana)
  n_materiales: number         // materiales activos del MTO
  solicitudes: number          // hito 2: cotizaciones solicitadas
  fecha_solicitud: string | null
  con_precio: number           // hito 3: materiales con precio (COTIZADO+)
  en_oc: number                // hito 4: materiales en una OC (ORDENADO+)
  recibidos: number            // hito 5: RECIBIDO
  en_stock: number             // resueltos desde stock
  fecha_primera_oc: string | null
  fecha_ultima_recepcion: string | null
  pct_disponible: number       // (recibidos + en_stock) / n_materiales, 0..1
}

/** Lee el estado agregado del flujo de compras de un proyecto (5 hitos). */
export async function estadoCompras(runner: QueryRunner, proyectoExt: string): Promise<EstadoCompras> {
  // (1) Materiales del MTO por estado (la máquina de estados vive en estado_cotiz).
  const { rows: mm } = await runner.query<{
    n: string; con_precio: string; en_oc: string; recibidos: string; en_stock: string; fecha_mto: string | null
  }>(
    `SELECT
        count(*)::int AS n,
        count(*) FILTER (WHERE m.estado_cotiz <> 'PENDIENTE')::int AS con_precio,
        count(*) FILTER (WHERE m.estado_cotiz IN ('ORDENADO','RECIBIDO'))::int AS en_oc,
        count(*) FILTER (WHERE m.estado_cotiz = 'RECIBIDO')::int AS recibidos,
        count(*) FILTER (WHERE m.estado_cotiz = 'EN_STOCK')::int AS en_stock,
        to_char(min(m.fecha_importacion),'YYYY-MM-DD') AS fecha_mto
       FROM materiales_mto m
       JOIN ing_proyectos ip ON ip.proyecto_id = m.proyecto_id
      WHERE ip.proyecto_ext = $1 AND m.activo AND COALESCE(m.cotizar,'SI') <> 'NO'`, [proyectoExt])
  const r = mm[0]
  const n = r ? +r.n : 0

  // (2) Cotizaciones solicitadas (hito 2).
  const { rows: sc } = await runner.query<{ n: string; fecha: string | null }>(
    `SELECT count(*)::int AS n, to_char(min(s.fecha_solicitud),'YYYY-MM-DD') AS fecha
       FROM solicitudes_cotizacion s
       JOIN ing_proyectos ip ON ip.proyecto_id = s.proyecto_id
      WHERE ip.proyecto_ext = $1`, [proyectoExt])

  // (3) Fechas de OC y de recepción (para el riesgo y para alimentar fabricación).
  const { rows: oc } = await runner.query<{ primera_oc: string | null; ultima_rec: string | null }>(
    `SELECT to_char(min(o.fecha_emision),'YYYY-MM-DD') AS primera_oc,
            to_char(max(o.fecha_entrega_real),'YYYY-MM-DD') AS ultima_rec
       FROM ordenes_compra o
       JOIN ing_proyectos ip ON ip.proyecto_id = o.proyecto_id
      WHERE ip.proyecto_ext = $1`, [proyectoExt])

  const recibidos = r ? +r.recibidos : 0
  const en_stock = r ? +r.en_stock : 0
  return {
    hay: n > 0,
    fecha_mto: r?.fecha_mto ?? null,
    n_materiales: n,
    solicitudes: sc[0] ? +sc[0].n : 0,
    fecha_solicitud: sc[0]?.fecha ?? null,
    con_precio: r ? +r.con_precio : 0,
    en_oc: r ? +r.en_oc : 0,
    recibidos,
    en_stock,
    fecha_primera_oc: oc[0]?.primera_oc ?? null,
    fecha_ultima_recepcion: oc[0]?.ultima_rec ?? null,
    pct_disponible: n > 0 ? Math.round(((recibidos + en_stock) / n) * 100) / 100 : 0,
  }
}
