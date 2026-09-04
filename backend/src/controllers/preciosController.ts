// ─────────────────────────────────────────────────────────────────────────────
// preciosController — buscador histórico de precios (2026-08-21)
// ─────────────────────────────────────────────────────────────────────────────
// Feature pedida por Chali tras meses de uso: "necesito buscar precios que
// pagué antes, por vendor, por categoría, por rango". Fuente de verdad =
// precio de OC (items_orden_compra.precio_unitario), lo efectivamente pagado.
//
// Excluye OCs canceladas — esos precios no son referencias válidas.
//
// 3 endpoints:
//   GET /api/precios/filtros                → { vendors[], categorias[] }
//   GET /api/precios/buscar                 → { data[], total, resumen }
//   GET /api/precios/evolucion?descripcion  → serie histórica de un ítem
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'

// ─── /filtros ────────────────────────────────────────────────────────────────
// Devuelve valores únicos que aparecen en OCs no canceladas — para poblar los
// dropdowns del buscador. No hardcodeamos: siempre reflejan lo real.
export async function getFiltrosPrecios(_req: Request, res: Response, next: NextFunction) {
  try {
    // vendors reales: proveedores usados en OCs no canceladas
    const vendorsQ = await pool.query(`
      SELECT DISTINCT p.nombre
        FROM ordenes_compra oc
        JOIN proveedores p ON p.id = oc.proveedor_id
       WHERE oc.estado <> 'cancelada'
       ORDER BY p.nombre
    `)

    // categorías reales: unión de materiales_mto.categoria y ordenes_compra.categoria
    const categoriasQ = await pool.query(`
      SELECT DISTINCT cat FROM (
        SELECT DISTINCT m.categoria AS cat
          FROM items_orden_compra ioc
          JOIN ordenes_compra oc ON oc.id = ioc.orden_compra_id
          LEFT JOIN materiales_mto m ON m.id = ioc.material_id
         WHERE oc.estado <> 'cancelada' AND m.categoria IS NOT NULL AND m.categoria <> ''
        UNION
        SELECT DISTINCT oc.categoria AS cat
          FROM ordenes_compra oc
         WHERE oc.estado <> 'cancelada' AND oc.categoria IS NOT NULL AND oc.categoria <> ''
      ) t
       ORDER BY cat
    `)

    res.json({
      vendors: vendorsQ.rows.map((r) => r.nombre),
      categorias: categoriasQ.rows.map((r) => r.cat),
    })
  } catch (err) {
    next(err)
  }
}

