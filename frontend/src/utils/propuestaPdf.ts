import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─────────────────────────────────────────────────────────────────────────────
// La hoja que recibe el GC: "Millwork Fabrication Estimate".
//
// Es el documento que hoy sale del Excel y que el estimador manda por mail. Se arma
// con los datos de GET /api/estimados/:id/propuesta — acá no se calcula nada,
// sólo se imprime: si un número de esta hoja no cierra, el problema está en el
// motor, no acá.
//
// Dos páginas, como el original: la hoja con los renglones y el desglose por
// ítem, y los Términos y Condiciones con su versión. El SOW (el plano marcado)
// va aparte, sale de Bluebeam.
//
// Sigue el patrón de cotizacionPdf.ts: se genera en el navegador y se descarga;
// el envío al cliente es manual.
// ─────────────────────────────────────────────────────────────────────────────

export interface Propuesta {
  encabezado: {
    cliente: { nombre: string | null; contacto: string | null; email: string | null; telefono: string | null }
    preparadoPor: {
      empresa: string; estimador: string | null; email: string | null
      oficina: string | null; directo: string | null
    }
    proyecto: { codigo: string; nombre: string; ubicacion: string | null }
    presentadoEl: string | null
    basadoEn: string | null
    draft: number
    estado: string
  }
  renglones: { n: number; etiqueta: string; monto: number }[]
  total: number
  salesTax: number
  totalConImpuestos: number
  leyendaImpuesto: string | null
  items: {
    n: number; titulo: string; refPlano: string | null; precio: number
    descripcion: string | null; tamanos: string | null; acabados: string | null
    herrajes: string | null; exclusiones: string | null
  }[]
  terminos: { version: string; contenido: string | null; pago: string[] } | null
  advertencias: string[]
}

const LOGO_URL = '/logo_cm_login.png'
const COLOR_TEXTO = '#1c1c1c'
const COLOR_SUAVE = '#6b6b6b'
const COLOR_LINEA = '#9a9a9a'
const PIE = '2939 Blystone Ln. Dallas, TX 75220 | (972) 925-0236 | info@centralmillwork.com | centralmillwork.com'

