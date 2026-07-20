import { Request, Response, NextFunction } from 'express'
import path from 'path'
import fs from 'fs'
import pool from '../db/pool'
import { uploadToGitHub } from '../utils/github'
import { createError } from '../middleware/errorHandler'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../utils/supabase'

const TEMPLATES_DIR = path.join(__dirname, '../../templates')

function templatePath(name: string) {
  return path.join(TEMPLATES_DIR, name)
}

async function buildData() {
  // Proyectos
  const { rows: proyectosRows } = await pool.query(
    `SELECT id, codigo, nombre, presupuesto, estado
     FROM proyectos ORDER BY codigo`
  )

  // Ordenes — join proveedor para obtener vendor name + fecha_oc for batch logic
  const { rows: ordenesRows } = await pool.query(
    `SELECT
       oc.id,
       oc.numero            AS id_oc,
       p.codigo             AS id_proyecto,
       prov.nombre          AS vendor,
       oc.categoria,
       oc.fecha_mto         AS fecha_solicitud,
       oc.fecha_emision     AS fecha_oc,
       oc.fecha_entrega_estimada AS fecha_entrega,
       oc.fecha_entrega_real     AS fecha_recepcion,
       oc.total             AS monto,
       oc.notas,
       CASE
         WHEN oc.estado = 'recibida'    THEN 'EN_EL_TALLER'
         WHEN oc.estado = 'en_transito' THEN 'EN_TRANSITO'
         WHEN oc.estado = 'cancelada'   THEN 'CANCELADA'
         ELSE 'ORDENADO'
       END AS estado
     FROM ordenes_compra oc
     JOIN proyectos p ON p.id = oc.proyecto_id
     LEFT JOIN proveedores prov ON prov.id = oc.proveedor_id
     ORDER BY oc.numero`
  )

  // MTO with id_oc assigned using the same batch-slicing logic as the endpoint:
  //   fi_this  = MAX(fecha_importacion) <= this OC's fecha_emision
  //   fi_prev  = MAX(fecha_importacion) <= previous OC's fecha_emision (same vendor+project)
  //   material belongs to this OC when fecha_importacion = fi_this AND fi_this != fi_prev
  const { rows: mtoRows } = await pool.query(
    `WITH oc_batches AS (
       SELECT
         oc.numero AS id_oc,
         oc.proyecto_id,
         UPPER(TRIM(prov.nombre)) AS vendor_upper,
         oc.fecha_emision,
         -- Most recent import date <= this OC's fecha_emision
         (
           SELECT MAX(m2.fecha_importacion)
           FROM materiales_mto m2
           WHERE m2.proyecto_id = oc.proyecto_id
             AND UPPER(TRIM(m2.vendor)) = UPPER(TRIM(prov.nombre))
             AND m2.fecha_importacion IS NOT NULL
             AND m2.fecha_importacion <= oc.fecha_emision
         ) AS fi_this,
         -- Most recent import date <= previous OC's fecha_emision (same vendor+project)
         (
           SELECT MAX(m2.fecha_importacion)
           FROM materiales_mto m2
           WHERE m2.proyecto_id = oc.proyecto_id
             AND UPPER(TRIM(m2.vendor)) = UPPER(TRIM(prov.nombre))
             AND m2.fecha_importacion IS NOT NULL
             AND m2.fecha_importacion <= COALESCE(
               (
                 SELECT MAX(o2.fecha_emision)
                 FROM ordenes_compra o2
                 JOIN proveedores v2 ON v2.id = o2.proveedor_id
                 WHERE o2.proyecto_id = oc.proyecto_id
                   AND UPPER(TRIM(v2.nombre)) = UPPER(TRIM(prov.nombre))
                   AND o2.fecha_emision < oc.fecha_emision
               ),
               '1900-01-01'::date
             )
         ) AS fi_prev
       FROM ordenes_compra oc
       JOIN proveedores prov ON prov.id = oc.proveedor_id
     )
     SELECT
       m.id,
       ob.id_oc,
       p.codigo           AS id_proyecto,
       m.codigo           AS cm_code,
       m.descripcion,
       m.item,
       m.qty,
       m.unit_price,
       m.total_price,
       m.vendor,
       m.mill_made,
       m.cotizar,
       m.estado_cotiz,
       m.notas,
       m.color,
       m.size,
       m.fecha_importacion
     FROM materiales_mto m
     LEFT JOIN proyectos p ON p.id = m.proyecto_id
     LEFT JOIN oc_batches ob
       ON ob.proyecto_id = m.proyecto_id
       AND UPPER(TRIM(m.vendor)) = ob.vendor_upper
       AND m.fecha_importacion = ob.fi_this
       AND ob.fi_this IS DISTINCT FROM ob.fi_prev
     ORDER BY m.codigo`
  )

  // Recepciones — unir con OC para obtener id_oc (número)
  const { rows: recepcionesRows } = await pool.query(
    `SELECT
       r.id,
       oc.numero          AS id_oc,
       r.fecha_recepcion  AS fecha,
       r.notas            AS observaciones,
       r.recibio,
       r.estado,
       r.folio
     FROM recepciones r
     JOIN ordenes_compra oc ON oc.id = r.orden_compra_id
     ORDER BY r.created_at`
  )

  const proyectos = proyectosRows.map((p) => ({
    id:     p.codigo,
    nombre: p.nombre,
    budget: parseFloat(p.presupuesto) || 0,
    estado: p.estado,
  }))

  const ordenes = ordenesRows.map((o) => ({
    id_oc:           o.id_oc,
    id_proyecto:     o.id_proyecto,
    vendor:          o.vendor ?? '',
    categoria:       o.categoria ?? '',
    fecha_solicitud: o.fecha_solicitud ? String(o.fecha_solicitud).slice(0, 10) : '',
    fecha_oc:        o.fecha_oc        ? String(o.fecha_oc).slice(0, 10) : '',
    fecha_entrega:   o.fecha_entrega   ? String(o.fecha_entrega).slice(0, 10) : '',
    fecha_recepcion: o.fecha_recepcion ? String(o.fecha_recepcion).slice(0, 10) : '',
    monto:           parseFloat(o.monto) || 0,
    estado:          o.estado,
    notas:           o.notas ?? '',
  }))

  const mto = mtoRows.map((m) => ({
    id_oc:        m.id_oc ?? null,
    id_proyecto:  m.id_proyecto ?? '',
    cm_code:      m.cm_code ?? '',
    descripcion:  m.descripcion ?? '',
    item:         m.item ?? '',
    qty:          m.qty ?? '',
    unit_price:   parseFloat(m.unit_price) || 0,
    total_price:  parseFloat(m.total_price) || 0,
    vendor:       m.vendor ?? '',
    mill_made:    m.mill_made ?? 'NO',
    cotizar:      m.cotizar ?? 'SI',
    estado_cotiz: m.estado_cotiz ?? 'PENDIENTE',
    notas:        m.notas ?? '',
    color:        m.color ?? '',
    size:         m.size ?? '',
    fecha_importacion: m.fecha_importacion ? String(m.fecha_importacion).slice(0, 10) : null,
  }))

  const recepciones = recepcionesRows.map((r) => ({
    id_oc:         r.id_oc,
    fecha:         r.fecha ? String(r.fecha).slice(0, 10) : '',
    observaciones: r.observaciones ?? '',
    recibio:       r.recibio ?? '',
    estado:        r.estado ?? '',
    folio:         r.folio ?? '',
  }))

  return { proyectos, ordenes, mto, recepciones }
}

