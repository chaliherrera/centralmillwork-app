// Manual de arranque — Módulo de Producción
// Documento completo, 11 secciones. Sin páginas vacías.
const PDFDocument = require('pdfkit')
const fs = require('fs')

const outPath = String.raw`C:\Users\chali\OneDrive - Central Millwork\centralmillwork-app\manual_produccion_2026_06_15.pdf`

const doc = new PDFDocument({
  size: 'LETTER',
  // bottom 90 deja un cinturón de 30 puntos para el footer DENTRO del flujo
  // útil (H - 75 a H - 65). Si dejábamos bottom 60 y escribíamos en y=H-32,
  // PDFKit interpretaba ese y como "overflow" y auto-creaba página extra.
  margins: { top: 50, bottom: 90, left: 50, right: 50 },
  autoFirstPage: true,
})
doc.pipe(fs.createWriteStream(outPath))

const W = doc.page.width
const H = doc.page.height
const ML = 50, MR = 50, MT = 50, MB = 90
const CW = W - ML - MR

const GOLD = '#9B7200'
const GOLD_LIGHT = '#DEA832'
const GOLD_PALE = '#FAEFD6'
const FOREST = '#2C3126'
const FOREST_MID = '#4A5240'
const BG_PALE = '#F8F6F0'
const TEXT_DARK = '#1F1B14'
const TEXT_MUTED = '#6B6356'
const TEXT_LIGHT = '#9B9486'
const BLUE = '#2563EB'
const BLUE_PALE = '#DBEAFE'
const AMBER = '#D97706'
const AMBER_PALE = '#FEF3C7'
const GREEN = '#059669'
const GREEN_PALE = '#D1FAE5'
const RED = '#DC2626'
const RED_PALE = '#FEE2E2'
const PURPLE = '#7C3AED'
const PURPLE_PALE = '#EDE9FE'
const BORDER = '#E7E2D5'
const BORDER_DARK = '#D8D1C0'

const URL_APP = 'https://centralmillwork-frontend-production.up.railway.app'
const URL_LOGIN = `${URL_APP}/login`
const URL_KIOSK = `${URL_APP}/kiosko`

let pageNum = 0

function drawPageChrome(title) {
  pageNum += 1
  doc.save()
  doc.rect(0, 0, W, 6).fill(GOLD_LIGHT)
  doc.restore()
  doc.save()
  doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold')
     .text('CENTRAL MILLWORK', ML, 18, { characterSpacing: 3, lineBreak: false })
  doc.fillColor(TEXT_MUTED).fontSize(8).font('Helvetica')
     .text(title, ML, 18, { width: CW, align: 'right', lineBreak: false })
  doc.restore()
  doc.save()
  // Footer ubicado DENTRO del espacio útil (H - MB = 702). Si lo poníamos
  // en y=H-32=760, PDFKit detectaba "overflow" y auto-creaba página.
  doc.moveTo(ML, H - 110).lineTo(W - MR, H - 110).strokeColor(BORDER).lineWidth(0.5).stroke()
  doc.fillColor(TEXT_LIGHT).fontSize(8).font('Helvetica')
     .text(`Página ${pageNum} · Manual de arranque · Módulo Producción · Junio 2026`,
           ML, H - 100, { width: CW, align: 'center', lineBreak: false })
  doc.restore()
  doc.x = ML
  doc.y = MT
}

function sectionTitle(num, title, subtitle) {
  doc.save()
  doc.fillColor(GOLD_LIGHT).fontSize(36).font('Helvetica-Bold').text(num, ML, MT + 10)
  doc.fillColor(FOREST).fontSize(22).font('Helvetica-Bold').text(title, ML + 50, MT + 22)
  if (subtitle) {
    doc.fillColor(TEXT_MUTED).fontSize(11).font('Helvetica-Oblique')
       .text(subtitle, ML + 50, MT + 50, { width: CW - 50 })
  }
  doc.moveTo(ML + 50, MT + 80).lineTo(ML + 90, MT + 80).strokeColor(GOLD_LIGHT).lineWidth(1.5).stroke()
  doc.restore()
  return MT + 100
}

function box(y, height, opts = {}) {
  const { fill = '#FFFFFF', border = BORDER, accent = null } = opts
  doc.save()
  doc.rect(ML, y, CW, height).fillAndStroke(fill, border)
  if (accent) {
    doc.rect(ML, y, CW, 4).fill(accent)
  }
  doc.restore()
}

function h3(text, y, color = FOREST) {
  doc.save()
  doc.fillColor(color).fontSize(13).font('Helvetica-Bold').text(text, ML, y)
  doc.restore()
  return y + 20
}

