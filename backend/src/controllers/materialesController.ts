import { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import * as XLSX from 'xlsx'
import pool from '../db/pool'
import { parsePagination, paginatedResponse } from '../utils/pagination'
import { createError } from '../middleware/errorHandler'

export const uploadExcel = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (/\.(xlsx|xls|csv)$/i.test(file.originalname)) cb(null, true)
    else cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls) o CSV') as any, false)
  },
  limits: { fileSize: 20 * 1024 * 1024 },
})

export async function getMaterialesImportDates(req: Request, res: Response, next: NextFunction) {
  try {
    const { proyecto_id } = req.query
    if (!proyecto_id) return next(createError('proyecto_id es requerido', 400))
    const { rows } = await pool.query(
      `SELECT DISTINCT fecha_importacion, fecha_importacion::text AS fecha
       FROM materiales_mto
       WHERE proyecto_id = $1 AND fecha_importacion IS NOT NULL
       ORDER BY fecha_importacion DESC`,
      [parseInt(String(proyecto_id))]
    )
    res.json({ data: rows.map((r) => r.fecha) })
  } catch (err) { next(err) }
}

export async function getMateriales(req: Request, res: Response, next: NextFunction) {
  try {
    const opts = parsePagination(req, 'm.descripcion')
    const conds: string[] = []

    if (req.query.proyecto_id)       conds.push(`m.proyecto_id = ${parseInt(String(req.query.proyecto_id))}`)
    if (req.query.vendor)            conds.push(`m.vendor = '${String(req.query.vendor).replace(/'/g, "''")}'`)
    if (req.query.estado_cotiz)      conds.push(`m.estado_cotiz = '${String(req.query.estado_cotiz).replace(/'/g, "''")}'`)
    if (req.query.cotizar)           conds.push(`m.cotizar = '${String(req.query.cotizar).replace(/'/g, "''")}'`)
    if (req.query.categoria)         conds.push(`m.categoria = '${String(req.query.categoria).replace(/'/g, "''")}'`)
    if (req.query.fecha_importacion) conds.push(`m.fecha_importacion = '${String(req.query.fecha_importacion).replace(/'/g, "''")}'`)

    const whereMain  = opts.search
      ? [...conds, `(m.descripcion ILIKE $3 OR m.codigo ILIKE $3 OR m.vendor ILIKE $3)`].join(' AND ')
      : conds.join(' AND ')
    const whereCount = opts.search
      ? [...conds, `(m.descripcion ILIKE $1 OR m.codigo ILIKE $1 OR m.vendor ILIKE $1)`].join(' AND ')
      : conds.join(' AND ')

    const wm = whereMain  ? `WHERE ${whereMain}`  : ''
    const wc = whereCount ? `WHERE ${whereCount}` : ''
    const join = `LEFT JOIN proyectos p ON p.id = m.proyecto_id`

    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT m.*,
           json_build_object('id', p.id, 'nombre', p.nombre, 'codigo', p.codigo) AS proyecto
         FROM materiales_mto m ${join} ${wm}
         ORDER BY ${opts.sort} ${opts.order} LIMIT $1 OFFSET $2`,
        opts.search ? [opts.limit, opts.offset, `%${opts.search}%`] : [opts.limit, opts.offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM materiales_mto m ${join} ${wc}`,
        opts.search ? [`%${opts.search}%`] : []
      ),
    ])

    res.json(paginatedResponse(rows.rows, parseInt(countRow.rows[0].count), opts))
  } catch (err) { next(err) }
}

