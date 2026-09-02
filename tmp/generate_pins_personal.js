// Genera 10 PINs únicos de 4 dígitos para operarios de producción,
// los actualiza en personal_taller (hash bcrypt) y produce un PDF
// con la lista en claro para distribuir el lunes.
const bcrypt = require('bcryptjs')
const { Client } = require('pg')
const PDFDocument = require('pdfkit')
const fs = require('fs')

const DATABASE_URL = 'postgresql://postgres:RXahoTwuHwHnyTtMPGJQHinjIyjAABae@switchyard.proxy.rlwy.net:39068/railway'

// IDs en BD según consulta previa (id, nombre completo, estaciones)
const TARGETS = [
  { id: 1,  nombre: 'Junior Martínez',    tipo: 'Operador',   estaciones: 'CNC · Edge Banding' },
  { id: 11, nombre: 'Dilan Uriostegui',   tipo: 'Carpintero', estaciones: 'Assembly' },
  { id: 13, nombre: 'Jhonatan Angeles',   tipo: 'Carpintero', estaciones: 'Final · Registro · Shipping' },
  { id: 10, nombre: 'José Pérez',         tipo: 'Carpintero', estaciones: 'Assembly' },
  { id: 7,  nombre: 'Juan Ávila',         tipo: 'Carpintero', estaciones: 'Assembly' },
  { id: 2,  nombre: 'Julio Casillas',     tipo: 'Carpintero', estaciones: 'Lamina' },
  { id: 9,  nombre: 'Luis Ávila',         tipo: 'Carpintero', estaciones: 'Assembly' },
  { id: 8,  nombre: 'Rolando Pérez',      tipo: 'Carpintero', estaciones: 'Assembly' },
  { id: 12, nombre: 'Renny Hernández',    tipo: 'Ayudante',   estaciones: 'Final · Registro · Shipping' },
  { id: 3,  nombre: 'Víctor Padilla',     tipo: 'Pintor',     estaciones: 'Pintura' },
]

// Generador de PINs únicos de 4 dígitos sin secuencias obvias
function generarPinsUnicos(n) {
  const usados = new Set()
  const malos = new Set(['1234','4321','0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1212','1010','2020','2026','0101'])
  const pins = []
  while (pins.length < n) {
    const p = String(Math.floor(1000 + Math.random() * 9000))
    if (usados.has(p) || malos.has(p)) continue
    // Evitar secuencias monotónicas (1234, 9876)
    const d = p.split('').map(Number)
    const ascendente = d.every((x,i) => i === 0 || x === d[i-1] + 1)
    const descendente = d.every((x,i) => i === 0 || x === d[i-1] - 1)
    if (ascendente || descendente) continue
    usados.add(p)
    pins.push(p)
  }
  return pins
}

