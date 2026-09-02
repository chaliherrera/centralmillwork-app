// Guía visual del ciclo de Muestras — V3
// Los 4 slides comparten estilo: fondo oscuro, cards translúcidas, acentos
// dorados/color. Mismo nivel de impacto visual en toda la presentación.
const pptxgen = require('pptxgenjs')

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE'
pres.author = 'Central Millwork'
pres.title = 'Sistematizando Muestras — Guía visual V3'

// ─── Paleta brand ─────────────────────────────────────────────────────────
const FOREST_DARK = '2C3126'
const FOREST_MID  = '4A5240'
const GOLD        = '9B7200'
const GOLD_LIGHT  = 'DEA832'
const GOLD_PALE   = 'F5E9C9'
const BG_DARK     = '1C1F18'        // hero / consistente para slides 2-3
const BG_FOREST   = '2C3126'        // impacto slide 4
const CARD_DARK   = '262A20'        // cards translúcidas oscuras
const CARD_DARKER = '353A2E'        // variante un poco más clara para destacar
const TEXT_WHITE  = 'FFFFFF'
const TEXT_MUTED  = 'D1D5DB'
const TEXT_LIGHT  = '9CA3AF'
const TEXT_DIM    = '6B7280'

// Colores por rol — versiones BRILLANTES para fondo oscuro
const ROL_ENG       = 'A78BFA'   // morado claro
const ROL_PROC      = '60A5FA'   // azul claro
const ROL_SHOP      = 'FBBF24'   // ámbar claro
const ROL_ADMIN     = '34D399'   // verde claro

// Estados — versiones brillantes
const ESTADO_COLORS = {
  solicitada:     'B0A89A',  // gris cálido
  procurement:    '60A5FA',  // azul
  fabricacion:    'FBBF24',  // ámbar
  qc:             'A78BFA',  // morado
  enviada:        '38BDF8',  // cyan
  esperando:      '9CA3AF',  // gris
  aprobada:       '34D399',  // verde
}

// Helpers visuales
function drawDarkCard(slide, x, y, w, h, opts = {}) {
  // Sombra ligera
  slide.addShape('roundRect', {
    x: x + 0.05, y: y + 0.05, w, h,
    fill: { color: '000000', transparency: 70 },
    line: { color: 'FFFFFF', transparency: 100, width: 0 },
    rectRadius: opts.radius ?? 0.14,
  })
  // Card oscura
  slide.addShape('roundRect', {
    x, y, w, h,
    fill: { color: opts.bg ?? CARD_DARK },
    line: { color: opts.borderColor ?? '4A5240', width: opts.borderWidth ?? 1 },
    rectRadius: opts.radius ?? 0.14,
  })
  // Borde de acento arriba (si se pide)
  if (opts.accent) {
    slide.addShape('rect', {
      x, y, w, h: 0.10,
      fill: { color: opts.accent },
      line: { color: opts.accent, width: 0 },
    })
  }
}

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 1 — HERO / Manifesto (igual que V2)
// ═════════════════════════════════════════════════════════════════════════
const hero = pres.addSlide()
hero.background = { color: BG_DARK }

hero.addShape('rect', {
  x: 0, y: 0, w: 0.5, h: 7.5,
  fill: { color: GOLD }, line: { color: GOLD, width: 0 },
})

hero.addText('M', {
  x: 7.5, y: -1.0, w: 6.5, h: 9.5,
  fontSize: 600, fontFace: 'Calibri', bold: true,
  color: GOLD, transparency: 88, valign: 'middle',
})

hero.addText('CENTRAL MILLWORK', {
  x: 1.0, y: 0.6, w: 8, h: 0.4,
  fontSize: 13, fontFace: 'Calibri', color: GOLD_LIGHT, bold: true, charSpacing: 6,
})

hero.addText('Sistematizando el', {
  x: 1.0, y: 1.4, w: 11, h: 0.95,
  fontSize: 56, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
})
hero.addText('proceso de muestras', {
  x: 1.0, y: 2.3, w: 11, h: 0.95,
  fontSize: 56, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT,
})

hero.addShape('rect', {
  x: 1.0, y: 3.45, w: 1.5, h: 0.05,
  fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 },
})

hero.addText(
  'Un proceso transparente, automatizado y trazable.\n' +
  'Cada rol sabe qué hacer, cuándo hacerlo y a quién le toca después.',
  {
    x: 1.0, y: 3.7, w: 9.5, h: 1.4,
    fontSize: 18, fontFace: 'Calibri', italic: true,
    color: TEXT_MUTED, lineSpacingMultiple: 1.3,
  }
)

