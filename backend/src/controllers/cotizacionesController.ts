import { Request, Response, NextFunction } from 'express'
import nodemailer from 'nodemailer'
import pool from '../db/pool'
import { parsePagination, paginatedResponse } from '../utils/pagination'
import { createError } from '../middleware/errorHandler'

// Reusable transporter for Outlook 365 SMTP
const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // STARTTLS on port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

async function sendViaSMTP(to: string, subject: string, htmlBody: string): Promise<void> {
  const info = await smtpTransporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html: htmlBody,
  })
  console.log(`[SMTP] enviado a ${to} | messageId=${info.messageId}`)
}

interface MaterialRow {
  codigo: string; descripcion: string; unidad: string; color: string | null
  size: string | null; qty: number; unit_price: number; total_price: number
  manufacturer: string | null; notas: string | null
}

interface ProyectoRow { codigo: string; nombre: string; cliente: string }

function buildEmailHtml(proyecto: ProyectoRow, vendor: string, materiales: MaterialRow[]): string {
  const rows = materiales.map((m) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;">${m.codigo ?? ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;">${m.descripcion ?? ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center;">${m.color ?? ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center;">${m.size ?? ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center;">${m.unidad ?? ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">${m.qty ?? ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">&nbsp;</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:900px;margin:0 auto;padding:20px;">
  <div style="background:#2c3126;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;color:#dea832;">Central Millwork</h1>
    <p style="margin:4px 0 0;font-size:13px;color:#aaa;">Quote Request</p>
  </div>
  <div style="background:#f9f9f7;padding:20px 24px;border:1px solid #ddd;border-top:none;">
    <p><strong>Dear ${vendor} team,</strong></p>
    <p>We are requesting a quote for the following materials for project <strong>${proyecto.codigo} - ${proyecto.nombre}</strong>.</p>
    <p>Please fill in the <strong>Unit Price</strong> column and reply to this email.</p>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:0;border:1px solid #ddd;border-top:none;">
    <thead>
      <tr style="background:#4A5240;color:#fff;">
        <th style="padding:10px;text-align:left;">CM Code</th>
        <th style="padding:10px;text-align:left;">Description</th>
        <th style="padding:10px;text-align:center;">Color</th>
        <th style="padding:10px;text-align:center;">Size</th>
        <th style="padding:10px;text-align:center;">Unit</th>
        <th style="padding:10px;text-align:right;">QTY</th>
        <th style="padding:10px;text-align:right;background:#5c6b50;">Unit Price</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="padding:16px 24px;border:1px solid #ddd;border-top:none;font-size:12px;color:#888;">
    <p style="margin:0;"><strong>Central Millwork</strong></p>
  </div>
</body>
</html>`
}

export async function getCotizaciones(req: Request, res: Response, next: NextFunction) {
  try {
    const opts = parsePagination(req, 'sc.fecha_solicitud')
    const conds: string[] = []
    if (req.query.estado)     conds.push(`sc.estado = '${req.query.estado}'`)
    if (req.query.proyecto_id) conds.push(`sc.proyecto_id = ${parseInt(String(req.query.proyecto_id))}`)

    const whereMain  = opts.search
      ? [...conds, `(sc.folio ILIKE $3 OR p.nombre ILIKE $3 OR v.nombre ILIKE $3)`].join(' AND ')
      : conds.join(' AND ')
    const whereCount = opts.search
      ? [...conds, `(sc.folio ILIKE $1 OR p.nombre ILIKE $1 OR v.nombre ILIKE $1)`].join(' AND ')
      : conds.join(' AND ')

    const wm = whereMain  ? `WHERE ${whereMain}`  : ''
    const wc = whereCount ? `WHERE ${whereCount}` : ''
    const joins = `LEFT JOIN proyectos  p ON p.id = sc.proyecto_id
                   LEFT JOIN proveedores v ON v.id = sc.proveedor_id`

    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT sc.*,
           json_build_object('id', p.id, 'nombre', p.nombre) AS proyecto,
           json_build_object('id', v.id, 'nombre', v.nombre) AS proveedor
         FROM solicitudes_cotizacion sc ${joins} ${wm}
         ORDER BY ${opts.sort} ${opts.order} LIMIT $1 OFFSET $2`,
        opts.search ? [opts.limit, opts.offset, `%${opts.search}%`] : [opts.limit, opts.offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM solicitudes_cotizacion sc ${joins} ${wc}`,
        opts.search ? [`%${opts.search}%`] : []
      ),
    ])

    res.json(paginatedResponse(rows.rows, parseInt(countRow.rows[0].count), opts))
  } catch (err) { next(err) }
}

export async function getCotizacion(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows: [cot] } = await pool.query(
      `SELECT sc.*,
         json_build_object('id', p.id, 'nombre', p.nombre) AS proyecto,
         json_build_object('id', v.id, 'nombre', v.nombre) AS proveedor
       FROM solicitudes_cotizacion sc
       LEFT JOIN proyectos  p ON p.id = sc.proyecto_id
       LEFT JOIN proveedores v ON v.id = sc.proveedor_id
       WHERE sc.id = $1`,
      [req.params.id]
    )
    if (!cot) return next(createError('Cotización no encontrada', 404))
    res.json({ data: cot })
  } catch (err) { next(err) }
}

export async function createCotizacion(req: Request, res: Response, next: NextFunction) {
  try {
    const { proyecto_id, proveedor_id, fecha_solicitud, notas } = req.body
    if (!proyecto_id || !proveedor_id)
      return next(createError('proyecto_id y proveedor_id son requeridos', 400))

    const { rows: [last] } = await pool.query(
      `SELECT folio FROM solicitudes_cotizacion ORDER BY id DESC LIMIT 1`
    )
    const seq = last ? parseInt(last.folio.split('-')[2] ?? '0') + 1 : 1
    const folio = `COT-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`

    const { rows } = await pool.query(
      `INSERT INTO solicitudes_cotizacion (folio, proyecto_id, proveedor_id, fecha_solicitud, notas)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [folio, proyecto_id, proveedor_id, fecha_solicitud ?? new Date(), notas ?? null]
    )
    res.status(201).json({ data: rows[0], message: `Solicitud ${folio} creada` })
  } catch (err) { next(err) }
}

export async function updateCotizacion(req: Request, res: Response, next: NextFunction) {
  try {
    const fields = ['estado', 'fecha_respuesta', 'monto_cotizado', 'notas']
    const updates = fields.filter((f) => req.body[f] !== undefined).map((f, i) => `${f} = $${i + 2}`)
    if (!updates.length) return next(createError('Sin campos para actualizar', 400))
    const values = fields.filter((f) => req.body[f] !== undefined).map((f) => req.body[f])
    const { rows } = await pool.query(
      `UPDATE solicitudes_cotizacion SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    )
    if (!rows[0]) return next(createError('Cotización no encontrada', 404))
    res.json({ data: rows[0], message: 'Cotización actualizada' })
  } catch (err) { next(err) }
}

export async function aprobarCotizacion(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [cot] } = await client.query(
      `UPDATE solicitudes_cotizacion SET estado = 'aprobada', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    )
    if (!cot) return next(createError('Cotización no encontrada', 404))

    await client.query(
      `UPDATE solicitudes_cotizacion SET estado = 'rechazada', updated_at = NOW()
       WHERE proyecto_id = $1 AND id != $2 AND estado = 'recibida'`,
      [cot.proyecto_id, cot.id]
    )
    await client.query('COMMIT')
    res.json({ data: cot, message: 'Cotización aprobada' })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally { client.release() }
}

export async function deleteCotizacion(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows: [cot] } = await pool.query(
      `SELECT estado FROM solicitudes_cotizacion WHERE id = $1`, [req.params.id]
    )
    if (!cot) return next(createError('Cotización no encontrada', 404))
    if (cot.estado === 'aprobada')
      return next(createError('No se puede eliminar una cotización aprobada', 409))
    await pool.query('DELETE FROM solicitudes_cotizacion WHERE id = $1', [req.params.id])
    res.json({ message: 'Cotización eliminada' })
  } catch (err) { next(err) }
}

export async function getVendorEmails(req: Request, res: Response, next: NextFunction) {
  try {
    const proyecto_id = parseInt(String(req.query.proyecto_id))
    if (!proyecto_id) return next(createError('proyecto_id requerido', 400))

    const { rows } = await pool.query<{ vendor: string; email: string | null }>(
      `SELECT DISTINCT m.vendor, p.email
       FROM materiales_mto m
       LEFT JOIN proveedores p
         ON LOWER(TRIM(p.nombre)) = LOWER(TRIM(m.vendor))
       WHERE m.proyecto_id = $1
         AND m.cotizar = 'SI'
         AND m.vendor IS NOT NULL AND m.vendor != ''
       ORDER BY m.vendor`,
      [proyecto_id]
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
}

export async function enviarCotizaciones(req: Request, res: Response, next: NextFunction) {
  console.log(`[cotizaciones] POST recibido - ${new Date().toISOString()} - vendors: ${JSON.stringify(req.body.vendors)}`)
  try {
    const { proyecto_id, vendors } = req.body as {
      proyecto_id: number
      vendors: Array<{ vendor: string; email_to: string }>
    }
    if (!proyecto_id || !Array.isArray(vendors) || !vendors.length)
      return next(createError('proyecto_id y vendors son requeridos', 400))

    // Deduplicate and reject any entry with empty email_to
    const seen = new Set<string>()
    const validVendors = vendors.filter(({ vendor, email_to }) => {
      if (!vendor || !email_to?.trim()) {
        console.warn(`[enviar] skipping vendor "${vendor}" — email_to vacío`)
        return false
      }
      if (seen.has(vendor)) {
        console.warn(`[enviar] skipping duplicate vendor "${vendor}"`)
        return false
      }
      seen.add(vendor)
      return true
    })

    console.log(`[enviar] proyecto_id=${proyecto_id} | vendors recibidos=${vendors.length} | válidos=${validVendors.length}`)
    validVendors.forEach(({ vendor, email_to }) => console.log(`  → ${vendor} <${email_to}>`))

    if (!validVendors.length)
      return next(createError('No hay vendors válidos con email para enviar', 400))

    const { rows: [proyecto] } = await pool.query<ProyectoRow>(
      `SELECT codigo, nombre, cliente FROM proyectos WHERE id = $1`, [proyecto_id]
    )
    if (!proyecto) return next(createError('Proyecto no encontrado', 404))

    const { rows: [last] } = await pool.query(
      `SELECT folio FROM solicitudes_cotizacion ORDER BY id DESC LIMIT 1`
    )
    let seq = last ? parseInt(last.folio.split('-')[2] ?? '0') + 1 : 1

    const results: Array<{ vendor: string; folio: string; preview_url: null; materiales_count: number }> = []

    for (const { vendor, email_to } of validVendors) {
      const { rows: materiales } = await pool.query<MaterialRow>(
        `SELECT codigo, descripcion, unidad, color, size, qty, unit_price, total_price, manufacturer, notas
         FROM materiales_mto
         WHERE proyecto_id = $1 AND vendor = $2 AND cotizar = 'SI'
         ORDER BY item NULLS LAST, codigo`,
        [proyecto_id, vendor]
      )
      if (!materiales.length) continue

      const html    = buildEmailHtml(proyecto, vendor, materiales)
      const subject = `Quote Request - ${proyecto.codigo} - ${vendor} - Central Millwork`

      await sendViaSMTP(email_to, subject, html)

      const folio = `COT-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`
      seq++

      await pool.query(
        `INSERT INTO solicitudes_cotizacion
           (folio, proyecto_id, vendor, fecha_solicitud, fecha_envio,
            email_destinatario, materiales_incluidos, estado)
         VALUES ($1,$2,$3,NOW(),NOW(),$4,$5,'enviada')`,
        [
          folio, proyecto_id, vendor, email_to,
          JSON.stringify(materiales.map((m) => ({
            codigo: m.codigo, descripcion: m.descripcion, qty: m.qty, unidad: m.unidad,
          }))),
        ]
      )

      results.push({ vendor, folio, preview_url: null, materiales_count: materiales.length })
    }

   res.json({ data: results, message: `${results.length} cotización(es) enviada(s) por correo` })
  } catch (err) { next(err) }
}