function p(text, y, opts = {}) {
  const { color = TEXT_DARK, size = 10, font = 'Helvetica', width = CW, indent = 0, lineGap = 2 } = opts
  doc.save()
  doc.fillColor(color).fontSize(size).font(font)
  doc.text(text, ML + indent, y, { width: width - indent, lineGap, align: opts.align || 'left' })
  const newY = doc.y
  doc.restore()
  return newY + 4
}

function bullet(label, text, y, opts = {}) {
  const { color = GREEN, size = 10 } = opts
  doc.save()
  doc.fillColor(color).fontSize(size).font('Helvetica-Bold').text('•', ML + 4, y)
  doc.fillColor(FOREST).fontSize(size).font('Helvetica-Bold').text(label, ML + 18, y, { continued: !!text })
  if (text) {
    doc.fillColor(TEXT_DARK).font('Helvetica').text(`  ${text}`, { width: CW - 18 })
  }
  const newY = doc.y
  doc.restore()
  return newY + 4
}

function step(num, label, body, y) {
  doc.save()
  doc.circle(ML + 12, y + 8, 11).fillAndStroke(AMBER, AMBER)
  doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold')
     .text(String(num), ML, y + 4, { width: 24, align: 'center' })
  doc.fillColor(FOREST).fontSize(11).font('Helvetica-Bold').text(label, ML + 34, y + 2, { width: CW - 34 })
  if (body) {
    doc.fillColor(TEXT_MUTED).fontSize(10).font('Helvetica')
       .text(body, ML + 34, y + 18, { width: CW - 34, lineGap: 1 })
  }
  doc.restore()
  return Math.max(y + 24, doc.y) + 8
}

function labelValue(label, value, y, opts = {}) {
  const { valueFont = 'Helvetica-Bold', valueColor = TEXT_DARK, valueSize = 12 } = opts
  doc.save()
  doc.fillColor(TEXT_MUTED).fontSize(8).font('Helvetica-Bold')
     .text(label.toUpperCase(), ML + 14, y, { characterSpacing: 2 })
  doc.fillColor(valueColor).fontSize(valueSize).font(valueFont).text(value, ML + 14, y + 12)
  doc.restore()
  return y + 36
}

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 1 — PORTADA
// ═══════════════════════════════════════════════════════════════════════
drawPageChrome('Portada')

doc.save()
doc.rect(0, MT + 100, 8, 280).fill(GOLD_LIGHT)
doc.restore()

doc.fillColor(GOLD).fontSize(10).font('Helvetica-Bold')
   .text('CENTRAL MILLWORK', 30, MT + 110, { characterSpacing: 4 })

doc.fillColor(FOREST).fontSize(40).font('Helvetica-Bold').text('Manual de arranque', 30, MT + 140)
doc.fillColor(GOLD_LIGHT).fontSize(40).font('Helvetica-Bold').text('Módulo de Producción', 30, MT + 195)

doc.moveTo(30, MT + 270).lineTo(150, MT + 270).strokeColor(GOLD_LIGHT).lineWidth(2).stroke()

doc.fillColor(TEXT_MUTED).fontSize(13).font('Helvetica-Oblique')
   .text('Guía operativa para el arranque del lunes 15 de junio de 2026.\nIncluye accesos, flujos del Shop Manager, guía del operario en el Kiosko, plan de habilitación gradual y casos comunes.',
         30, MT + 285, { width: CW - 30, lineGap: 4 })

// Tabla de contenidos
const tocY = MT + 380
doc.fillColor(FOREST).fontSize(11).font('Helvetica-Bold').text('CONTENIDO', 30, tocY, { characterSpacing: 3 })

const toc = [
  ['1', 'Acceso al sistema', '2'],
  ['2', 'Qué es el módulo de Producción', '3'],
  ['3', 'Las 8 estaciones del taller', '4'],
  ['4', 'Para el Shop Manager (parte 1)', '5'],
  ['5', 'Para el Shop Manager (parte 2)', '6'],
  ['6', 'En el Kiosko: identificarse y arrancar', '7'],
  ['7', 'En el Kiosko: pausar, fotos, completar', '8'],
  ['8', 'Plan de arranque controlado', '9'],
  ['9', 'Operarios y PINs', '10'],
  ['10', 'Casos comunes y resolución', '11'],
]
let ty = tocY + 22
toc.forEach(([n, t, p]) => {
  doc.fillColor(GOLD).fontSize(10).font('Helvetica-Bold').text(n + '.', 30, ty, { width: 20 })
  doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica').text(t, 55, ty, { width: 380 })
  doc.fillColor(TEXT_MUTED).fontSize(10).font('Helvetica').text('pág. ' + p, 0, ty, { width: W - 50, align: 'right' })
  ty += 18
})

