// Guía Módulo de Producción — para CEO
// Destaca el Kiosko, las estaciones, las fotos de avance y la visibilidad
// en tiempo real. Tono neutro descriptivo. Muestra sofisticación sin
// nombrarla (sin usar la palabra "complejo").
const pptxgen = require('pptxgenjs')

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE'
pres.author = 'Central Millwork'
pres.title = 'Módulo de Producción — Guía CEO'

// ─── Paleta ─────────────────────────────────────────────────────────────
const GOLD        = '9B7200'
const GOLD_LIGHT  = 'DEA832'
const BG_DARK     = '1C1F18'
const BG_FOREST   = '2C3126'
const CARD_DARK   = '262A20'
const CARD_DARKER = '353A2E'
const TEXT_WHITE  = 'FFFFFF'
const TEXT_MUTED  = 'D1D5DB'
const TEXT_LIGHT  = '9CA3AF'
const TEXT_DIM    = '6B7280'

// Acentos producción
const C_PEND   = 'FBBF24'   // ámbar (pendiente)
const C_PROC   = '60A5FA'   // azul (en proceso)
const C_PAUSE  = 'F472B6'   // rosa (pausada)
const C_DONE   = '34D399'   // verde (completada)
const C_KIOSK  = 'A78BFA'   // morado (kiosko)
const C_PHOTO  = '38BDF8'   // cyan (fotos)
const C_LIVE   = 'F87171'   // rojo (tiempo real)

// Estaciones — colores por tipo
const C_ST_CNC      = '60A5FA'
const C_ST_EDGE     = 'A78BFA'
const C_ST_PAINT    = 'F472B6'
const C_ST_ASSEM    = 'FBBF24'
const C_ST_FINAL    = '38BDF8'
const C_ST_SHIP     = '34D399'

// Roles
const R_SHOP   = 'FBBF24'
const R_OPER   = 'F472B6'
const R_ADMIN  = '34D399'
const R_PM     = '60A5FA'

function drawDarkCard(slide, x, y, w, h, opts = {}) {
  slide.addShape('roundRect', {
    x: x + 0.05, y: y + 0.05, w, h,
    fill: { color: '000000', transparency: 70 },
    line: { color: 'FFFFFF', transparency: 100, width: 0 },
    rectRadius: opts.radius ?? 0.14,
  })
  slide.addShape('roundRect', {
    x, y, w, h,
    fill: { color: opts.bg ?? CARD_DARK },
    line: { color: opts.borderColor ?? '4A5240', width: opts.borderWidth ?? 1 },
    rectRadius: opts.radius ?? 0.14,
  })
  if (opts.accent) {
    slide.addShape('rect', {
      x, y, w, h: 0.10,
      fill: { color: opts.accent }, line: { color: opts.accent, width: 0 },
    })
  }
}
function header(slide, num, title, subtitle) {
  slide.addShape('rect', {
    x: 0, y: 0, w: 13.33, h: 0.12,
    fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 },
  })
  slide.addText(num, {
    x: 0.5, y: 0.4, w: 1.2, h: 0.7,
    fontSize: 44, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT,
  })
  slide.addText(title, {
    x: 1.8, y: 0.5, w: 11, h: 0.6,
    fontSize: 30, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
  })
  slide.addText(subtitle, {
    x: 1.8, y: 1.05, w: 11.5, h: 0.4,
    fontSize: 13, fontFace: 'Calibri', italic: true, color: TEXT_MUTED,
  })
  slide.addShape('rect', {
    x: 1.8, y: 1.45, w: 1.2, h: 0.04,
    fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 },
  })
}
function footer(slide, text) {
  slide.addShape('rect', {
    x: 0.4, y: 7.05, w: 12.55, h: 0.03,
    fill: { color: GOLD_LIGHT, transparency: 50 }, line: { color: GOLD_LIGHT, width: 0 },
  })
  slide.addText(text, {
    x: 0.4, y: 7.15, w: 12.55, h: 0.3,
    fontSize: 10, fontFace: 'Calibri', italic: true, color: TEXT_LIGHT, align: 'center',
  })
}

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 1 — HERO
// ═════════════════════════════════════════════════════════════════════════
const hero = pres.addSlide()
hero.background = { color: BG_DARK }

hero.addShape('rect', {
  x: 0, y: 0, w: 0.5, h: 7.5,
  fill: { color: GOLD }, line: { color: GOLD, width: 0 },
})

// Watermark P gigante
hero.addText('P', {
  x: 7.5, y: -1.0, w: 6.5, h: 9.5,
  fontSize: 600, fontFace: 'Calibri', bold: true,
  color: GOLD, transparency: 88, valign: 'middle',
})

hero.addText('CENTRAL MILLWORK', {
  x: 1.0, y: 0.6, w: 8, h: 0.4,
  fontSize: 13, fontFace: 'Calibri', color: GOLD_LIGHT, bold: true, charSpacing: 6,
})

hero.addText('Módulo de', {
  x: 1.0, y: 1.4, w: 11, h: 0.95,
  fontSize: 56, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
})
hero.addText('Producción', {
  x: 1.0, y: 2.3, w: 11, h: 0.95,
  fontSize: 56, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT,
})

