import fs from 'fs'
import path from 'path'
import { Pool } from 'pg'

const pool = new Pool({
  host: 'localhost', port: 5432,
  database: 'centralmillwork', user: 'postgres', password: 'postgres',
})

function parseDate(s: string): Date | null {
  if (!s || s.trim() === '') return null
  const [m, d, y] = s.split('/')
  if (!m || !d || !y) return null
  const dt = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`)
  return isNaN(dt.getTime()) ? null : dt
}

function mapOrdenEstado(s: string): string {
  if (s === 'EN_EL_TALLER') return 'recibida'
  if (s === 'ORDENADO') return 'confirmada'
  return 'emitida'
}

async function run() {
  const filePath = path.resolve('C:/Users/Pedro/OneDrive - Central Millwork/Desktop/UTILITIES/PROYECTOS/data.json')
  const buf = fs.readFileSync(filePath)
  // UTF-16 LE with BOM
  const str = buf.slice(2).toString('utf16le')
  const data = JSON.parse(str) as {
    proyectos: { id: string; nombre: string; owner: string; estado: string; budget: number }[]
    ordenes: {
      id_oc: string; id_proyecto: string; id_proveedor: string; vendor: string
      categoria: string; fecha_solicitud: string; fecha_oc: string
      fecha_recepcion: string; monto: number; estado: string; notas: string; fecha_entrega: string
    }[]
    recepciones: {
      id_recepcion: string; id_oc: string; id_proyecto: string
      fecha: string; tipo: string; tipo_material: string; receptor: string; observaciones: string
    }[]
    mto: {
      id_proyecto: string; cm_code: string; vendor_code: string; vendor: string
      descripcion: string; color: string; categoria: string; unidad: string
      size: string; qty: number; unit_price: number; total_price: number
      estado_cotiz: string; mill_made: string
    }[]
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── 1. Proyectos ──────────────────────────────────────────────
    console.log('\n── Proyectos ──')
    const proyectoIdMap: Record<string, number> = {}
    for (const p of data.proyectos) {
      const { rows } = await client.query(
        `INSERT INTO proyectos (codigo, nombre, cliente, estado, presupuesto)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (codigo) DO UPDATE SET nombre=EXCLUDED.nombre, cliente=EXCLUDED.cliente
         RETURNING id`,
        [p.id, p.nombre, p.owner, p.estado.toLowerCase(), p.budget ?? 0]
      )
      proyectoIdMap[p.id] = rows[0].id
      console.log(`  ✓ ${p.id} → id=${rows[0].id}`)
    }

    // ── 2. Proveedores ────────────────────────────────────────────
    console.log('\n── Proveedores ──')
    const vendorIdMap: Record<string, number> = {}
    const uniqueVendors = [...new Set(data.ordenes.map(o => o.vendor).filter(Boolean))]
    for (const nombre of uniqueVendors) {
      const { rows: existing } = await client.query(
        `SELECT id FROM proveedores WHERE LOWER(nombre) = LOWER($1)`, [nombre]
      )
      if (existing.length) {
        vendorIdMap[nombre] = existing[0].id
        console.log(`  ~ ${nombre} already exists → id=${existing[0].id}`)
      } else {
        const { rows } = await client.query(
          `INSERT INTO proveedores (nombre, contacto, email, telefono)
           VALUES ($1,'','','') RETURNING id`,
          [nombre]
        )
        vendorIdMap[nombre] = rows[0].id
        console.log(`  ✓ ${nombre} → id=${rows[0].id}`)
      }
    }

    // ── 3. Ordenes de compra ──────────────────────────────────────
    console.log('\n── Ordenes de Compra ──')
    const ordenIdMap: Record<string, number> = {}
    for (const o of data.ordenes) {
      const proyectoId = proyectoIdMap[o.id_proyecto]
      const proveedorId = vendorIdMap[o.vendor]
      const estado = mapOrdenEstado(o.estado)
      const fechaEmision = parseDate(o.fecha_oc) ?? new Date()
      const fechaEntregaEst = parseDate(o.fecha_entrega)
      const fechaEntregaReal = parseDate(o.fecha_recepcion)
      const total = Number(o.monto) || 0
      const subtotal = total / 1.16
      const iva = total - subtotal

      const { rows } = await client.query(
        `INSERT INTO ordenes_compra
           (numero, proyecto_id, proveedor_id, estado, fecha_emision,
            fecha_entrega_estimada, fecha_entrega_real, notas, subtotal, iva, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (numero) DO UPDATE SET estado=EXCLUDED.estado
         RETURNING id`,
        [o.id_oc, proyectoId, proveedorId, estado, fechaEmision,
         fechaEntregaEst, fechaEntregaReal, o.notas || null,
         subtotal.toFixed(2), iva.toFixed(2), total.toFixed(2)]
      )
      ordenIdMap[o.id_oc] = rows[0].id
      console.log(`  ✓ ${o.id_oc} (${estado}) → id=${rows[0].id}`)
    }

    // ── 4. Recepciones ────────────────────────────────────────────
    console.log('\n── Recepciones ──')
    for (const r of data.recepciones) {
      const ordenId = ordenIdMap[r.id_oc]
      if (!ordenId) { console.log(`  ⚠ ${r.id_recepcion}: orden ${r.id_oc} not found, skipping`); continue }
      const estado = r.tipo === 'TOTAL' ? 'completa' : 'con_diferencias'
      const fechaRaw = parseDate(r.fecha)
      if (!fechaRaw) console.log(`  ⚠ ${r.id_recepcion}: invalid date "${r.fecha}", using today`)
      const fecha = fechaRaw ?? new Date()
      const { rows: existR } = await client.query(
        `SELECT id FROM recepciones WHERE folio = $1`, [r.id_recepcion]
      )
      if (existR.length) {
        console.log(`  ~ ${r.id_recepcion} already exists → id=${existR[0].id}`)
        continue
      }
      const { rows } = await client.query(
        `INSERT INTO recepciones (folio, orden_compra_id, estado, fecha_recepcion, recibio, notas)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [r.id_recepcion, ordenId, estado, fecha, r.receptor || null, r.observaciones || null]
      )
      console.log(`  ✓ ${r.id_recepcion} → id=${rows[0].id}`)
    }

    // ── 5. Materiales MTO (deduplicated by cm_code) ───────────────
    console.log('\n── Materiales MTO ──')
    const seenCodes = new Set<string>()
    let matInserted = 0, matSkipped = 0
    for (const m of data.mto) {
      if (!m.cm_code || seenCodes.has(m.cm_code)) { matSkipped++; continue }
      seenCodes.add(m.cm_code)
      const desc = [m.descripcion, m.color, m.size].filter(Boolean).join(' | ')
      await client.query(
        `INSERT INTO materiales_mto (codigo, descripcion, unidad, categoria, precio_referencia)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (codigo) DO NOTHING`,
        [m.cm_code, desc || m.cm_code, m.unidad || 'EACH', m.categoria || null, m.unit_price ?? 0]
      )
      matInserted++
    }
    console.log(`  ✓ ${matInserted} materiales inserted, ${matSkipped} duplicates skipped`)

    await client.query('COMMIT')
    console.log('\n✅ Migration complete!')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('❌ Migration failed:', err)
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(e => { console.error(e); process.exit(1) })
