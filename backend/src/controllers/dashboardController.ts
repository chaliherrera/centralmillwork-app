import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'

// ─── Filter helpers ───────────────────────────────────────────────────────────

function buildMatFilters(q: Record<string, string>) {
  const conds: string[] = []
  const vals: any[] = []
  let i = 1
  if (q.fecha_desde)     { conds.push(`m.fecha_importacion >= $${i++}`); vals.push(q.fecha_desde) }
  if (q.fecha_hasta)     { conds.push(`m.fecha_importacion <= $${i++}`); vals.push(q.fecha_hasta) }
  if (q.proyecto_estado) { conds.push(`p.estado = $${i++}`);             vals.push(q.proyecto_estado) }
  if (q.vendor)          { conds.push(`m.vendor ILIKE $${i++}`);         vals.push(q.vendor) }
  if (q.categoria)       { conds.push(`m.categoria = $${i++}`);          vals.push(q.categoria) }
  const extra = conds.length ? ' AND ' + conds.join(' AND ') : ''
  return { extra, vals }
}

// ─── Full stats — single call dashboard ──────────────────────────────────────

export async function getStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const [
      kpiRow,
      donaProyectos,
      barrasEconomico,
      topProyectos,
      proyectosRecientes,
      topVendors,
      topCategorias,
      ocsPorMes,
      recepcionesPorMes,
    ] = await Promise.all([

      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM proyectos WHERE estado = 'activo')                                                    AS proyectos_activos,
          (SELECT COALESCE(SUM(total),0) FROM ordenes_compra WHERE estado != 'cancelada')                            AS monto_total_ocs,
          (SELECT COALESCE(SUM(total),0) FROM ordenes_compra WHERE estado = 'recibida')                              AS monto_recibido,
          (SELECT COUNT(*) FROM ordenes_compra WHERE estado = 'recibida')                                            AS ocs_completadas,
          (SELECT COUNT(*) FROM ordenes_compra WHERE estado IN ('enviada','confirmada','parcial'))                    AS ocs_en_proceso,
          (SELECT COUNT(*) FROM ordenes_compra
            WHERE estado IN ('enviada','confirmada','parcial')
              AND fecha_entrega_estimada IS NOT NULL
              AND fecha_entrega_estimada < CURRENT_DATE)                                                              AS ocs_retrasadas,
          (SELECT COUNT(*) FROM ordenes_compra WHERE estado != 'cancelada')                                          AS total_ocs
      `),

      pool.query(`
        SELECT estado, COUNT(*) AS total
        FROM proyectos
        GROUP BY estado ORDER BY estado
      `),

      pool.query(`
        SELECT
          p.estado AS estado_proyecto,
          COALESCE(SUM(CASE WHEN oc.estado IN ('enviada','confirmada','parcial') THEN oc.total ELSE 0 END),0) AS ordenado,
          COALESCE(SUM(CASE WHEN oc.estado = 'recibida' THEN oc.total ELSE 0 END),0)                         AS recibido
        FROM proyectos p
        LEFT JOIN ordenes_compra oc ON oc.proyecto_id = p.id AND oc.estado != 'cancelada'
        GROUP BY p.estado ORDER BY p.estado
      `),

      pool.query(`
        SELECT p.id, p.codigo, p.nombre, p.estado,
               COALESCE(SUM(oc.total),0) AS monto_total
        FROM proyectos p
        LEFT JOIN ordenes_compra oc ON oc.proyecto_id = p.id AND oc.estado != 'cancelada'
        GROUP BY p.id, p.codigo, p.nombre, p.estado
        ORDER BY monto_total DESC
        LIMIT 5
      `),

      pool.query(`
        SELECT
          p.id, p.codigo, p.nombre, p.estado, p.updated_at,
          COUNT(oc.id)                                                                                              AS cant_ocs,
          COALESCE(SUM(CASE WHEN oc.estado IN ('enviada','confirmada','parcial') THEN oc.total ELSE 0 END),0)      AS monto_ordenado,
          COALESCE(SUM(CASE WHEN oc.estado = 'recibida' THEN oc.total ELSE 0 END),0)                              AS monto_recibido,
          COALESCE(SUM(CASE WHEN oc.estado != 'cancelada' THEN oc.total ELSE 0 END),0)                            AS monto_total
        FROM proyectos p
        LEFT JOIN ordenes_compra oc ON oc.proyecto_id = p.id
        GROUP BY p.id, p.codigo, p.nombre, p.estado, p.updated_at
        ORDER BY p.updated_at DESC NULLS LAST
        LIMIT 5
      `),

      pool.query(`
        SELECT pv.nombre AS proveedor, COUNT(oc.id) AS cant_ocs, COALESCE(SUM(oc.total),0) AS monto
        FROM ordenes_compra oc
        JOIN proveedores pv ON pv.id = oc.proveedor_id
        WHERE oc.estado != 'cancelada'
        GROUP BY pv.nombre
        ORDER BY monto DESC
        LIMIT 5
      `),

      pool.query(`
        SELECT m.categoria, COUNT(m.id) AS cant_items, COALESCE(SUM(m.total_price),0) AS monto
        FROM materiales_mto m
        WHERE m.categoria IS NOT NULL AND m.categoria != ''
        GROUP BY m.categoria
        ORDER BY monto DESC
        LIMIT 5
      `),

      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', fecha_emision), 'Mon YY') AS mes,
               DATE_TRUNC('month', fecha_emision)                    AS mes_date,
               COUNT(*)                                              AS total
        FROM ordenes_compra
        WHERE fecha_emision >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', fecha_emision)
        ORDER BY DATE_TRUNC('month', fecha_emision)
      `),

      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', fecha_recepcion), 'Mon YY') AS mes,
               DATE_TRUNC('month', fecha_recepcion)                    AS mes_date,
               COUNT(*)                                                AS total
        FROM recepciones
        WHERE fecha_recepcion >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', fecha_recepcion)
        ORDER BY DATE_TRUNC('month', fecha_recepcion)
      `),
    ])

    const kpi       = kpiRow.rows[0]
    const totalOcs  = parseInt(kpi.total_ocs)
    const completadas = parseInt(kpi.ocs_completadas)

    res.json({
      data: {
        kpis: {
          proyectos_activos: parseInt(kpi.proyectos_activos),
          monto_total_ocs:   parseFloat(kpi.monto_total_ocs),
          monto_recibido:    parseFloat(kpi.monto_recibido),
          ocs_completadas:   completadas,
          ocs_en_proceso:    parseInt(kpi.ocs_en_proceso),
          ocs_retrasadas:    parseInt(kpi.ocs_retrasadas),
          cumplimiento_pct:  totalOcs > 0 ? Math.round(completadas / totalOcs * 100) : 0,
        },
        dona_proyectos: donaProyectos.rows.map(r => ({
          estado: r.estado,
          total:  parseInt(r.total),
        })),
        barras_economico: barrasEconomico.rows.map(r => ({
          estado:   r.estado_proyecto,
          ordenado: parseFloat(r.ordenado),
          recibido: parseFloat(r.recibido),
        })),
        top_proyectos: topProyectos.rows.map(r => ({
          id:          r.id,
          codigo:      r.codigo,
          nombre:      r.nombre,
          estado:      r.estado,
          monto_total: parseFloat(r.monto_total),
        })),
        proyectos_recientes: proyectosRecientes.rows.map(r => ({
          id:             r.id,
          codigo:         r.codigo,
          nombre:         r.nombre,
          estado:         r.estado,
          cant_ocs:       parseInt(r.cant_ocs),
          monto_ordenado: parseFloat(r.monto_ordenado),
          monto_recibido: parseFloat(r.monto_recibido),
          pendiente:      parseFloat(r.monto_total) - parseFloat(r.monto_recibido),
          updated_at:     r.updated_at,
        })),
        top_vendors: topVendors.rows.map(r => ({
          proveedor: r.proveedor,
          cant_ocs:  parseInt(r.cant_ocs),
          monto:     parseFloat(r.monto),
        })),
        top_categorias: topCategorias.rows.map(r => ({
          categoria: r.categoria,
          cant_ocs:  parseInt(r.cant_items),
          monto:     parseFloat(r.monto),
        })),
        ocs_por_mes: ocsPorMes.rows.map(r => ({
          mes:   r.mes,
          total: parseInt(r.total),
        })),
        recepciones_por_mes: recepcionesPorMes.rows.map(r => ({
          mes:   r.mes,
          total: parseInt(r.total),
        })),
      },
    })
  } catch (err) { next(err) }
}

export async function getGastoPorMes(_req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', fecha_emision), 'Mon YY') AS mes,
             SUM(total) AS total
      FROM ordenes_compra
      WHERE fecha_emision >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', fecha_emision)
      ORDER BY DATE_TRUNC('month', fecha_emision)
    `)
    res.json({ data: rows.map((r) => ({ mes: r.mes, total: parseFloat(r.total) })) })
  } catch (err) { next(err) }
}

