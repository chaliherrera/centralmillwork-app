// PDF — Hoja de accesos para arranque del módulo Producción
// Lunes 2026-06-15. Para SHOP_MANAGER y kiosko iPad.
const PDFDocument = require('pdfkit')
const fs = require('fs')

const outPath = String.raw`C:\Users\chali\OneDrive - Central Millwork\centralmillwork-app\accesos_produccion_2026_06_15.pdf`

const doc = new PDFDocument({ size: 'LETTER', margin: 40 })
doc.pipe(fs.createWriteStream(outPath))

// ─── Paleta corporativa ──────────────────────────────────────────────────
const GOLD       = '#9B7200'
const GOLD_LIGHT = '#DEA832'
const FOREST     = '#2C3126'
const FOREST_MID = '#4A5240'
const BG_PALE    = '#F8F6F0'
const TEXT_DARK  = '#1F1B14'
const TEXT_MUTED = '#6B6356'
const ACCENT_BLUE  = '#2563EB'
const ACCENT_AMBER = '#D97706'
const ACCENT_GREEN = '#059669'

// URLs
const URL_APP    = 'https://centralmillwork-frontend-production.up.railway.app'
const URL_LOGIN  = `${URL_APP}/login`
const URL_KIOSK  = `${URL_APP}/kiosko`

// ─── HEADER ──────────────────────────────────────────────────────────────
// Banda dorada superior
doc.rect(0, 0, doc.page.width, 8).fill(GOLD_LIGHT)

// Logo/título
doc.fillColor(GOLD).fontSize(10).font('Helvetica-Bold')
   .text('CENTRAL MILLWORK', 40, 25, { characterSpacing: 4 })

doc.fillColor(FOREST).fontSize(24).font('Helvetica-Bold')
   .text('Hoja de accesos', 40, 50)
doc.fillColor(GOLD_LIGHT).fontSize(24).font('Helvetica-Bold')
   .text('Módulo de Producción', 40, 80)

doc.fillColor(TEXT_MUTED).fontSize(11).font('Helvetica-Oblique')
   .text('Para el arranque del lunes 15 de junio de 2026 · Validar accesos el viernes 13 por la tarde', 40, 115)

// Línea separadora
doc.moveTo(40, 145).lineTo(doc.page.width - 40, 145)
   .strokeColor(GOLD_LIGHT).lineWidth(1).stroke()

// ─── SECCIÓN 1: SHOP MANAGER ─────────────────────────────────────────────
let y = 165

// Título de sección con icono
doc.fillColor(ACCENT_BLUE).fontSize(14).font('Helvetica-Bold')
   .text('1.', 40, y)
doc.fillColor(FOREST).fontSize(16).font('Helvetica-Bold')
   .text('Acceso del Shop Manager', 65, y - 2)
y += 26
doc.fillColor(TEXT_MUTED).fontSize(10).font('Helvetica-Oblique')
   .text('Computadora o tablet. Vista web completa con dashboard, proyectos, recepciones y producción.', 40, y)
y += 28

// Caja con datos
doc.rect(40, y, doc.page.width - 80, 175).fill('#FFFFFF')
   .strokeColor(GOLD_LIGHT).lineWidth(1).stroke()
doc.rect(40, y, doc.page.width - 80, 6).fill(ACCENT_BLUE)

let bx = 55
let by = y + 20

doc.fillColor(TEXT_MUTED).fontSize(9).font('Helvetica-Bold')
   .text('USUARIO', bx, by, { characterSpacing: 2 })
doc.fillColor(TEXT_DARK).fontSize(13).font('Helvetica-Bold')
   .text('LUIS SAGARNAGA (shaggy)', bx, by + 12)

doc.fillColor(TEXT_MUTED).fontSize(9).font('Helvetica-Bold')
   .text('ROL DEL SISTEMA', bx, by + 38, { characterSpacing: 2 })
doc.fillColor(ACCENT_BLUE).fontSize(11).font('Helvetica-Bold')
   .text('SHOP_MANAGER', bx, by + 50)

// Email — link
doc.fillColor(TEXT_MUTED).fontSize(9).font('Helvetica-Bold')
   .text('CORREO (USUARIO)', bx, by + 75, { characterSpacing: 2 })
doc.fillColor(TEXT_DARK).fontSize(11).font('Courier')
   .text('shaggy@centralmillwork.com', bx, by + 88)

// Password — destacada
doc.fillColor(TEXT_MUTED).fontSize(9).font('Helvetica-Bold')
   .text('CONTRASEÑA TEMPORAL', bx, by + 113, { characterSpacing: 2 })
doc.fillColor(ACCENT_AMBER).fontSize(15).font('Courier-Bold')
   .text('Produccion2026!', bx, by + 126)

// Nota password
doc.fillColor(TEXT_MUTED).fontSize(8).font('Helvetica-Oblique')
   .text('Cambiarla después del primer ingreso desde Configuración del perfil.', bx, by + 148)

y += 195

// URL del Shop Manager — link clickeable
doc.fillColor(TEXT_MUTED).fontSize(10).font('Helvetica-Bold')
   .text('ABRIR LA APP EN UN NAVEGADOR', 40, y, { characterSpacing: 2 })