function injectData(template: string, data: object): string {
  // JSON.stringify() no escapa "</script>" por default, lo que permitiría
  // a un payload como descripcion: "</script><script>alert(1)</script>"
  // romper el <script> contenedor del template y ejecutar JS arbitrario.
  // Escapamos esa secuencia (caso clásico de JSON-in-HTML XSS).
  const json = JSON.stringify(data)
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\!--')
  return template.replace('/*DATA_PLACEHOLDER*/', `var DATA = ${json};`)
}

export async function getReporteCompras(req: Request, res: Response, next: NextFunction) {
  try {
    const tmpl = fs.readFileSync(templatePath('reporte_compras_template.html'), 'utf-8')
    const data = await buildData()
    const html = injectData(tmpl, data)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_compras.html"')
    res.send(html)
  } catch (err) { next(err) }
}

export async function getReporteProduccion(req: Request, res: Response, next: NextFunction) {
  try {
    const tmpl = fs.readFileSync(templatePath('reporte_produccion_template.html'), 'utf-8')
    const data = await buildData()
    const html = injectData(tmpl, data)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_produccion.html"')
    res.send(html)
  } catch (err) { next(err) }
}

export async function compartirReporte(req: Request, res: Response, next: NextFunction) {
  try {
    const { tipo } = req.body
    if (!['compras', 'produccion'].includes(tipo))
      return next(createError('tipo debe ser "compras" o "produccion"', 400))

    const tmplName = tipo === 'compras'
      ? 'reporte_compras_template.html'
      : 'reporte_produccion_template.html'
    const filename = `reporte_${tipo}.html`

    const tmpl = fs.readFileSync(templatePath(tmplName), 'utf-8')
    const data = await buildData()
    const html = injectData(tmpl, data)

    const url = await uploadToGitHub(filename, html)
    res.json({ url })
  } catch (err: any) {
    next(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporte HTML: Movimientos de compras JUN + JUL 2026 (2026-07-16)
// ─────────────────────────────────────────────────────────────────────────────
// Endpoint que devuelve HTML self-contained (no JSON, no template file).
// User abre el URL en el navegador (logueado) y ve el reporte directo.
// Sin dependencias externas: 6 queries en paralelo + template inline.

function escapeHtmlInline(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const fmtMoney = (n: number | string): string => {
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (!Number.isFinite(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(num)
}

const fmtDateInline = (d: string | Date | null | undefined): string => {
  if (!d) return '—'
  const str = typeof d === 'string' ? d : d.toISOString()
  const [y, m, day] = str.slice(0, 10).split('-')
  return `${m}/${day}/${y}`
}

export async function getReporteComprasJunJul(req: Request, res: Response, next: NextFunction) {
  try {
    const [resumen, ocsPorMes, topVendors, topProyectos, recepcionesPorMes, ocsVencidas, porOrigen, freightSummary, topFreightVendors, topCategorias, insights] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total_ocs,
          COALESCE(SUM(total), 0)::text AS monto_total,
          COALESCE(SUM(total) FILTER (WHERE estado != 'cancelada'), 0)::text AS monto_activo,
          COALESCE(SUM(freight) FILTER (WHERE estado != 'cancelada'), 0)::text AS freight_total,
          COUNT(*) FILTER (WHERE estado = 'recibida')::int AS ocs_recibidas,
          COUNT(*) FILTER (WHERE estado NOT IN ('recibida','cancelada'))::int AS ocs_pendientes,
          COUNT(*) FILTER (WHERE estado = 'cancelada')::int AS ocs_canceladas,
          COUNT(DISTINCT proveedor_id) FILTER (WHERE estado != 'cancelada')::int AS vendors_distintos,
          COUNT(DISTINCT proyecto_id) FILTER (WHERE estado != 'cancelada')::int AS proyectos_distintos
        FROM ordenes_compra
        WHERE fecha_emision >= '2026-06-01' AND fecha_emision < '2026-08-01'
      `),
      pool.query(`
        SELECT TO_CHAR(fecha_emision, 'YYYY-MM') AS mes,
          COUNT(*)::int AS total,
          COALESCE(SUM(total), 0)::text AS monto,
          COUNT(*) FILTER (WHERE estado = 'recibida')::int AS recibidas,
          COUNT(*) FILTER (WHERE estado NOT IN ('recibida','cancelada'))::int AS pendientes,
          COUNT(*) FILTER (WHERE estado = 'cancelada')::int AS canceladas
        FROM ordenes_compra
        WHERE fecha_emision >= '2026-06-01' AND fecha_emision < '2026-08-01'
        GROUP BY mes ORDER BY mes
      `),
      pool.query(`
        SELECT COALESCE(v.nombre, '(sin vendor)') AS vendor,
          COUNT(o.id)::int AS ocs,
          COALESCE(SUM(o.total), 0)::text AS monto
        FROM ordenes_compra o
        LEFT JOIN proveedores v ON v.id = o.proveedor_id
        WHERE o.fecha_emision >= '2026-06-01' AND o.fecha_emision < '2026-08-01'
          AND o.estado != 'cancelada'
        GROUP BY v.nombre ORDER BY SUM(o.total) DESC NULLS LAST LIMIT 15
      `),
      pool.query(`
        SELECT p.codigo, p.nombre,
          COUNT(o.id)::int AS ocs,
          COALESCE(SUM(o.total), 0)::text AS monto
        FROM ordenes_compra o
        LEFT JOIN proyectos p ON p.id = o.proyecto_id
        WHERE o.fecha_emision >= '2026-06-01' AND o.fecha_emision < '2026-08-01'
          AND o.estado != 'cancelada'
        GROUP BY p.codigo, p.nombre ORDER BY SUM(o.total) DESC NULLS LAST LIMIT 15
      `),
      pool.query(`
        SELECT TO_CHAR(fecha_recepcion, 'YYYY-MM') AS mes,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE estado = 'completa')::int AS completas,
          COUNT(*) FILTER (WHERE estado = 'con_diferencias')::int AS con_diferencias
        FROM recepciones
        WHERE fecha_recepcion >= '2026-06-01' AND fecha_recepcion < '2026-08-01'
        GROUP BY mes ORDER BY mes
      `),
      pool.query(`
        SELECT o.numero, COALESCE(v.nombre, '(sin vendor)') AS vendor,
          p.codigo AS proyecto,
          o.fecha_entrega_estimada::text AS eta,
          o.total::text AS monto,
          (CURRENT_DATE - o.fecha_entrega_estimada)::int AS dias_vencida
        FROM ordenes_compra o
        LEFT JOIN proveedores v ON v.id = o.proveedor_id
        LEFT JOIN proyectos p ON p.id = o.proyecto_id
        WHERE o.estado NOT IN ('recibida', 'cancelada')
          AND o.fecha_entrega_estimada IS NOT NULL
          AND o.fecha_entrega_estimada < CURRENT_DATE
        ORDER BY o.fecha_entrega_estimada LIMIT 20
      `),
      // Desglose por tipo de orden (origen: MTO / DIRECTA / URGENTE / OPERATIVA)
      pool.query(`
        SELECT COALESCE(origen, 'MTO') AS origen,
          COUNT(*)::int AS ocs,
          COALESCE(SUM(total), 0)::text AS monto,
          COALESCE(SUM(freight), 0)::text AS freight,
          COUNT(*) FILTER (WHERE estado = 'recibida')::int AS recibidas
        FROM ordenes_compra
        WHERE fecha_emision >= '2026-06-01' AND fecha_emision < '2026-08-01'
          AND estado != 'cancelada'
        GROUP BY origen
        ORDER BY SUM(total) DESC NULLS LAST
      `),
      // Freight breakdown: total + promedio por OC + % del monto total
      pool.query(`
        SELECT COALESCE(SUM(freight), 0)::text AS freight_total,
          COALESCE(SUM(total), 0)::text AS monto_total,
          COALESCE(AVG(freight) FILTER (WHERE freight > 0), 0)::text AS freight_promedio_ocs_con_freight,
          COUNT(*) FILTER (WHERE freight > 0)::int AS ocs_con_freight,
          COUNT(*)::int AS ocs_totales
        FROM ordenes_compra
        WHERE fecha_emision >= '2026-06-01' AND fecha_emision < '2026-08-01'
          AND estado != 'cancelada'
      `),
      // Top 10 vendors por gasto en freight
      pool.query(`
        SELECT COALESCE(v.nombre, '(sin vendor)') AS vendor,
          COUNT(o.id)::int AS ocs_con_freight,
          COALESCE(SUM(o.freight), 0)::text AS freight_total,
          COALESCE(SUM(o.total), 0)::text AS monto_ocs
        FROM ordenes_compra o
        LEFT JOIN proveedores v ON v.id = o.proveedor_id
        WHERE o.fecha_emision >= '2026-06-01' AND o.fecha_emision < '2026-08-01'
          AND o.estado != 'cancelada'
          AND o.freight > 0
        GROUP BY v.nombre
        ORDER BY SUM(o.freight) DESC NULLS LAST
        LIMIT 10
      `),
      // Top 10 categorías (si se usan)
      pool.query(`
        SELECT COALESCE(NULLIF(TRIM(categoria), ''), '(sin categoría)') AS categoria,
          COUNT(*)::int AS ocs,
          COALESCE(SUM(total), 0)::text AS monto
        FROM ordenes_compra
        WHERE fecha_emision >= '2026-06-01' AND fecha_emision < '2026-08-01'
          AND estado != 'cancelada'
        GROUP BY categoria
        ORDER BY SUM(total) DESC NULLS LAST
        LIMIT 10
      `),
      // Insights: días promedio ETA (fecha_entrega - fecha_emision),
      // día de la semana con más compras, ratio recibidas/emitidas
      pool.query(`
        SELECT
          ROUND(AVG(fecha_entrega_estimada - fecha_emision) FILTER (WHERE fecha_entrega_estimada IS NOT NULL), 1)::text AS eta_promedio_dias,
          (SELECT TRIM(TO_CHAR(fecha_emision, 'Day'))
             FROM ordenes_compra
             WHERE fecha_emision >= '2026-06-01' AND fecha_emision < '2026-08-01' AND estado != 'cancelada'
             GROUP BY TO_CHAR(fecha_emision, 'Day'), EXTRACT(DOW FROM fecha_emision)
             ORDER BY COUNT(*) DESC LIMIT 1) AS dia_pico_compras,
          COUNT(*) FILTER (WHERE fecha_entrega_real IS NOT NULL AND fecha_entrega_estimada IS NOT NULL AND fecha_entrega_real <= fecha_entrega_estimada)::int AS ocs_a_tiempo,
          COUNT(*) FILTER (WHERE fecha_entrega_real IS NOT NULL AND fecha_entrega_estimada IS NOT NULL AND fecha_entrega_real > fecha_entrega_estimada)::int AS ocs_con_retraso,
          COUNT(*) FILTER (WHERE estado = 'recibida')::int AS total_recibidas
        FROM ordenes_compra
        WHERE fecha_emision >= '2026-06-01' AND fecha_emision < '2026-08-01'
          AND estado != 'cancelada'
      `),
    ])

    const r = resumen.rows[0] as any
    const generatedAt = new Date().toLocaleString('es-MX', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    const maxMonto = ocsPorMes.rows.length > 0
      ? Math.max(...ocsPorMes.rows.map((row: any) => parseFloat(row.monto)))
      : 0

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reporte de Compras · Jun–Jul 2026 · Central Millwork</title>
<style>
:root { --cream:#faf7f0; --cream-2:#f0ebe0; --forest:#2c3126; --forest-2:#4A5240; --gold:#9B7200; --gold-2:#dea832; --text:#1f1b14; --text-soft:#6b6356; --border:#dcd4c0; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--cream); color: var(--text); margin: 0; padding: 24px; max-width: 1100px; margin-left: auto; margin-right: auto; line-height: 1.5; }
header { border-bottom: 3px solid var(--gold); padding-bottom: 16px; margin-bottom: 24px; }
h1 { color: var(--forest); margin: 0 0 4px; font-size: 28px; font-weight: 700; }
.subtitle { color: var(--text-soft); font-size: 14px; }
.meta { color: var(--text-soft); font-size: 12px; margin-top: 8px; font-style: italic; }
section { background: white; border: 1px solid var(--border); border-radius: 10px; padding: 20px 24px; margin-bottom: 20px; }
h2 { color: var(--forest); margin: 0 0 16px; font-size: 18px; border-left: 4px solid var(--gold); padding-left: 12px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.kpi { background: var(--cream-2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; }
.kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-soft); font-weight: 600; margin-bottom: 4px; }
.kpi-value { font-size: 22px; font-weight: 700; color: var(--forest); font-variant-numeric: tabular-nums; }
.kpi-value.gold { color: var(--gold); font-size: 16px; }
.kpi-value.big { font-size: 28px; }
.kpi-sub { font-size: 11px; color: var(--text-soft); margin-top: 4px; }
.chart { display: flex; gap: 24px; align-items: flex-end; justify-content: center; height: 260px; padding: 20px; background: var(--cream-2); border-radius: 8px; }
.bar-group { display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1; max-width: 220px; }
.bar-wrap { width: 100%; display: flex; flex-direction: column; justify-content: flex-end; height: 160px; }
.bar { background: linear-gradient(to top, var(--gold), var(--gold-2)); border-radius: 6px 6px 0 0; width: 100%; display: flex; align-items: flex-start; justify-content: center; color: white; font-weight: 700; font-size: 13px; padding-top: 8px; box-shadow: 0 2px 4px rgba(0,0,0,.08); }
.bar-label { font-size: 11px; color: var(--text-soft); text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
.bar-monto { font-size: 14px; color: var(--forest); font-weight: 700; font-variant-numeric: tabular-nums; }
.bar-count { font-size: 10px; color: var(--text-soft); text-align: center; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead th { background: var(--cream-2); color: var(--text-soft); text-transform: uppercase; letter-spacing: 1px; font-size: 10px; font-weight: 700; padding: 8px 12px; text-align: left; border-bottom: 2px solid var(--border); }
tbody td { padding: 8px 12px; border-bottom: 1px solid var(--cream-2); }
tbody tr:hover { background: var(--cream); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.mono { font-family: 'SF Mono', Menlo, monospace; font-size: 12px; }
.rank { display: inline-block; background: var(--forest); color: white; width: 22px; height: 22px; border-radius: 50%; text-align: center; line-height: 22px; font-size: 11px; font-weight: 700; }
.alert-row td { background: #fff5f5; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
.badge-red { background: #FEE2E2; color: #991B1B; }
.badge-amber { background: #FEF3C7; color: #92400E; }
.badge-emerald { background: #D1FAE5; color: #065F46; }
.empty { text-align: center; color: var(--text-soft); font-style: italic; padding: 24px; background: var(--cream-2); border-radius: 6px; }
footer { text-align: center; color: var(--text-soft); font-size: 11px; margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border); }
@media print { body { background: white; padding: 12px; } section { break-inside: avoid; page-break-inside: avoid; } }
</style></head><body>
<header>
  <h1>Reporte de Compras</h1>
  <div class="subtitle">Junio 2026 – 16 de Julio 2026 · Central Millwork</div>
  <div class="meta">Generado ${escapeHtmlInline(generatedAt)}</div>
</header>

<section>
  <h2>Resumen del período</h2>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">OCs emitidas</div><div class="kpi-value big">${escapeHtmlInline(r.total_ocs)}</div><div class="kpi-sub">Total del período</div></div>
    <div class="kpi"><div class="kpi-label">Monto activo</div><div class="kpi-value gold">${escapeHtmlInline(fmtMoney(r.monto_activo))}</div><div class="kpi-sub">Excluye canceladas</div></div>
    <div class="kpi"><div class="kpi-label">Freight total</div><div class="kpi-value gold">${escapeHtmlInline(fmtMoney(r.freight_total))}</div><div class="kpi-sub">Envíos del período</div></div>
    <div class="kpi"><div class="kpi-label">Recibidas</div><div class="kpi-value">${escapeHtmlInline(r.ocs_recibidas)}</div><div class="kpi-sub"><span class="badge badge-emerald">En el taller</span></div></div>
    <div class="kpi"><div class="kpi-label">Pendientes</div><div class="kpi-value">${escapeHtmlInline(r.ocs_pendientes)}</div><div class="kpi-sub"><span class="badge badge-amber">Aún no recibidas</span></div></div>
    <div class="kpi"><div class="kpi-label">Canceladas</div><div class="kpi-value">${escapeHtmlInline(r.ocs_canceladas)}</div><div class="kpi-sub"><span class="badge badge-red">Excluidas</span></div></div>
    <div class="kpi"><div class="kpi-label">Vendors únicos</div><div class="kpi-value">${escapeHtmlInline(r.vendors_distintos)}</div><div class="kpi-sub">Con OC activa</div></div>
    <div class="kpi"><div class="kpi-label">Proyectos únicos</div><div class="kpi-value">${escapeHtmlInline(r.proyectos_distintos)}</div><div class="kpi-sub">Con OC activa</div></div>
  </div>
</section>

<section>
  <h2>OCs por mes</h2>
  ${ocsPorMes.rows.length === 0 ? '<div class="empty">Sin datos en el período</div>' : `
  <div class="chart">
    ${ocsPorMes.rows.map((row: any) => {
      const monto = parseFloat(row.monto)
      const height = maxMonto > 0 ? Math.max(20, (monto / maxMonto) * 150) : 20
      const mesLabel = row.mes === '2026-06' ? 'Junio 2026' : row.mes === '2026-07' ? 'Julio 2026' : row.mes
      return `
      <div class="bar-group">
        <div class="bar-monto">${escapeHtmlInline(fmtMoney(monto))}</div>
        <div class="bar-wrap"><div class="bar" style="height: ${height}px;">${row.total}</div></div>
        <div class="bar-label">${escapeHtmlInline(mesLabel)}</div>
        <div class="bar-count">${row.total} OCs · ${row.recibidas} recibidas · ${row.pendientes} pendientes${row.canceladas > 0 ? ` · ${row.canceladas} canceladas` : ''}</div>
      </div>`
    }).join('')}
  </div>`}
</section>

<section>
  <h2>Top vendors por monto</h2>
  ${topVendors.rows.length === 0 ? '<div class="empty">Sin datos</div>' : `
  <table><thead><tr><th>#</th><th>Vendor</th><th class="num">OCs</th><th class="num">Monto total</th></tr></thead><tbody>
    ${topVendors.rows.map((row: any, i: number) => `
    <tr><td><span class="rank">${i + 1}</span></td><td><strong>${escapeHtmlInline(row.vendor)}</strong></td><td class="num">${escapeHtmlInline(row.ocs)}</td><td class="num"><strong>${escapeHtmlInline(fmtMoney(row.monto))}</strong></td></tr>`).join('')}
  </tbody></table>`}
</section>

<section>
  <h2>Top proyectos por monto</h2>
  ${topProyectos.rows.length === 0 ? '<div class="empty">Sin datos</div>' : `
  <table><thead><tr><th>#</th><th>Código</th><th>Proyecto</th><th class="num">OCs</th><th class="num">Monto total</th></tr></thead><tbody>
    ${topProyectos.rows.map((row: any, i: number) => `
    <tr><td><span class="rank">${i + 1}</span></td><td class="mono">${escapeHtmlInline(row.codigo)}</td><td>${escapeHtmlInline(row.nombre)}</td><td class="num">${escapeHtmlInline(row.ocs)}</td><td class="num"><strong>${escapeHtmlInline(fmtMoney(row.monto))}</strong></td></tr>`).join('')}
  </tbody></table>`}
</section>

<section>
  <h2>Recepciones por mes</h2>
  ${recepcionesPorMes.rows.length === 0 ? '<div class="empty">Sin recepciones registradas en el período</div>' : `
  <table><thead><tr><th>Mes</th><th class="num">Total</th><th class="num">Completas</th><th class="num">Con diferencias</th></tr></thead><tbody>
    ${recepcionesPorMes.rows.map((row: any) => {
      const mesLabel = row.mes === '2026-06' ? 'Junio 2026' : row.mes === '2026-07' ? 'Julio 2026' : row.mes
      return `
      <tr><td><strong>${escapeHtmlInline(mesLabel)}</strong></td><td class="num">${escapeHtmlInline(row.total)}</td><td class="num"><span class="badge badge-emerald">${escapeHtmlInline(row.completas)}</span></td><td class="num">${row.con_diferencias > 0 ? `<span class="badge badge-amber">${escapeHtmlInline(row.con_diferencias)}</span>` : '—'}</td></tr>`
    }).join('')}
  </tbody></table>`}
</section>

<section>
  <h2>Desglose por tipo de orden <span style="font-size: 12px; color: var(--text-soft); font-weight: normal;">(según origen: MTO / DIRECTA / URGENTE / OPERATIVA)</span></h2>
  ${porOrigen.rows.length === 0 ? '<div class="empty">Sin datos en el período</div>' : `
  <table><thead><tr><th>Tipo</th><th class="num">OCs</th><th class="num">Monto</th><th class="num">Freight</th><th class="num">% del monto total</th><th class="num">Recibidas</th></tr></thead><tbody>
    ${porOrigen.rows.map((row: any) => {
      const monto = parseFloat(row.monto)
      const total = parseFloat(r.monto_activo)
      const pct = total > 0 ? Math.round((monto / total) * 100) : 0
      const originBadge: Record<string, string> = {
        MTO: 'badge-emerald', DIRECTA: 'badge-amber', URGENTE: 'badge-red', OPERATIVA: 'badge-amber',
      }
      const cls = originBadge[row.origen] || 'badge-amber'
      return `
      <tr><td><span class="badge ${cls}">${escapeHtmlInline(row.origen)}</span></td><td class="num">${escapeHtmlInline(row.ocs)}</td><td class="num"><strong>${escapeHtmlInline(fmtMoney(row.monto))}</strong></td><td class="num">${escapeHtmlInline(fmtMoney(row.freight))}</td><td class="num">${pct}%</td><td class="num">${escapeHtmlInline(row.recibidas)}</td></tr>`
    }).join('')}
  </tbody></table>`}
</section>

<section>
  <h2>Freight — envíos y logística</h2>
  <div class="kpi-grid" style="margin-bottom: 12px;">
    <div class="kpi"><div class="kpi-label">Freight total gastado</div><div class="kpi-value gold big">${escapeHtmlInline(fmtMoney((freightSummary.rows[0] as any).freight_total))}</div><div class="kpi-sub">Del período</div></div>
    <div class="kpi"><div class="kpi-label">Promedio por OC</div><div class="kpi-value">${escapeHtmlInline(fmtMoney((freightSummary.rows[0] as any).freight_promedio_ocs_con_freight))}</div><div class="kpi-sub">Solo OCs con freight</div></div>
    <div class="kpi"><div class="kpi-label">OCs con freight cargado</div><div class="kpi-value">${escapeHtmlInline((freightSummary.rows[0] as any).ocs_con_freight)} <span style="font-size: 14px; color: var(--text-soft); font-weight: normal;">/ ${escapeHtmlInline((freightSummary.rows[0] as any).ocs_totales)}</span></div><div class="kpi-sub">Ratio de cobertura</div></div>
    <div class="kpi"><div class="kpi-label">% del monto total</div><div class="kpi-value">${(() => { const f = parseFloat((freightSummary.rows[0] as any).freight_total); const t = parseFloat((freightSummary.rows[0] as any).monto_total); return t > 0 ? Math.round((f / t) * 100) : 0 })()}%</div><div class="kpi-sub">Peso del freight sobre total</div></div>
  </div>
  ${topFreightVendors.rows.length === 0 ? '<div class="empty">Ningún vendor con freight cargado en el período</div>' : `
  <table><thead><tr><th>#</th><th>Vendor</th><th class="num">OCs</th><th class="num">Freight</th><th class="num">Monto OCs</th><th class="num">% freight/monto</th></tr></thead><tbody>
    ${topFreightVendors.rows.map((row: any, i: number) => {
      const freight = parseFloat(row.freight_total)
      const monto = parseFloat(row.monto_ocs)
      const pct = monto > 0 ? Math.round((freight / monto) * 100 * 10) / 10 : 0
      return `
      <tr><td><span class="rank">${i + 1}</span></td><td><strong>${escapeHtmlInline(row.vendor)}</strong></td><td class="num">${escapeHtmlInline(row.ocs_con_freight)}</td><td class="num"><strong>${escapeHtmlInline(fmtMoney(freight))}</strong></td><td class="num">${escapeHtmlInline(fmtMoney(monto))}</td><td class="num">${pct}%</td></tr>`
    }).join('')}
  </tbody></table>`}
</section>

<section>
  <h2>Top categorías por monto</h2>
  ${topCategorias.rows.length === 0 || (topCategorias.rows.length === 1 && (topCategorias.rows[0] as any).categoria === '(sin categoría)' && (topCategorias.rows[0] as any).ocs === (r.total_ocs - r.ocs_canceladas)) ? '<div class="empty">No hay categorías asignadas a las OCs del período</div>' : `
  <table><thead><tr><th>#</th><th>Categoría</th><th class="num">OCs</th><th class="num">Monto</th></tr></thead><tbody>
    ${topCategorias.rows.map((row: any, i: number) => `
    <tr><td><span class="rank">${i + 1}</span></td><td>${escapeHtmlInline(row.categoria)}</td><td class="num">${escapeHtmlInline(row.ocs)}</td><td class="num"><strong>${escapeHtmlInline(fmtMoney(row.monto))}</strong></td></tr>`).join('')}
  </tbody></table>`}
</section>

<section>
  <h2>Insights del período</h2>
  ${(() => {
    const ins = insights.rows[0] as any
    const aTiempo = ins.ocs_a_tiempo
    const conRetraso = ins.ocs_con_retraso
    const recibidas = aTiempo + conRetraso
    const pctATiempo = recibidas > 0 ? Math.round((aTiempo / recibidas) * 100) : 0
    return `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">ETA promedio</div><div class="kpi-value">${escapeHtmlInline(ins.eta_promedio_dias ?? '—')} <span style="font-size: 12px; color: var(--text-soft); font-weight: normal;">días</span></div><div class="kpi-sub">Del emisor al deadline</div></div>
      <div class="kpi"><div class="kpi-label">Día pico de compras</div><div class="kpi-value" style="font-size: 18px;">${escapeHtmlInline(ins.dia_pico_compras ?? '—')}</div><div class="kpi-sub">Día de la semana con más OCs</div></div>
      <div class="kpi"><div class="kpi-label">OCs a tiempo</div><div class="kpi-value">${escapeHtmlInline(aTiempo)} <span style="font-size: 14px; color: var(--text-soft); font-weight: normal;">/ ${recibidas}</span></div><div class="kpi-sub"><span class="badge ${pctATiempo >= 80 ? 'badge-emerald' : pctATiempo >= 60 ? 'badge-amber' : 'badge-red'}">${pctATiempo}% cumplimiento</span></div></div>
      <div class="kpi"><div class="kpi-label">OCs con retraso</div><div class="kpi-value">${escapeHtmlInline(conRetraso)}</div><div class="kpi-sub">Llegaron después del ETA</div></div>
    </div>`
  })()}
</section>

<section>
  <h2>⚠️ OCs vencidas actualmente <span style="font-size: 12px; color: var(--text-soft); font-weight: normal;">(ETA pasada, aún no recibida)</span></h2>
  ${ocsVencidas.rows.length === 0 ? '<div class="empty">✅ Sin OCs vencidas al día de hoy</div>' : `
  <table><thead><tr><th>OC</th><th>Vendor</th><th>Proyecto</th><th>ETA</th><th class="num">Días vencida</th><th class="num">Monto</th></tr></thead><tbody>
    ${ocsVencidas.rows.map((row: any) => `
    <tr class="alert-row"><td class="mono"><strong>${escapeHtmlInline(row.numero)}</strong></td><td>${escapeHtmlInline(row.vendor)}</td><td class="mono">${escapeHtmlInline(row.proyecto ?? '—')}</td><td>${escapeHtmlInline(fmtDateInline(row.eta))}</td><td class="num"><span class="badge ${row.dias_vencida > 7 ? 'badge-red' : 'badge-amber'}">${escapeHtmlInline(row.dias_vencida)} días</span></td><td class="num">${escapeHtmlInline(fmtMoney(row.monto))}</td></tr>`).join('')}
  </tbody></table>`}
</section>

<footer>Central Millwork · Reporte generado automáticamente por el sistema</footer>
</body></html>`

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.send(html)
  } catch (err) {
    next(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporte HTML: OP de producción (2026-07-16)
// ─────────────────────────────────────────────────────────────────────────────
// Reporte visual de una OP específica para mostrar a la dirección: header
// con estado, KPIs, timeline vertical de cada estación con plazos/operador/
// notas/fotos. Fotos via signed URLs de Supabase Storage (TTL 1h).

const SIGNED_TTL_OP = 3600 // 1h — suficiente para navegar/imprimir/guardar

async function firmarUrlFoto(filename: string | null): Promise<string | null> {
  if (!filename || !supabaseEnabled || !supabase) return null
  const { data, error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(filename, SIGNED_TTL_OP)
  if (error || !data) return null
  return data.signedUrl
}

export async function getReporteOP(req: Request, res: Response, next: NextFunction) {
  try {
    const numeroOrden = String(req.params.numero || '').trim().toUpperCase()
    if (!numeroOrden) {
      return next(createError('numero de orden requerido', 400))
    }

    // 1) OP + proyecto (búsqueda case-insensitive por si tipearon distinto)
    const opRes = await pool.query(`
      SELECT o.*, p.codigo AS proyecto_codigo, p.nombre AS proyecto_nombre,
             per.nombre AS asignado_nombre
      FROM ordenes_produccion o
      LEFT JOIN proyectos p ON p.id = o.proyecto_id
      LEFT JOIN personal_taller per ON per.id = o.personal_asignado_id
      WHERE UPPER(o.numero_orden) = $1
      LIMIT 1
    `, [numeroOrden])

    if (opRes.rows.length === 0) {
      res.status(404)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(`<html><body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1 style="color:#7d5c00;">OP ${escapeHtmlInline(numeroOrden)} no encontrada</h1>
          <p style="color:#666;">Verificá el número de orden e intentá de nuevo.</p>
        </body></html>`)
      return
    }
    const op = opRes.rows[0] as any

    // 2) Procesos/estaciones + operarios
    const procesosRes = await pool.query(`
      SELECT p.id, p.estacion, p.secuencia, p.requerido, p.completado,
             p.fecha_inicio::text AS fecha_inicio,
             p.fecha_fin::text AS fecha_fin,
             p.tiempo_estimado_minutos, p.tiempo_real_minutos,
             p.notas,
             per.nombre AS operador_nombre
      FROM orden_procesos p
      LEFT JOIN personal_taller per ON per.id = p.operador_id
      WHERE p.orden_id = $1
      ORDER BY p.secuencia ASC
    `, [op.id])

    // 3) Fotos de avance
    const fotosRes = await pool.query(`
      SELECT f.id, f.proceso_id, f.estacion, f.filename, f.comentario,
             f.created_at::text AS created_at,
             per.nombre AS operador_nombre
      FROM orden_avance_fotos f
      LEFT JOIN personal_taller per ON per.id = f.personal_id
      WHERE f.orden_id = $1
      ORDER BY f.created_at ASC
    `, [op.id])

    // 4) Historial de eventos (transiciones/asignaciones)
    const historialRes = await pool.query(`
      SELECT h.accion, h.estacion_origen, h.estacion_destino, h.motivo,
             h.timestamp::text AS ts,
             per_o.nombre AS operador_origen,
             per_d.nombre AS operador_destino
      FROM orden_historial h
      LEFT JOIN personal_taller per_o ON per_o.id = h.personal_origen_id
      LEFT JOIN personal_taller per_d ON per_d.id = h.personal_destino_id
      WHERE h.orden_id = $1
      ORDER BY h.timestamp ASC
    `, [op.id])

    // 5) Firmar URLs de fotos en paralelo
    const fotosConUrl = await Promise.all(
      fotosRes.rows.map(async (f: any) => ({
        ...f,
        url: await firmarUrlFoto(f.filename),
      }))
    )

    // ── Cálculos derivados ────────────────────────────────────────────
    const procesos = procesosRes.rows as any[]
    const completados = procesos.filter((p) => p.completado).length
    const pctCompleto = procesos.length > 0 ? Math.round((completados / procesos.length) * 100) : 0
    const operariosDistintos = new Set(procesos.filter((p) => p.operador_nombre).map((p) => p.operador_nombre)).size
    const totalFotos = fotosConUrl.length

    // Días transcurridos desde inicio
    let diasTranscurridos: number | null = null
    if (op.fecha_inicio) {
      const inicio = new Date(op.fecha_inicio)
      const fin = op.fecha_completada ? new Date(op.fecha_completada) : new Date()
      diasTranscurridos = Math.round((fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24))
    }

    // ETA cumplimiento
    let etaStatus: 'ok' | 'atrasado' | 'sin_fecha' = 'sin_fecha'
    if (op.fecha_entrega) {
      const eta = new Date(op.fecha_entrega)
      const hoy = new Date()
      if (op.status === 'Completada' && op.fecha_completada) {
        etaStatus = new Date(op.fecha_completada) <= eta ? 'ok' : 'atrasado'
      } else {
        etaStatus = hoy <= eta ? 'ok' : 'atrasado'
      }
    }

    const statusBadge: Record<string, { color: string; icon: string }> = {
      'Completada':  { color: '#065F46;background:#D1FAE5', icon: '✅' },
      'En Proceso':  { color: '#1E40AF;background:#DBEAFE', icon: '⏳' },
      'Pausada':     { color: '#92400E;background:#FEF3C7', icon: '⏸' },
      'Pendiente':   { color: '#4B5563;background:#F3F4F6', icon: '⚪' },
      'Cancelada':   { color: '#991B1B;background:#FEE2E2', icon: '❌' },
    }
    const st = statusBadge[op.status] || statusBadge.Pendiente

    // Agrupar fotos por proceso
    const fotosPorProceso = new Map<number, any[]>()
    const fotosSueltas: any[] = []
    for (const f of fotosConUrl) {
      if (f.proceso_id) {
        const list = fotosPorProceso.get(f.proceso_id) ?? []
        list.push(f)
        fotosPorProceso.set(f.proceso_id, list)
      } else {
        fotosSueltas.push(f)
      }
    }

    const generatedAt = new Date().toLocaleString('es-MX', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const fmtDT = (s: string | null | undefined): string => {
      if (!s) return '—'
      const d = new Date(s)
      if (isNaN(d.getTime())) return s
      return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
    const fmtDateOnly = (s: string | null | undefined): string => {
      if (!s) return '—'
      const d = new Date(s)
      if (isNaN(d.getTime())) return s
      return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    }
    const fmtMinutos = (m: number | null | undefined): string => {
      if (!m || m === 0) return '—'
      if (m < 60) return `${m} min`
      const h = Math.floor(m / 60)
      const min = m % 60
      return min === 0 ? `${h}h` : `${h}h ${min}min`
    }

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>OP ${escapeHtmlInline(op.numero_orden)} · Reporte · Central Millwork</title>
<style>
:root { --cream:#faf7f0; --cream-2:#f0ebe0; --forest:#2c3126; --forest-2:#4A5240; --gold:#9B7200; --gold-2:#dea832; --text:#1f1b14; --text-soft:#6b6356; --border:#dcd4c0; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--cream); color: var(--text); margin: 0; padding: 24px; max-width: 1100px; margin-left: auto; margin-right: auto; line-height: 1.5; }
header { border-bottom: 3px solid var(--gold); padding-bottom: 20px; margin-bottom: 24px; }
.op-title { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
h1 { color: var(--forest); margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; font-family: 'SF Mono', Menlo, monospace; }
.status-pill { padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
.subtitle { color: var(--text-soft); font-size: 15px; margin-top: 4px; }
.meta { color: var(--text-soft); font-size: 12px; margin-top: 8px; font-style: italic; }
section { background: white; border: 1px solid var(--border); border-radius: 10px; padding: 20px 24px; margin-bottom: 20px; }
h2 { color: var(--forest); margin: 0 0 16px; font-size: 18px; border-left: 4px solid var(--gold); padding-left: 12px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.kpi { background: var(--cream-2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; }
.kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-soft); font-weight: 600; margin-bottom: 4px; }
.kpi-value { font-size: 22px; font-weight: 700; color: var(--forest); font-variant-numeric: tabular-nums; }
.kpi-value.gold { color: var(--gold); font-size: 16px; }
.kpi-sub { font-size: 11px; color: var(--text-soft); margin-top: 4px; }

/* Timeline */
.timeline { position: relative; padding-left: 32px; }
.timeline::before { content: ''; position: absolute; left: 12px; top: 8px; bottom: 8px; width: 3px; background: var(--cream-2); border-radius: 2px; }
.step { position: relative; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px dashed var(--cream-2); }
.step:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.step-dot { position: absolute; left: -32px; top: 4px; width: 26px; height: 26px; border-radius: 50%; border: 3px solid var(--cream); background: var(--cream-2); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: white; z-index: 1; }
.step-dot.completado { background: #10B981; }
.step-dot.actual { background: var(--gold); animation: pulse 2s infinite; }
.step-dot.pendiente { background: #9CA3AF; }
@keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(155, 114, 0, 0.6); } 50% { box-shadow: 0 0 0 10px rgba(155, 114, 0, 0); } }
.step-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.step-name { font-size: 16px; font-weight: 700; color: var(--forest); text-transform: uppercase; letter-spacing: 0.5px; }
.step-body { color: var(--text); font-size: 13px; }
.step-info { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px 24px; margin: 8px 0; }
.info-row { display: flex; gap: 6px; font-size: 12px; }
.info-label { color: var(--text-soft); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; padding-top: 2px; }
.info-value { color: var(--text); }
.step-notas { background: var(--cream-2); padding: 10px 14px; border-radius: 6px; font-size: 13px; color: var(--forest-2); margin-top: 8px; font-style: italic; }

/* Fotos */
.fotos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; margin-top: 12px; }
.foto-card { background: var(--cream-2); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.foto-card img { width: 100%; height: 140px; object-fit: cover; display: block; background: var(--cream); }
.foto-meta { padding: 6px 10px; font-size: 10px; color: var(--text-soft); border-top: 1px solid var(--border); background: white; }
.foto-comment { font-size: 11px; color: var(--forest-2); font-style: italic; padding: 4px 10px 8px; background: white; }

/* Historial compacto */
.hist-item { display: flex; gap: 12px; padding: 6px 0; font-size: 12px; border-bottom: 1px solid var(--cream-2); }
.hist-time { color: var(--text-soft); font-family: 'SF Mono', Menlo, monospace; min-width: 130px; font-size: 11px; }
.hist-desc { color: var(--text); }

.badge { display: inline-block; padding: 3px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
.badge-red { background: #FEE2E2; color: #991B1B; }
.badge-amber { background: #FEF3C7; color: #92400E; }
.badge-emerald { background: #D1FAE5; color: #065F46; }
.badge-blue { background: #DBEAFE; color: #1E40AF; }
.badge-gray { background: #F3F4F6; color: #4B5563; }
.empty { text-align: center; color: var(--text-soft); font-style: italic; padding: 20px; background: var(--cream-2); border-radius: 6px; font-size: 13px; }
footer { text-align: center; color: var(--text-soft); font-size: 11px; margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border); }
@media print { body { background: white; padding: 12px; max-width: none; } section { break-inside: avoid; page-break-inside: avoid; } .foto-card img { max-height: 100px; } }
</style></head><body>
<header>
  <div class="op-title">
    <h1>${escapeHtmlInline(op.numero_orden)}</h1>
    <span class="status-pill" style="color:${st.color};">${st.icon} ${escapeHtmlInline(op.status)}</span>
  </div>
  <div class="subtitle">
    ${op.proyecto_codigo ? `<strong>${escapeHtmlInline(op.proyecto_codigo)}</strong> · ` : ''}
    ${escapeHtmlInline(op.proyecto_nombre ?? 'Sin proyecto')} · Item <strong>${escapeHtmlInline(op.numero_item)}</strong> · ${escapeHtmlInline(op.cantidad)} ${escapeHtmlInline(op.unidad ?? 'Piezas')}
  </div>
  ${op.especificaciones ? `<div class="subtitle" style="margin-top: 6px; font-size: 13px;">${escapeHtmlInline(op.especificaciones)}</div>` : ''}
  <div class="meta">Generado ${escapeHtmlInline(generatedAt)}</div>
</header>

<section>
  <h2>Resumen</h2>
  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-label">Progreso</div>
      <div class="kpi-value">${pctCompleto}%</div>
      <div class="kpi-sub">${completados} de ${procesos.length} procesos</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Estación actual</div>
      <div class="kpi-value" style="font-size: 15px; text-transform: uppercase;">${escapeHtmlInline(op.estacion_actual ?? '—')}</div>
      <div class="kpi-sub">${op.personal_asignado_id ? `Asignado: ${escapeHtmlInline(op.asignado_nombre ?? '#' + op.personal_asignado_id)}` : 'Sin asignar'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Prioridad</div>
      <div class="kpi-value" style="font-size: 15px;">${escapeHtmlInline(op.prioridad ?? 'Media')}</div>
      <div class="kpi-sub">${op.tiempo_estimado_horas ? `Est. ${op.tiempo_estimado_horas}h` : 'Sin estimación'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Fecha entrega</div>
      <div class="kpi-value" style="font-size: 15px;">${escapeHtmlInline(fmtDateOnly(op.fecha_entrega))}</div>
      <div class="kpi-sub">${etaStatus === 'ok' ? '<span class="badge badge-emerald">A tiempo</span>' : etaStatus === 'atrasado' ? '<span class="badge badge-red">Vencida</span>' : 'Sin fecha'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Días transcurridos</div>
      <div class="kpi-value">${diasTranscurridos !== null ? diasTranscurridos : '—'}</div>
      <div class="kpi-sub">${op.fecha_inicio ? `Inicio: ${escapeHtmlInline(fmtDateOnly(op.fecha_inicio))}` : 'Aún no iniciada'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Operarios</div>
      <div class="kpi-value">${operariosDistintos}</div>
      <div class="kpi-sub">Distintos han trabajado</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Fotos subidas</div>
      <div class="kpi-value">${totalFotos}</div>
      <div class="kpi-sub">Evidencia visual</div>
    </div>
  </div>
</section>

<section>
  <h2>Recorrido productivo — proceso por proceso</h2>
  ${procesos.length === 0 ? '<div class="empty">Esta OP no tiene procesos definidos</div>' : `
  <div class="timeline">
    ${procesos.map((p: any) => {
      const isActual = !p.completado && op.estacion_actual === p.estacion
      const dotClass = p.completado ? 'completado' : isActual ? 'actual' : 'pendiente'
      const dotIcon = p.completado ? '✓' : isActual ? '●' : '○'
      const fotosDeEste = fotosPorProceso.get(p.id) ?? []
      const tiempoEst = p.tiempo_estimado_minutos
      const tiempoReal = p.tiempo_real_minutos
      let tiempoBadge = ''
      if (tiempoEst && tiempoReal) {
        const pct = Math.round((tiempoReal / tiempoEst) * 100)
        const cls = pct <= 100 ? 'badge-emerald' : pct <= 120 ? 'badge-amber' : 'badge-red'
        tiempoBadge = `<span class="badge ${cls}">${pct}% del estimado</span>`
      }
      return `
      <div class="step">
        <div class="step-dot ${dotClass}">${dotIcon}</div>
        <div class="step-header">
          <div class="step-name">${escapeHtmlInline(p.estacion)}</div>
          ${p.completado ? '<span class="badge badge-emerald">Completado</span>' : isActual ? '<span class="badge badge-amber">En proceso ahora</span>' : '<span class="badge badge-gray">Pendiente</span>'}
          ${p.requerido ? '' : '<span class="badge badge-blue">Opcional</span>'}
          ${tiempoBadge}
        </div>
        <div class="step-body">
          <div class="step-info">
            <div class="info-row"><span class="info-label">Inicio:</span><span class="info-value">${escapeHtmlInline(fmtDT(p.fecha_inicio))}</span></div>
            <div class="info-row"><span class="info-label">Fin:</span><span class="info-value">${escapeHtmlInline(fmtDT(p.fecha_fin))}</span></div>
            <div class="info-row"><span class="info-label">Tiempo estimado:</span><span class="info-value">${fmtMinutos(tiempoEst)}</span></div>
            <div class="info-row"><span class="info-label">Tiempo real:</span><span class="info-value">${fmtMinutos(tiempoReal)}</span></div>
            <div class="info-row"><span class="info-label">Operador:</span><span class="info-value">${escapeHtmlInline(p.operador_nombre ?? '—')}</span></div>
            <div class="info-row"><span class="info-label">Secuencia:</span><span class="info-value">#${escapeHtmlInline(p.secuencia)}</span></div>
          </div>
          ${p.notas ? `<div class="step-notas">📝 ${escapeHtmlInline(p.notas)}</div>` : ''}
          ${fotosDeEste.length > 0 ? `
          <div style="margin-top: 12px;">
            <div style="font-size: 11px; color: var(--text-soft); text-transform: uppercase; letter-spacing: 1px; font-weight: 600; margin-bottom: 6px;">📸 ${fotosDeEste.length} foto${fotosDeEste.length > 1 ? 's' : ''} de este proceso</div>
            <div class="fotos-grid">
              ${fotosDeEste.map((f: any) => f.url ? `
              <div class="foto-card">
                <a href="${escapeHtmlInline(f.url)}" target="_blank" rel="noopener"><img src="${escapeHtmlInline(f.url)}" alt="Foto de avance" loading="lazy"></a>
                ${f.comentario ? `<div class="foto-comment">"${escapeHtmlInline(f.comentario)}"</div>` : ''}
                <div class="foto-meta">${escapeHtmlInline(fmtDT(f.created_at))}${f.operador_nombre ? ` · ${escapeHtmlInline(f.operador_nombre)}` : ''}</div>
              </div>` : `<div class="foto-card"><div class="foto-meta" style="padding: 40px 10px; text-align: center;">Foto no disponible</div></div>`).join('')}
            </div>
          </div>` : ''}
        </div>
      </div>`
    }).join('')}
  </div>`}
</section>

${fotosSueltas.length > 0 ? `
<section>
  <h2>Fotos generales <span style="font-size: 12px; color: var(--text-soft); font-weight: normal;">(sin proceso asociado)</span></h2>
  <div class="fotos-grid">
    ${fotosSueltas.map((f: any) => f.url ? `
    <div class="foto-card">
      <a href="${escapeHtmlInline(f.url)}" target="_blank" rel="noopener"><img src="${escapeHtmlInline(f.url)}" alt="Foto" loading="lazy"></a>
      ${f.comentario ? `<div class="foto-comment">"${escapeHtmlInline(f.comentario)}"</div>` : ''}
      <div class="foto-meta">${escapeHtmlInline(fmtDT(f.created_at))}${f.estacion ? ` · ${escapeHtmlInline(f.estacion)}` : ''}${f.operador_nombre ? ` · ${escapeHtmlInline(f.operador_nombre)}` : ''}</div>
    </div>` : '').join('')}
  </div>
</section>` : ''}

${historialRes.rows.length > 0 ? `
<section>
  <h2>Historial de eventos</h2>
  <div>
    ${historialRes.rows.map((h: any) => `
    <div class="hist-item">
      <div class="hist-time">${escapeHtmlInline(fmtDT(h.ts))}</div>
      <div class="hist-desc">
        <strong>${escapeHtmlInline(h.accion)}</strong>${h.estacion_origen ? ` de <em>${escapeHtmlInline(h.estacion_origen)}</em>` : ''}${h.estacion_destino && h.estacion_destino !== h.estacion_origen ? ` a <em>${escapeHtmlInline(h.estacion_destino)}</em>` : ''}
        ${h.operador_destino ? ` · Operador: ${escapeHtmlInline(h.operador_destino)}` : ''}
        ${h.motivo ? `<br><span style="color: var(--text-soft); font-style: italic;">Motivo: ${escapeHtmlInline(h.motivo)}</span>` : ''}
      </div>
    </div>`).join('')}
  </div>
</section>` : ''}

${op.notas ? `
<section>
  <h2>Notas de la orden</h2>
  <div style="white-space: pre-wrap; font-size: 13px; color: var(--forest-2);">${escapeHtmlInline(op.notas)}</div>
</section>` : ''}

<footer>Central Millwork · Reporte generado desde el sistema de producción</footer>
</body></html>`

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.send(html)
  } catch (err) {
    next(err)
  }
}
