// Reporte de semana — Central Millwork
// Slide 1 página, 16:9 widescreen, lenguaje natural para equipo interno
const pptxgen = require('pptxgenjs')

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE'
pres.author = 'Central Millwork'
pres.title = 'Reporte de Semana 2026-06-08'

// ─── Paleta brand ────────────────────────────────────────────────────────────
const FOREST_DARK = '2C3126'
const FOREST_MID  = '4A5240'
const GOLD        = '9B7200'
const GOLD_LIGHT  = 'DEA832'
const BG          = 'F8F6F0'
const CARD_BG     = 'FFFFFF'
const CARD_BORDER = 'D8D1C0'
const TEXT_DARK   = '1F1B14'
const TEXT_MUTED  = '6B6356'
const TEXT_LIGHT  = 'B0A89A'
const CHECK_GREEN = '10B981'

const slide = pres.addSlide()
slide.background = { color: BG }

// ─── HEADER ──────────────────────────────────────────────────────────────────
slide.addText('Central Millwork · Reporte de Semana', {
  x: 0.4, y: 0.25, w: 12.5, h: 0.35,
  fontSize: 14, fontFace: 'Calibri', color: GOLD,
  bold: true, charSpacing: 2,
})
slide.addText('Mejoras al sistema — del 1 al 8 de junio 2026', {
  x: 0.4, y: 0.6, w: 12.5, h: 0.55,
  fontSize: 28, fontFace: 'Calibri', bold: true,
  color: FOREST_DARK,
})
slide.addText('Resumen de avances en arquitectura, seguridad, observabilidad y nuevas funcionalidades', {
  x: 0.4, y: 1.05, w: 12.5, h: 0.3,
  fontSize: 12, fontFace: 'Calibri', italic: true, color: TEXT_MUTED,
})

// ─── Función helper para dibujar cuadrante ───────────────────────────────────
function quadrant({ x, y, w, h, icon, title, tagline, bullets, accent, footerIsTagline = true }) {
  // Card background
  slide.addShape('roundRect', {
    x, y, w, h,
    fill: { color: CARD_BG },
    line: { color: CARD_BORDER, width: 1 },
    rectRadius: 0.12,
  })

  // Borde superior con color del accent
  slide.addShape('rect', {
    x, y, w, h: 0.08,
    fill: { color: accent },
    line: { color: accent, width: 0 },
  })

  // Icono + título
  slide.addText(icon, {
    x: x + 0.2, y: y + 0.18, w: 0.6, h: 0.5,
    fontSize: 24, valign: 'middle',
  })
  slide.addText(title, {
    x: x + 0.85, y: y + 0.18, w: w - 1.0, h: 0.3,
    fontSize: 14, fontFace: 'Calibri', bold: true,
    color: FOREST_DARK, charSpacing: 1.5,
  })
  slide.addText(tagline, {
    x: x + 0.85, y: y + 0.45, w: w - 1.0, h: 0.3,
    fontSize: 11, fontFace: 'Calibri', italic: true,
    color: TEXT_MUTED,
  })

  // Bullets
  const bulletStartY = y + 0.85
  const lineHeight = 0.32
  bullets.forEach((b, i) => {
    const lineY = bulletStartY + i * lineHeight
    slide.addText('✓', {
      x: x + 0.2, y: lineY, w: 0.3, h: 0.25,
      fontSize: 11, color: CHECK_GREEN, bold: true,
    })
    slide.addText(b, {
      x: x + 0.5, y: lineY, w: w - 0.7, h: 0.3,
      fontSize: 10.5, fontFace: 'Calibri', color: TEXT_DARK,
      valign: 'top',
    })
  })
}

// ─── CUADRANTE 1: Estabilidad y Seguridad ───────────────────────────────────
quadrant({
  x: 0.4, y: 1.5, w: 6.3, h: 2.7,
  icon: '🛡️',
  title: 'ESTABILIDAD Y SEGURIDAD',
  tagline: 'El sistema ahora es resistente a fallas',
  accent: '2C3126',
  bullets: [
    'Auditoría externa con 9 expertos virtuales — cero vulnerabilidades graves',
    'Duplicó la capacidad de operaciones simultáneas sin colapsar',
    'Números de OC, recepciones y cotizaciones a prueba de duplicados',
    'Backup automático diario activado (plan Pro Supabase)',
    'Base de datos reproducible desde el código (fresh setup posible)',
    '14 mejoras de performance — queries de segundos ahora milisegundos',
  ],
})

// ─── CUADRANTE 2: Observabilidad y Calidad ──────────────────────────────────
quadrant({
  x: 6.85, y: 1.5, w: 6.05, h: 2.7,
  icon: '🚀',
  title: 'OBSERVABILIDAD Y CALIDAD',
  tagline: 'Si algo falla, lo vamos a saber',
  accent: GOLD,
  bullets: [
    'Sentry integrado — bugs en producción reportados automáticamente',
    'Pantalla blanca eliminada — fallback amigable con botones',
    'Notificaciones inteligentes — sin eventos viejos en la campana',
    'Primera red de 68 pruebas automatizadas verdes',
    'Sistema de emails listo para activar (Procurement / Producción)',
    '10 bugs detectados y corregidos por revisión asistida',
  ],
})