// ─── /buscar ─────────────────────────────────────────────────────────────────
// Filtros combinables. Todos opcionales; sin ninguno devuelve los N más
// recientes. Paginado con page/limit — cap defensivo en 200.
export async function buscarPrecios(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      search,
      vendor,
      categoria,
      precio_min,
      precio_max,
      fecha_desde,
      fecha_hasta,
      orderBy = 'fecha_desc',
    } = req.query as Record<string, string | undefined>

    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || '50', 10)))
    const offset = (page - 1) * limit

    // WHERE dinámico
    const conds: string[] = [`oc.estado <> 'cancelada'`]
    const vals: any[] = []

    if (search && search.trim()) {
      vals.push(`%${search.trim()}%`)
      conds.push(`ioc.descripcion ILIKE $${vals.length}`)
    }
    if (vendor && vendor.trim()) {
      vals.push(vendor.trim())
      conds.push(`p.nombre = $${vals.length}`)
    }
    if (categoria && categoria.trim()) {
      vals.push(categoria.trim())
      // categoría puede venir del material MTO o del OC directo
      conds.push(`(m.categoria = $${vals.length} OR oc.categoria = $${vals.length})`)
    }
    if (precio_min !== undefined && precio_min !== '') {
      const n = Number(precio_min)
      if (!isNaN(n)) {
        vals.push(n)
        conds.push(`ioc.precio_unitario >= $${vals.length}`)
      }
    }
    if (precio_max !== undefined && precio_max !== '') {
      const n = Number(precio_max)
      if (!isNaN(n)) {
        vals.push(n)
        conds.push(`ioc.precio_unitario <= $${vals.length}`)
      }
    }
    if (fecha_desde) {
      vals.push(fecha_desde)
      conds.push(`oc.fecha_emision >= $${vals.length}`)
    }
    if (fecha_hasta) {
      vals.push(fecha_hasta)
      conds.push(`oc.fecha_emision <= $${vals.length}`)
    }

    // orderBy — whitelist estricta para evitar SQL injection
    const orderMap: Record<string, string> = {
      fecha_desc: 'oc.fecha_emision DESC NULLS LAST, oc.id DESC',
      fecha_asc:  'oc.fecha_emision ASC NULLS LAST, oc.id ASC',
      precio_desc: 'ioc.precio_unitario DESC',
      precio_asc:  'ioc.precio_unitario ASC',
      vendor_asc:  'p.nombre ASC, oc.fecha_emision DESC',
      descripcion_asc: 'ioc.descripcion ASC',
    }
    const orderSql = orderMap[orderBy] || orderMap.fecha_desc

    const whereSql = conds.join(' AND ')

    // Query principal — LEFT JOIN a materiales_mto porque item.material_id
    // puede ser NULL en compras SIN-MTO / URGENTE / OPERATIVA
    const dataQ = pool.query(`
      SELECT
        ioc.id                AS item_id,
        ioc.descripcion       AS descripcion,
        ioc.unidad            AS unidad,
        ioc.cantidad          AS cantidad,
        ioc.precio_unitario   AS precio_unitario,
        ioc.subtotal          AS subtotal,
        oc.id                 AS oc_id,
        oc.numero             AS oc_numero,
        oc.fecha_emision      AS fecha_emision,
        oc.estado             AS oc_estado,
        p.id                  AS proveedor_id,
        p.nombre              AS vendor,
        pr.id                 AS proyecto_id,
        pr.codigo             AS proyecto_codigo,
        pr.nombre             AS proyecto_nombre,
        COALESCE(m.categoria, oc.categoria) AS categoria,
        m.codigo              AS material_codigo
      FROM items_orden_compra ioc
      JOIN ordenes_compra oc  ON oc.id = ioc.orden_compra_id
      JOIN proveedores p       ON p.id = oc.proveedor_id
      LEFT JOIN proyectos pr   ON pr.id = oc.proyecto_id
      LEFT JOIN materiales_mto m ON m.id = ioc.material_id
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}
    `, [...vals, limit, offset])

    // Count + resumen en la misma pasada
    const summaryQ = pool.query(`
      SELECT
        COUNT(*)::int                              AS total,
        AVG(ioc.precio_unitario)::numeric(12,4)    AS precio_promedio,
        MIN(ioc.precio_unitario)::numeric(12,4)    AS precio_min,
        MAX(ioc.precio_unitario)::numeric(12,4)    AS precio_max,
        SUM(ioc.subtotal)::numeric(14,2)           AS subtotal_total
      FROM items_orden_compra ioc
      JOIN ordenes_compra oc  ON oc.id = ioc.orden_compra_id
      JOIN proveedores p       ON p.id = oc.proveedor_id
      LEFT JOIN materiales_mto m ON m.id = ioc.material_id
      WHERE ${whereSql}
    `, vals)

    const [dataR, summaryR] = await Promise.all([dataQ, summaryQ])

    res.json({
      data: dataR.rows,
      total: summaryR.rows[0]?.total ?? 0,
      resumen: {
        total: summaryR.rows[0]?.total ?? 0,
        precio_promedio: summaryR.rows[0]?.precio_promedio !== null ? Number(summaryR.rows[0].precio_promedio) : null,
        precio_min: summaryR.rows[0]?.precio_min !== null ? Number(summaryR.rows[0].precio_min) : null,
        precio_max: summaryR.rows[0]?.precio_max !== null ? Number(summaryR.rows[0].precio_max) : null,
        subtotal_total: summaryR.rows[0]?.subtotal_total !== null ? Number(summaryR.rows[0].subtotal_total) : null,
      },
      page,
      limit,
    })
  } catch (err) {
    next(err)
  }
}

