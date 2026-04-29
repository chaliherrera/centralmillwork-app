import { Request, Response, NextFunction } from 'express'
import path from 'path'
import fs from 'fs'
import pool from '../db/pool'
import { uploadToGitHub } from '../utils/github'
import { createError } from '../middleware/errorHandler'

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
  const json = JSON.stringify(data)
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