hero.addShape('rect', {
  x: 1.0, y: 3.45, w: 1.5, h: 0.05,
  fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 },
})

hero.addText(
  'Del taller a la pantalla, sincronizado en tiempo real.',
  {
    x: 1.0, y: 3.7, w: 9.5, h: 0.7,
    fontSize: 22, fontFace: 'Calibri', italic: true, color: TEXT_MUTED,
  }
)

const heroStats = [
  { num: '8',   label: 'estaciones especializadas' },
  { num: '📲',  label: 'kiosko táctil en el taller' },
  { num: '📷',  label: 'fotos en cada paso clave' },
  { num: '⚡',  label: 'visibilidad en tiempo real' },
]
heroStats.forEach((s, i) => {
  const x = 1.0 + i * 2.85
  hero.addText(s.num, {
    x, y: 5.7, w: 2.5, h: 0.7,
    fontSize: 38, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT,
  })
  hero.addText(s.label, {
    x, y: 6.4, w: 2.5, h: 0.4,
    fontSize: 11, fontFace: 'Calibri', color: TEXT_MUTED,
  })
})

hero.addText('PRESENTACIÓN DIRECCIÓN · JUNIO 2026', {
  x: 1.0, y: 7.18, w: 8, h: 0.3,
  fontSize: 9, fontFace: 'Calibri', color: TEXT_DIM, bold: true, charSpacing: 4,
})

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 2 — EL VIAJE DE UNA OP
// ═════════════════════════════════════════════════════════════════════════
const s2 = pres.addSlide()
s2.background = { color: BG_DARK }
header(s2, '01', 'El viaje de una orden de producción',
  'Desde que entra al taller hasta que el cliente la recibe. Cada movimiento queda registrado.')

const STEPS = [
  { n: '01', label: 'Pendiente',    desc: 'La orden de producción nace con los materiales reservados y los procesos definidos',
    icon: '📥', who: 'Shop Manager planifica', color: C_PEND },
  { n: '02', label: 'En proceso',   desc: 'Los operarios trabajan paso a paso, cada uno en su estación especializada',
    icon: '⚙️', who: 'Operarios ejecutan', color: C_PROC },
  { n: '03', label: 'Pausada',      desc: 'Si hay que esperar (material, validación, cliente), la pausa queda visible para todos',
    icon: '⏸️', who: 'Razón registrada', color: C_PAUSE },
  { n: '04', label: 'Completada',   desc: 'Todos los procesos terminados, fotos archivadas, lista para entregar',
    icon: '✅', who: 'Cierre automático', color: C_DONE },
]

const cardH = 2.65
const cardY = 2.0
const gapX = 0.18
const totalW = 12.4
const w4 = (totalW - 3 * gapX) / 4

STEPS.forEach((st, i) => {
  const x = 0.45 + i * (w4 + gapX)
  drawDarkCard(s2, x, cardY, w4, cardH, { accent: st.color, radius: 0.18 })

  s2.addText(st.n, {
    x: x + w4 - 1.2, y: cardY + 0.05, w: 1.2, h: 0.75,
    fontSize: 42, fontFace: 'Calibri', bold: true,
    color: st.color, transparency: 75, align: 'right',
  })
  s2.addText(st.icon, {
    x: x + 0.25, y: cardY + 0.3, w: 0.8, h: 0.7,
    fontSize: 40, valign: 'middle',
  })
  s2.addText(st.label, {
    x: x + 0.25, y: cardY + 1.1, w: w4 - 0.5, h: 0.45,
    fontSize: 18, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
  })
  s2.addText(st.who, {
    x: x + 0.25, y: cardY + 1.55, w: w4 - 0.5, h: 0.32,
    fontSize: 10, fontFace: 'Calibri', bold: true, color: st.color, charSpacing: 2,
  })
  s2.addText(st.desc, {
    x: x + 0.25, y: cardY + 1.9, w: w4 - 0.5, h: 0.7,
    fontSize: 11, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
  })
})

// Banner inferior con destacado
drawDarkCard(s2, 0.45, 5.1, 12.4, 1.7, {
  bg: '2A2F22', borderColor: GOLD_LIGHT, borderWidth: 1, radius: 0.16,
})
s2.addText('🎯', {
  x: 0.7, y: 5.3, w: 0.8, h: 1.0,
  fontSize: 50, valign: 'middle',
})
s2.addText('Una sola fuente de verdad para todo el taller', {
  x: 1.7, y: 5.3, w: 11, h: 0.5,
  fontSize: 18, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
})
s2.addText('En cualquier momento, desde cualquier pantalla, se sabe exactamente en qué estación está cada orden, quién la está trabajando y cuánto lleva.', {
  x: 1.7, y: 5.85, w: 11, h: 0.85,
  fontSize: 12, fontFace: 'Calibri', italic: true, color: TEXT_MUTED, valign: 'top',
})