// ─── /rankings ───────────────────────────────────────────────────────────────
// Materiales agregados — cuántas veces se compró cada uno, cuánto se gastó,
// precio promedio. Agrupamos por LOWER(TRIM(descripcion)) para que
// variaciones de whitespace/case cuenten como el mismo material.
//
// Ordenamiento: 'veces' (default), 'gasto', 'precio_prom'. Filtros mismos
// que /buscar (categoria, vendor, fecha_desde, fecha_hasta).
//
// Devuelve por fila: descripcion display (la más frecuente), veces_comprado,
// total_gastado, precio_promedio/min/max, primera/ultima_compra,
// vendors[] distintos, cantidad_total, categoria (moda).
export async function getRankingsMateriales(req: Request, res: Response, next: NextFunction) {
  try {
    const { vendor, categoria, fecha_desde, fecha_hasta, orden = 'veces' } = req.query as Record<string, string | undefined>
    const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || '50', 10)))

    const conds: string[] = [`oc.estado <> 'cancelada'`, `ioc.descripcion IS NOT NULL`, `TRIM(ioc.descripcion) <> ''`]
    const vals: any[] = []

    if (vendor && vendor.trim()) {
      vals.push(vendor.trim())
      conds.push(`p.nombre = $${vals.length}`)
    }
    if (categoria && categoria.trim()) {
      vals.push(categoria.trim())
      conds.push(`(m.categoria = $${vals.length} OR oc.categoria = $${vals.length})`)
    }
    if (fecha_desde) {
      vals.push(fecha_desde)
      conds.push(`oc.fecha_emision >= $${vals.length}`)
    }
    if (fecha_hasta) {
      vals.push(fecha_hasta)
      conds.push(`oc.fecha_emision <= $${vals.length}`)
    }

    const orderMap: Record<string, string> = {
      veces: 'veces_comprado DESC, total_gastado DESC',
      gasto: 'total_gastado DESC, veces_comprado DESC',
      precio_prom: 'precio_promedio DESC, veces_comprado DESC',
    }
    const orderSql = orderMap[orden] || orderMap.veces

    // Agregación en 2 pasos con CTE:
    // 1) items → cada fila con su descripcion normalizada
    // 2) group by clave normalizada
    // Para el display de descripcion tomamos MODE() — la variante más
    // frecuente (más natural que MIN/MAX alfabético).
    const q = await pool.query(`
      WITH items_norm AS (
        SELECT
          LOWER(TRIM(ioc.descripcion))                   AS key,
          ioc.descripcion                                AS descripcion,
          ioc.precio_unitario                            AS precio,
          ioc.cantidad                                   AS cantidad,
          ioc.subtotal                                   AS subtotal,
          ioc.unidad                                     AS unidad,
          oc.fecha_emision                               AS fecha,
          p.nombre                                       AS vendor,
          COALESCE(m.categoria, oc.categoria)            AS categoria,
          m.codigo                                       AS material_codigo
        FROM items_orden_compra ioc
        JOIN ordenes_compra oc  ON oc.id = ioc.orden_compra_id
        JOIN proveedores p       ON p.id = oc.proveedor_id
        LEFT JOIN materiales_mto m ON m.id = ioc.material_id
        WHERE ${conds.join(' AND ')}
      )
      SELECT
        MODE() WITHIN GROUP (ORDER BY descripcion)          AS descripcion,
        COUNT(*)::int                                       AS veces_comprado,
        SUM(subtotal)::numeric(14,2)                        AS total_gastado,
        AVG(precio)::numeric(12,4)                          AS precio_promedio,
        MIN(precio)::numeric(12,4)                          AS precio_min,
        MAX(precio)::numeric(12,4)                          AS precio_max,
        MIN(fecha)                                          AS primera_compra,
        MAX(fecha)                                          AS ultima_compra,
        SUM(cantidad)::numeric(14,2)                        AS cantidad_total,
        MODE() WITHIN GROUP (ORDER BY unidad)               AS unidad,
        MODE() WITHIN GROUP (ORDER BY categoria)            AS categoria,
        MODE() WITHIN GROUP (ORDER BY material_codigo)      AS material_codigo,
        COUNT(DISTINCT vendor)::int                         AS vendors_count,
        ARRAY_AGG(DISTINCT vendor ORDER BY vendor)          AS vendors
      FROM items_norm
      GROUP BY key
      ORDER BY ${orderSql}
      LIMIT $${vals.length + 1}
    `, [...vals, limit])

    const rankings = q.rows.map((r) => ({
      descripcion: r.descripcion,
      veces_comprado: r.veces_comprado,
      total_gastado: r.total_gastado !== null ? Number(r.total_gastado) : 0,
      precio_promedio: r.precio_promedio !== null ? Number(r.precio_promedio) : 0,
      precio_min: r.precio_min !== null ? Number(r.precio_min) : 0,
      precio_max: r.precio_max !== null ? Number(r.precio_max) : 0,
      primera_compra: r.primera_compra,
      ultima_compra: r.ultima_compra,
      cantidad_total: r.cantidad_total !== null ? Number(r.cantidad_total) : 0,
      unidad: r.unidad,
      categoria: r.categoria,
      material_codigo: r.material_codigo,
      vendors_count: r.vendors_count,
      vendors: r.vendors || [],
    }))

    res.json({ rankings, total: rankings.length, orden, limit })
  } catch (err) {
    next(err)
  }
}