async function main() {
  const pins = generarPinsUnicos(TARGETS.length)
  const conLog = TARGETS.map((t, i) => ({ ...t, pin: pins[i] }))

  // 1) Update BD con hashes
  const cli = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await cli.connect()
  console.log('Conectado a BD. Actualizando hashes...')
  for (const { id, nombre, pin } of conLog) {
    const hash = bcrypt.hashSync(pin, 10)
    await cli.query(
      'UPDATE personal_taller SET pin_hash = $1, pin_actualizado_at = NOW() WHERE id = $2',
      [hash, id]
    )
    console.log(`  ✓ ${nombre} (id ${id}) → PIN ${pin}`)
  }
  await cli.end()
  console.log('BD lista.')

  // 2) Generar PDF
  const outPath = String.raw`C:\Users\chali\OneDrive - Central Millwork\centralmillwork-app\pins_operarios_2026_06_15.pdf`
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 50, bottom: 90, left: 50, right: 50 },
    autoFirstPage: true,
  })
  doc.pipe(fs.createWriteStream(outPath))

  const W = doc.page.width, H = doc.page.height
  const ML = 50, MR = 50, MT = 50, MB = 90
  const CW = W - ML - MR

  const GOLD = '#9B7200', GOLD_LIGHT = '#DEA832', FOREST = '#2C3126'
  const TEXT_DARK = '#1F1B14', TEXT_MUTED = '#6B6356', TEXT_LIGHT = '#9B9486'
  const BG_PALE = '#F8F6F0', BORDER = '#E7E2D5'
  const RED = '#DC2626', AMBER = '#D97706'

  // Header
  doc.rect(0, 0, W, 6).fill(GOLD_LIGHT)
  doc.fillColor(GOLD).fontSize(10).font('Helvetica-Bold')
     .text('CENTRAL MILLWORK', ML, 18, { characterSpacing: 3, lineBreak: false })

  // Title
  doc.fillColor(FOREST).fontSize(26).font('Helvetica-Bold').text('PINs de operarios', ML, 60)
  doc.fillColor(GOLD_LIGHT).fontSize(26).font('Helvetica-Bold').text('Arranque del lunes 15 de junio', ML, 95)
  doc.moveTo(ML, 142).lineTo(ML + 60, 142).strokeColor(GOLD_LIGHT).lineWidth(1.5).stroke()
  doc.fillColor(TEXT_MUTED).fontSize(11).font('Helvetica-Oblique')
     .text('Cada operario tiene un PIN personal de 4 dígitos. Lo usa para identificarse en el iPad del kiosko.',
           ML, 155, { width: CW, lineGap: 2 })

  // Warning box
  let y = 200
  doc.rect(ML, y, CW, 60).fillAndStroke('#FEF2F2', RED)
  doc.rect(ML, y, CW, 4).fill(RED)
  doc.fillColor(RED).fontSize(10).font('Helvetica-Bold')
     .text('CONFIDENCIAL', ML + 14, y + 16, { characterSpacing: 2, lineBreak: false })
  doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
     .text('Entregar cada PIN sólo a su titular. Si un PIN se compromete, avisar para regenerarlo. No fotografiar ni reenviar esta hoja por chat.',
           ML + 14, y + 32, { width: CW - 28, lineGap: 1 })

  // Table header
  y = 280
  doc.rect(ML, y, CW, 26).fill(FOREST)
  doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold')
  doc.text('#',           ML + 8,   y + 9, { width: 22, lineBreak: false })
  doc.text('OPERARIO',    ML + 36,  y + 9, { width: 170, characterSpacing: 1, lineBreak: false })
  doc.text('TIPO',        ML + 210, y + 9, { width: 80,  characterSpacing: 1, lineBreak: false })
  doc.text('ESTACIONES',  ML + 295, y + 9, { width: 145, characterSpacing: 1, lineBreak: false })
  doc.text('PIN',         ML + 445, y + 9, { width: 60,  characterSpacing: 1, lineBreak: false })

  y += 26

  // Rows
  const rowH = 32
  conLog.forEach((p, i) => {
    if (i % 2 === 1) doc.rect(ML, y, CW, rowH).fill(BG_PALE)
    doc.fillColor(TEXT_LIGHT).fontSize(10).font('Helvetica')
       .text(String(i + 1), ML + 8, y + 11, { width: 22, lineBreak: false })
    doc.fillColor(FOREST).fontSize(11).font('Helvetica-Bold')
       .text(p.nombre, ML + 36, y + 10, { width: 170, lineBreak: false })
    doc.fillColor(TEXT_MUTED).fontSize(9).font('Helvetica')
       .text(p.tipo, ML + 210, y + 11, { width: 80, lineBreak: false })
    doc.fillColor(TEXT_DARK).fontSize(9).font('Helvetica')
       .text(p.estaciones, ML + 295, y + 11, { width: 145, lineBreak: false })

    // PIN destacado
    doc.rect(ML + 445, y + 5, 65, 22).fillAndStroke('#FFFAEC', AMBER)
    doc.fillColor(AMBER).fontSize(15).font('Courier-Bold')
       .text(p.pin, ML + 445, y + 9, { width: 65, align: 'center', lineBreak: false })
    y += rowH
  })

  // Note
  y += 14
  doc.rect(ML, y, CW, 50).fillAndStroke('#FEFCE8', AMBER)
  doc.rect(ML, y, CW, 4).fill(AMBER)
  doc.fillColor(AMBER).fontSize(10).font('Helvetica-Bold')
     .text('CÓMO USAR EL PIN', ML + 14, y + 12, { characterSpacing: 2, lineBreak: false })
  doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
     .text('1) Abrir el kiosko en el iPad.  2) Tocar los 4 dígitos.  3) Tocar "Ingresar". Ya está identificado.',
           ML + 14, y + 28, { width: CW - 28, lineBreak: false })

  // Footer
  doc.moveTo(ML, H - 110).lineTo(W - MR, H - 110).strokeColor(BORDER).lineWidth(0.5).stroke()
  doc.fillColor(TEXT_LIGHT).fontSize(8).font('Helvetica')
     .text('Central Millwork · Generado el 15 de junio de 2026 · Documento confidencial — destruir o guardar bajo llave después de distribuir.',
           ML, H - 100, { width: CW, align: 'center', lineBreak: false })

  doc.end()
  console.log('PDF guardado en:', outPath)
}

main().catch(e => { console.error(e); process.exit(1) })