const heroStats = [
  { num: '7', label: 'estados del ciclo' },
  { num: '4', label: 'roles con responsabilidad clara' },
  { num: '100%', label: 'avisos automáticos por email' },
  { num: '0', label: 'mensajes de WhatsApp necesarios' },
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

hero.addText('GUÍA INTERNA · JUNIO 2026', {
  x: 1.0, y: 7.18, w: 8, h: 0.3,
  fontSize: 9, fontFace: 'Calibri', color: TEXT_DIM, bold: true, charSpacing: 4,
})

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 2 — El ciclo (FONDO OSCURO consistente con slide 1)
// ═════════════════════════════════════════════════════════════════════════
const s2 = pres.addSlide()
s2.background = { color: BG_DARK }

// Banda dorada arriba (como slide 4)
s2.addShape('rect', {
  x: 0, y: 0, w: 13.33, h: 0.12,
  fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 },
})

// Header del slide
s2.addText('01', {
  x: 0.5, y: 0.4, w: 1.2, h: 0.7,
  fontSize: 44, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT,
})
s2.addText('El viaje de una muestra', {
  x: 1.8, y: 0.5, w: 11, h: 0.6,
  fontSize: 30, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
})
s2.addText('De la idea inicial hasta la aprobación del cliente — 7 etapas, todas avisadas por email', {
  x: 1.8, y: 1.05, w: 11.5, h: 0.4,
  fontSize: 13, fontFace: 'Calibri', italic: true, color: TEXT_MUTED,
})
// Línea acento
s2.addShape('rect', {
  x: 1.8, y: 1.45, w: 1.2, h: 0.04,
  fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 },
})

// ─── 7 estados como cards en grid 4+3 ────────────────────────────────────
const STATES = [
  { n: '01', label: 'Solicitada',       desc: 'INGENIERÍA crea la muestra con la spec del cliente',
    icon: '📋', who: 'Ingeniería arranca', color: ESTADO_COLORS.solicitada },
  { n: '02', label: 'En Procurement',   desc: 'Decide si hay que comprar materiales o si ya están en stock',
    icon: '🛒', who: 'Procurement decide', color: ESTADO_COLORS.procurement },
  { n: '03', label: 'En Fabricación',   desc: 'El taller construye la muestra siguiendo la ruta del tipo',
    icon: '🔨', who: 'Shop Manager + operarios', color: ESTADO_COLORS.fabricacion },
  { n: '04', label: 'En QC',            desc: 'Control de calidad antes de salir al cliente',
    icon: '🔍', who: 'Shop Manager valida', color: ESTADO_COLORS.qc },
  { n: '05', label: 'Enviada',          desc: 'Logística la despacha al cliente, con foto del paquete',
    icon: '📦', who: 'Procurement / Logística', color: ESTADO_COLORS.enviada },
  { n: '06', label: 'Esperando',        desc: 'El cliente revisa la muestra y nos dice qué opina',
    icon: '⏳', who: 'Cliente revisa', color: ESTADO_COLORS.esperando },
  { n: '07', label: 'Aprobada',         desc: 'Queda vinculada al proyecto para usar en producción real',
    icon: '✅', who: 'Ingeniería cierra', color: ESTADO_COLORS.aprobada },
]

const cardW = 2.95
const cardH = 2.3
const row1Y = 1.75
const row2Y = 4.30
const gapX = 0.13
const startCardsX = 0.45

// Row 1: estados 1-4
for (let i = 0; i < 4; i++) {
  const st = STATES[i]
  const x = startCardsX + i * (cardW + gapX)
  drawDarkCard(s2, x, row1Y, cardW, cardH, { accent: st.color, radius: 0.16 })

  // Número grande sutil de fondo
  s2.addText(st.n, {
    x: x + cardW - 1.0, y: row1Y + 0.05, w: 1.0, h: 0.7,
    fontSize: 36, fontFace: 'Calibri', bold: true,
    color: st.color, transparency: 75, align: 'right',
  })
  // Icono
  s2.addText(st.icon, {
    x: x + 0.2, y: row1Y + 0.25, w: 0.7, h: 0.6,
    fontSize: 30, valign: 'middle',
  })
  // Label
  s2.addText(st.label, {
    x: x + 0.2, y: row1Y + 0.95, w: cardW - 0.4, h: 0.4,
    fontSize: 15, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
  })
  // Quién
  s2.addText(st.who, {
    x: x + 0.2, y: row1Y + 1.36, w: cardW - 0.4, h: 0.3,
    fontSize: 9, fontFace: 'Calibri', bold: true,
    color: st.color, charSpacing: 2,
  })
  // Descripción
  s2.addText(st.desc, {
    x: x + 0.2, y: row1Y + 1.65, w: cardW - 0.4, h: 0.6,
    fontSize: 10, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
  })
}

