// Guía visual del ciclo de Muestras — Central Millwork
// Lenguaje natural, pensada para que cualquier usuario (ENG/PROC/SHOP/ADMIN)
// entienda qué pasa, cuándo, y qué tiene que hacer.
const pptxgen = require('pptxgenjs')

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE'
pres.author = 'Central Millwork'
pres.title = 'Guía de Muestras — cómo funciona'

// ─── Paleta brand ───────────────────────────────────────────────────────────
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

// Colores por rol
const ROL_ENG  = '7C3AED'  // morado
const ROL_PROC = '2563EB'  // azul
const ROL_SHOP = 'D97706'  // ámbar
const ROL_ADMIN = '059669'  // verde
const ROL_SYS  = '6B7280'  // gris (automático)

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 1 — Timeline del ciclo
// ─────────────────────────────────────────────────────────────────────────────
const s1 = pres.addSlide()
s1.background = { color: BG }

s1.addText('Central Millwork · Guía de Muestras', {
  x: 0.4, y: 0.25, w: 12.5, h: 0.35,
  fontSize: 13, fontFace: 'Calibri', color: GOLD, bold: true, charSpacing: 2,
})
s1.addText('El viaje de una muestra, de principio a fin', {
  x: 0.4, y: 0.6, w: 12.5, h: 0.55,
  fontSize: 26, fontFace: 'Calibri', bold: true, color: FOREST_DARK,
})
s1.addText('Cada etapa muestra qué pasa, quién la dispara y a quién le llega aviso por email.', {
  x: 0.4, y: 1.05, w: 12.5, h: 0.3,
  fontSize: 12, fontFace: 'Calibri', italic: true, color: TEXT_MUTED,
})

// ─── Línea de tiempo: 7 estados horizontales ────────────────────────────────
// Posiciones X de cada nodo. 7 nodos repartidos en 12.4 de ancho.
const STATES = [
  { label: 'Solicitada',     subtitle: 'INGENIERÍA crea la muestra',         color: '6B6356' },
  { label: 'Procurement',    subtitle: 'Decide compras o stock',             color: ROL_PROC },
  { label: 'En fabricación', subtitle: 'Taller construye',                   color: GOLD },
  { label: 'En QC',          subtitle: 'Control de calidad',                 color: '8B5CF6' },
  { label: 'Enviada',        subtitle: 'Logística manda al cliente',         color: '3B82F6' },
  { label: 'Esperando',      subtitle: 'Cliente revisa',                     color: '6B7280' },
  { label: 'Aprobada',       subtitle: 'INGENIERÍA cierra el ciclo',         color: '10B981' },
]
const lineY = 2.0
const startX = 0.6
const endX = 12.7
const stateW = 1.65
const stepX = (endX - startX) / (STATES.length - 1)

// Línea base
s1.addShape('line', {
  x: startX + 0.2, y: lineY + 0.5, w: endX - startX - 0.4, h: 0,
  line: { color: CARD_BORDER, width: 2, dashType: 'dash' },
})

// Nodos
STATES.forEach((st, i) => {
  const cx = startX + i * stepX
  // Círculo del nodo (color del estado)
  s1.addShape('ellipse', {
    x: cx, y: lineY + 0.2, w: 0.6, h: 0.6,
    fill: { color: st.color },
    line: { color: 'FFFFFF', width: 3 },
  })
  s1.addText(String(i + 1), {
    x: cx, y: lineY + 0.2, w: 0.6, h: 0.6,
    fontSize: 18, fontFace: 'Calibri', bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle',
  })
  // Label del estado abajo
  s1.addText(st.label, {
    x: cx - 0.5, y: lineY + 0.95, w: 1.6, h: 0.3,
    fontSize: 11, fontFace: 'Calibri', bold: true,
    color: FOREST_DARK, align: 'center',
  })
  s1.addText(st.subtitle, {
    x: cx - 0.6, y: lineY + 1.25, w: 1.8, h: 0.3,
    fontSize: 9, fontFace: 'Calibri', italic: true,
    color: TEXT_MUTED, align: 'center',
  })
})

