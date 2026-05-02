import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { parsePagination, paginatedResponse } from '../utils/pagination'
import { createError } from '../middleware/errorHandler'

interface ProyectoRow { codigo: string; nombre: string; cliente: string }

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

// Registra que las cotizaciones para los vendors indicados fueron enviadas
// (vía PDF + email manual fuera del sistema). NO envía email automáticamente.
// Antes mandaba via SMTP/Outlook pero la auth de M365 era inestable; ahora
// el frontend genera un PDF y el usuario envía el mail manualmente.
export async function marcarCotizacionesEnviadas(req: Request, res: Response, next: NextFunction) {
  console.log(`[cotizaciones] POST marcar-enviadas - ${new Date().toISOString()} - vendors: ${JSON.stringify(req.body.vendors)}`)
  try {
    const { proyecto_id, vendors } = req.body as {
      proyecto_id: number
      vendors: Array<{ vendor: string }>
    }
    if (!proyecto_id || !Array.isArray(vendors) || !vendors.length)
      return next(createError('proyecto_id y vendors son requeridos', 400))

    const seen = new Set<string>()
    const validVendors = vendors.filter(({ vendor }) => {
      if (!vendor) return false
      if (seen.has(vendor)) return false
      seen.add(vendor)
      return true
    })

    if (!validVendors.length)
      return next(createError('No hay vendors válidos para registrar', 400))

    const { rows: [proyecto] } = await pool.query<ProyectoRow>(
      `SELECT codigo, nombre, cliente FROM proyectos WHERE id = $1`, [proyecto_id]
    )
    if (!proyecto) return next(createError('Proyecto no encontrado', 404))

    const { rows: [last] } = await pool.query(
      `SELECT folio FROM solicitudes_cotizacion ORDER BY id DESC LIMIT 1`
    )
    let seq = last ? parseInt(last.folio.split('-')[2] ?? '0') + 1 : 1

    const results: Array<{ vendor: string; folio: string; materiales_count: number }> = []

    for (const { vendor } of validVendors) {
      const { rows: materiales } = await pool.query(
        `SELECT codigo, descripcion, unidad, qty
         FROM materiales_mto
         WHERE proyecto_id = $1 AND vendor = $2 AND cotizar = 'SI'
         ORDER BY item NULLS LAST, codigo`,
        [proyecto_id, vendor]
      )
      if (!materiales.length) continue

      const folio = `COT-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`
      seq++

      await pool.query(
        `INSERT INTO solicitudes_cotizacion
           (folio, proyecto_id, vendor, fecha_solicitud, fecha_envio,
            email_destinatario, materiales_incluidos, estado)
         VALUES ($1,$2,$3,NOW(),NOW(),NULL,$4,'enviada')`,
        [folio, proyecto_id, vendor, JSON.stringify(materiales)]
      )

      results.push({ vendor, folio, materiales_count: materiales.length })
    }

    res.json({ data: results, message: `${results.length} cotización(es) marcada(s) como enviada(s)` })
  } catch (err) { next(err) }
}

