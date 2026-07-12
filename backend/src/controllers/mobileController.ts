// ─────────────────────────────────────────────────────────────────────────────
// mobileController — endpoints específicos de la app móvil
// ─────────────────────────────────────────────────────────────────────────────
// La app móvil consume la misma API que el web, pero hay endpoints que le
// vienen mejor a un flow mobile-first: búsqueda global agregando varias
// tablas, respuestas más compactas, priorización por relevancia.
//
// Feature "Buscar" (2026-07-12): la necesidad real del user (Chali) es
// consultar el sistema desde el shop floor sin volver a oficina. Su flow
// natural es proyecto → vendor/código → detalle con fotos. Este endpoint
// agrega materiales + OCs + recepciones en un solo request para no obligar
// al mobile a coordinar N calls.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../utils/supabase'

const SIGNED_URL_TTL = 3600  // 1 hora — refetch del mobile lo renueva

interface MaterialResult {
  id: number
  codigo: string | null
  descripcion: string
  vendor: string | null
  qty: number
  unit_price: number
  item: string | null
  estado_cotiz: string
  oc_numero: string | null
  oc_estado: string | null
  recepcion_folio: string | null
  recepcion_fecha: string | null
  fotos_urls: string[]
}

interface OCResult {
  id: number
  numero: string
  estado: string
  fecha_emision: string | null
  fecha_entrega_estimada: string | null
  total: number
  proveedor_nombre: string | null
  items_cubiertos: string | null
}

/**
 * GET /api/mobile/search
 *
 * Query params:
 *   proyecto_id  (opcional pero recomendado) — filtra por proyecto
 *   q            (opcional) — texto libre, matchea contra:
 *                códigos, descripción, vendor, item, número de OC
 *   limit        (opcional, default 20, max 50) — resultados por tipo
 *
 * Response:
 *   { proyecto, query, materiales: [], ocs: [], counts: {materiales,ocs} }
 *
 * Diseño: 3 queries paralelas (proyecto/materiales/ocs). Materiales incluye
 * su OC asociada más reciente (si hay), su recepción más reciente (si hay),
 * y las URLs firmadas de fotos de esa recepción (max 3 para no explotar
 * el payload).
 */