// ─── Tarjetas de "qué pasa" entre cada nodo ─────────────────────────────────
// 4 tarjetas explicando los momentos clave
const cards = [
  {
    x: 0.4, y: 3.8, w: 6.15, h: 1.5,
    icon: '📧',
    title: 'Cuando una muestra entra en Solicitada',
    color: ROL_PROC,
    bullets: [
      'PROCUREMENT recibe email: "Hay materiales por gestionar"',
      'Puede crear órdenes de compra, o marcar "sin compras" si está en stock',
      'Cuando todo el material está listo, le avisa al taller automáticamente',
    ],
  },
  {
    x: 6.75, y: 3.8, w: 6.15, h: 1.5,
    icon: '🔨',
    title: 'Cuando todo está listo para fabricar',
    color: GOLD,
    bullets: [
      'SHOP MANAGER recibe email: "Materiales listos, podés iniciar"',
      'Click "Iniciar fabricación" abre un modal con los procesos sugeridos',
      'El operario en el kiosko ejecuta paso a paso',
    ],
  },
  {
    x: 0.4, y: 5.45, w: 6.15, h: 1.5,
    icon: '📦',
    title: 'Cuando la muestra termina QC y se envía',
    color: '3B82F6',
    bullets: [
      'PROCUREMENT/LOGÍSTICA registra el envío (foto del paquete opcional)',
      'INGENIERÍA recibe email: "Muestra enviada, esperar respuesta del cliente"',
      'Al recibir respuesta, la cierra como Aprobada o Rechazada',
    ],
  },
  {
    x: 6.75, y: 5.45, w: 6.15, h: 1.5,
    icon: '✅',
    title: 'Cuando se aprueba (cierra el ciclo)',
    color: '10B981',
    bullets: [
      'Solo INGENIERÍA puede aprobar (decisión técnica formal)',
      'La aprobación queda registrada en el proyecto del cliente',
      'El PDF de spec queda disponible para producción futura',
    ],
  },
]

cards.forEach((c) => {
  // Card
  s1.addShape('roundRect', {
    x: c.x, y: c.y, w: c.w, h: c.h,
    fill: { color: CARD_BG },
    line: { color: CARD_BORDER, width: 1 },
    rectRadius: 0.08,
  })
  // Top accent
  s1.addShape('rect', {
    x: c.x, y: c.y, w: c.w, h: 0.05,
    fill: { color: c.color }, line: { color: c.color, width: 0 },
  })
  // Icono + título
  s1.addText(c.icon, {
    x: c.x + 0.2, y: c.y + 0.15, w: 0.5, h: 0.4,
    fontSize: 20, valign: 'middle',
  })
  s1.addText(c.title, {
    x: c.x + 0.75, y: c.y + 0.18, w: c.w - 0.9, h: 0.35,
    fontSize: 12, fontFace: 'Calibri', bold: true, color: FOREST_DARK,
  })
  // Bullets
  c.bullets.forEach((b, i) => {
    s1.addText('•', {
      x: c.x + 0.25, y: c.y + 0.6 + i * 0.27, w: 0.2, h: 0.25,
      fontSize: 11, color: c.color, bold: true,
    })
    s1.addText(b, {
      x: c.x + 0.5, y: c.y + 0.6 + i * 0.27, w: c.w - 0.7, h: 0.3,
      fontSize: 9.5, fontFace: 'Calibri', color: TEXT_DARK, valign: 'top',
    })
  })
})