y += 16
doc.fillColor(ACCENT_BLUE).fontSize(11).font('Courier').underline(40, y, 380, 14, { color: ACCENT_BLUE })
   .text(URL_LOGIN, 40, y, { link: URL_LOGIN })
y += 30

// Lo que verá Luis al entrar
doc.fillColor(FOREST).fontSize(11).font('Helvetica-Bold')
   .text('Una vez dentro, tiene acceso a:', 40, y)
y += 18

const accesosSM = [
  { label: 'Dashboard',   desc: 'Visión general del taller, métricas en tiempo real' },
  { label: 'Proyectos',   desc: 'Estado de cada proyecto, materiales y avances' },
  { label: 'Recepciones', desc: 'Registrar mercadería que llega al taller' },
  { label: 'Producción',  desc: 'Crear órdenes de producción, asignar estaciones, supervisar' },
]
accesosSM.forEach((a) => {
  doc.fillColor(ACCENT_GREEN).fontSize(11).font('Helvetica-Bold').text('✓', 50, y)
  doc.fillColor(TEXT_DARK).fontSize(11).font('Helvetica-Bold').text(a.label, 65, y)
  doc.fillColor(TEXT_MUTED).fontSize(10).font('Helvetica').text(`— ${a.desc}`, 140, y)
  y += 18
})

// ─── SECCIÓN 2: KIOSKO ─────────────────────────────────────────────────
y += 18
doc.moveTo(40, y).lineTo(doc.page.width - 40, y)
   .strokeColor('#D8D1C0').lineWidth(0.5).stroke()
y += 18

doc.fillColor(ACCENT_AMBER).fontSize(14).font('Helvetica-Bold')
   .text('2.', 40, y)
doc.fillColor(FOREST).fontSize(16).font('Helvetica-Bold')
   .text('Acceso del Kiosko (iPad)', 65, y - 2)
y += 26
doc.fillColor(TEXT_MUTED).fontSize(10).font('Helvetica-Oblique')
   .text('Pantalla táctil. Los operarios se identifican con su PIN, no con email ni contraseña.', 40, y)
y += 28

// Caja URL kiosko
doc.rect(40, y, doc.page.width - 80, 95).fill('#FFFFFF')
   .strokeColor(GOLD_LIGHT).lineWidth(1).stroke()
doc.rect(40, y, doc.page.width - 80, 6).fill(ACCENT_AMBER)

bx = 55
by = y + 20

doc.fillColor(TEXT_MUTED).fontSize(9).font('Helvetica-Bold')
   .text('ABRIR EN SAFARI DEL iPAD', bx, by, { characterSpacing: 2 })
doc.fillColor(ACCENT_BLUE).fontSize(13).font('Courier').underline(bx, by + 14, 380, 16, { color: ACCENT_BLUE })
   .text(URL_KIOSK, bx, by + 14, { link: URL_KIOSK })

doc.fillColor(TEXT_MUTED).fontSize(8).font('Helvetica-Oblique')
   .text('Recomendado: agregar a la pantalla de inicio (Compartir → Añadir a inicio) para que abra a pantalla completa.', bx, by + 44, { width: doc.page.width - 110 })

doc.fillColor(TEXT_MUTED).fontSize(9).font('Helvetica-Bold')
   .text('IDENTIFICACIÓN', bx, by + 65, { characterSpacing: 2 })
doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
   .text('Cada operario ingresa su PIN personal de 4 dígitos (se les comunica por separado).', bx, by + 78)

y += 115

// Cómo arranca el operario
doc.fillColor(FOREST).fontSize(11).font('Helvetica-Bold')
   .text('Qué hace el operario en el Kiosko:', 40, y)
y += 18

const opAcciones = [
  { num: '1.', t: 'Ingresar su PIN para identificarse' },
  { num: '2.', t: 'Ver las órdenes que tiene asignadas en su estación' },
  { num: '3.', t: 'Marcar "Iniciar" cuando empieza a trabajar en una' },
  { num: '4.', t: 'Si tiene que parar: marcar "Pausar" con motivo' },
  { num: '5.', t: 'Tomar las fotos requeridas (depende de la estación)' },
  { num: '6.', t: 'Marcar "Completar" → la orden viaja a la siguiente estación' },
]
opAcciones.forEach((a) => {
  doc.fillColor(ACCENT_AMBER).fontSize(11).font('Helvetica-Bold').text(a.num, 50, y)
  doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica').text(a.t, 75, y, { width: doc.page.width - 115 })
  y += 16
})

// ─── FOOTER ────────────────────────────────────────────────────────────
const footerY = doc.page.height - 50
doc.moveTo(40, footerY).lineTo(doc.page.width - 40, footerY)
   .strokeColor(GOLD_LIGHT).lineWidth(0.5).stroke()
doc.fillColor(TEXT_MUTED).fontSize(8).font('Helvetica-Oblique')
   .text('Central Millwork · Generado el 13 de junio de 2026 · Documento interno', 40, footerY + 8, { align: 'center', width: doc.page.width - 80 })
doc.fillColor(TEXT_MUTED).fontSize(8).font('Helvetica')
   .text('Mantener confidencial. La contraseña debe cambiarse después del primer ingreso.', 40, footerY + 22, { align: 'center', width: doc.page.width - 80 })

doc.end()

console.log('OK guardado en:', outPath)