// ─── /evolucion ──────────────────────────────────────────────────────────────
// Serie histórica de precios de un ítem específico. Se puede filtrar por
// descripcion (ILIKE — fuzzy) y opcionalmente por vendor. Devuelve TODOS los
// puntos (sin agregación por mes) — el frontend puede agrupar si quiere.
// Escapado a 200 puntos para evitar payloads gigantes.
export async function getEvolucionPrecio(req: Request, res: Response, next: NextFunction) {
  try {
    const { descripcion, vendor } = req.query as Record<string, string | undefined>

    if (!descripcion || !descripcion.trim()) {
      return res.status(400).json({ error: 'descripcion requerida' })
    }

    const conds: string[] = [`oc.estado <> 'cancelada'`, `oc.fecha_emision IS NOT NULL`]
    const vals: any[] = []

    vals.push(`%${descripcion.trim()}%`)
    conds.push(`ioc.descripcion ILIKE $${vals.length}`)

    if (vendor && vendor.trim()) {
      vals.push(vendor.trim())
      conds.push(`p.nombre = $${vals.length}`)
    }

    const q = await pool.query(`
      SELECT
        oc.fecha_emision                      AS fecha,
        ioc.precio_unitario::numeric(12,4)    AS precio,
        ioc.cantidad::numeric(12,2)           AS cantidad,
        ioc.unidad                            AS unidad,
        p.nombre                              AS vendor,
        oc.numero                             AS oc_numero,
        oc.id                                 AS oc_id,
        pr.codigo                             AS proyecto_codigo,
        pr.id                                 AS proyecto_id,
        ioc.descripcion                       AS descripcion
      FROM items_orden_compra ioc
      JOIN ordenes_compra oc  ON oc.id = ioc.orden_compra_id
      JOIN proveedores p       ON p.id = oc.proveedor_id
      LEFT JOIN proyectos pr   ON pr.id = oc.proyecto_id
      WHERE ${conds.join(' AND ')}
      ORDER BY oc.fecha_emision ASC, oc.id ASC
      LIMIT 200
    `, vals)

    const puntos = q.rows.map((r) => ({
      fecha: r.fecha,
      precio: Number(r.precio),
      cantidad: r.cantidad !== null ? Number(r.cantidad) : null,
      unidad: r.unidad,
      vendor: r.vendor,
      oc_numero: r.oc_numero,
      oc_id: r.oc_id,
      proyecto_codigo: r.proyecto_codigo,
      proyecto_id: r.proyecto_id,
      descripcion: r.descripcion,
    }))

    // Vendors únicos que aparecen — para leyenda / colorizar por vendor
    const vendors = Array.from(new Set(puntos.map((p) => p.vendor))).sort()

    res.json({ puntos, vendors, total: puntos.length })
  } catch (err) {
    next(err)
  }
}
