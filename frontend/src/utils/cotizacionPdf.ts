import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Material } from '@/types'

interface ProyectoInfo {
  codigo: string
  nombre: string
  cliente?: string
}

const CONTACT_EMAIL = 'chali@centralmillwork.com'
const LOGO_URL = '/logo_cm_login.png'
const COLOR_FOREST = '#2c3126'
const COLOR_GOLD   = '#dea832'
const COLOR_TABLE_HEADER = '#4A5240'

let logoCache: string | null = null

async function loadLogoBase64(): Promise<string | null> {
  if (logoCache) return logoCache
  try {
    const res = await fetch(LOGO_URL)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        logoCache = reader.result as string
        resolve(logoCache)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

export async function generarCotizacionPDF(
  proyecto: ProyectoInfo,
  vendor: string,
  materiales: Material[],
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14

  // Header band
  doc.setFillColor(COLOR_FOREST)
  doc.rect(0, 0, pageWidth, 28, 'F')

  const logo = await loadLogoBase64()
  if (logo) {
    try { doc.addImage(logo, 'PNG', margin, 6, 16, 16) } catch { /* noop */ }
  }

  doc.setTextColor(COLOR_GOLD)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Central Millwork', margin + 20, 14)

  doc.setTextColor(255)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Quote Request', margin + 20, 20)

  const today = new Date().toISOString().slice(0, 10)
  doc.setFontSize(9)
  doc.text(today, pageWidth - margin, 20, { align: 'right' })

  // Project + vendor block
  let y = 38
  doc.setTextColor(50)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`Project: ${proyecto.codigo} — ${proyecto.nombre}`, margin, y)
  if (proyecto.cliente) {
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`Client: ${proyecto.cliente}`, margin, y)
  }

  y += 7
  doc.setTextColor(50)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(`Vendor: ${vendor}`, margin, y)

  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(
    'Please fill in the Unit Price column and reply to this email.',
    margin, y,
  )

  // Materials table
  const body = materiales.map((m) => [
    m.codigo ?? '',
    m.descripcion ?? '',
    m.color ?? '',
    m.size ?? '',
    m.unidad ?? '',
    m.qty != null ? String(m.qty) : '',
    '', // Unit Price — left empty for vendor
  ])

  autoTable(doc, {
    startY: y + 4,
    head: [['CM Code', 'Description', 'Color', 'Size', 'Unit', 'QTY', 'Unit Price']],
    body,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: COLOR_TABLE_HEADER, textColor: 255, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 'auto' },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'right',  cellWidth: 14 },
      6: { halign: 'right',  cellWidth: 24, fillColor: '#f3efe2' },
    },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight()
      doc.setFontSize(8)
      doc.setTextColor(140)
      doc.text(`Reply to: ${CONTACT_EMAIL}`, margin, h - 8)
      doc.text('Central Millwork', pageWidth - margin, h - 8, { align: 'right' })
    },
  })

  const filename = `Cotizacion_${sanitizeFilename(proyecto.codigo)}_${sanitizeFilename(vendor)}.pdf`
  doc.save(filename)
}