export async function getMaterialesKpis(req: Request, res: Response, next: NextFunction) {
  try {
    const { proyecto_id } = req.query
    if (!proyecto_id) return next(createError('proyecto_id es requerido', 400))

    const { rows } = await pool.query(
      `SELECT
         COUNT(*)                                              AS total,
         COUNT(*) FILTER (WHERE estado_cotiz = 'COTIZADO')    AS cotizados,
         COUNT(*) FILTER (WHERE estado_cotiz = 'PENDIENTE')   AS pendientes,
         COALESCE(SUM(total_price), 0)                        AS total_usd,
         COALESCE(SUM(total_price) FILTER (WHERE estado_cotiz = 'COTIZADO'), 0) AS cotizado_usd,
         COUNT(DISTINCT vendor) FILTER (WHERE vendor != '')   AS vendors,
         COUNT(*) FILTER (WHERE mill_made = 'SI')             AS mill_made_count,
         (SELECT COUNT(*) FROM proyectos WHERE estado = 'activo') AS proyectos_activos
       FROM materiales_mto WHERE proyecto_id = $1`,
      [parseInt(String(proyecto_id))]
    )
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
}

export async function getMaterial(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query(
      `SELECT m.*, json_build_object('id', p.id, 'nombre', p.nombre, 'codigo', p.codigo) AS proyecto
       FROM materiales_mto m LEFT JOIN proyectos p ON p.id = m.proyecto_id
       WHERE m.id = $1`,
      [req.params.id]
    )
    if (!rows[0]) return next(createError('Material no encontrado', 404))
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
}

export async function getMaterialOcInfo(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query(
      `SELECT
         m.id   AS material_id,
         m.notas AS material_notas,
         m.vendor,
         oc.id           AS oc_id,
         oc.numero       AS oc_numero,
         oc.estado       AS oc_estado_raw,
         oc.fecha_emision,
         oc.notas        AS oc_notas,
         (SELECT r.fecha_recepcion
          FROM recepciones r
          WHERE r.orden_compra_id = oc.id
          ORDER BY r.fecha_recepcion DESC
          LIMIT 1) AS fecha_recepcion
       FROM materiales_mto m
       LEFT JOIN LATERAL (
         SELECT o.*
         FROM ordenes_compra o
         JOIN proveedores pv ON pv.id = o.proveedor_id
         WHERE o.proyecto_id = m.proyecto_id
           AND pv.nombre     ILIKE m.vendor
           AND o.estado      != 'cancelada'
         ORDER BY
           CASE WHEN o.fecha_emision <= COALESCE(m.fecha_importacion, m.created_at::date) THEN 0 ELSE 1 END ASC,
           o.fecha_emision DESC
         LIMIT 1
       ) oc ON true
       WHERE m.id = $1`,
      [req.params.id]
    )
    if (!rows[0]) return next(createError('Material no encontrado', 404))

    const row = rows[0]
    let oc_status: 'ORDENADO' | 'EN EL TALLER' | null = null
    let fecha: string | null = null

    if (row.oc_id) {
      if (row.fecha_recepcion) {
        oc_status = 'EN EL TALLER'
        fecha = row.fecha_recepcion
      } else {
        oc_status = 'ORDENADO'
        fecha = row.fecha_emision ?? null
      }
    }

    res.json({
      data: {
        oc_id: row.oc_id ?? null,
        oc_numero: row.oc_numero ?? null,
        oc_status,
        fecha,
        oc_notas: row.oc_notas ?? null,
        material_notas: row.material_notas ?? null,
        vendor: row.vendor ?? null,
      }
    })
  } catch (err) { next(err) }
}

