// Generador del diagrama visual del sistema Central Millwork
// Single slide, 13.33" × 7.5" (16:9 widescreen)
// Diseñado para ser entendido por alguien NO técnico
const pptxgen = require('pptxgenjs')

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE'
pres.author = 'Central Millwork'
pres.title = 'Arquitectura del Sistema'

// ─── Paleta de colores (basada en brand Central Millwork) ────────────────────
const FOREST_DARK   = '2C3126'   // forest-700
const FOREST_MID    = '4A5240'   // forest-500
const GOLD          = '9B7200'   // gold-500
const GOLD_LIGHT    = 'DEA832'   // gold-400
const BG            = 'F8F6F0'   // fondo crema suave
const CARD_BG       = 'FFFFFF'
const CARD_BORDER   = 'D8D1C0'
const TEXT_DARK     = '1F1B14'
const TEXT_MUTED    = '6B6356'
const TEXT_LIGHT    = 'B0A89A'

const slide = pres.addSlide()
slide.background = { color: BG }

// ─── HEADER ──────────────────────────────────────────────────────────────────
slide.addText('Cómo funciona Central Millwork', {
  x: 0.4, y: 0.25, w: 12.5, h: 0.5,
  fontSize: 30, fontFace: 'Calibri', bold: true,
  color: FOREST_DARK,
})
slide.addText('Estructura del sistema explicada en términos simples', {
  x: 0.4, y: 0.75, w: 12.5, h: 0.3,
  fontSize: 13, fontFace: 'Calibri', italic: true,
  color: TEXT_MUTED,
})

// ─── COLUMN 1 — USUARIOS Y DISPOSITIVOS (LEFT) ───────────────────────────────
slide.addText('1 · QUIÉN USA EL SISTEMA', {
  x: 0.4, y: 1.35, w: 2.5, h: 0.3,
  fontSize: 10, fontFace: 'Calibri', bold: true, color: GOLD,
  charSpacing: 2,
})

function userCard(y, emoji, title, desc) {
  slide.addShape('roundRect', {
    x: 0.4, y, w: 2.5, h: 1.05,
    fill: { color: CARD_BG },
    line: { color: CARD_BORDER, width: 1 },
    rectRadius: 0.08,
  })
  slide.addText(emoji, {
    x: 0.55, y: y + 0.1, w: 0.5, h: 0.55,
    fontSize: 26, valign: 'middle',
  })
  slide.addText(title, {
    x: 1.05, y: y + 0.12, w: 1.8, h: 0.3,
    fontSize: 11, bold: true, color: TEXT_DARK, fontFace: 'Calibri',
  })
  slide.addText(desc, {
    x: 1.05, y: y + 0.42, w: 1.8, h: 0.55,
    fontSize: 9, color: TEXT_MUTED, fontFace: 'Calibri',
  })
}

userCard(1.75, '👤', 'Admin (Chali)', 'Desde PC en la oficina')
userCard(2.9,  '📱', 'Operarios', 'Desde iPad — kiosko\nLogin con PIN 4 dígitos')
userCard(4.05, '💻', 'Equipo futuro', 'Ingeniería, Compras…\nLogin con email + contraseña')

// ─── COLUMN 2 — CLOUD (CENTER) ───────────────────────────────────────────────
slide.addText('2 · EN INTERNET (RAILWAY CLOUD — SERVIDOR 24/7)', {
  x: 3.1, y: 1.35, w: 6.85, h: 0.3,
  fontSize: 10, fontFace: 'Calibri', bold: true, color: GOLD,
  charSpacing: 2,
})

// Contenedor cloud grande (forest oscuro)
slide.addShape('roundRect', {
  x: 3.1, y: 1.7, w: 6.85, h: 4.6,
  fill: { color: FOREST_DARK },
  line: { color: GOLD_LIGHT, width: 0 },
  rectRadius: 0.12,
})

// Etiqueta cloud
slide.addText('☁️  Cloud — siempre prendida, sin importar si tu PC está apagada', {
  x: 3.3, y: 1.75, w: 6.5, h: 0.3,
  fontSize: 10, color: GOLD_LIGHT, italic: true, fontFace: 'Calibri',
})