// ─── New dashboard endpoints ──────────────────────────────────────────────────

export async function getDashboardKpis(req: Request, res: Response, next: NextFunction) {
  try {
    const { extra, vals } = buildMatFilters(req.query as Record<string, string>)
    const base = `FROM materiales_mto m LEFT JOIN proyectos p ON m.proyecto_id = p.id WHERE 1=1${extra}`

    const [total, valor, pendientes, cotizados, enStock, proyActivos, ocMes, ocActivas] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS n ${base}`, vals),
      pool.query(`SELECT COALESCE(SUM(m.total_price), 0) AS n ${base}`, vals),
      pool.query(`SELECT COUNT(*) AS n ${base} AND m.cotizar = 'SI' AND m.estado_cotiz = 'PENDIENTE'`, vals),
      pool.query(`SELECT COUNT(*) AS n ${base} AND m.estado_cotiz = 'COTIZADO'`, vals),
      pool.query(`SELECT COUNT(*) AS n ${base} AND m.cotizar = 'EN_STOCK'`, vals),
      pool.query(`SELECT COUNT(*) AS n FROM proyectos WHERE estado = 'activo'`),
      pool.query(`SELECT COALESCE(SUM(total), 0) AS n FROM ordenes_compra WHERE DATE_TRUNC('month', fecha_emision) = DATE_TRUNC('month', CURRENT_DATE)`),
      pool.query(`SELECT COUNT(*) AS n FROM ordenes_compra WHERE estado IN ('enviada','confirmada','parcial')`),
    ])

    res.json({
      data: {
        total_materiales:  parseInt(total.rows[0].n),
        valor_total:       parseFloat(valor.rows[0].n),
        pendientes:        parseInt(pendientes.rows[0].n),
        cotizados:         parseInt(cotizados.rows[0].n),
        en_stock:          parseInt(enStock.rows[0].n),
        proyectos_activos: parseInt(proyActivos.rows[0].n),
        oc_mes_actual:     parseFloat(ocMes.rows[0].n),
        oc_activas:        parseInt(ocActivas.rows[0].n),
      },
    })
  } catch (err) { next(err) }
}

export async function getDashboardCharts(req: Request, res: Response, next: NextFunction) {
  try {
    const { extra, vals } = buildMatFilters(req.query as Record<string, string>)
    const base = `FROM materiales_mto m LEFT JOIN proyectos p ON m.proyecto_id = p.id WHERE 1=1${extra}`

    const [estados, gastoPorMes, topVendors, topCategorias, matPorMes] = await Promise.all([
      pool.query(`
        SELECT m.estado_cotiz AS estado, COUNT(*) AS total, COALESCE(SUM(m.total_price), 0) AS valor
        ${base}
        GROUP BY m.estado_cotiz ORDER BY m.estado_cotiz
      `, vals),

      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', fecha_emision), 'Mon YY') AS mes,
               DATE_TRUNC('month', fecha_emision) AS mes_date,
               COALESCE(SUM(total), 0) AS total
        FROM ordenes_compra
        WHERE fecha_emision >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', fecha_emision)
        ORDER BY DATE_TRUNC('month', fecha_emision)
      `),

      pool.query(`
        SELECT m.vendor, COUNT(*) AS total_items, COALESCE(SUM(m.total_price), 0) AS valor
        ${base} AND m.vendor IS NOT NULL AND m.vendor != ''
        GROUP BY m.vendor ORDER BY valor DESC LIMIT 10
      `, vals),

      pool.query(`
        SELECT m.categoria, COUNT(*) AS total, COALESCE(SUM(m.total_price), 0) AS valor
        ${base} AND m.categoria IS NOT NULL AND m.categoria != ''
        GROUP BY m.categoria ORDER BY total DESC LIMIT 8
      `, vals),

      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', m.fecha_importacion), 'Mon YY') AS mes,
               DATE_TRUNC('month', m.fecha_importacion) AS mes_date,
               COUNT(*) AS total
        ${base} AND m.fecha_importacion IS NOT NULL
          AND m.fecha_importacion >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', m.fecha_importacion)
        ORDER BY DATE_TRUNC('month', m.fecha_importacion)
      `, vals),
    ])

    res.json({
      data: {
        por_estado:      estados.rows.map(r => ({ estado: r.estado, total: parseInt(r.total), valor: parseFloat(r.valor) })),
        gasto_por_mes:   gastoPorMes.rows.map(r => ({ mes: r.mes, total: parseFloat(r.total) })),
        top_vendors:     topVendors.rows.map(r => ({ vendor: r.vendor, total_items: parseInt(r.total_items), valor: parseFloat(r.valor) })),
        top_categorias:  topCategorias.rows.map(r => ({ categoria: r.categoria, total: parseInt(r.total), valor: parseFloat(r.valor) })),
        mat_por_mes:     matPorMes.rows.map(r => ({ mes: r.mes, total: parseInt(r.total) })),
      },
    })
  } catch (err) { next(err) }
}

export async function getDashboardResumenEstados(req: Request, res: Response, next: NextFunction) {
  try {
    const { extra, vals } = buildMatFilters(req.query as Record<string, string>)

    const { rows } = await pool.query(`
      SELECT
        m.estado_cotiz AS estado,
        m.cotizar,
        COUNT(*) AS total,
        COALESCE(SUM(m.total_price), 0) AS valor,
        COALESCE(SUM(m.qty), 0) AS qty_total
      FROM materiales_mto m
      LEFT JOIN proyectos p ON m.proyecto_id = p.id
      WHERE 1=1${extra}
      GROUP BY m.estado_cotiz, m.cotizar
      ORDER BY m.estado_cotiz, m.cotizar
    `, vals)

    const grandTotal = rows.reduce((acc, r) => acc + parseInt(r.total), 0)

    res.json({
      data: rows.map(r => ({
        estado:    r.estado,
        cotizar:   r.cotizar,
        total:     parseInt(r.total),
        valor:     parseFloat(r.valor),
        qty_total: parseFloat(r.qty_total),
        pct:       grandTotal > 0 ? Math.round(parseInt(r.total) / grandTotal * 100) : 0,
      })),
    })
  } catch (err) { next(err) }
}

export async function getDashboardProyectosRecientes(req: Request, res: Response, next: NextFunction) {
  try {
    const page   = Math.max(1, parseInt(req.query.page  as string) || 1)
    const limit  = Math.min(20, parseInt(req.query.limit as string) || 8)
    const offset = (page - 1) * limit

    const [rows, countResult] = await Promise.all([
      pool.query(`
        SELECT
          p.id, p.codigo, p.nombre, p.estado, p.fecha_inicio,
          COUNT(m.id)                                                              AS total_materiales,
          COALESCE(SUM(m.total_price), 0)                                         AS valor_total,
          COUNT(m.id) FILTER (WHERE m.cotizar = 'SI' AND m.estado_cotiz = 'PENDIENTE') AS pendientes,
          COUNT(m.id) FILTER (WHERE m.estado_cotiz = 'COTIZADO')                  AS cotizados,
          COUNT(m.id) FILTER (WHERE m.cotizar = 'EN_STOCK')                       AS en_stock
        FROM proyectos p
        LEFT JOIN materiales_mto m ON m.proyecto_id = p.id
        GROUP BY p.id, p.codigo, p.nombre, p.estado, p.fecha_inicio
        ORDER BY p.id DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]),
      pool.query(`SELECT COUNT(*) AS n FROM proyectos`),
    ])

    res.json({
      data: rows.rows.map(r => ({
        id:               r.id,
        codigo:           r.codigo,
        nombre:           r.nombre,
        estado:           r.estado,
        fecha_inicio:     r.fecha_inicio,
        total_materiales: parseInt(r.total_materiales),
        valor_total:      parseFloat(r.valor_total),
        pendientes:       parseInt(r.pendientes),
        cotizados:        parseInt(r.cotizados),
        en_stock:         parseInt(r.en_stock),
      })),
      total: parseInt(countResult.rows[0].n),
      page,
      limit,
    })
  } catch (err) { next(err) }
}