footer(s2, 'Pasar de un estado al siguiente requiere acción explícita y queda asociado a un operario y a un momento exacto.')

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 3 — EL KIOSKO (estrella)
// ═════════════════════════════════════════════════════════════════════════
const s3 = pres.addSlide()
s3.background = { color: BG_DARK }
header(s3, '02', 'El Kiosko: el sistema en el taller',
  'Una pantalla táctil donde los operarios viven el sistema sin tocar una computadora.')

// Card izquierda: representación del kiosko (pantalla grande)
drawDarkCard(s3, 0.45, 1.75, 5.2, 5.0, { accent: C_KIOSK, radius: 0.18 })

// Mockup pantalla touchscreen (rectangular horizontal)
s3.addShape('roundRect', {
  x: 0.8, y: 2.1, w: 4.5, h: 3.4,
  fill: { color: '0F1410' },
  line: { color: C_KIOSK, width: 2 },
  rectRadius: 0.15,
})

// Marco interno de pantalla
s3.addText('CNC · Estación 1', {
  x: 1.0, y: 2.3, w: 4.1, h: 0.35,
  fontSize: 13, fontFace: 'Calibri', bold: true, color: C_KIOSK, align: 'center',
})
s3.addText('OP-2026-0287  ·  Pico Bay #4', {
  x: 1.0, y: 2.6, w: 4.1, h: 0.3,
  fontSize: 10, fontFace: 'Calibri', color: TEXT_MUTED, align: 'center',
})

// Datos del operario actual
s3.addShape('roundRect', {
  x: 1.1, y: 3.05, w: 3.9, h: 0.8,
  fill: { color: C_KIOSK, transparency: 85 },
  line: { color: C_KIOSK, transparency: 50, width: 1 },
  rectRadius: 0.08,
})
s3.addText('👤  Víctor M.', {
  x: 1.2, y: 3.1, w: 2, h: 0.35,
  fontSize: 13, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, valign: 'middle',
})
s3.addText('⏱  2h 47min', {
  x: 3.5, y: 3.1, w: 1.5, h: 0.35,
  fontSize: 13, fontFace: 'Calibri', bold: true, color: C_KIOSK,
  align: 'right', valign: 'middle',
})
s3.addText('Iniciado a las 7:23 AM', {
  x: 1.2, y: 3.45, w: 3.7, h: 0.3,
  fontSize: 9, fontFace: 'Calibri', italic: true, color: 'D1D5DB',
})

// Botones táctiles
s3.addShape('roundRect', {
  x: 1.1, y: 4.05, w: 1.85, h: 1.15,
  fill: { color: C_DONE, transparency: 70 }, line: { color: C_DONE, width: 0 },
  rectRadius: 0.1,
})
s3.addText('✓\nCOMPLETAR', {
  x: 1.1, y: 4.05, w: 1.85, h: 1.15,
  fontSize: 13, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
  align: 'center', valign: 'middle',
})

s3.addShape('roundRect', {
  x: 3.15, y: 4.05, w: 1.85, h: 1.15,
  fill: { color: C_PAUSE, transparency: 70 }, line: { color: C_PAUSE, width: 0 },
  rectRadius: 0.1,
})
s3.addText('⏸\nPAUSAR', {
  x: 3.15, y: 4.05, w: 1.85, h: 1.15,
  fontSize: 13, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
  align: 'center', valign: 'middle',
})

// Label "PANTALLA TÁCTIL"
s3.addText('PANTALLA TÁCTIL · TALLER', {
  x: 0.8, y: 5.7, w: 4.5, h: 0.4,
  fontSize: 11, fontFace: 'Calibri', bold: true, color: C_KIOSK,
  align: 'center', charSpacing: 4,
})
s3.addText('Sin teclado, sin mouse, sin pelearse con una PC', {
  x: 0.8, y: 6.05, w: 4.5, h: 0.35,
  fontSize: 10, fontFace: 'Calibri', italic: true, color: TEXT_MUTED,
  align: 'center',
})

// Card derecha: características del kiosko
drawDarkCard(s3, 5.85, 1.75, 7.0, 5.0, { accent: C_KIOSK, radius: 0.18 })
s3.addText('CÓMO FUNCIONA', {
  x: 6.15, y: 2.0, w: 6.5, h: 0.4,
  fontSize: 12, fontFace: 'Calibri', bold: true, color: C_KIOSK, charSpacing: 4,
})

const kioskFns = [
  { icon: '🔑', t: 'Identificación con PIN personal',
    d: 'Cada operario tiene su PIN. El sistema sabe quién hizo qué en cada momento.' },
  { icon: '👆', t: 'Iniciar e ir item',
    d: 'Un toque marca el inicio del trabajo. El cronómetro se activa en el momento.' },
  { icon: '⏸️', t: 'Pausar con razón',
    d: 'Si hay que parar (esperando material, otra tarea), se registra el motivo. Visible para Dirección.' },
  { icon: '✅', t: 'Completar y avanzar',
    d: 'Al terminar, la orden viaja sola a la siguiente estación. El próximo operario la encuentra esperándolo.' },
  { icon: '📊', t: 'Tiempo real, sin esfuerzo',
    d: 'Cada toque queda registrado. Las horas trabajadas se acumulan sin necesidad de planilla.' },
]
kioskFns.forEach((f, i) => {
  const yi = 2.55 + i * 0.82
  s3.addText(f.icon, {
    x: 6.15, y: yi, w: 0.55, h: 0.55,
    fontSize: 22, valign: 'middle',
  })
  s3.addText(f.t, {
    x: 6.75, y: yi, w: 6.0, h: 0.35,
    fontSize: 13, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, valign: 'top',
  })
  s3.addText(f.d, {
    x: 6.75, y: yi + 0.35, w: 6.0, h: 0.45,
    fontSize: 10.5, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
  })
})