// Sub-card: Frontend
slide.addShape('roundRect', {
  x: 3.35, y: 2.15, w: 6.35, h: 0.75,
  fill: { color: CARD_BG },
  line: { color: GOLD_LIGHT, width: 1 },
  rectRadius: 0.08,
})
slide.addText('🖥️', {
  x: 3.45, y: 2.25, w: 0.4, h: 0.55, fontSize: 22, valign: 'middle',
})
slide.addText('Frontend — La interfaz que VOS ves', {
  x: 3.9, y: 2.22, w: 5.7, h: 0.28,
  fontSize: 12, bold: true, color: TEXT_DARK, fontFace: 'Calibri',
})
slide.addText('La página web donde entrás. Misma URL para PC, iPad y móvil. Solo dibuja, no guarda nada.', {
  x: 3.9, y: 2.5, w: 5.7, h: 0.35,
  fontSize: 9, color: TEXT_MUTED, fontFace: 'Calibri',
})

// Arrow down (frontend → backend)
slide.addShape('downArrow', {
  x: 6.3, y: 2.95, w: 0.25, h: 0.25,
  fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT },
})

// Sub-cards: Backend #1 y #2 (réplicas)
function backendCard(x, title, desc) {
  slide.addShape('roundRect', {
    x, y: 3.25, w: 3.05, h: 1.0,
    fill: { color: CARD_BG },
    line: { color: GOLD_LIGHT, width: 1 },
    rectRadius: 0.08,
  })
  slide.addText('⚙️', { x: x + 0.1, y: 3.35, w: 0.4, h: 0.55, fontSize: 22, valign: 'middle' })
  slide.addText(title, {
    x: x + 0.55, y: 3.32, w: 2.4, h: 0.28,
    fontSize: 11, bold: true, color: TEXT_DARK, fontFace: 'Calibri',
  })
  slide.addText(desc, {
    x: x + 0.55, y: 3.6, w: 2.4, h: 0.6,
    fontSize: 9, color: TEXT_MUTED, fontFace: 'Calibri',
  })
}

backendCard(3.35, 'Backend (réplica 1)', '"Cerebro" del sistema.\nProcesa todo lo que pedís.')
backendCard(6.65, 'Backend (réplica 2)', 'Copia idéntica. Si #1 cae,\n#2 sigue atendiendo solo.')

// Pequeño badge "Alta Disponibilidad"
slide.addText('★ Alta Disponibilidad — sin caídas aunque falle un servidor', {
  x: 3.35, y: 4.25, w: 6.35, h: 0.22,
  fontSize: 8.5, italic: true, color: GOLD_LIGHT, align: 'center', fontFace: 'Calibri',
})

// Arrow down (backend → DB + storage)
slide.addShape('downArrow', {
  x: 6.3, y: 4.5, w: 0.25, h: 0.22,
  fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT },
})

// Sub-cards: Postgres y Supabase
function storageCard(x, emoji, title, sub, desc) {
  slide.addShape('roundRect', {
    x, y: 4.8, w: 3.05, h: 1.45,
    fill: { color: CARD_BG },
    line: { color: GOLD_LIGHT, width: 1 },
    rectRadius: 0.08,
  })
  slide.addText(emoji, { x: x + 0.1, y: 4.88, w: 0.4, h: 0.5, fontSize: 22, valign: 'middle' })
  slide.addText(title, {
    x: x + 0.55, y: 4.88, w: 2.4, h: 0.25,
    fontSize: 11, bold: true, color: TEXT_DARK, fontFace: 'Calibri',
  })
  slide.addText(sub, {
    x: x + 0.55, y: 5.13, w: 2.4, h: 0.22,
    fontSize: 8.5, italic: true, color: GOLD, fontFace: 'Calibri',
  })
  slide.addText(desc, {
    x: x + 0.15, y: 5.4, w: 2.8, h: 0.8,
    fontSize: 9, color: TEXT_MUTED, fontFace: 'Calibri',
  })
}