// Row 2: estados 5-7 + tarjeta "Si rechaza"
for (let i = 0; i < 3; i++) {
  const st = STATES[4 + i]
  const x = startCardsX + i * (cardW + gapX)
  drawDarkCard(s2, x, row2Y, cardW, cardH, { accent: st.color, radius: 0.16 })

  s2.addText(st.n, {
    x: x + cardW - 1.0, y: row2Y + 0.05, w: 1.0, h: 0.7,
    fontSize: 36, fontFace: 'Calibri', bold: true,
    color: st.color, transparency: 75, align: 'right',
  })
  s2.addText(st.icon, {
    x: x + 0.2, y: row2Y + 0.25, w: 0.7, h: 0.6,
    fontSize: 30, valign: 'middle',
  })
  s2.addText(st.label, {
    x: x + 0.2, y: row2Y + 0.95, w: cardW - 0.4, h: 0.4,
    fontSize: 15, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
  })
  s2.addText(st.who, {
    x: x + 0.2, y: row2Y + 1.36, w: cardW - 0.4, h: 0.3,
    fontSize: 9, fontFace: 'Calibri', bold: true,
    color: st.color, charSpacing: 2,
  })
  s2.addText(st.desc, {
    x: x + 0.2, y: row2Y + 1.65, w: cardW - 0.4, h: 0.6,
    fontSize: 10, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
  })
}

// Card 4 de row 2: "Si rechaza" — destacado en rojo brillante
const rejectX = startCardsX + 3 * (cardW + gapX)
drawDarkCard(s2, rejectX, row2Y, cardW, cardH, {
  accent: 'F87171',
  bg: '3B1F1F',
  borderColor: '7F1D1D',
  borderWidth: 1.5,
  radius: 0.16,
})
s2.addText('↻', {
  x: rejectX + cardW - 1.0, y: row2Y + 0.05, w: 1.0, h: 0.7,
  fontSize: 36, fontFace: 'Calibri', bold: true,
  color: 'F87171', transparency: 60, align: 'right',
})
s2.addText('⚠️', {
  x: rejectX + 0.2, y: row2Y + 0.25, w: 0.7, h: 0.6,
  fontSize: 28, valign: 'middle',
})
s2.addText('Si rechaza', {
  x: rejectX + 0.2, y: row2Y + 0.95, w: cardW - 0.4, h: 0.4,
  fontSize: 15, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
})
s2.addText('CICLO REABRE', {
  x: rejectX + 0.2, y: row2Y + 1.36, w: cardW - 0.4, h: 0.3,
  fontSize: 9, fontFace: 'Calibri', bold: true, color: 'FCA5A5', charSpacing: 2,
})
s2.addText('Vuelve a "Solicitada" como V2, V3… con la razón del cliente. Ingeniería ajusta y arranca de nuevo.', {
  x: rejectX + 0.2, y: row2Y + 1.65, w: cardW - 0.4, h: 0.6,
  fontSize: 9.5, fontFace: 'Calibri', color: 'FECACA', valign: 'top',
})

// Footer
s2.addShape('rect', {
  x: 0.4, y: 7.05, w: 12.55, h: 0.03,
  fill: { color: GOLD_LIGHT, transparency: 50 }, line: { color: GOLD_LIGHT, width: 0 },
})
s2.addText('Cada transición dispara un email automático al rol responsable. Nadie espera ser avisado por mensaje.', {
  x: 0.4, y: 7.15, w: 12.55, h: 0.3,
  fontSize: 10, fontFace: 'Calibri', italic: true, color: TEXT_LIGHT, align: 'center',
})

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 3 — Roles (FONDO OSCURO consistente)
// ═════════════════════════════════════════════════════════════════════════
const s3 = pres.addSlide()
s3.background = { color: BG_DARK }

// Banda dorada arriba
s3.addShape('rect', {
  x: 0, y: 0, w: 13.33, h: 0.12,
  fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 },
})