doc.fillColor(TEXT_LIGHT).fontSize(9).font('Helvetica-Oblique')
   .text('Generado el 15 de junio de 2026 · Documento interno · Mantener confidencial',
         30, H - 145, { width: CW, align: 'left', lineBreak: false })

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 2 — ACCESO AL SISTEMA
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Acceso al sistema')
let y = sectionTitle('01', 'Acceso al sistema', 'Quién entra a qué, con qué credencial y desde qué dispositivo.')

// Caja Shop Manager
box(y, 195, { accent: BLUE })
doc.fillColor(BLUE).fontSize(10).font('Helvetica-Bold').text('SHOP MANAGER', ML + 14, y + 16, { characterSpacing: 3 })
doc.fillColor(FOREST).fontSize(15).font('Helvetica-Bold').text('Luis Sagarnaga', ML + 14, y + 34)

let by = y + 64
by = labelValue('Correo (usuario)', 'shaggy@centralmillwork.com', by, { valueFont: 'Courier', valueSize: 11 })
by = labelValue('Contraseña temporal', 'Produccion2026!', by, { valueFont: 'Courier-Bold', valueColor: AMBER, valueSize: 14 })

doc.fillColor(TEXT_MUTED).fontSize(9).font('Helvetica-Oblique')
   .text('Cambiar la contraseña después del primer ingreso desde el menú del perfil.',
         ML + 14, by, { width: CW - 28 })
y += 215

// URL para Shop Manager
doc.fillColor(TEXT_MUTED).fontSize(9).font('Helvetica-Bold')
   .text('ABRIR EN COMPUTADORA O TABLET', ML, y, { characterSpacing: 2 })
y += 14
doc.fillColor(BLUE).fontSize(11).font('Courier').text(URL_LOGIN, ML, y, { link: URL_LOGIN, underline: true })
y += 30

// Caja Kiosko
box(y, 165, { accent: AMBER })
doc.fillColor(AMBER).fontSize(10).font('Helvetica-Bold').text('KIOSKO (iPad en el taller)', ML + 14, y + 16, { characterSpacing: 3 })
doc.fillColor(FOREST).fontSize(15).font('Helvetica-Bold').text('Acceso por PIN, no por contraseña', ML + 14, y + 34)

doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
   .text('Cada operario tiene su PIN personal de 4 dígitos. La pantalla del kiosko no pide email ni contraseña: directamente muestra el teclado numérico.',
         ML + 14, y + 60, { width: CW - 28, lineGap: 2 })

by = y + 110
doc.fillColor(TEXT_MUTED).fontSize(9).font('Helvetica-Bold')
   .text('ABRIR EN SAFARI DEL iPAD', ML + 14, by, { characterSpacing: 2 })
doc.fillColor(BLUE).fontSize(11).font('Courier').text(URL_KIOSK, ML + 14, by + 14, { link: URL_KIOSK, underline: true })
doc.fillColor(TEXT_MUTED).fontSize(8).font('Helvetica-Oblique')
   .text('Recomendado: Compartir → Añadir a pantalla de inicio, así abre a pantalla completa.',
         ML + 14, by + 36, { width: CW - 28 })

y += 185

// Nota importante WiFi
box(y, 75, { fill: AMBER_PALE, border: AMBER, accent: AMBER })
doc.fillColor(AMBER).fontSize(10).font('Helvetica-Bold')
   .text('IMPORTANTE — CONEXIÓN', ML + 14, y + 14, { characterSpacing: 2 })
doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
   .text('El sistema necesita conexión a internet en todo momento. Si el iPad pierde WiFi, los toques (iniciar, pausar, completar) no se guardan. Asegurar WiFi estable en el taller o datos celulares como respaldo.',
         ML + 14, y + 32, { width: CW - 28, lineGap: 2 })

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 3 — QUÉ ES EL MÓDULO
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Qué es el módulo de Producción')
y = sectionTitle('02', 'Qué es el módulo de Producción', 'Concepto general antes de entrar al detalle operativo.')

y = h3('El problema que resuelve', y)
y = p('Hasta hoy, el avance del taller vivía en planillas, mensajes y memoria de quien estaba en la pieza. Saber en qué etapa está una orden, quién la trabajó, cuánto tardó o por qué se paró requería preguntar.',
      y, { lineGap: 3 })
y = p('Con el módulo de Producción, cada movimiento queda registrado en el momento, desde el taller mismo. Una sola fuente de verdad para todo el equipo.',
      y, { lineGap: 3 })