storageCard(3.35, '🗄️', 'Base de Datos', 'PostgreSQL',
  'Acá vive toda la información: proyectos, materiales, OCs, muestras, usuarios, eventos.')
storageCard(6.65, '🗂️', 'Archivos', 'Supabase Storage',
  'Acá van los PDFs, fotos de OCs, sample requests. Separados de la base de datos.')

// ─── COLUMN 3 — PROTECCIÓN (RIGHT) ───────────────────────────────────────────
slide.addText('3 · PROTECCIÓN 24/7', {
  x: 10.15, y: 1.35, w: 2.8, h: 0.3,
  fontSize: 10, fontFace: 'Calibri', bold: true, color: GOLD,
  charSpacing: 2,
})

function protectionCard(y, h, emoji, title, desc) {
  slide.addShape('roundRect', {
    x: 10.15, y, w: 2.8, h,
    fill: { color: CARD_BG },
    line: { color: CARD_BORDER, width: 1 },
    rectRadius: 0.08,
  })
  slide.addText(emoji, { x: 10.25, y: y + 0.08, w: 0.5, h: 0.55, fontSize: 22, valign: 'middle' })
  slide.addText(title, {
    x: 10.8, y: y + 0.1, w: 2.05, h: 0.3,
    fontSize: 11, bold: true, color: TEXT_DARK, fontFace: 'Calibri',
  })
  slide.addText(desc, {
    x: 10.25, y: y + 0.5, w: 2.65, h: h - 0.55,
    fontSize: 9, color: TEXT_MUTED, fontFace: 'Calibri',
  })
}

protectionCard(1.75, 1.45, '🔔', 'UptimeRobot',
  'Cada 5 min verifica que el sistema esté vivo. Si cae, te avisa por mail al toque.')
protectionCard(3.3,  1.45, '💾', 'Backup diario',
  'Cada 24h respalda toda la base de datos. Se guardan los últimos 6 días.')
protectionCard(4.85, 1.45, '📧', 'Task Agent',
  'En tu PC. Lee Outlook y crea tareas en el sistema a las 7 AM y 1 PM.')

// ─── SECURITY STRIP (BOTTOM) ─────────────────────────────────────────────────
slide.addShape('roundRect', {
  x: 0.4, y: 6.5, w: 12.55, h: 0.85,
  fill: { color: FOREST_DARK },
  line: { color: FOREST_DARK },
  rectRadius: 0.08,
})

slide.addText('🔒  SEGURIDAD — cómo te protege de afuera', {
  x: 0.55, y: 6.55, w: 4.5, h: 0.3,
  fontSize: 10, color: GOLD_LIGHT, bold: true,
  charSpacing: 2, fontFace: 'Calibri',
})

const securityItems = [
  { x: 0.6,  label: 'HTTPS encriptado',    desc: 'Todo lo que mandás va cifrado' },
  { x: 3.7,  label: 'Login + contraseña',   desc: 'Almacenadas hasheadas (bcrypt)' },
  { x: 6.85, label: 'Token de sesión (JWT)', desc: 'Expira a las 8 horas' },
  { x: 10.0, label: 'Anti-abuso',           desc: 'Máx 200 pedidos/min por IP' },
]

securityItems.forEach((item) => {
  slide.addText('✓', {
    x: item.x, y: 6.86, w: 0.2, h: 0.25,
    fontSize: 11, color: GOLD_LIGHT, bold: true, fontFace: 'Calibri',
  })
  slide.addText(item.label, {
    x: item.x + 0.18, y: 6.85, w: 2.9, h: 0.25,
    fontSize: 10, color: 'FFFFFF', bold: true, fontFace: 'Calibri',
  })
  slide.addText(item.desc, {
    x: item.x + 0.18, y: 7.08, w: 2.9, h: 0.2,
    fontSize: 8.5, color: TEXT_LIGHT, italic: true, fontFace: 'Calibri',
  })
})

// Save
const outPath = String.raw`C:\Users\chali\OneDrive - Central Millwork\centralmillwork-app\diagrama-sistema-centralmillwork.pptx`
pres.writeFile({ fileName: outPath }).then((name) => {
  console.log('OK guardado en:', name)
})