// Footer
s1.addShape('line', {
  x: 0.4, y: 7.18, w: 12.55, h: 0,
  line: { color: GOLD_LIGHT, width: 1 },
})
s1.addText('Si una muestra se rechaza, vuelve a Solicitada como nueva versión (V2, V3…) con la razón del cliente', {
  x: 0.4, y: 7.22, w: 12.55, h: 0.25,
  fontSize: 9, fontFace: 'Calibri', italic: true,
  color: TEXT_MUTED, align: 'center',
})

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 2 — Qué hacés según tu rol (4 carriles)
// ─────────────────────────────────────────────────────────────────────────────
const s2 = pres.addSlide()
s2.background = { color: BG }

s2.addText('Central Millwork · Guía de Muestras', {
  x: 0.4, y: 0.25, w: 12.5, h: 0.35,
  fontSize: 13, fontFace: 'Calibri', color: GOLD, bold: true, charSpacing: 2,
})
s2.addText('Qué hacés según tu rol', {
  x: 0.4, y: 0.6, w: 12.5, h: 0.55,
  fontSize: 26, fontFace: 'Calibri', bold: true, color: FOREST_DARK,
})
s2.addText('Cada rol tiene responsabilidades claras y recibe avisos por email cuando algo le toca a él.', {
  x: 0.4, y: 1.05, w: 12.5, h: 0.3,
  fontSize: 12, fontFace: 'Calibri', italic: true, color: TEXT_MUTED,
})

// 4 columnas verticales (carriles) — cada rol
const lanes = [
  {
    x: 0.4, color: ROL_ENG,
    rol: 'INGENIERÍA',
    icon: '📐',
    quePasa: 'Vos sos quien crea la muestra y la cierra',
    tareas: [
      { txt: 'Crear muestra con código, tipo y especificaciones',  when: 'al inicio' },
      { txt: 'Subir el Sample Request PDF para el cliente',        when: 'al inicio' },
      { txt: 'Esperar que llegue la respuesta del cliente',        when: 'al final, te llega email cuando la enviamos' },
      { txt: 'Aprobar o rechazar según lo que dijo el cliente',    when: 'decisión final' },
      { txt: 'Si rechaza: nueva versión con razón del cliente',    when: 'reabre el ciclo' },
    ],
  },
  {
    x: 3.5, color: ROL_PROC,
    rol: 'PROCUREMENT',
    icon: '🛒',
    quePasa: 'Vos garantizás que el taller tenga materiales',
    tareas: [
      { txt: 'Recibís email cuando hay muestra nueva',            when: 'avisado automático' },
      { txt: 'Crear órdenes de compra (botón "Crear OC")',         when: 'si hay que comprar' },
      { txt: 'O marcar "sin compras" si está en stock',            when: 'si ya tenemos todo' },
      { txt: 'Recibir las OCs cuando llegan al taller',            when: 'al recibir mercadería' },
      { txt: 'Registrar el envío con foto del paquete',            when: 'logística saliente' },
    ],
  },
  {
    x: 6.6, color: ROL_SHOP,
    rol: 'SHOP MANAGER',
    icon: '🔨',
    quePasa: 'Vos arrancás y supervisás la fabricación',
    tareas: [
      { txt: 'Recibís email "lista para fabricar"',                when: 'cuando hay material' },
      { txt: 'Click "Iniciar fabricación" — modal con procesos',   when: 'arranque' },
      { txt: 'Editás la ruta sugerida según el tipo',              when: 'pre-llenado por tipo' },
      { txt: 'Operario ejecuta cada paso en el kiosko',            when: 'durante producción' },
      { txt: 'Recibís email cuando termina y va a QC',             when: 'cierre fabricación' },
    ],
  },
  {
    x: 9.7, color: ROL_ADMIN,
    rol: 'ADMIN',
    icon: '👁️',
    quePasa: 'Vos ves todo y podés intervenir donde sea',
    tareas: [
      { txt: 'Ves el inbox completo de tareas del sistema',        when: 'siempre' },
      { txt: 'Podés hacer cualquier transición manual',            when: 'casos especiales' },
      { txt: 'Cancelar o archivar muestras antiguas',              when: 'cleanup' },
      { txt: 'Linkear muestras huérfanas a proyectos',             when: 'corrección' },
      { txt: 'Ver el detalle de cualquier muestra histórica',      when: 'consultas' },
    ],
  },
]