footer(s3, 'El operario no necesita aprender informática. El kiosko habla su idioma: tocar, ver, avanzar.')

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 4 — LAS ESTACIONES (mapa visual del recorrido)
// ═════════════════════════════════════════════════════════════════════════
const s4 = pres.addSlide()
s4.background = { color: BG_DARK }
header(s4, '03', 'Las estaciones del taller',
  'Ocho estaciones especializadas. Cada orden recorre solo las que necesita, en el orden que le corresponde.')

// Banner descriptivo arriba
drawDarkCard(s4, 0.45, 1.85, 12.4, 0.75, {
  bg: '2A2F22', borderColor: GOLD_LIGHT, borderWidth: 1, radius: 0.14,
})
s4.addText('🏭', {
  x: 0.7, y: 1.95, w: 0.7, h: 0.6,
  fontSize: 28, valign: 'middle',
})
s4.addText('Cada estación trabaja en su tiempo. El sistema las coordina sin que nadie tenga que avisar a la siguiente.', {
  x: 1.45, y: 1.95, w: 11.3, h: 0.6,
  fontSize: 13, fontFace: 'Calibri', italic: true, color: TEXT_MUTED, valign: 'middle',
})

// 8 estaciones en grid 4x2
const STATIONS = [
  { id: 'CNC',          icon: '🪚', desc: 'Corte de piezas con máquinas de precisión', color: C_ST_CNC },
  { id: 'Edge Banding', icon: '📏', desc: 'Aplicación de cantos a los bordes',           color: C_ST_EDGE },
  { id: 'Lámina',       icon: '📐', desc: 'Laminado de superficies',                     color: C_ST_CNC },
  { id: 'Pintura',      icon: '🎨', desc: 'Acabado y color final',                       color: C_ST_PAINT },
  { id: 'Assembly',     icon: '🔧', desc: 'Ensamble de las piezas terminadas',           color: C_ST_ASSEM },
  { id: 'Final',        icon: '✨', desc: 'Detalles, pulido y revisión',                 color: C_ST_FINAL },
  { id: 'Registro',     icon: '📋', desc: 'Verificación, conteo y empaque',              color: C_ST_EDGE },
  { id: 'Shipping',     icon: '📦', desc: 'Embalaje y preparación para entrega',         color: C_ST_SHIP },
]

const stGapX = 0.13
const stGapY = 0.18
const stTotal = 12.4
const stW = (stTotal - 3 * stGapX) / 4
const stH = 1.85
const stRow1Y = 2.85
const stRow2Y = stRow1Y + stH + stGapY

STATIONS.forEach((st, i) => {
  const isRow1 = i < 4
  const col = i % 4
  const y = isRow1 ? stRow1Y : stRow2Y
  const x = 0.45 + col * (stW + stGapX)

  drawDarkCard(s4, x, y, stW, stH, { accent: st.color, radius: 0.14 })

  // Icono grande arriba
  s4.addText(st.icon, {
    x: x + 0.2, y: y + 0.2, w: 0.7, h: 0.7,
    fontSize: 30, valign: 'middle',
  })
  // Número de estación
  s4.addText(`${i + 1}`, {
    x: x + stW - 0.7, y: y + 0.05, w: 0.6, h: 0.6,
    fontSize: 26, fontFace: 'Calibri', bold: true,
    color: st.color, transparency: 65, align: 'right',
  })
  // Nombre
  s4.addText(st.id, {
    x: x + 0.2, y: y + 0.85, w: stW - 0.3, h: 0.35,
    fontSize: 14, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
  })
  // Descripción
  s4.addText(st.desc, {
    x: x + 0.2, y: y + 1.2, w: stW - 0.3, h: 0.55,
    fontSize: 9.5, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
  })
})

// Banner inferior: flujo
drawDarkCard(s4, 0.45, 6.4, 12.4, 0.55, {
  bg: '2A2F22', borderColor: '4A5240', radius: 0.14,
})
s4.addText('Las órdenes recorren solo las estaciones que su tipo requiere. Una muestra de hardware no pasa por CNC. Un mueble grande sí.', {
  x: 0.7, y: 6.4, w: 12.0, h: 0.55,
  fontSize: 11, fontFace: 'Calibri', italic: true, color: TEXT_MUTED, align: 'center', valign: 'middle',
})

footer(s4, 'La ruta de cada orden se define al inicio. El sistema la lleva de estación en estación sin intervención manual.')

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 5 — FOTOS DE AVANCE (calidad documentada)
// ═════════════════════════════════════════════════════════════════════════
const s5 = pres.addSlide()
s5.background = { color: BG_DARK }
header(s5, '04', 'Fotos de avance en cada estación',
  'Antes de cerrar una etapa, se documenta lo realizado. Evidencia visual, archivada para siempre.')