y += 14
y = h3('Quiénes participan', y)

box(y, 132)
let cy = y + 14

doc.fillColor(BLUE).fontSize(10).font('Helvetica-Bold').text('SHOP MANAGER', ML + 14, cy, { characterSpacing: 2 })
doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
   .text('Crea las órdenes de producción, asigna operarios a las estaciones, supervisa el avance del día y resuelve lo que se traba.',
         ML + 14, cy + 14, { width: CW - 28, lineGap: 2 })
cy += 52

doc.fillColor(AMBER).fontSize(10).font('Helvetica-Bold').text('OPERARIOS', ML + 14, cy, { characterSpacing: 2 })
doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
   .text('Trabajan en su estación. Se identifican con PIN en el kiosko, marcan inicio, pausa y fin de cada item, toman fotos cuando corresponde.',
         ML + 14, cy + 14, { width: CW - 28, lineGap: 2 })
cy += 52

doc.fillColor(GREEN).fontSize(10).font('Helvetica-Bold').text('DIRECCIÓN Y PM', ML + 14, cy, { characterSpacing: 2 })
doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
   .text('Ven el estado en vivo desde la app web: qué orden está en qué estación, cuánto lleva, qué fotos se tomaron, qué métricas acumula el taller.',
         ML + 14, cy + 14, { width: CW - 28, lineGap: 2 })

y += 152

y = h3('Cómo conviven la oficina y el taller', y)
y = p('La oficina usa la app web (Shop Manager planifica y supervisa; Dirección y PM consultan). El taller usa los iPads como kiosko táctil. Cada uno con la herramienta que le sirve.',
      y, { lineGap: 3 })
y = p('El operario no necesita saber de computadoras: el kiosko muestra solo lo que tiene asignado, con botones grandes para tocar.',
      y, { lineGap: 3 })

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 4 — LAS 8 ESTACIONES
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Las 8 estaciones del taller')
y = sectionTitle('03', 'Las 8 estaciones del taller', 'Cada orden recorre solo las que su tipo requiere, en el orden que le corresponde.')

const stations = [
  { id: 'cnc',          desc: 'Corte de piezas con máquinas de precisión',  foto: false, min: '—' },
  { id: 'edge_banding', desc: 'Aplicación de cantos en los bordes',         foto: false, min: '—' },
  { id: 'lamina',       desc: 'Laminado de superficies',                    foto: true,  min: '3 fotos' },
  { id: 'pintura',      desc: 'Acabado y color final',                      foto: true,  min: '3 fotos' },
  { id: 'assembly',     desc: 'Ensamble de las piezas terminadas',          foto: true,  min: '3 fotos' },
  { id: 'final',        desc: 'Detalles, pulido y revisión',                foto: true,  min: '3 fotos' },
  { id: 'registro',     desc: 'Verificación, conteo y empaque',             foto: true,  min: '3 fotos' },
  { id: 'shipping',     desc: 'Embalaje y preparación para entrega',        foto: true,  min: '8 fotos' },
]

const colW = (CW - 12) / 2
const rowH = 78
stations.forEach((st, i) => {
  const col = i % 2
  const row = Math.floor(i / 2)
  const x = ML + col * (colW + 12)
  const ry = y + row * (rowH + 10)

  doc.save()
  doc.rect(x, ry, colW, rowH).fillAndStroke('#FFFFFF', BORDER)
  doc.rect(x, ry, 4, rowH).fill(st.foto ? GREEN : TEXT_LIGHT)

  doc.fillColor(FOREST).fontSize(13).font('Helvetica-Bold').text(`${i + 1}. ${st.id}`, x + 14, ry + 10)
  doc.fillColor(TEXT_MUTED).fontSize(9).font('Helvetica')
     .text(st.desc, x + 14, ry + 28, { width: colW - 28, lineGap: 1 })

  const tagColor = st.foto ? GREEN : TEXT_MUTED
  const tagBg = st.foto ? GREEN_PALE : BG_PALE
  doc.rect(x + 14, ry + 54, colW - 28, 16).fillAndStroke(tagBg, tagBg)
  doc.fillColor(tagColor).fontSize(9).font('Helvetica-Bold')
     .text(st.foto ? `📷  Foto obligatoria · ${st.min}` : 'Sin foto obligatoria',
           x + 14, ry + 58, { width: colW - 28, align: 'center', characterSpacing: 1 })
  doc.restore()
})

y += Math.ceil(stations.length / 2) * (rowH + 10) + 18

