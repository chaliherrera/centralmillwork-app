// ─────────────────────────────────────────────────────────────────────────────
// mtosController — panel operativo MTO-céntrico (2026-07-14)
// ─────────────────────────────────────────────────────────────────────────────
// Endpoint READ-ONLY que responde el problema real de PROCUREMENT:
// "proceso varios MTOs al día y pierdo control sobre en qué parte del
// proceso está cada uno".
//
// La página /mtos consume este endpoint y muestra 1 card por MTO activo,
// con vendors adentro y contadores por estado. Cero cambios de schema —
// puro consumo de datos que ya existen en materiales_mto.
//
// Un MTO se identifica por `import_batch_id`. Para materiales legacy sin
// batch_id, fallback a agrupar por (fecha_importacion + origen). Mismo
// patrón usado en materialesController.
//
// "MTO activo" = tiene al menos 1 material con estado_cotiz NOT IN
// ('RECIBIDO', 'EN_STOCK') Y su proyecto está en estado 'activo'. Los
// batches 100% recibidos o cancelados se filtran fuera — no requieren
// atención operativa.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'

interface Row {
  batch_key: string
  import_batch_id: string | null
  fecha_importacion: string | null
  origen: string
  proyecto_id: number
  proyecto_codigo: string
  proyecto_nombre: string
  vendor: string | null
  estado_cotiz: string
  count: string
}

type EstadoCotiz = 'PENDIENTE' | 'COTIZADO' | 'ORDENADO' | 'RECIBIDO'

interface VendorAgg {
  vendor: string
  counts: Record<EstadoCotiz, number>
  total: number
}

interface MtoActivo {
  batch_key: string
  import_batch_id: string | null
  fecha_importacion: string | null
  origen: string
  proyecto: { id: number; codigo: string; nombre: string }
  total_materiales: number
  counts: Record<EstadoCotiz, number>
  vendors: VendorAgg[]
  porcentaje_recibido: number
}

const emptyCounts = (): Record<EstadoCotiz, number> => ({
  PENDIENTE: 0, COTIZADO: 0, ORDENADO: 0, RECIBIDO: 0,
})

/**
 * GET /api/mtos/activos
 *
 * Devuelve todos los MTOs actualmente activos (al menos 1 material aún no
 * recibido) de proyectos en estado 'activo'. Excluye stock interno CM.
 *
 * Response: { data: MtoActivo[] }
 * Ordenado por fecha_importacion DESC (más recientes primero).
 */
export async function getMtosActivos(_req: Request, res: Response, next: NextFunction) {
  try {
    // Query única: agrupa por (batch, proyecto, vendor, estado_cotiz) y
    // el conteo. Filtramos proyectos activos y excluimos EN_STOCK. El
    // filtro "al menos 1 material no recibido" lo aplicamos en JS después
    // de agregar (más simple que HAVING con array_agg).
    const { rows } = await pool.query<Row>(`
      SELECT
        COALESCE(m.import_batch_id::text, m.fecha_importacion::text || ':' || COALESCE(m.origen, 'MTO')) AS batch_key,
        m.import_batch_id::text                                       AS import_batch_id,
        m.fecha_importacion::text                                     AS fecha_importacion,
        COALESCE(m.origen, 'MTO')                                     AS origen,
        p.id                                                          AS proyecto_id,
        p.codigo                                                      AS proyecto_codigo,
        p.nombre                                                      AS proyecto_nombre,
        NULLIF(TRIM(m.vendor), '')                                    AS vendor,
        m.estado_cotiz::text                                          AS estado_cotiz,
        COUNT(*)::text                                                AS count
      FROM materiales_mto m
      JOIN proyectos p ON p.id = m.proyecto_id
      WHERE p.estado = 'activo'
        AND m.cotizar    != 'EN_STOCK'
        AND m.estado_cotiz != 'EN_STOCK'
      GROUP BY batch_key, m.import_batch_id, m.fecha_importacion, m.origen,
               p.id, p.codigo, p.nombre, vendor, m.estado_cotiz
    `)

    // Agrupamos en JS por batch_key -> vendors -> estados
    const byBatch = new Map<string, MtoActivo>()

    for (const r of rows) {
      const key = r.batch_key
      let mto = byBatch.get(key)
      if (!mto) {
        mto = {
          batch_key: key,
          import_batch_id: r.import_batch_id,
          fecha_importacion: r.fecha_importacion,
          origen: r.origen,
          proyecto: { id: r.proyecto_id, codigo: r.proyecto_codigo, nombre: r.proyecto_nombre },
          total_materiales: 0,
          counts: emptyCounts(),
          vendors: [],
          porcentaje_recibido: 0,
        }
        byBatch.set(key, mto)
      }

      const estado = r.estado_cotiz as EstadoCotiz
      const count = Number(r.count)
      const vendorName = r.vendor ?? 'Sin vendor'

      // Contadores globales del MTO
      if (estado in mto.counts) {
        mto.counts[estado] += count
        mto.total_materiales += count
      }

      // Contadores por vendor
      let vendorAgg = mto.vendors.find((v) => v.vendor === vendorName)
      if (!vendorAgg) {
        vendorAgg = { vendor: vendorName, counts: emptyCounts(), total: 0 }
        mto.vendors.push(vendorAgg)
      }
      if (estado in vendorAgg.counts) {
        vendorAgg.counts[estado] += count
        vendorAgg.total += count
      }
    }

    // Filtro "MTO activo": al menos 1 material NOT en RECIBIDO
    // (los que están 100% recibidos ya no requieren atención)
    const mtos = Array.from(byBatch.values()).filter((mto) => {
      const noRecibidos = mto.counts.PENDIENTE + mto.counts.COTIZADO + mto.counts.ORDENADO
      return noRecibidos > 0
    })

    // Calcular % recibido y ordenar vendors alfabético (consistencia visual)
    for (const mto of mtos) {
      mto.porcentaje_recibido = mto.total_materiales > 0
        ? Math.round((mto.counts.RECIBIDO / mto.total_materiales) * 100)
        : 0
      mto.vendors.sort((a, b) => a.vendor.localeCompare(b.vendor))
    }

    // Ordenar por fecha_importacion DESC (más recientes arriba). NULL last.
    mtos.sort((a, b) => {
      if (!a.fecha_importacion && !b.fecha_importacion) return 0
      if (!a.fecha_importacion) return 1
      if (!b.fecha_importacion) return -1
      return b.fecha_importacion.localeCompare(a.fecha_importacion)
    })

    res.json({ data: mtos })
  } catch (err) { next(err) }
}