const laneW = 3.0
const laneY = 1.65
const laneH = 5.6

lanes.forEach((lane) => {
  // Background card
  s2.addShape('roundRect', {
    x: lane.x, y: laneY, w: laneW, h: laneH,
    fill: { color: CARD_BG },
    line: { color: CARD_BORDER, width: 1 },
    rectRadius: 0.12,
  })
  // Top color bar
  s2.addShape('rect', {
    x: lane.x, y: laneY, w: laneW, h: 0.08,
    fill: { color: lane.color }, line: { color: lane.color, width: 0 },
  })

  // Icono
  s2.addText(lane.icon, {
    x: lane.x + 0.15, y: laneY + 0.2, w: 0.5, h: 0.5,
    fontSize: 22, valign: 'middle',
  })
  // Rol
  s2.addText(lane.rol, {
    x: lane.x + 0.7, y: laneY + 0.2, w: laneW - 0.85, h: 0.3,
    fontSize: 13, fontFace: 'Calibri', bold: true,
    color: lane.color, charSpacing: 1.5,
  })
  // Subtítulo "qué pasa"
  s2.addText(lane.quePasa, {
    x: lane.x + 0.15, y: laneY + 0.75, w: laneW - 0.3, h: 0.4,
    fontSize: 10, fontFace: 'Calibri', italic: true,
    color: TEXT_MUTED,
  })

  // Línea separadora
  s2.addShape('line', {
    x: lane.x + 0.15, y: laneY + 1.2, w: laneW - 0.3, h: 0,
    line: { color: CARD_BORDER, width: 1 },
  })

  // Tareas (5 por carril)
  lane.tareas.forEach((t, i) => {
    const ty = laneY + 1.4 + i * 0.82

    // Número
    s2.addShape('ellipse', {
      x: lane.x + 0.15, y: ty, w: 0.3, h: 0.3,
      fill: { color: lane.color },
      line: { color: lane.color, width: 0 },
    })
    s2.addText(String(i + 1), {
      x: lane.x + 0.15, y: ty, w: 0.3, h: 0.3,
      fontSize: 10, fontFace: 'Calibri', bold: true,
      color: 'FFFFFF', align: 'center', valign: 'middle',
    })
    // Texto
    s2.addText(t.txt, {
      x: lane.x + 0.55, y: ty - 0.04, w: laneW - 0.7, h: 0.45,
      fontSize: 9.5, fontFace: 'Calibri', color: TEXT_DARK, valign: 'top',
    })
    // "When"
    s2.addText(t.when, {
      x: lane.x + 0.55, y: ty + 0.35, w: laneW - 0.7, h: 0.3,
      fontSize: 8, fontFace: 'Calibri', italic: true, color: TEXT_LIGHT, valign: 'top',
    })
  })
})

// Footer leyenda emails
s2.addShape('line', {
  x: 0.4, y: 7.18, w: 12.55, h: 0,
  line: { color: GOLD_LIGHT, width: 1 },
})
s2.addText('Cada cambio importante dispara un email automático al rol que sigue. No hace falta avisar por WhatsApp ni revisar el sistema constantemente.', {
  x: 0.4, y: 7.22, w: 12.55, h: 0.25,
  fontSize: 9, fontFace: 'Calibri', italic: true,
  color: TEXT_MUTED, align: 'center',
})

// Save
const outPath = String.raw`C:\Users\chali\OneDrive - Central Millwork\centralmillwork-app\guia_muestras_2026_06_10.pptx`
pres.writeFile({ fileName: outPath }).then((name) => {
  console.log('OK guardado en:', name)
})