export async function mobileSearch(req: Request, res: Response, next: NextFunction) {
  try {
    const proyectoId = req.query.proyecto_id
      ? parseInt(String(req.query.proyecto_id), 10)
      : null
    const rawQ = String(req.query.q ?? '').trim()
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20))

    // Si no hay proyecto ni q, devolver vacío (evita full-scan por accidente)
    if (!proyectoId && !rawQ) {
      return res.json({
        data: {
          proyecto: null,
          query: '',
          materiales: [],
          ocs: [],
          counts: { materiales: 0, ocs: 0 },
        },
      })
    }

    // El patrón ILIKE del query. Escapamos wildcards del user para que
    // no interfiera con la búsqueda literal ("stain%" no debería tratar
    // el % como wildcard).
    const qLike = rawQ ? `%${rawQ.replace(/[%_]/g, (m) => `\\${m}`)}%` : null

    // ── Query 1: info del proyecto ──────────────────────────────────
    const proyectoQuery = proyectoId
      ? pool.query(
          `SELECT id, codigo, nombre, cliente, estado
             FROM proyectos WHERE id = $1`,
          [proyectoId]
        )
      : Promise.resolve({ rows: [] as any[] })

    // ── Query 2: materiales matching ────────────────────────────────
    // Incluye: OC más reciente activa + recepción más reciente + fotos de
    // esa recepción (via LATERAL joins). Prioridad: matches en códigos
    // arriba, después descripción, después vendor.
    const matConds: string[] = []
    const matVals: any[] = []
    if (proyectoId) {
      matVals.push(proyectoId)
      matConds.push(`m.proyecto_id = $${matVals.length}`)
    }
    if (qLike) {
      matVals.push(qLike)
      matConds.push(`(
        m.codigo ILIKE $${matVals.length}
        OR m.descripcion ILIKE $${matVals.length}
        OR m.vendor ILIKE $${matVals.length}
        OR m.item ILIKE $${matVals.length}
      )`)
    }
    matVals.push(limit)
    const matWhere = matConds.length ? `WHERE ${matConds.join(' AND ')}` : ''

    const materialesQuery = pool.query<any>(
      `SELECT
         m.id, m.codigo, m.descripcion, m.vendor, m.qty, m.unit_price,
         m.item, m.estado_cotiz,
         oc_recent.numero AS oc_numero, oc_recent.estado AS oc_estado,
         rec_recent.folio AS recepcion_folio,
         rec_recent.fecha_recepcion AS recepcion_fecha,
         rec_fotos.filenames AS foto_filenames
       FROM materiales_mto m
       LEFT JOIN LATERAL (
         SELECT oc.numero, oc.estado
           FROM items_orden_compra ioc
           JOIN ordenes_compra oc ON oc.id = ioc.orden_compra_id
          WHERE ioc.material_id = m.id
            AND oc.estado <> 'cancelada'
          ORDER BY oc.fecha_emision DESC NULLS LAST
          LIMIT 1
       ) oc_recent ON true
       LEFT JOIN LATERAL (
         SELECT r.folio, r.fecha_recepcion, r.orden_compra_id
           FROM recepciones r
           JOIN items_orden_compra ioc ON ioc.orden_compra_id = r.orden_compra_id
          WHERE ioc.material_id = m.id
            AND r.estado IN ('completa', 'con_diferencias')
          ORDER BY r.fecha_recepcion DESC NULLS LAST
          LIMIT 1
       ) rec_recent ON true
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(oi.filename ORDER BY oi.created_at DESC) FILTER (WHERE oi.filename IS NOT NULL) AS filenames
           FROM oc_imagenes oi
          WHERE oi.orden_compra_id = rec_recent.orden_compra_id
          LIMIT 3
       ) rec_fotos ON true
       ${matWhere}
       ORDER BY
         -- códigos exactos y prefijo primero
         CASE
           WHEN ${qLike ? `m.codigo ILIKE $${matVals.length - 1}` : 'FALSE'} THEN 1
           WHEN ${qLike ? `m.vendor ILIKE $${matVals.length - 1}` : 'FALSE'} THEN 2
           ELSE 3
         END,
         m.updated_at DESC
       LIMIT $${matVals.length}`,
      matVals
    )

    // ── Query 3: OCs matching ───────────────────────────────────────
    const ocConds: string[] = []
    const ocVals: any[] = []
    if (proyectoId) {
      ocVals.push(proyectoId)
      ocConds.push(`o.proyecto_id = $${ocVals.length}`)
    }
    if (qLike) {
      ocVals.push(qLike)
      ocConds.push(`(
        o.numero ILIKE $${ocVals.length}
        OR v.nombre ILIKE $${ocVals.length}
        OR o.categoria ILIKE $${ocVals.length}
      )`)
    }
    ocVals.push(limit)
    const ocWhere = ocConds.length ? `WHERE ${ocConds.join(' AND ')}` : ''

    const ocsQuery = pool.query<any>(
      `SELECT
         o.id, o.numero, o.estado, o.fecha_emision, o.fecha_entrega_estimada,
         o.total, v.nombre AS proveedor_nombre,
         (SELECT STRING_AGG(DISTINCT NULLIF(TRIM(m.item), ''), ', ' ORDER BY NULLIF(TRIM(m.item), ''))
            FROM items_orden_compra ioc
            LEFT JOIN materiales_mto m ON m.id = ioc.material_id
           WHERE ioc.orden_compra_id = o.id) AS items_cubiertos
       FROM ordenes_compra o
       LEFT JOIN proveedores v ON v.id = o.proveedor_id
       ${ocWhere}
       ORDER BY o.fecha_emision DESC NULLS LAST
       LIMIT $${ocVals.length}`,
      ocVals
    )

    const [proyectoRes, materialesRes, ocsRes] = await Promise.all([
      proyectoQuery, materialesQuery, ocsQuery,
    ])

    // ── Enriquecer fotos con signed URLs de Supabase ─────────────
    const enrichFotos = async (filenames: string[] | null): Promise<string[]> => {
      if (!filenames || filenames.length === 0) return []
      if (!supabaseEnabled || !supabase) return []
      const sb = supabase
      const results = await Promise.all(
        filenames.slice(0, 3).map(async (fn) => {
          const { data, error } = await sb.storage
            .from(SUPABASE_BUCKET)
            .createSignedUrl(fn, SIGNED_URL_TTL)
          if (error) return null
          return data.signedUrl
        })
      )
      return results.filter((u): u is string => u !== null)
    }

    const materiales: MaterialResult[] = await Promise.all(
      materialesRes.rows.map(async (r) => ({
        id: r.id,
        codigo: r.codigo,
        descripcion: r.descripcion,
        vendor: r.vendor,
        qty: Number(r.qty),
        unit_price: Number(r.unit_price),
        item: r.item,
        estado_cotiz: r.estado_cotiz,
        oc_numero: r.oc_numero,
        oc_estado: r.oc_estado,
        recepcion_folio: r.recepcion_folio,
        recepcion_fecha: r.recepcion_fecha,
        fotos_urls: await enrichFotos(r.foto_filenames),
      }))
    )

    const ocs: OCResult[] = ocsRes.rows.map((r) => ({
      id: r.id,
      numero: r.numero,
      estado: r.estado,
      fecha_emision: r.fecha_emision,
      fecha_entrega_estimada: r.fecha_entrega_estimada,
      total: Number(r.total),
      proveedor_nombre: r.proveedor_nombre,
      items_cubiertos: r.items_cubiertos,
    }))

    res.json({
      data: {
        proyecto: proyectoRes.rows[0] ?? null,
        query: rawQ,
        materiales,
        ocs,
        counts: { materiales: materiales.length, ocs: ocs.length },
      },
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/mobile/proyectos
 *
 * Lista compacta de proyectos activos para el dropdown de la pantalla Buscar.
 * Sin paginación (esperamos <100 proyectos activos). Sin joins pesados.
 */
export async function mobileProyectos(_req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query(
      `SELECT id, codigo, nombre, cliente
         FROM proyectos
        WHERE estado = 'activo'
        ORDER BY codigo`
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
}