s3.addText('02', {
  x: 0.5, y: 0.4, w: 1.2, h: 0.7,
  fontSize: 44, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT,
})
s3.addText('Qué hacés según tu rol', {
  x: 1.8, y: 0.5, w: 11, h: 0.6,
  fontSize: 30, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
})
s3.addText('Cuatro roles con responsabilidades claras. Cada uno recibe avisos cuando le toca actuar.', {
  x: 1.8, y: 1.05, w: 11.5, h: 0.4,
  fontSize: 13, fontFace: 'Calibri', italic: true, color: TEXT_MUTED,
})
s3.addShape('rect', {
  x: 1.8, y: 1.45, w: 1.2, h: 0.04,
  fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 },
})

const ROLES = [
  {
    icon: '📐', name: 'INGENIERÍA',
    color: ROL_ENG,
    tagline: 'Vos abrís y cerrás el ciclo',
    superpoder: 'Decisión técnica formal',
    tareas: [
      'Crear la muestra con código, tipo y especificaciones',
      'Subir el Sample Request PDF para el cliente',
      'Aprobar o rechazar según la respuesta del cliente',
      'Si rechaza: ajustar y crear una nueva versión',
    ],
  },
  {
    icon: '🛒', name: 'PROCUREMENT',
    color: ROL_PROC,
    tagline: 'Garantizás que el taller tenga material',
    superpoder: 'Compras y logística',
    tareas: [
      'Recibís email cuando hay muestra nueva',
      'Crear OCs si hay que comprar, o marcar "sin compras"',
      'Recibir el material cuando llega al taller',
      'Registrar el envío con foto al despachar',
    ],
  },
  {
    icon: '🔨', name: 'SHOP MANAGER',
    color: ROL_SHOP,
    tagline: 'Arrancás y supervisás la fabricación',
    superpoder: 'Producción taller',
    tareas: [
      'Recibís email "lista para fabricar"',
      'Iniciás fabricación: modal con procesos según tipo',
      'Editás la ruta sugerida si hace falta',
      'Recibís email cuando termina y va a QC',
    ],
  },
  {
    icon: '👁️', name: 'ADMIN',
    color: ROL_ADMIN,
    tagline: 'Ves todo y podés intervenir',
    superpoder: 'Supervisión global',
    tareas: [
      'Ves el inbox completo de tareas del sistema',
      'Podés hacer cualquier transición manual',
      'Linkear muestras huérfanas a proyectos',
      'Cancelar o archivar muestras antiguas',
    ],
  },
]

const laneW = 2.95
const laneY = 1.75
const laneH = 5.3
const laneGap = 0.13

ROLES.forEach((rol, i) => {
  const x = startCardsX + i * (laneW + laneGap)

  drawDarkCard(s3, x, laneY, laneW, laneH, { radius: 0.18 })

  // Banda de color en la parte superior (más alta y con icono dentro)
  s3.addShape('rect', {
    x, y: laneY, w: laneW, h: 1.35,
    fill: { color: rol.color, transparency: 80 },
    line: { color: rol.color, width: 0 },
  })

  // Icono grande
  s3.addText(rol.icon, {
    x: x + 0.3, y: laneY + 0.2, w: 1.0, h: 1.0,
    fontSize: 50, valign: 'middle',
  })
  // Nombre del rol
  s3.addText(rol.name, {
    x: x + 0.25, y: laneY + 0.95, w: laneW - 0.5, h: 0.35,
    fontSize: 14, fontFace: 'Calibri', bold: true,
    color: TEXT_WHITE, charSpacing: 3,
  })

  // Tagline
  s3.addText(rol.tagline, {
    x: x + 0.25, y: laneY + 1.55, w: laneW - 0.5, h: 0.4,
    fontSize: 11, fontFace: 'Calibri', italic: true, bold: true, color: rol.color,
  })

  // Badge "superpoder" — pill con color del rol
  s3.addShape('roundRect', {
    x: x + 0.25, y: laneY + 2.0, w: laneW - 0.5, h: 0.4,
    fill: { color: rol.color, transparency: 80 },
    line: { color: rol.color, transparency: 60, width: 1 },
    rectRadius: 0.1,
  })
  s3.addText(rol.superpoder.toUpperCase(), {
    x: x + 0.25, y: laneY + 2.0, w: laneW - 0.5, h: 0.4,
    fontSize: 9, fontFace: 'Calibri', bold: true,
    color: rol.color, align: 'center', valign: 'middle', charSpacing: 2,
  })

  // Línea separadora
  s3.addShape('line', {
    x: x + 0.3, y: laneY + 2.6, w: laneW - 0.6, h: 0,
    line: { color: '4A5240', width: 1 },
  })

  // Tareas — bullets coloreados
  rol.tareas.forEach((t, ti) => {
    const ty = laneY + 2.8 + ti * 0.58
    s3.addShape('ellipse', {
      x: x + 0.3, y: ty + 0.08, w: 0.15, h: 0.15,
      fill: { color: rol.color }, line: { color: rol.color, width: 0 },
    })
    s3.addText(t, {
      x: x + 0.55, y: ty, w: laneW - 0.75, h: 0.55,
      fontSize: 10, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
    })
  })
})