box(y, 70, { fill: BLUE_PALE, border: BLUE, accent: BLUE })
doc.fillColor(BLUE).fontSize(10).font('Helvetica-Bold').text('CÓMO FUNCIONA EL RECORRIDO', ML + 14, y + 12, { characterSpacing: 2 })
doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
   .text('Al crear una orden, el Shop Manager elige las estaciones que esa orden va a recorrer (por ejemplo: CNC → Edge Banding → Assembly → Pintura → Final). Cuando un operario completa su estación, la orden viaja automáticamente a la siguiente. Nadie tiene que llamar al de la otra estación.',
         ML + 14, y + 30, { width: CW - 28, lineGap: 2 })

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 5 — SHOP MANAGER PARTE 1
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Para el Shop Manager — crear y asignar')
y = sectionTitle('04', 'Para el Shop Manager (1 de 2)', 'Crear una orden de producción y asignar operarios a sus estaciones.')

y = h3('Crear una orden de producción', y)
y += 4

y = step(1, 'Entrar a la app web con tu correo y la contraseña.',
         'shaggy@centralmillwork.com · Produccion2026!  (cambiar después del primer ingreso)', y)
y = step(2, 'Ir al menú "Producción" → botón "Nueva orden".', null, y)
y = step(3, 'Completar los datos del item:',
         'Número de item, cantidad, proyecto, prioridad, fecha de entrega comprometida.', y)
y = step(4, 'Definir la ruta de estaciones.',
         'Elegir qué estaciones recorre el item (CNC, Edge Banding, etc.) en el orden que corresponde. El sistema sugiere una ruta por defecto que se puede editar.', y)
y = step(5, 'Confirmar la creación.',
         'La orden queda en estado "Pendiente" hasta que un operario la inicie en su kiosko.', y)

y += 8
y = h3('Asignar operarios a las estaciones', y)
y = p('Cada estación necesita al menos un operario asignado para que las órdenes puedan correr. Se asigna desde el menú "Personal" → seleccionar el operario → elegir las estaciones donde trabaja.',
      y, { lineGap: 2 })
y += 4

box(y, 110, { fill: BG_PALE, accent: GOLD_LIGHT })
doc.fillColor(GOLD).fontSize(10).font('Helvetica-Bold')
   .text('ASIGNACIONES SUGERIDAS DEL EQUIPO ACTUAL', ML + 14, y + 12, { characterSpacing: 1.5 })

const assignSugeridas = [
  ['cnc / edge_banding', 'Victor (cubrirlo con backup también)'],
  ['lamina',             'Julio (asignar backup también)'],
  ['pintura',            'Elvis, José, Raquel, Victor'],
  ['assembly',           'Dilan, Juan, Luis, Rolando, Rubén'],
  ['final',              'Jhonatan, Renny'],
  ['registro / shipping','Renny (asignar backup también)'],
]
let cy2 = y + 30
assignSugeridas.forEach(([est, ops]) => {
  doc.fillColor(FOREST).fontSize(9).font('Helvetica-Bold').text(est, ML + 14, cy2, { width: 130 })
  doc.fillColor(TEXT_DARK).fontSize(9).font('Helvetica').text(ops, ML + 150, cy2, { width: CW - 164 })
  cy2 += 13
})

y += 130

box(y, 60, { fill: RED_PALE, border: RED, accent: RED })
doc.fillColor(RED).fontSize(10).font('Helvetica-Bold').text('CUIDADO CON LAS ESTACIONES CON UNA SOLA PERSONA', ML + 14, y + 12, { characterSpacing: 1.5 })
doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
   .text('CNC, Edge Banding, Lámina, Registro y Shipping hoy tienen un solo operario asignado. Si esa persona falta, esa estación queda sin cobertura. Asignar un segundo operario como backup antes del lunes.',
         ML + 14, y + 28, { width: CW - 28, lineGap: 2 })

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 6 — SHOP MANAGER PARTE 2
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Para el Shop Manager — supervisar y resolver')
y = sectionTitle('05', 'Para el Shop Manager (2 de 2)', 'Supervisar el avance del día, registrar recepciones y resolver casos especiales.')

y = h3('Supervisar el avance', y)
y = p('Desde el menú "Producción" tenés tres vistas que se actualizan en vivo:', y, { lineGap: 2 })
y += 4

y = bullet('Mapa del taller.', 'Vista visual con las 8 estaciones. Cada orden aparece como una tarjeta con su número, item y operario actual. Color indica estado.', y)
y = bullet('Lista de órdenes.', 'Tabla con todas las órdenes activas, filtrable por estación, operario, proyecto o estado.', y)
y = bullet('Evolución de la orden.', 'Click en una orden para ver su línea de tiempo: cuándo entró a cada estación, quién la trabajó, cuántos minutos lleva, qué fotos se tomaron, qué pausas tuvo y por qué.', y)

