import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import pool from '../db/pool'
import { parsePagination, paginatedResponse } from '../utils/pagination'
import { createError } from '../middleware/errorHandler'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../utils/supabase'

// ─── Schemas de validación ──────────────────────────────────────────────────
const ESTADOS_PROYECTO = ['cotizacion', 'activo', 'en_pausa', 'completado', 'cancelado'] as const

export const createProyectoSchema = z.object({
  codigo:               z.string().trim().min(1, 'requerido').max(30),
  nombre:               z.string().trim().min(1, 'requerido').max(300),
  cliente:              z.string().trim().min(1, 'requerido').max(200),
  descripcion:          z.string().max(2000).nullable().optional(),
  estado:               z.enum(ESTADOS_PROYECTO).optional(),
  fecha_inicio:         z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'formato YYYY-MM-DD').nullable().optional(),
  fecha_fin_estimada:   z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'formato YYYY-MM-DD').nullable().optional(),
  presupuesto:          z.coerce.number().min(0, 'debe ser ≥ 0').optional(),
  responsable:          z.string().max(150).nullable().optional(),
})

export const updateProyectoSchema = z.object({
  codigo:               z.string().trim().min(1).max(30).optional(),
  nombre:               z.string().trim().min(1).max(300).optional(),
  cliente:              z.string().trim().min(1).max(200).optional(),
  descripcion:          z.string().max(2000).nullable().optional(),
  estado:               z.enum(ESTADOS_PROYECTO).optional(),
  fecha_inicio:         z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional(),
  fecha_fin_estimada:   z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional(),
  fecha_fin_real:       z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional(),
  presupuesto:          z.coerce.number().min(0).optional(),
  responsable:          z.string().max(150).nullable().optional(),
})

export async function getProyectos(req: Request, res: Response, next: NextFunction) {
  try {
    const opts = parsePagination(req, 'created_at')
    const whereMain  = opts.search
      ? `WHERE p.nombre ILIKE $3 OR p.codigo ILIKE $3 OR p.cliente ILIKE $3`
      : ''
    const whereCount = opts.search
      ? `WHERE nombre ILIKE $1 OR codigo ILIKE $1 OR cliente ILIKE $1`
      : ''

    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT p.*,
           COALESCE(SUM(oc.total), 0) AS total_ocs
         FROM proyectos p
         LEFT JOIN ordenes_compra oc ON oc.proyecto_id = p.id
         ${whereMain}
         GROUP BY p.id
         ORDER BY ${opts.sort} ${opts.order}
         LIMIT $1 OFFSET $2`,
        opts.search ? [opts.limit, opts.offset, `%${opts.search}%`] : [opts.limit, opts.offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM proyectos ${whereCount}`,
        opts.search ? [`%${opts.search}%`] : []
      ),
    ])

    res.json(paginatedResponse(rows.rows, parseInt(countRow.rows[0].count), opts))
  } catch (err) { next(err) }
}

export async function getProyecto(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query('SELECT * FROM proyectos WHERE id = $1', [req.params.id])
    if (!rows[0]) return next(createError('Proyecto no encontrado', 404))
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
}

export async function createProyecto(req: Request, res: Response, next: NextFunction) {
  try {
    const { codigo, nombre, cliente, descripcion, estado, fecha_inicio,
            fecha_fin_estimada, presupuesto, responsable } = req.body
    const { rows } = await pool.query(
      `INSERT INTO proyectos (codigo, nombre, cliente, descripcion, estado,
        fecha_inicio, fecha_fin_estimada, presupuesto, responsable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [codigo, nombre, cliente, descripcion || null, estado || 'activo',
       fecha_inicio || null, fecha_fin_estimada || null, presupuesto ?? 0, responsable || null]
    )
    res.status(201).json({ data: rows[0], message: 'Proyecto creado exitosamente' })
  } catch (err) { next(err) }
}

export async function updateProyecto(req: Request, res: Response, next: NextFunction) {
  try {
    const fields = ['codigo','nombre','cliente','descripcion','estado',
                    'fecha_inicio','fecha_fin_estimada','fecha_fin_real','presupuesto','responsable']
    const updates = fields
      .filter((f) => req.body[f] !== undefined)
      .map((f, i) => `${f} = $${i + 2}`)
    if (!updates.length) return next(createError('Sin campos para actualizar', 400))

    const values = fields.filter((f) => req.body[f] !== undefined).map((f) => req.body[f])
    const { rows } = await pool.query(
      `UPDATE proyectos SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    )
    if (!rows[0]) return next(createError('Proyecto no encontrado', 404))
    res.json({ data: rows[0], message: 'Proyecto actualizado' })
  } catch (err) { next(err) }
}