let logoCache: string | null = null
async function cargarLogo(): Promise<string | null> {
  if (logoCache) return logoCache
  try {
    const res = await fetch(LOGO_URL)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => { logoCache = reader.result as string; resolve(logoCache) }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

/** Formato en-US: es el que leen el GC y el estimador. */
const usd = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fechaLarga = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`)
  return Number.isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

const limpiar = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')

export async function generarPropuestaPDF(p: Propuesta): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  const m = 12
  const derecha = ancho - m

  // ── encabezado ────────────────────────────────────────────────────────────
  const logo = await cargarLogo()
  if (logo) { try { doc.addImage(logo, 'PNG', m, 8, 14, 14) } catch { /* sin logo */ } }

  doc.setTextColor(COLOR_TEXTO)
  doc.setFont('helvetica', 'bold').setFontSize(14)
  doc.text('Millwork Fabrication Estimate', ancho / 2, 14, { align: 'center' })
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(COLOR_SUAVE)
  doc.text(
    'Required Exhibit to the Contractor (Client) / Sub-Contractor (Central Millwork) Service Agreement',
    ancho / 2, 19, { align: 'center' })

  // Las cuatro columnas del encabezado, como en el original.
  const e = p.encabezado
  const cols: { titulo: string; lineas: string[] }[] = [
    { titulo: 'CLIENT:', lineas: [
      e.cliente.nombre ?? '',
      e.cliente.contacto ? `Contact: ${e.cliente.contacto}` : '',
      e.cliente.email ? `Email: ${e.cliente.email}` : '',
      e.cliente.telefono ? `Phone: ${e.cliente.telefono}` : '',
    ] },
    { titulo: 'PREPARED BY:', lineas: [
      e.preparadoPor.empresa,
      e.preparadoPor.estimador ? `Estimator: ${e.preparadoPor.estimador}` : '',
      e.preparadoPor.email ? `Email: ${e.preparadoPor.email}` : '',
      e.preparadoPor.oficina ? `Office: ${e.preparadoPor.oficina}` : '',
      e.preparadoPor.directo ? `Direct: ${e.preparadoPor.directo}` : '',
    ] },
    { titulo: 'PROJECT:', lineas: [
      // El nombre a veces ya trae el código adelante; no repetirlo.
      e.proyecto.nombre.startsWith(e.proyecto.codigo)
        ? e.proyecto.nombre
        : `${e.proyecto.codigo} ${e.proyecto.nombre}`.trim(),
      ...(e.proyecto.ubicacion ?? '').split('\n'),
    ] },
    { titulo: 'TERMS:', lineas: p.terminos?.pago ?? [] },
  ]

  const anchoCol = (ancho - m * 2) / 4
  let yMax = 0
  cols.forEach((c, i) => {
    const x = m + anchoCol * i
    let y = 27
    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(COLOR_TEXTO)
    doc.text(c.titulo, x, y)
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(COLOR_SUAVE)
    for (const linea of c.lineas.filter(Boolean)) {
      for (const parte of doc.splitTextToSize(linea, anchoCol - 3)) {
        y += 3.4
        doc.text(parte, x, y)
      }
    }
    yMax = Math.max(yMax, y)
  })

  let y = yMax + 6
  doc.setDrawColor(COLOR_LINEA).setLineWidth(0.2)
  doc.line(m, y, derecha, y)
  y += 5

  doc.setFontSize(8).setTextColor(COLOR_TEXTO)
  doc.setFont('helvetica', 'bold').text('Presented on:', m, y)
  doc.setFont('helvetica', 'normal').text(fechaLarga(e.presentadoEl), m + 32, y)
  doc.setFont('helvetica', 'bold').text(`Draft#${e.draft}`, derecha, y, { align: 'right' })
  y += 4.5
  doc.setFont('helvetica', 'bold').text('Proposal based on:', m, y)
  doc.setFont('helvetica', 'normal').text(e.basadoEn ?? '', m + 32, y)

  // ── los renglones ─────────────────────────────────────────────────────────
  const filas = p.renglones.map((r) => [r.etiqueta, `$ ${usd(r.monto)}`])
  filas.push(['ESTIMATE TOTAL - NOT INCLUDING TAXES', `$ ${usd(p.total)}`])
  filas.push([
    'SALES TAX (TO BE COLLECTED IF NOT PROVIDED WITH A TEXAS RESALE OR TAX EXEMPT CERTIFICATE)',
    p.leyendaImpuesto ?? `$ ${usd(p.salesTax)}`,
  ])
  filas.push(['ESTIMATE TOTAL INCLUDING TAXES',
    p.leyendaImpuesto ? p.leyendaImpuesto : `$ ${usd(p.totalConImpuestos)}`])

  const primeraTotal = p.renglones.length
  autoTable(doc, {
    startY: y + 4,
    body: filas,
    theme: 'plain',
    margin: { left: m, right: m },
    styles: { fontSize: 8, cellPadding: { top: 1.3, bottom: 1.3, left: 1, right: 1 },
              textColor: COLOR_TEXTO },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 34 } },
    didParseCell: (d) => {
      if (d.row.index >= primeraTotal) {
        d.cell.styles.fontStyle = 'bold'
        d.cell.styles.lineWidth = { top: 0.2, right: 0, bottom: 0, left: 0 }
        d.cell.styles.lineColor = COLOR_LINEA
      }
      // El renglón de impuestos lleva una aclaración larga: achicarla.
      if (d.row.index === primeraTotal + 1 && d.column.index === 0) d.cell.styles.fontSize = 6.2
    },
  })

  // ── el desglose por ítem ──────────────────────────────────────────────────
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

  const etiquetas: [string, (i: Propuesta['items'][number]) => string | null][] = [
    ['Description: ', (i) => i.descripcion],
    ['Approx. Size: ', (i) => i.tamanos],
    ['Finishes: ', (i) => i.acabados],
    ['Hardware: ', (i) => i.herrajes],
    ['Exclusions: ', (i) => i.exclusiones],
  ]

  for (const item of p.items) {
    // Un ítem no se parte entre páginas si entra entero en la siguiente.
    const alturaEstimada = 6 + etiquetas.length * 3.6
    if (y + alturaEstimada > alto - 18) { doc.addPage(); y = 18 }

    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(COLOR_TEXTO)
    doc.text(item.titulo, m, y)
    if (item.refPlano) {
      doc.setFont('helvetica', 'normal').setFontSize(7.5)
      doc.text(`Drawing Ref: ${item.refPlano}`, m + 92, y)
    }
    doc.setFont('helvetica', 'bold').setFontSize(8)
    doc.text(`$ ${usd(item.precio)}`, derecha, y, { align: 'right' })
    y += 3.8

    doc.setFontSize(7).setTextColor(COLOR_SUAVE)
    for (const [rotulo, leer] of etiquetas) {
      const valor = leer(item)
      if (!valor) continue
      const partes = doc.splitTextToSize(`${rotulo}${valor}`, ancho - m * 2 - 2)
      for (const parte of partes) {
        if (y > alto - 16) { doc.addPage(); y = 18 }
        doc.setFont('helvetica', 'normal')
        doc.text(parte, m + 2, y)
        y += 3.2
      }
    }
    y += 2.5
  }

  // ── página 2: Términos y Condiciones ──────────────────────────────────────
  if (p.terminos?.contenido) {
    doc.addPage()
    let ty = 16
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(COLOR_TEXTO)
    doc.text(`Terms and Conditions Version ${p.terminos.version}`, ancho / 2, ty, { align: 'center' })
    ty += 6
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(COLOR_TEXTO)
    for (const parrafo of p.terminos.contenido.split('\n\n')) {
      for (const linea of doc.splitTextToSize(parrafo.trim(), ancho - m * 2)) {
        if (ty > alto - 16) { doc.addPage(); ty = 16 }
        doc.text(linea, m, ty)
        ty += 3
      }
      ty += 2
    }
  }

  // ── pie de página en todas ────────────────────────────────────────────────
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(COLOR_SUAVE)
    doc.text(PIE, ancho / 2, alto - 10, { align: 'center' })
    doc.text(`Page ${i} of ${total}`, ancho / 2, alto - 6.5, { align: 'center' })
  }

  const nombre = `${limpiar(e.proyecto.codigo)}_${limpiar(e.proyecto.nombre)}_Draft${e.draft}.pdf`
  doc.save(nombre)
}