y += 8
y = h3('Registrar una recepción de materiales', y)
y = p('Cuando llega mercadería al taller, el Shop Manager puede registrar la recepción desde la app:',
      y, { lineGap: 2 })
y += 4
y = step(1, 'Ir al menú "Recepciones" → "Nueva recepción".', null, y)
y = step(2, 'Buscar la orden de compra que está llegando.', 'Por número de OC o por proveedor.', y)
y = step(3, 'Marcar qué se recibió y qué faltó.', 'Item por item, con cantidad real recibida.', y)
y = step(4, 'Subir foto del ticket y del material (si corresponde) y guardar.', null, y)

y += 8
y = h3('Cancelar una orden de producción o una OC', y)
y = p('Si una orden hay que descartarla (por ejemplo, error en el item), abrir el detalle y usar el botón "Cancelar". Esto preserva el folio en el historial. No usar "Eliminar" porque rompe la trazabilidad.',
      y, { lineGap: 2 })

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 7 — KIOSKO PARTE 1
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('En el Kiosko — identificarse y arrancar')
y = sectionTitle('06', 'En el Kiosko (1 de 2)', 'Lo que ve y hace cada operario, paso a paso, en la pantalla táctil del taller.')

y = h3('Identificarse', y)
y = p('Al abrir el kiosko, la primera pantalla muestra un teclado numérico grande. El operario:',
      y, { lineGap: 2 })
y += 4
y = step(1, 'Toca los 4 dígitos de su PIN personal.', null, y)
y = step(2, 'Toca "Ingresar".', 'El sistema lo identifica. No usa email ni contraseña.', y)

y += 8
y = h3('Ver las órdenes asignadas', y)
y = p('Tras ingresar, el operario ve las órdenes que están en su estación y le tocan a él. Por cada orden aparece:',
      y, { lineGap: 2 })
y += 4
y = bullet('Número de la orden y código del item.', null, y)
y = bullet('Proyecto al que pertenece.', null, y)
y = bullet('Prioridad (Alta, Media, Baja).', null, y)
y = bullet('Botón grande "Iniciar" o "Continuar".', '"Iniciar" si nunca se arrancó. "Continuar" si ya se había trabajado antes.', y)

y += 8
y = h3('Iniciar el trabajo', y)
y = step(1, 'Tocar el botón "Iniciar" / "Continuar" de la orden que va a trabajar.',
         'El sistema arranca el cronómetro y deja la orden marcada como "en proceso".', y)
y = step(2, 'Si tenía otra orden abierta antes, se cierra automáticamente.',
         'Un operario solo puede tener un item activo a la vez.', y)

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 8 — KIOSKO PARTE 2
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('En el Kiosko — pausar, fotos, completar')
y = sectionTitle('07', 'En el Kiosko (2 de 2)', 'Pausar el trabajo, tomar las fotos requeridas y completar la etapa.')

y = h3('Pausar el trabajo', y)
y = p('Si el operario tiene que parar (esperando material, va a almorzar, lo llaman para otra cosa), toca "Pausar". El sistema le pide elegir el motivo:',
      y, { lineGap: 2 })
y += 4
y = bullet('Esperando material.', 'Faltan piezas o insumos.', y)
y = bullet('Esperando validación.', 'Necesita confirmación del Shop Manager o supervisor.', y)
y = bullet('Cambio de actividad.', 'Va a otra tarea por orden del Shop Manager.', y)
y = bullet('Descanso / almuerzo.', null, y)
y = bullet('Otro.', 'Permite escribir un motivo breve.', y)
y += 4
y = p('La pausa queda registrada con su razón y duración. Cuando vuelve, toca "Continuar".',
      y, { lineGap: 2 })

y += 8
y = h3('Tomar fotos de avance', y)
y = p('En las estaciones que las requieren (lámina, pintura, assembly, final, registro, shipping), antes de marcar "Completar" hay que tomar fotos. El sistema no deja avanzar sin ellas.',
      y, { lineGap: 2 })
y += 4
y = step(1, 'Tocar "Tomar foto" en la orden activa.', null, y)
y = step(2, 'El kiosko abre la cámara del iPad.', null, y)
y = step(3, 'Encuadrar el trabajo terminado y tocar el obturador.', null, y)
y = step(4, 'Repetir hasta llegar al mínimo (3 fotos en la mayoría; 8 en Shipping).', null, y)