// Card izquierda: por qué importa
drawDarkCard(s5, 0.45, 1.75, 5.7, 5.0, { accent: C_PHOTO, radius: 0.18 })
s5.addText('CÓMO FUNCIONA', {
  x: 0.7, y: 2.0, w: 5.2, h: 0.4,
  fontSize: 12, fontFace: 'Calibri', bold: true, color: C_PHOTO, charSpacing: 4,
})
s5.addText('La cámara como obligación', {
  x: 0.7, y: 2.4, w: 5.2, h: 0.5,
  fontSize: 19, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
})

const fotoPoints = [
  { icon: '📸', t: 'Foto antes de avanzar',
    d: 'En las estaciones críticas, sin foto no se puede marcar el paso como completo.' },
  { icon: '🔢', t: 'Cantidad mínima configurable',
    d: 'Cada estación define cuántas fotos pide (1, 3, 5). Por defecto, 3 ángulos.' },
  { icon: '📂', t: 'Archivadas con la orden',
    d: 'Las fotos quedan vinculadas a la orden de producción para consultarlas cuando haga falta.' },
  { icon: '🔍', t: 'Visibles en cualquier momento',
    d: 'Dirección, supervisión o servicio al cliente pueden revisar el trabajo realizado a la distancia.' },
]
fotoPoints.forEach((p, i) => {
  const yi = 3.15 + i * 0.85
  s5.addText(p.icon, {
    x: 0.85, y: yi, w: 0.6, h: 0.6,
    fontSize: 26, valign: 'middle',
  })
  s5.addText(p.t, {
    x: 1.5, y: yi, w: 4.5, h: 0.35,
    fontSize: 13, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, valign: 'top',
  })
  s5.addText(p.d, {
    x: 1.5, y: yi + 0.35, w: 4.5, h: 0.5,
    fontSize: 10.5, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
  })
})

// Card derecha: mockup de "galería de fotos"
drawDarkCard(s5, 6.35, 1.75, 6.5, 5.0, { accent: C_PHOTO, radius: 0.18 })
s5.addText('EJEMPLO: OP-2026-0287 · CNC', {
  x: 6.6, y: 2.0, w: 6.0, h: 0.4,
  fontSize: 11, fontFace: 'Calibri', bold: true, color: C_PHOTO, charSpacing: 3,
})

// Grid de 6 "fotos" (rectángulos simulados con icono cámara)
const photos = [
  { tag: 'Pieza principal', op: 'Lateral A' },
  { tag: 'Pieza principal', op: 'Lateral B' },
  { tag: 'Ensamble previo',  op: 'Cara superior' },
  { tag: 'Detalle',          op: 'Esquina inferior' },
  { tag: 'Detalle',          op: 'Cantos' },
  { tag: 'Conjunto',         op: 'Vista completa' },
]
const pPerRow = 3
const pW = 1.85
const pH = 1.45
const pGapX = 0.13
const pGapY = 0.18
const pStartX = 6.6
const pStartY = 2.55

photos.forEach((ph, i) => {
  const row = Math.floor(i / pPerRow)
  const col = i % pPerRow
  const x = pStartX + col * (pW + pGapX)
  const y = pStartY + row * (pH + pGapY)

  // Foto simulada (rectángulo oscuro con icono)
  s5.addShape('roundRect', {
    x, y, w: pW, h: pH,
    fill: { color: '0F1410' },
    line: { color: C_PHOTO, transparency: 70, width: 1 },
    rectRadius: 0.08,
  })
  // Icono cámara grande adentro
  s5.addText('📷', {
    x, y: y + 0.05, w: pW, h: 0.8,
    fontSize: 36, valign: 'middle', align: 'center',
  })
  // Tags abajo
  s5.addText(ph.tag, {
    x: x + 0.1, y: y + 0.9, w: pW - 0.2, h: 0.25,
    fontSize: 8.5, fontFace: 'Calibri', bold: true, color: C_PHOTO, valign: 'top',
  })
  s5.addText(ph.op, {
    x: x + 0.1, y: y + 1.15, w: pW - 0.2, h: 0.25,
    fontSize: 8, fontFace: 'Calibri', italic: true, color: TEXT_MUTED, valign: 'top',
  })
})

// Footer card mockup
s5.addText('6 fotos · capturadas hoy 09:42  ·  Operario: Víctor M.', {
  x: 6.6, y: 5.85, w: 6.0, h: 0.3,
  fontSize: 9, fontFace: 'Calibri', italic: true, color: TEXT_LIGHT, align: 'center',
})

footer(s5, 'La calidad se documenta, no se asume. Cualquier reclamo posterior se resuelve con la evidencia ya guardada.')

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 6 — TIEMPO REAL (la sala de control)
// ═════════════════════════════════════════════════════════════════════════
const s6 = pres.addSlide()
s6.background = { color: BG_DARK }
header(s6, '05', 'Tiempo real en todas las pantallas',
  'Lo que pasa en el taller se ve, en el mismo momento, en oficina y en Dirección.')