export async function deleteProyecto(req: Request, res: Response, next: NextFunction) {
  try {
    const { rowCount } = await pool.query('DELETE FROM proyectos WHERE id = $1', [req.params.id])
    if (!rowCount) return next(createError('Proyecto no encontrado', 404))
    res.json({ message: 'Proyecto eliminado' })
  } catch (err) { next(err) }
}

// ─── Resumen del proyecto: info + KPIs agregados para la vista de detalle ────
//
// Devuelve en una sola llamada:
//   - proyecto: datos básicos (codigo, nombre, cliente, estado, fechas, presupuesto)
//   - kpis.materiales: distribución por estado_cotiz + total + monto
//   - kpis.origen: cantidades por MTO / DIRECTA / URGENTE
//   - kpis.ocs: cantidades por estado + montos
//   - kpis.recepciones: cantidades + con diferencias
//   - kpis.vendors: top 5 por gasto
//   - kpis.gasto_mensual: serie mensual acumulada de gastos (para chart)
export async function getProyectoResumen(req: Request, res: Response, next: NextFunction) {
  try {
    const proyecto_id = parseInt(String(req.params.id))
    if (!proyecto_id) return next(createError('id inválido', 400))

    const { rows: [proyecto] } = await pool.query(
      `SELECT * FROM proyectos WHERE id = $1`, [proyecto_id]
    )
    if (!proyecto) return next(createError('Proyecto no encontrado', 404))

    // ── KPIs de materiales (distribución por estado + origen + totales) ────
    const { rows: [materialesKpi] } = await pool.query(
      `SELECT
         COUNT(*)::int                                             AS total,
         COUNT(*) FILTER (WHERE estado_cotiz = 'PENDIENTE')::int   AS pendientes,
         COUNT(*) FILTER (WHERE estado_cotiz = 'COTIZADO')::int    AS cotizados,
         COUNT(*) FILTER (WHERE estado_cotiz = 'ORDENADO')::int    AS ordenados,
         COUNT(*) FILTER (WHERE estado_cotiz = 'RECIBIDO')::int    AS recibidos,
         COUNT(*) FILTER (WHERE estado_cotiz = 'EN_STOCK')::int    AS en_stock,
         COUNT(*) FILTER (WHERE origen = 'MTO')::int               AS origen_mto,
         COUNT(*) FILTER (WHERE origen = 'DIRECTA')::int           AS origen_directa,
         COUNT(*) FILTER (WHERE origen = 'URGENTE')::int           AS origen_urgente,
         COALESCE(SUM(total_price), 0)::numeric                    AS monto_total,
         COALESCE(SUM(total_price) FILTER (WHERE estado_cotiz IN ('ORDENADO','RECIBIDO')), 0)::numeric AS monto_comprado,
         COALESCE(SUM(total_price) FILTER (WHERE estado_cotiz = 'RECIBIDO'), 0)::numeric AS monto_recibido
       FROM materiales_mto
       WHERE proyecto_id = $1`,
      [proyecto_id]
    )

    // ── KPIs de OCs ────────────────────────────────────────────────────────
    const { rows: [ocsKpi] } = await pool.query(
      `SELECT
         COUNT(*)::int                                              AS total,
         COUNT(*) FILTER (WHERE estado = 'recibida')::int           AS recibidas,
         COUNT(*) FILTER (WHERE estado NOT IN ('cancelada','recibida'))::int AS activas,
         COUNT(*) FILTER (WHERE estado = 'cancelada')::int          AS canceladas,
         COUNT(*) FILTER (WHERE origen = 'DIRECTA')::int            AS directas,
         COUNT(*) FILTER (WHERE origen = 'URGENTE')::int            AS urgentes,
         COALESCE(SUM(total), 0)::numeric                           AS monto_total,
         COALESCE(SUM(freight), 0)::numeric                         AS freight_total,
         COUNT(*) FILTER (
           WHERE estado NOT IN ('cancelada','recibida')
             AND fecha_entrega_estimada IS NOT NULL
             AND fecha_entrega_estimada < CURRENT_DATE
         )::int                                                     AS vencidas
       FROM ordenes_compra
       WHERE proyecto_id = $1`,
      [proyecto_id]
    )

    // ── KPIs de recepciones ────────────────────────────────────────────────
    const { rows: [recepcionesKpi] } = await pool.query(
      `SELECT
         COUNT(*)::int                                                AS total,
         COUNT(*) FILTER (WHERE r.estado = 'completa')::int           AS completas,
         COUNT(*) FILTER (WHERE r.estado = 'con_diferencias')::int    AS con_diferencias
       FROM recepciones r
       JOIN ordenes_compra oc ON oc.id = r.orden_compra_id
       WHERE oc.proyecto_id = $1`,
      [proyecto_id]
    )

    // ── Top 5 vendors por gasto (para gráfica) ─────────────────────────────
    const { rows: topVendors } = await pool.query(
      `SELECT
         v.nombre                              AS vendor,
         COUNT(oc.id)::int                     AS ocs_count,
         COALESCE(SUM(oc.total), 0)::numeric   AS monto
       FROM ordenes_compra oc
       JOIN proveedores v ON v.id = oc.proveedor_id
       WHERE oc.proyecto_id = $1 AND oc.estado != 'cancelada'
       GROUP BY v.nombre
       ORDER BY monto DESC
       LIMIT 5`,
      [proyecto_id]
    )

    // ── Serie mensual de gasto (para line chart) ───────────────────────────
    const { rows: gastoMensual } = await pool.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', fecha_emision), 'YYYY-MM') AS mes,
         COALESCE(SUM(total), 0)::numeric                       AS monto
       FROM ordenes_compra
       WHERE proyecto_id = $1 AND estado != 'cancelada'
       GROUP BY DATE_TRUNC('month', fecha_emision)
       ORDER BY DATE_TRUNC('month', fecha_emision)`,
      [proyecto_id]
    )

    res.json({
      data: {
        proyecto,
        kpis: {
          materiales:   materialesKpi,
          ocs:          ocsKpi,
          recepciones:  recepcionesKpi,
          top_vendors:  topVendors,
          gasto_mensual: gastoMensual,
        },
      },
    })
  } catch (err) { next(err) }
}

// ─── Actividad cronológica del proyecto ──────────────────────────────────────
//
// Devuelve un feed de eventos ordenados desc por fecha, mezclando:
//   - importaciones de MTO (agrupadas por fecha_importacion + origen)
//   - generación / creación de OCs (cualquier estado, incluido cancelada)
//   - recepciones (completa o con_diferencias)
//
// Cada evento incluye una nota cuando existe (oc.notas, recepcion.notas, etc.)
export async function getProyectoActividad(req: Request, res: Response, next: NextFunction) {
  try {
    const proyecto_id = parseInt(String(req.params.id))
    if (!proyecto_id) return next(createError('id inválido', 400))

    // 1) Imports de MTO: agrupados por import_batch_id si existe (migración 032+),
    //    fallback a (fecha_importacion, origen) para materiales legacy con
    //    batch_id NULL.
    //
    // El COALESCE con un "synthetic batch key" garantiza que filas legacy del
    //    mismo día/origen siguen agrupándose como antes; las nuevas (post-032)
    //    se agrupan por batch_id real, así 2 subidas el mismo día = 2 eventos.
    const { rows: imports } = await pool.query(
      `SELECT
         'mto_import'                                AS tipo,
         MIN(created_at)                             AS ts,
         fecha_importacion                           AS fecha,
         origen,
         import_batch_id                             AS batch_id,
         COUNT(*)::int                               AS items_count,
         COUNT(*) FILTER (WHERE cotizar = 'SI')::int      AS cotizar_si,
         COUNT(*) FILTER (WHERE cotizar = 'EN_STOCK')::int AS en_stock,
         (SELECT MIN(vendor) FROM materiales_mto m2
          WHERE m2.proyecto_id = materiales_mto.proyecto_id
            AND COALESCE(m2.import_batch_id::text, m2.fecha_importacion::text || ':' || m2.origen)
              = COALESCE(materiales_mto.import_batch_id::text, materiales_mto.fecha_importacion::text || ':' || materiales_mto.origen)
            AND m2.vendor IS NOT NULL AND m2.vendor != '')   AS vendor_principal
       FROM materiales_mto
       WHERE proyecto_id = $1
       GROUP BY
         COALESCE(import_batch_id::text, fecha_importacion::text || ':' || origen),
         import_batch_id, fecha_importacion, origen, proyecto_id
       ORDER BY ts DESC`,
      [proyecto_id]
    )

    // 2) OCs: cada OC = 1 evento con su estado actual
    const { rows: ocs } = await pool.query(
      `SELECT
         'oc'                                AS tipo,
         oc.created_at                       AS ts,
         oc.id, oc.numero, oc.estado, oc.origen,
         oc.fecha_emision, oc.fecha_entrega_estimada, oc.fecha_entrega_real,
         oc.total, oc.freight, oc.categoria, oc.notas,
         v.nombre                            AS vendor,
         (SELECT COUNT(*)::int FROM items_orden_compra WHERE orden_compra_id = oc.id) AS items_count
       FROM ordenes_compra oc
       LEFT JOIN proveedores v ON v.id = oc.proveedor_id
       WHERE oc.proyecto_id = $1
       ORDER BY oc.created_at DESC`,
      [proyecto_id]
    )

    // 3) Recepciones
    const { rows: recepciones } = await pool.query(
      `SELECT
         'recepcion'                         AS tipo,
         r.created_at                        AS ts,
         r.id, r.folio, r.estado, r.fecha_recepcion, r.recibio, r.notas,
         oc.numero                           AS oc_numero,
         oc.id                               AS oc_id,
         (SELECT COUNT(*)::int FROM items_recepcion WHERE recepcion_id = r.id AND cantidad_recibida != cantidad_ordenada) AS diffs_count
       FROM recepciones r
       JOIN ordenes_compra oc ON oc.id = r.orden_compra_id
       WHERE oc.proyecto_id = $1
       ORDER BY r.created_at DESC`,
      [proyecto_id]
    )

    // 4) Cotizaciones enviadas a vendors
    // Cada solicitud_cotizacion con fecha_solicitud no nula = 1 evento
    // (la cotización fue solicitada/enviada al vendor)
    const { rows: cotizaciones } = await pool.query(
      `SELECT
         'cotizacion'                        AS tipo,
         sc.created_at                       AS ts,
         sc.id, sc.folio, sc.estado, sc.fecha_solicitud, sc.fecha_respuesta,
         sc.monto_cotizado, sc.notas,
         v.nombre                            AS vendor
       FROM solicitudes_cotizacion sc
       LEFT JOIN proveedores v ON v.id = sc.proveedor_id
       WHERE sc.proyecto_id = $1
       ORDER BY sc.created_at DESC`,
      [proyecto_id]
    )

    // Merge + sort desc por ts
    const eventos = [...imports, ...ocs, ...recepciones, ...cotizaciones].sort(
      (a: any, b: any) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
    )

    res.json({ data: eventos })
  } catch (err) { next(err) }
}

// ─── Items readiness: ¿cada item del proyecto tiene todos sus materiales? ───
//
// Lee materiales_mto.item (TEXT) y expande para que un material que va a N
// items cuente en los N. Formato real de los datos:
//   - "3"              → un solo item
//   - "1-15-18-19-20"  → multi-item con guión (~55 casos en prod)
//   - "1,2"            → multi-item con coma (~14 casos en prod)
//   - NULL o ""        → sin item, se excluye
// Por eso usamos REGEXP_SPLIT_TO_ARRAY con la clase de caracteres '[-,]'
// que acepta ambos separadores. La fuente de los datos es el Excel "Material
// List" columna ITEM#, y la planilla histórica no es 100% consistente con
// el separador.
//
// Devuelve, para cada item del proyecto:
//   - total: cantidad de materiales que necesita ese item
//   - recibidos: cuántos ya están en RECIBIDO
//   - ordenados: cuántos están en una OC activa (ORDENADO)
//   - pendientes: cuántos sin ordenar (PENDIENTE o COTIZADO)
//   - en_stock: cuántos son de stock propio (EN_STOCK)
//   - estado: LISTO | PARCIAL | ORDENADO | PENDIENTE
//
// Estado calculado así:
//   - LISTO     → todos recibidos o en stock (recibidos + en_stock == total)
//   - PARCIAL   → al menos uno recibido pero faltan otros
//   - ORDENADO  → ninguno recibido, todos están en una OC activa
//   - PENDIENTE → hay materiales sin ordenar
//
// Los materiales sin item (vacío o NULL) se excluyen del cálculo.
//
// Cada material incluye `oc_fecha_entrega` (ETA estimada de la OC activa) — lo
// usa el módulo de Producción para mostrar cuándo llegan los materiales faltantes
// y resaltar ETAs vencidas.
export async function getProyectoItemsReadiness(req: Request, res: Response, next: NextFunction) {
  try {
    const proyecto_id = parseInt(String(req.params.id))
    if (!proyecto_id) return next(createError('id inválido', 400))

    const { rows } = await pool.query(
      `WITH items_expanded AS (
         SELECT
           TRIM(item_num) AS item,
           m.id, m.codigo, m.descripcion, m.vendor, m.qty, m.unit_price,
           m.estado_cotiz, m.cotizar,
           oc_link.oc_id, oc_link.oc_numero, oc_link.oc_fecha_entrega
         FROM materiales_mto m
         CROSS JOIN UNNEST(REGEXP_SPLIT_TO_ARRAY(m.item, '[-,]')) AS item_num
         LEFT JOIN LATERAL (
           SELECT oc.id AS oc_id, oc.numero AS oc_numero,
                  oc.fecha_entrega_estimada AS oc_fecha_entrega
           FROM items_orden_compra ioc
           JOIN ordenes_compra oc ON oc.id = ioc.orden_compra_id
           WHERE ioc.material_id = m.id
             AND oc.estado != 'cancelada'
           ORDER BY oc.fecha_emision DESC
           LIMIT 1
         ) oc_link ON true
         WHERE m.proyecto_id = $1
           AND m.item IS NOT NULL
           AND TRIM(m.item) != ''
       )
       SELECT
         item,
         COUNT(*)::int                                                       AS total,
         COUNT(*) FILTER (WHERE estado_cotiz = 'RECIBIDO')::int              AS recibidos,
         COUNT(*) FILTER (WHERE estado_cotiz = 'ORDENADO')::int              AS ordenados,
         COUNT(*) FILTER (WHERE estado_cotiz IN ('PENDIENTE','COTIZADO'))::int AS pendientes,
         COUNT(*) FILTER (WHERE estado_cotiz = 'EN_STOCK')::int              AS en_stock,
         json_agg(
           json_build_object(
             'id',          id,
             'codigo',      codigo,
             'descripcion', descripcion,
             'vendor',      vendor,
             'qty',         qty,
             'unit_price',  unit_price,
             'estado_cotiz', estado_cotiz,
             'oc_id',       oc_id,
             'oc_numero',   oc_numero,
             'oc_fecha_entrega', oc_fecha_entrega
           ) ORDER BY codigo
         ) AS materiales
       FROM items_expanded
       GROUP BY item
       ORDER BY
         -- Sort numérico cuando el item es número (1,2,3...) y alfabético si no
         CASE WHEN item ~ '^\\d+$' THEN LPAD(item, 10, '0') ELSE item END`,
      [proyecto_id]
    )

    // Calcular el estado de cada item en JS (más legible que en SQL)
    const items = rows.map((r: any) => {
      const total = r.total
      const recibidos = r.recibidos
      const en_stock = r.en_stock
      const pendientes = r.pendientes

      // "Disponibles" = recibidos + en_stock (ambos están físicamente en el taller)
      const disponibles = recibidos + en_stock

      let estado: 'LISTO' | 'PARCIAL' | 'ORDENADO' | 'PENDIENTE'
      if (disponibles === total) {
        estado = 'LISTO'
      } else if (disponibles > 0) {
        estado = 'PARCIAL'
      } else if (pendientes === 0) {
        estado = 'ORDENADO'  // ninguno recibido pero todos en OC activa
      } else {
        estado = 'PENDIENTE'
      }

      return { ...r, disponibles, estado }
    })

    // Resumen agregado del proyecto
    const resumen = {
      total_items:    items.length,
      listos:         items.filter((i: any) => i.estado === 'LISTO').length,
      parciales:      items.filter((i: any) => i.estado === 'PARCIAL').length,
      ordenados:      items.filter((i: any) => i.estado === 'ORDENADO').length,
      pendientes:     items.filter((i: any) => i.estado === 'PENDIENTE').length,
    }

    res.json({ data: { items, resumen } })
  } catch (err) { next(err) }
}

/**
 * GET /api/proyectos/:id/muestras-aprobadas — F6 Muestras (2026-06-09)
 *
 * Devuelve las muestras aprobadas vinculadas al proyecto, con URL firmada
 * del PDF sample_request si existe. Sirve para:
 *  - Mostrar subsección "Muestras aprobadas" en /proyectos/:id
 *  - Cruzar con items de producción para badges "spec aprobada disponible"
 */
export async function getProyectoMuestrasAprobadas(req: Request, res: Response, next: NextFunction) {
  try {
    const proyecto_id = parseInt(String(req.params.id))
    if (!proyecto_id) return next(createError('id inválido', 400))

    const { rows } = await pool.query<{
      id: number
      muestra_id: number
      version_numero: number
      codigo: string
      descripcion: string
      tipo: string
      pdf_archivo_id: number | null
      pdf_filename: string | null
      pdf_nombre: string | null
      fecha_aprobacion: string
      aprobado_por_nombre: string | null
      notas: string | null
      created_at: string
    }>(
      `SELECT
         pma.id, pma.muestra_id, pma.version_numero,
         pma.codigo, pma.descripcion, pma.tipo,
         pma.pdf_archivo_id,
         ma.filename AS pdf_filename,
         ma.nombre AS pdf_nombre,
         pma.fecha_aprobacion,
         u.nombre AS aprobado_por_nombre,
         pma.notas, pma.created_at
       FROM proyectos_muestras_aprobadas pma
       LEFT JOIN muestras_archivos ma ON ma.id = pma.pdf_archivo_id
       LEFT JOIN usuarios u ON u.id = pma.aprobado_por
       WHERE pma.proyecto_id = $1
       ORDER BY pma.fecha_aprobacion DESC, pma.created_at DESC`,
      [proyecto_id]
    )

    // Generar signed URL para el PDF si existe (bucket privado)
    if (supabaseEnabled && supabase) {
      const sb = supabase
      for (const r of rows) {
        if (r.pdf_filename) {
          const { data } = await sb.storage
            .from(SUPABASE_BUCKET)
            .createSignedUrl(r.pdf_filename, 3600)
          ;(r as any).pdf_url = data?.signedUrl ?? null
        } else {
          ;(r as any).pdf_url = null
        }
      }
    }

    res.json({ data: rows })
  } catch (err) { next(err) }
}