y += 8
y = h3('Completar la etapa', y)
y = p('Cuando el trabajo está hecho y las fotos están tomadas, tocar "Completar". La orden viaja automáticamente a la siguiente estación. El operario de la próxima estación la encuentra en su kiosko.',
      y, { lineGap: 2 })

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 9 — PLAN DE ARRANQUE
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Plan de arranque controlado')
y = sectionTitle('08', 'Plan de arranque controlado', 'Vamos despacio. Una estación a la vez. Validamos cada paso.')

y = h3('Lunes 15 de junio · día de configuración', y)
y = step(1, 'Temprano: validar que los iPads abren el kiosko y que el WiFi del taller es estable.', null, y)
y = step(2, 'Cargar los PINs de los operarios que no los tienen.', 'Ver sección 9 — Operarios y PINs. Chali entrega la lista a Claude para cargarlos al sistema.', y)
y = step(3, 'Shop Manager crea la primera orden de producción de prueba.',
         'Un item simple, ruta corta (por ejemplo: CNC → Assembly → Final).', y)
y = step(4, 'Capacitar al primer operario que va a iniciar el flujo.',
         'Mostrarle cómo identificarse, iniciar, pausar, tomar foto y completar.', y)

y += 8
y = h3('Martes 16 de junio · primera orden corre de verdad', y)
y = p('La orden de prueba arranca con un operario. A medida que avanza por las estaciones, vamos capacitando al siguiente operario que la va a recibir. Habilitamos las estaciones una por una, no todas al mismo tiempo.',
      y, { lineGap: 2 })

y += 8
y = h3('Días siguientes · expansión gradual', y)
y = p('Cuando la primera orden completa todo el recorrido sin problemas, arrancan más órdenes en paralelo. Para entonces el equipo ya tiene experiencia y el flujo es natural.',
      y, { lineGap: 2 })

y += 14
box(y, 80, { fill: GREEN_PALE, border: GREEN, accent: GREEN })
doc.fillColor(GREEN).fontSize(10).font('Helvetica-Bold')
   .text('POR QUÉ ARRANCAR ASÍ', ML + 14, y + 12, { characterSpacing: 2 })
doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
   .text('Habilitar una sola estación por vez permite detectar problemas chicos antes de que afecten a todo el taller. Si en CNC hay un detalle, lo resolvemos antes de que llegue a Pintura. Si el primer operario tiene una duda, la resolvemos antes de que la tenga el siguiente. Lento al principio, sólido después.',
         ML + 14, y + 28, { width: CW - 28, lineGap: 2 })

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 10 — OPERARIOS Y PINs
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Operarios y PINs')
y = sectionTitle('09', 'Operarios y PINs', '13 operarios activos. 6 ya tienen PIN. 7 lo necesitan antes del lunes.')

// Header de tabla
const colNum = ML
const colName = ML + 30
const colStations = ML + 130
const colPin = ML + 340
const colNew = ML + 420

doc.save()
doc.rect(ML, y, CW, 24).fill(FOREST)
doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold')
doc.text('#', colNum + 4, y + 8, { width: 22 })
doc.text('OPERARIO', colName, y + 8, { width: 95, characterSpacing: 1 })
doc.text('ESTACIONES ASIGNADAS', colStations, y + 8, { width: 205, characterSpacing: 1 })
doc.text('TIENE PIN', colPin, y + 8, { width: 75, characterSpacing: 1 })
doc.text('PIN NUEVO', colNew, y + 8, { width: 95, characterSpacing: 1 })
doc.restore()

y += 24

const operarios = [
  { name: 'Dilan',    stations: 'assembly',                         hasPin: false },
  { name: 'Elvis',    stations: 'pintura',                          hasPin: false },
  { name: 'Jhonatan', stations: 'final',                            hasPin: true  },
  { name: 'José',     stations: 'pintura',                          hasPin: false },
  { name: 'Juan',     stations: 'assembly',                         hasPin: false },
  { name: 'Julio',    stations: 'lamina',                           hasPin: true  },
  { name: 'Luis',     stations: 'assembly',                         hasPin: false },
  { name: 'Raquel',   stations: 'pintura',                          hasPin: false },
  { name: 'Renny',    stations: 'final, registro, shipping',        hasPin: true  },
  { name: 'Rolando',  stations: 'assembly',                         hasPin: true  },
  { name: 'Rubén',    stations: 'assembly',                         hasPin: false },
  { name: 'Victor',   stations: 'pintura',                          hasPin: true  },
  { name: 'Victor',   stations: 'cnc, edge_banding',                hasPin: true  },
]