// Layout: 3 cards horizontales mostrando vistas distintas
const vistas = [
  {
    title: 'EL MAPA DEL TALLER',
    icon: '🗺️',
    color: C_LIVE,
    badge: 'OPERACIÓN',
    items: [
      'Mapa visual con las 8 estaciones',
      'Cada orden aparece como una tarjeta',
      'El color indica el estado en tiempo real',
      'Los timers corren mientras el operario trabaja',
    ],
  },
  {
    title: 'EVOLUCIÓN DE LA ORDEN',
    icon: '📈',
    color: C_PROC,
    badge: 'TRAZABILIDAD',
    items: [
      'Línea de tiempo de la orden completa',
      'Inicio y fin de cada estación',
      'Operario responsable en cada paso',
      'Pausas con su razón y duración',
    ],
  },
  {
    title: 'REPORTES Y MÉTRICAS',
    icon: '📊',
    color: C_DONE,
    badge: 'DIRECCIÓN',
    items: [
      'Horas trabajadas por operario y proyecto',
      'Tiempo promedio por estación',
      'Comparativa real vs estimado',
      'Reporte semanal listo para presentar',
    ],
  },
]

const vW = 4.1
const vH = 4.95
const vY = 1.85
const vGap = 0.15

vistas.forEach((v, i) => {
  const x = 0.45 + i * (vW + vGap)
  drawDarkCard(s6, x, vY, vW, vH, { accent: v.color, radius: 0.18 })

  // Badge arriba
  s6.addShape('roundRect', {
    x: x + 0.3, y: vY + 0.25, w: 1.5, h: 0.3,
    fill: { color: v.color, transparency: 75 },
    line: { color: v.color, width: 0 },
    rectRadius: 0.1,
  })
  s6.addText(v.badge, {
    x: x + 0.3, y: vY + 0.25, w: 1.5, h: 0.3,
    fontSize: 8.5, fontFace: 'Calibri', bold: true, color: v.color,
    align: 'center', valign: 'middle', charSpacing: 1.5,
  })

  // Icono gigante
  s6.addText(v.icon, {
    x: x + 0.3, y: vY + 0.7, w: vW - 0.6, h: 1.3,
    fontSize: 72, valign: 'middle', align: 'center',
  })

  // Título
  s6.addText(v.title, {
    x: x + 0.3, y: vY + 2.15, w: vW - 0.6, h: 0.45,
    fontSize: 15, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
    align: 'center', charSpacing: 2,
  })

  // Línea separadora
  s6.addShape('line', {
    x: x + 0.6, y: vY + 2.7, w: vW - 1.2, h: 0,
    line: { color: '4A5240', width: 1 },
  })

  // Items con bullets coloreados
  v.items.forEach((it, ti) => {
    const ty = vY + 2.9 + ti * 0.45
    s6.addShape('ellipse', {
      x: x + 0.4, y: ty + 0.08, w: 0.15, h: 0.15,
      fill: { color: v.color }, line: { color: v.color, width: 0 },
    })
    s6.addText(it, {
      x: x + 0.65, y: ty, w: vW - 0.85, h: 0.4,
      fontSize: 10.5, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
    })
  })
})

footer(s6, 'No hay reporte semanal de Excel que armar. Las métricas están listas todo el tiempo, para quien las quiera ver.')

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 7 — ROLES
// ═════════════════════════════════════════════════════════════════════════
const s7 = pres.addSlide()
s7.background = { color: BG_DARK }
header(s7, '06', 'Quién hace qué',
  'Cuatro roles, cada uno con la herramienta que su tarea demanda.')

const ROLES = [
  {
    icon: '🧑‍🏭', name: 'OPERARIO',
    color: R_OPER,
    tagline: 'El que ejecuta el trabajo',
    actividades: [
      'Se identifica con su PIN en el kiosko',
      'Inicia, pausa y completa cada item',
      'Captura las fotos de avance requeridas',
      'No necesita saber de computadoras',
    ],
    herramienta: 'Kiosko táctil · Su estación',
  },
  {
    icon: '👷', name: 'SHOP MANAGER',
    color: R_SHOP,
    tagline: 'Organiza el flujo del taller',
    actividades: [
      'Crea y planifica las órdenes de producción',
      'Asigna operarios a las estaciones',
      'Resuelve cuellos de botella y pausas',
      'Supervisa el avance del día',
    ],
    herramienta: 'Computadora · Vista Producción',
  },
  {
    icon: '📐', name: 'PROJECT MANAGEMENT',
    color: R_PM,
    tagline: 'Sigue el avance del proyecto',
    actividades: [
      'Ve qué órdenes están en cada estación',
      'Consulta tiempo estimado vs real',
      'Anticipa entregas y comunica al cliente',
      'Revisa fotos y calidad de avance',
    ],
    herramienta: 'Computadora · Vista de proyecto',
  },
  {
    icon: '👁️', name: 'DIRECCIÓN',
    color: R_ADMIN,
    tagline: 'Mira la operación a vuelo de pájaro',
    actividades: [
      'Métricas de productividad por operario',
      'Comparativa de eficiencia entre estaciones',
      'Costos reales versus estimados',
      'Reporte semanal sin armarlo a mano',
    ],
    herramienta: 'Computadora · Dashboard ejecutivo',
  },
]