// Footer
s3.addShape('rect', {
  x: 0.4, y: 7.05, w: 12.55, h: 0.03,
  fill: { color: GOLD_LIGHT, transparency: 50 }, line: { color: GOLD_LIGHT, width: 0 },
})
s3.addText('Sin reuniones, sin WhatsApp, sin "¿en qué quedó X?". El sistema te dice cuándo te toca.', {
  x: 0.4, y: 7.15, w: 12.55, h: 0.3,
  fontSize: 10, fontFace: 'Calibri', italic: true, color: TEXT_LIGHT, align: 'center',
})

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 4 — Impacto / Por qué importa (igual que V2)
// ═════════════════════════════════════════════════════════════════════════
const s4 = pres.addSlide()
s4.background = { color: BG_FOREST }

s4.addShape('rect', {
  x: 0, y: 0, w: 13.33, h: 0.15,
  fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 },
})

s4.addText('LO QUE GANAMOS', {
  x: 1.0, y: 0.5, w: 11, h: 0.4,
  fontSize: 13, fontFace: 'Calibri', color: GOLD_LIGHT, bold: true, charSpacing: 6,
})

s4.addText('Más que software:', {
  x: 1.0, y: 1.05, w: 11, h: 0.85,
  fontSize: 40, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
})
s4.addText('un nuevo estándar de trabajo', {
  x: 1.0, y: 1.85, w: 11, h: 0.85,
  fontSize: 40, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT,
})

const beneficios = [
  {
    icon: '🎯',
    title: 'Responsabilidad clara',
    desc: 'Cada rol sabe exactamente qué tiene que hacer y cuándo. Nadie queda esperando que "alguien le avise".',
  },
  {
    icon: '🔍',
    title: 'Trazabilidad total',
    desc: 'Cada muestra deja registro: cuándo se creó, quién la fabricó, cuándo se envió, qué dijo el cliente.',
  },
  {
    icon: '⚡',
    title: 'Sin canales paralelos',
    desc: 'Se acabaron los WhatsApps, mails sueltos y "¿pasaste por la oficina?". Todo pasa en el sistema.',
  },
  {
    icon: '💎',
    title: 'Conocimiento que queda',
    desc: 'Las muestras aprobadas quedan ligadas a los proyectos. La próxima vez ya tenés la spec validada.',
  },
]

const bcardW = 5.95
const bcardH = 2.0
const bcardX = [1.0, 6.95, 1.0, 6.95]
const bcardY = [3.05, 3.05, 5.15, 5.15]

beneficios.forEach((b, i) => {
  const x = bcardX[i]
  const y = bcardY[i]

  s4.addShape('roundRect', {
    x, y, w: bcardW, h: bcardH,
    fill: { color: CARD_DARKER },
    line: { color: '4A5240', width: 1 },
    rectRadius: 0.14,
  })

  s4.addText(b.icon, {
    x: x + 0.3, y: y + 0.3, w: 1.0, h: 1.0,
    fontSize: 44, valign: 'middle',
  })
  s4.addText(b.title, {
    x: x + 1.45, y: y + 0.35, w: bcardW - 1.6, h: 0.5,
    fontSize: 18, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
  })
  s4.addText(b.desc, {
    x: x + 1.45, y: y + 0.85, w: bcardW - 1.6, h: 1.0,
    fontSize: 11.5, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
    lineSpacingMultiple: 1.3,
  })
})

s4.addText('Central Millwork · Junio 2026', {
  x: 1.0, y: 7.18, w: 11, h: 0.25,
  fontSize: 10, fontFace: 'Calibri', color: TEXT_LIGHT, italic: true, charSpacing: 2,
})

// Save
const outPath = String.raw`C:\Users\chali\OneDrive - Central Millwork\centralmillwork-app\guia_muestras_v3_2026_06_10.pptx`
pres.writeFile({ fileName: outPath }).then((name) => {
  console.log('OK guardado en:', name)
})