// ─── CUADRANTE 3: Módulo Muestras ───────────────────────────────────────────
quadrant({
  x: 0.4, y: 4.35, w: 6.3, h: 2.7,
  icon: '⚙️',
  title: 'MÓDULO MUESTRAS',
  tagline: 'De crear muestra a aprobar — ciclo casi automático',
  accent: GOLD_LIGHT,
  bullets: [
    'Fase 1 + Fase 2 deployadas (de 7 fases del plan total)',
    'Crear muestra → tarea automática a Procurement (sin WhatsApp)',
    'Procurement decide "sin compras" o crea OC asociada en un click',
    'Al recibir OCs → tarea automática para Shop Manager iniciar fabricación',
    '3 muestras ya completaron ciclo en producción real',
    'Próximas: auto QC, OPs con procesos predefinidos, emails activos',
  ],
})

// ─── CUADRANTE 4: Números clave ─────────────────────────────────────────────
// Background card
slide.addShape('roundRect', {
  x: 6.85, y: 4.35, w: 6.05, h: 2.7,
  fill: { color: CARD_BG },
  line: { color: CARD_BORDER, width: 1 },
  rectRadius: 0.12,
})
slide.addShape('rect', {
  x: 6.85, y: 4.35, w: 6.05, h: 0.08,
  fill: { color: FOREST_MID }, line: { color: FOREST_MID, width: 0 },
})

slide.addText('📊', {
  x: 7.05, y: 4.53, w: 0.6, h: 0.5,
  fontSize: 24, valign: 'middle',
})
slide.addText('NÚMEROS DE LA SEMANA', {
  x: 7.7, y: 4.53, w: 4.5, h: 0.3,
  fontSize: 14, fontFace: 'Calibri', bold: true,
  color: FOREST_DARK, charSpacing: 1.5,
})
slide.addText('Lo que avanzamos en 7 días', {
  x: 7.7, y: 4.80, w: 4.5, h: 0.3,
  fontSize: 11, fontFace: 'Calibri', italic: true, color: TEXT_MUTED,
})

// Grid de 6 tiles con números grandes (2 columnas, 3 filas)
const tiles = [
  { num: '20+',      label: 'Commits a producción' },
  { num: '5,000+',   label: 'Líneas de código mejoradas' },
  { num: '20',       label: 'Bugs corregidos' },
  { num: '68',       label: 'Tests automatizados nuevos' },
  { num: '✓',        label: 'Backup diario activo' },
  { num: '< 1s',     label: 'Tiempo de respuesta' },
]
const tileStartX = 7.05
const tileStartY = 5.25
const tileW = 2.85
const tileH = 0.55
const tileGapX = 0.05
const tileGapY = 0.05

tiles.forEach((t, i) => {
  const col = i % 2
  const row = Math.floor(i / 2)
  const tx = tileStartX + col * (tileW + tileGapX)
  const ty = tileStartY + row * (tileH + tileGapY)

  slide.addShape('roundRect', {
    x: tx, y: ty, w: tileW, h: tileH,
    fill: { color: 'FFFAEC' },
    line: { color: GOLD_LIGHT, width: 0.5 },
    rectRadius: 0.06,
  })
  slide.addText(t.num, {
    x: tx + 0.1, y: ty + 0.05, w: 1.1, h: 0.45,
    fontSize: 20, fontFace: 'Calibri', bold: true,
    color: GOLD, valign: 'middle', align: 'center',
  })
  slide.addText(t.label, {
    x: tx + 1.25, y: ty + 0.05, w: tileW - 1.35, h: 0.45,
    fontSize: 9.5, fontFace: 'Calibri',
    color: TEXT_DARK, valign: 'middle',
  })
})

// ─── FOOTER ──────────────────────────────────────────────────────────────────
slide.addShape('line', {
  x: 0.4, y: 7.18, w: 12.55, h: 0,
  line: { color: GOLD_LIGHT, width: 1 },
})
slide.addText('Vibe coding maduro · Infraestructura nivel Stripe a escala Central Millwork', {
  x: 0.4, y: 7.22, w: 12.55, h: 0.25,
  fontSize: 9, fontFace: 'Calibri', italic: true,
  color: TEXT_MUTED, align: 'center',
})

// Save
const outPath = String.raw`C:\Users\chali\OneDrive - Central Millwork\centralmillwork-app\reporte_semana_2026_06_08.pptx`
pres.writeFile({ fileName: outPath }).then((name) => {
  console.log('OK guardado en:', name)
})