const laneW = 2.95
const laneY = 1.75
const laneH = 5.3
const laneGap = 0.13

ROLES.forEach((rol, i) => {
  const x = 0.45 + i * (laneW + laneGap)
  drawDarkCard(s7, x, laneY, laneW, laneH, { radius: 0.18 })

  s7.addShape('rect', {
    x, y: laneY, w: laneW, h: 1.35,
    fill: { color: rol.color, transparency: 80 },
    line: { color: rol.color, width: 0 },
  })

  s7.addText(rol.icon, {
    x: x + 0.3, y: laneY + 0.2, w: 1.0, h: 1.0,
    fontSize: 50, valign: 'middle',
  })
  s7.addText(rol.name, {
    x: x + 0.25, y: laneY + 0.95, w: laneW - 0.5, h: 0.35,
    fontSize: 13, fontFace: 'Calibri', bold: true,
    color: TEXT_WHITE, charSpacing: 3,
  })

  s7.addText(rol.tagline, {
    x: x + 0.25, y: laneY + 1.55, w: laneW - 0.5, h: 0.4,
    fontSize: 11, fontFace: 'Calibri', italic: true, bold: true, color: rol.color,
  })

  s7.addShape('roundRect', {
    x: x + 0.25, y: laneY + 2.0, w: laneW - 0.5, h: 0.4,
    fill: { color: rol.color, transparency: 80 },
    line: { color: rol.color, transparency: 60, width: 1 },
    rectRadius: 0.1,
  })
  s7.addText(rol.herramienta.toUpperCase(), {
    x: x + 0.25, y: laneY + 2.0, w: laneW - 0.5, h: 0.4,
    fontSize: 8.5, fontFace: 'Calibri', bold: true,
    color: rol.color, align: 'center', valign: 'middle', charSpacing: 1.5,
  })

  s7.addShape('line', {
    x: x + 0.3, y: laneY + 2.6, w: laneW - 0.6, h: 0,
    line: { color: '4A5240', width: 1 },
  })

  rol.actividades.forEach((t, ti) => {
    const ty = laneY + 2.8 + ti * 0.58
    s7.addShape('ellipse', {
      x: x + 0.3, y: ty + 0.08, w: 0.15, h: 0.15,
      fill: { color: rol.color }, line: { color: rol.color, width: 0 },
    })
    s7.addText(t, {
      x: x + 0.55, y: ty, w: laneW - 0.75, h: 0.55,
      fontSize: 10, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
    })
  })
})

footer(s7, 'El taller no usa lo mismo que la oficina. Y la oficina no se entromete con el flujo del taller.')

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 8 — CASOS ESPECIALES
// ═════════════════════════════════════════════════════════════════════════
const s8 = pres.addSlide()
s8.background = { color: BG_DARK }
header(s8, '07', 'Más que producción regular',
  'El sistema también orquesta muestras, pausas justificadas y trabajos especiales.')

const CASOS = [
  {
    icon: '🧪',
    color: 'A78BFA',
    name: 'Muestras como producción',
    badge: 'MUESTRAS',
    desc: 'Las muestras que se fabrican para el cliente entran al mismo flujo de producción.',
    bullets: [
      'Identificadas con badge especial en el kiosko',
      'Procesos pre-llenados según el tipo (puerta, cabinet, hardware…)',
      'Al completarse pasan automáticamente al control de calidad',
    ],
  },
  {
    icon: '⏸️',
    color: C_PAUSE,
    name: 'Pausas con razón',
    badge: 'JUSTIFICADA',
    desc: 'Cuando hay que parar, no es "se detuvo y ya". El motivo queda registrado.',
    bullets: [
      'Razón seleccionable (esperando material, validación, etc.)',
      'Tiempo de pausa cuantificado',
      'Visible en métricas para detectar patrones',
    ],
  },
  {
    icon: '🔁',
    color: 'F87171',
    name: 'Retrabajo y reapertura',
    badge: 'CORRECCIÓN',
    desc: 'Si una orden necesita volver a una estación anterior, se hace sin perder el historial.',
    bullets: [
      'Reapertura controlada y registrada',
      'El historial completo permanece intacto',
      'La razón del retrabajo queda documentada',
    ],
  },
  {
    icon: '⏱️',
    color: '60A5FA',
    name: 'Horas y costo real',
    badge: 'DATOS',
    desc: 'Cada minuto trabajado se acumula automáticamente para conocer el costo real.',
    bullets: [
      'Horas por operario, por estación y por proyecto',
      'Comparativa con tiempo estimado',
      'Base para decidir mejor el costo de futuros proyectos',
    ],
  },
]

const ccW = 6.05
const ccH = 2.6
const cardsXY = [
  { x: 0.45, y: 1.75 },
  { x: 6.85, y: 1.75 },
  { x: 0.45, y: 4.45 },
  { x: 6.85, y: 4.45 },
]