export async function createMaterial(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      proyecto_id, item, codigo, vendor_code, vendor,
      descripcion, color, categoria, unidad, size,
      qty, unit_price, total_price, estado_cotiz, mill_made, cotizar, manufacturer, notas, fecha_importacion,
    } = req.body
    if (!descripcion) return next(createError('descripcion es requerida', 400))
    const tp = total_price ?? (Number(qty || 0) * Number(unit_price || 0))
    const { rows } = await pool.query(
      `INSERT INTO materiales_mto
         (proyecto_id, item, codigo, vendor_code, vendor, descripcion, color, categoria, unidad, size,
          qty, unit_price, total_price, estado_cotiz, mill_made, cotizar, manufacturer, notas, fecha_importacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [
        proyecto_id ?? null, item ?? '', codigo ?? '', vendor_code ?? '', vendor ?? '',
        descripcion, color ?? '', categoria ?? '', unidad ?? 'EACH', size ?? '',
        Number(qty) || 0, Number(unit_price) || 0, Number(tp) || 0,
        estado_cotiz ?? 'PENDIENTE', mill_made ?? 'NO', cotizar ?? 'SI', manufacturer ?? '', notas ?? null,
        fecha_importacion ?? null,
      ]
    )
    res.status(201).json({ data: rows[0], message: 'Material creado' })
  } catch (err) { next(err) }
}

export async function updateMaterial(req: Request, res: Response, next: NextFunction) {
  try {
    const ALLOWED_FIELDS = [
      'proyecto_id', 'item', 'codigo', 'vendor_code', 'vendor',
      'descripcion', 'color', 'categoria', 'unidad', 'size',
      'qty', 'unit_price', 'total_price', 'estado_cotiz', 'mill_made',
      'cotizar', 'manufacturer', 'notas', 'fecha_importacion',
    ]

    // Coerce values that would cause PostgreSQL type errors if sent as empty string
    const coerce = (field: string, raw: unknown): unknown => {
      if (field === 'proyecto_id') return (raw === 0 || raw === '' || raw === null) ? null : Number(raw)
      if (field === 'fecha_importacion') return (raw === '' || raw === null) ? null : raw
      if (field === 'notas') return (raw === '') ? null : raw
      return raw
    }

    const present = ALLOWED_FIELDS.filter((f) => req.body[f] !== undefined)
    if (!present.length) return next(createError('Sin campos para actualizar', 400))

    const updates = present.map((f, i) => `${f} = $${i + 2}`)
    const values  = present.map((f) => coerce(f, req.body[f]))

    console.log(`[updateMaterial] id=${req.params.id} fields=[${present.join(', ')}]`)

    const { rows } = await pool.query(
      `UPDATE materiales_mto SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    )
    if (!rows[0]) return next(createError('Material no encontrado', 404))
    res.json({ data: rows[0], message: 'Material actualizado' })
  } catch (err: any) {
    console.error(`[updateMaterial] ERROR id=${req.params.id}: ${err?.message}`)
    console.error(`[updateMaterial] body:`, JSON.stringify(req.body))
    next(err)
  }
}

export async function deleteMaterial(req: Request, res: Response, next: NextFunction) {
  try {
    const { rowCount } = await pool.query('DELETE FROM materiales_mto WHERE id = $1', [req.params.id])
    if (!rowCount) return next(createError('Material no encontrado', 404))
    res.json({ message: 'Material eliminado' })
  } catch (err) { next(err) }
}

export async function getPreciosFreight(req: Request, res: Response, next: NextFunction) {
  try {
    const { proyecto_id, vendor } = req.query
    if (!proyecto_id || !vendor) return next(createError('proyecto_id y vendor son requeridos', 400))
    const { rows } = await pool.query(
      `SELECT freight FROM mto_freight WHERE proyecto_id = $1 AND vendor = $2`,
      [parseInt(String(proyecto_id)), String(vendor)]
    )
    res.json({ data: { freight: Number(rows[0]?.freight ?? 0) } })
  } catch (err) { next(err) }
}