const rowHeight = 24
operarios.forEach((op, i) => {
  doc.save()
  if (i % 2 === 1) doc.rect(ML, y, CW, rowHeight).fill(BG_PALE)
  doc.fillColor(TEXT_LIGHT).fontSize(9).font('Helvetica').text(String(i + 1), colNum + 4, y + 8, { width: 22 })
  doc.fillColor(FOREST).fontSize(10).font('Helvetica-Bold').text(op.name, colName, y + 8, { width: 95 })
  doc.fillColor(TEXT_DARK).fontSize(9).font('Helvetica').text(op.stations, colStations, y + 8, { width: 205 })

  if (op.hasPin) {
    doc.rect(colPin, y + 4, 60, 16).fillAndStroke(GREEN_PALE, GREEN_PALE)
    doc.fillColor(GREEN).fontSize(9).font('Helvetica-Bold').text('SÍ', colPin, y + 8, { width: 60, align: 'center' })
    doc.fillColor(TEXT_LIGHT).fontSize(9).font('Helvetica-Oblique').text('—', colNew, y + 8, { width: 95, align: 'center' })
  } else {
    doc.rect(colPin, y + 4, 60, 16).fillAndStroke(RED_PALE, RED_PALE)
    doc.fillColor(RED).fontSize(9).font('Helvetica-Bold').text('NO', colPin, y + 8, { width: 60, align: 'center' })
    doc.moveTo(colNew, y + 18).lineTo(colNew + 80, y + 18).strokeColor(BORDER_DARK).lineWidth(0.5).stroke()
  }
  doc.restore()
  y += rowHeight
})

y += 10
box(y, 65, { fill: AMBER_PALE, border: AMBER, accent: AMBER })
doc.fillColor(AMBER).fontSize(10).font('Helvetica-Bold')
   .text('CÓMO LLENAR ESTA TABLA', ML + 14, y + 12, { characterSpacing: 2 })
doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
   .text('Pasar la lista de los 7 operarios sin PIN a Claude (impreso en este documento o por mensaje) con un PIN sugerido de 4 dígitos por persona. Claude los carga al sistema antes del lunes. Si preferís, Claude genera los PINs aleatorios y los devuelve para imprimir.',
         ML + 14, y + 28, { width: CW - 28, lineGap: 2 })

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 11 — TROUBLESHOOTING
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Casos comunes y resolución')
y = sectionTitle('10', 'Casos comunes y resolución', 'Qué hacer si algo no anda como debería el día del arranque.')

const cases = [
  {
    title: 'El iPad pierde WiFi en mitad del trabajo',
    body: 'El sistema NO guarda los toques offline (esto se va a implementar más adelante). Si el WiFi se cae, el operario debe parar de tocar el kiosko hasta que vuelva la conexión. Aviso al Shop Manager. Cuando vuelve el WiFi, retomar normal.',
    color: RED, bg: RED_PALE,
  },
  {
    title: 'Una foto no termina de subirse',
    body: 'Volver a tocar "Tomar foto" e intentarlo de nuevo. Si persiste el problema, el operario completa la cantidad mínima y el Shop Manager revisa desde la app web si las fotos llegaron al servidor.',
    color: AMBER, bg: AMBER_PALE,
  },
  {
    title: 'El operario no aparece en la lista del kiosko',
    body: 'Probablemente no está asignado a esa estación o no tiene PIN cargado. Verificar desde "Personal" en la app web y agregarlo a la estación.',
    color: BLUE, bg: BLUE_PALE,
  },
  {
    title: 'Hay que cancelar una orden de producción',
    body: 'Desde el detalle de la orden, usar "Cancelar" (no eliminar). Si la orden ya estaba en proceso, el operario debe completar lo que pueda o pausarla antes para que el cronómetro cierre limpio.',
    color: PURPLE, bg: PURPLE_PALE,
  },
  {
    title: 'El sistema dice "error del servidor"',
    body: 'Lo más común es que la conexión se cortó un momento. Esperar 30 segundos y reintentar. Si persiste, avisar a Chali. Los errores quedan registrados automáticamente en el sistema de monitoreo (Sentry).',
    color: GREEN, bg: GREEN_PALE,
  },
]

cases.forEach((c) => {
  box(y, 72, { fill: c.bg, border: c.color, accent: c.color })
  doc.fillColor(c.color).fontSize(11).font('Helvetica-Bold').text(c.title, ML + 14, y + 14, { width: CW - 28 })
  doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
     .text(c.body, ML + 14, y + 32, { width: CW - 28, lineGap: 2 })
  y += 82
})

doc.end()
console.log('OK guardado en:', outPath)