CASOS.forEach((c, i) => {
  const { x, y } = cardsXY[i]
  drawDarkCard(s8, x, y, ccW, ccH, { accent: c.color, radius: 0.16 })

  s8.addText(c.icon, {
    x: x + 0.25, y: y + 0.25, w: 0.85, h: 0.85,
    fontSize: 38, valign: 'middle',
  })
  s8.addText(c.name, {
    x: x + 1.15, y: y + 0.28, w: ccW - 2.5, h: 0.45,
    fontSize: 17, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
  })
  s8.addShape('roundRect', {
    x: x + ccW - 1.6, y: y + 0.35, w: 1.4, h: 0.3,
    fill: { color: c.color, transparency: 75 },
    line: { color: c.color, width: 0 },
    rectRadius: 0.1,
  })
  s8.addText(c.badge, {
    x: x + ccW - 1.6, y: y + 0.35, w: 1.4, h: 0.3,
    fontSize: 8, fontFace: 'Calibri', bold: true, color: c.color,
    align: 'center', valign: 'middle', charSpacing: 1,
  })
  s8.addText(c.desc, {
    x: x + 1.15, y: y + 0.78, w: ccW - 1.4, h: 0.55,
    fontSize: 11, fontFace: 'Calibri', italic: true, color: TEXT_MUTED, valign: 'top',
  })
  c.bullets.forEach((b, bi) => {
    s8.addText('•  ' + b, {
      x: x + 0.3, y: y + 1.35 + bi * 0.38, w: ccW - 0.55, h: 0.35,
      fontSize: 10, fontFace: 'Calibri', color: TEXT_LIGHT, valign: 'top',
    })
  })
})

footer(s8, 'Un solo sistema orquesta producción regular, muestras, retrabajos y métricas. Todo conviviendo sin fricciones.')

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 9 — IMPACTO
// ═════════════════════════════════════════════════════════════════════════
const s9 = pres.addSlide()
s9.background = { color: BG_FOREST }

s9.addShape('rect', {
  x: 0, y: 0, w: 13.33, h: 0.15,
  fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 },
})

s9.addText('LO QUE GANAMOS', {
  x: 1.0, y: 0.5, w: 11, h: 0.4,
  fontSize: 13, fontFace: 'Calibri', color: GOLD_LIGHT, bold: true, charSpacing: 6,
})

s9.addText('Un taller orquestado', {
  x: 1.0, y: 1.05, w: 11, h: 0.85,
  fontSize: 40, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
})
s9.addText('y una operación medible', {
  x: 1.0, y: 1.85, w: 11, h: 0.85,
  fontSize: 40, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT,
})

const beneficios = [
  {
    icon: '🎯',
    title: 'Control total del flujo',
    desc: 'Cada orden se mueve por las estaciones sin que nadie tenga que avisar. Las pausas tienen razón y duración.',
  },
  {
    icon: '📷',
    title: 'Calidad documentada',
    desc: 'Fotos en cada estación crítica, archivadas con la orden. Cualquier consulta posterior tiene evidencia visual.',
  },
  {
    icon: '⚡',
    title: 'Visibilidad en vivo',
    desc: 'Lo que está pasando en el taller se ve en oficina y en Dirección al instante. Sin reportes manuales.',
  },
  {
    icon: '📈',
    title: 'Datos para decidir',
    desc: 'Horas reales por operario, estación y proyecto. Base sólida para cotizar mejor y mejorar la operación.',
  },
]

const bcardW = 5.95
const bcardH = 2.0
const bcardX = [1.0, 6.95, 1.0, 6.95]
const bcardY = [3.05, 3.05, 5.15, 5.15]

beneficios.forEach((b, i) => {
  const x = bcardX[i]
  const y = bcardY[i]

  s9.addShape('roundRect', {
    x, y, w: bcardW, h: bcardH,
    fill: { color: CARD_DARKER },
    line: { color: '4A5240', width: 1 },
    rectRadius: 0.14,
  })

  s9.addText(b.icon, {
    x: x + 0.3, y: y + 0.3, w: 1.0, h: 1.0,
    fontSize: 44, valign: 'middle',
  })
  s9.addText(b.title, {
    x: x + 1.45, y: y + 0.35, w: bcardW - 1.6, h: 0.5,
    fontSize: 18, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
  })
  s9.addText(b.desc, {
    x: x + 1.45, y: y + 0.85, w: bcardW - 1.6, h: 1.0,
    fontSize: 11.5, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
    lineSpacingMultiple: 1.3,
  })
})

s9.addText('Central Millwork · Junio 2026', {
  x: 1.0, y: 7.18, w: 11, h: 0.25,
  fontSize: 10, fontFace: 'Calibri', color: TEXT_LIGHT, italic: true, charSpacing: 2,
})

// Save
const outPath = String.raw`C:\Users\chali\OneDrive - Central Millwork\centralmillwork-app\guia_produccion_2026_06_12.pptx`
pres.writeFile({ fileName: outPath }).then((name) => {
  console.log('OK guardado en:', name)
})