export async function importarMateriales(req: Request, res: Response, next: NextFunction) {
  if (!req.file) return next(createError('No se recibió archivo', 400))
  const { proyecto_id, modo = 'agregar' } = req.body
  if (!proyecto_id) return next(createError('proyecto_id es requerido', 400))
  const proyId = parseInt(String(proyecto_id))

  // ── Smart header mapping ───────────────────────────────────────────────────
  const ALIASES: Record<string, string> = {
    // item
    'item': 'item', 'item #': 'item', 'item no': 'item', 'item no.': 'item',
    'line': 'item', 'line #': 'item', 'no.': 'item', '#': 'item',

    // cm code
    'cm code': 'codigo', 'cm_code': 'codigo', 'cmcode': 'codigo',
    'cm#': 'codigo', 'cm #': 'codigo', 'code': 'codigo', 'part number': 'codigo',
    'part no': 'codigo', 'part no.': 'codigo', 'sku': 'codigo', 'ref': 'codigo',

    // vendor code
    'vendor code': 'vendor_code', 'vendor_code': 'vendor_code', 'vendorcode': 'vendor_code',
    'vendor part': 'vendor_code', 'vendor part no': 'vendor_code', 'vendor #': 'vendor_code',
    'supplier code': 'vendor_code', 'supplier part': 'vendor_code', 'mfr part': 'vendor_code',
    'mfr part no': 'vendor_code', 'mfr#': 'vendor_code',

    // vendor / supplier
    'vendor': 'vendor', 'supplier': 'vendor', 'proveedor': 'vendor',
    'vendor name': 'vendor', 'supplier name': 'vendor',

    // description
    'description': 'descripcion', 'descripcion': 'descripcion', 'descripción': 'descripcion',
    'material description': 'descripcion', 'material desc': 'descripcion',
    'desc': 'descripcion', 'product description': 'descripcion', 'item description': 'descripcion',
    'name': 'descripcion', 'product name': 'descripcion', 'material name': 'descripcion',

    // color / finish
    'color': 'color', 'color/finish': 'color', 'colour/finish': 'color',
    'finish': 'color', 'colour': 'color', 'color finish': 'color',

    // manufacturer
    'manufacturer': 'manufacturer', 'brand': 'manufacturer', 'marca': 'manufacturer',
    'mfr': 'manufacturer', 'mfg': 'manufacturer', 'make': 'manufacturer',
    'fabricante': 'manufacturer',

    // category
    'category': 'categoria', 'categoría': 'categoria', 'categoria': 'categoria',
    'cat': 'categoria', 'cat.': 'categoria', 'type': 'categoria', 'product type': 'categoria',
    'material type': 'categoria',

    // unit
    'unit': 'unidad', 'unidad': 'unidad', 'uom': 'unidad', 'u/m': 'unidad',
    'unit of measure': 'unidad', 'unit of measurement': 'unidad', 'um': 'unidad',
    'measure': 'unidad',

    // size
    'size': 'size', 'dimension': 'size', 'dimensions': 'size',
    'spec': 'size', 'specs': 'size', 'specification': 'size',

    // qty
    'qty': 'qty', 'quantity': 'qty', 'cantidad': 'qty',
    'qty.': 'qty', 'count': 'qty', 'pieces': 'qty', 'pcs': 'qty', 'units': 'qty',

    // unit price
    'unit price': 'unit_price', 'unit_price': 'unit_price', 'unitprice': 'unit_price',
    'price': 'unit_price', 'precio': 'unit_price', 'precio unitario': 'unit_price',
    'unit cost': 'unit_price', 'cost': 'unit_price', 'costo': 'unit_price',
    'list price': 'unit_price', 'net price': 'unit_price', 'each': 'unit_price',

    // total price
    'total price': 'total_price', 'total_price': 'total_price', 'totalprice': 'total_price',
    'total': 'total_price', 'total amount': 'total_price', 'importe': 'total_price',
    'ext price': 'total_price', 'extended price': 'total_price', 'ext. price': 'total_price',
    'subtotal': 'total_price', 'line total': 'total_price', 'amount': 'total_price',
  }

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const allRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

    if (!allRows.length) return next(createError('El archivo está vacío', 400))

    // Find the row that best matches known column names
    let headerRowIdx = -1
    let colMap: Record<string, number> = {}
    let bestScore = 0

    for (let r = 0; r < Math.min(allRows.length, 25); r++) {
      const row = allRows[r]
      const map: Record<string, number> = {}
      let score = 0
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c]).trim().toLowerCase().replace(/\s+/g, ' ')
        const field = ALIASES[cell]
        if (field && map[field] === undefined) {
          map[field] = c
          score++
        }
      }
      if (score > bestScore) {
        bestScore = score
        headerRowIdx = r
        colMap = map
      }
    }

    if (headerRowIdx === -1 || bestScore < 2) {
      return next(createError('No se encontraron columnas reconocibles. Verificar encabezados del Excel.', 400))
    }

    const getText = (row: any[], field: string) => {
      if (colMap[field] === undefined) return ''
      const v = row[colMap[field]]
      return (v === null || v === undefined) ? '' : String(v).trim()
    }
    const getNum = (row: any[], field: string) => {
      const v = getText(row, field).replace(/[$,\s]/g, '')
      const n = parseFloat(v)
      return isNaN(n) ? 0 : n
    }

    // ── Debug: log detected header mapping and first 3 data rows ─────────────
    console.log('[importar] Header row index:', headerRowIdx)
    console.log('[importar] Column map:', colMap)
    console.log('[importar] Raw header row:', allRows[headerRowIdx])
    const preview = allRows.slice(headerRowIdx + 1, headerRowIdx + 4)
    preview.forEach((row, i) => {
      const mapped: Record<string, string> = {}
      for (const [field, col] of Object.entries(colMap)) {
        mapped[field] = String(row[col] ?? '').trim()
      }
      console.log(`[importar] Row ${i + 1} mapped:`, mapped)
    })
    // ─────────────────────────────────────────────────────────────────────────

    const fechaHoy = new Date().toISOString().slice(0, 10)
    const dataRows = allRows.slice(headerRowIdx + 1)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      if (modo === 'reemplazar') {
        await client.query('DELETE FROM materiales_mto WHERE proyecto_id = $1', [proyId])
      }

      let importados = 0
      let omitidos   = 0

      for (const row of dataRows) {
        const descripcion = getText(row, 'descripcion')
        const codigo      = getText(row, 'codigo')
        if (!descripcion && !codigo) { omitidos++; continue }

        const unit_price  = getNum(row, 'unit_price')
        const qty         = getNum(row, 'qty') || 1
        let   total_price = getNum(row, 'total_price')
        if (!total_price && unit_price) total_price = qty * unit_price

        let cotizar     = 'SI'
        let estado_cotiz = 'PENDIENTE'
        if (codigo.toUpperCase().startsWith('NC')) {
          cotizar = 'EN_STOCK'; estado_cotiz = 'EN_STOCK'
        } else if (unit_price > 0) {
          estado_cotiz = 'COTIZADO'
        }

        await client.query(
          `INSERT INTO materiales_mto
             (proyecto_id, item, codigo, vendor_code, vendor, descripcion, color,
              manufacturer, categoria, unidad, size, qty, unit_price, total_price,
              cotizar, estado_cotiz, fecha_importacion)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            proyId,
            getText(row, 'item'),
            codigo,
            getText(row, 'vendor_code'),
            getText(row, 'vendor'),
            descripcion,
            getText(row, 'color'),
            getText(row, 'manufacturer'),
            getText(row, 'categoria'),
            getText(row, 'unidad') || 'EACH',
            getText(row, 'size'),
            qty,
            unit_price,
            total_price,
            cotizar,
            estado_cotiz,
            fechaHoy,
          ]
        )
        importados++
      }

      await client.query('COMMIT')
      res.status(201).json({
        data: { importados, omitidos, fecha_importacion: fechaHoy },
        message: `${importados} materiales importados correctamente`,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally { client.release() }
  } catch (err) { next(err) }
}

export async function updatePreciosLote(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const { proyecto_id, vendor, freight = 0, items } = req.body
    if (!proyecto_id || !vendor) return next(createError('proyecto_id y vendor son requeridos', 400))
    if (!Array.isArray(items) || !items.length) return next(createError('items requerido', 400))

    await client.query('BEGIN')

    for (const item of items as { id: number; unit_price: number }[]) {
      await client.query(
        `UPDATE materiales_mto
         SET unit_price = $1, total_price = qty * $1, estado_cotiz = 'COTIZADO', updated_at = NOW()
         WHERE id = $2 AND proyecto_id = $3`,
        [Number(item.unit_price), item.id, proyecto_id]
      )
    }

    await client.query(
      `INSERT INTO mto_freight (proyecto_id, vendor, freight)
       VALUES ($1, $2, $3)
       ON CONFLICT (proyecto_id, vendor) DO UPDATE SET freight = $3, updated_at = NOW()`,
      [proyecto_id, vendor, Number(freight) || 0]
    )

    await client.query('COMMIT')
    res.json({ message: `Precios actualizados para ${vendor}` })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally { client.release() }
}
