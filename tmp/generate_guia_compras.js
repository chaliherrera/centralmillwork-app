// Guía visual del módulo de Compras — para CEO
// 9 slides. Lenguaje natural, didáctico, no técnico. Mismo estilo
// V3 de Muestras (dark + dorado). Incluye la app móvil de recepción.
const pptxgen = require('pptxgenjs')

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE'
pres.author = 'Central Millwork'
pres.title = 'Sistematizando el proceso de Compras — Guía CEO'

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

// Acentos por etapa
const C_IMPORT  = 'FBBF24'  // ámbar
const C_QUOTE   = '60A5FA'  // azul
const C_PRICE   = 'A78BFA'  // morado
const C_ORDER   = '34D399'  // verde
const C_MOBILE  = 'F472B6'  // rosa (app móvil destacada)
const C_RECEIVE = '38BDF8'  // cyan
const C_DONE    = '10B981'  // verde fuerte

// Por rol
const R_PROC   = '60A5FA'
const R_RECEP  = 'F472B6'
const R_PM     = 'A78BFA'
const R_ADMIN  = '34D399'

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

// Watermark C grande
hero.addText('C', {
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
hero.addText('proceso de compras', {
  x: 1.0, y: 2.3, w: 11, h: 0.95,
  fontSize: 56, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT,
})

hero.addShape('rect', {
  x: 1.0, y: 3.45, w: 1.5, h: 0.05,
  fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 },
})

hero.addText(
  'Desde la lista de materiales del proyecto\n' +
  'hasta el material recibido en el taller. Todo en un solo lugar.',
  {
    x: 1.0, y: 3.7, w: 9.5, h: 1.4,
    fontSize: 18, fontFace: 'Calibri', italic: true,
    color: TEXT_MUTED, lineSpacingMultiple: 1.3,
  }
)

const heroStats = [
  { num: '6', label: 'pasos del viaje' },
  { num: '0', label: 'planillas en papel' },
  { num: '100%', label: 'compras trazables' },
  { num: '📱', label: 'recepción desde el celular' },
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
// SLIDE 2 — EL VIAJE COMPLETO (overview)
// ═════════════════════════════════════════════════════════════════════════
const s2 = pres.addSlide()
s2.background = { color: BG_DARK }
header(s2, '01', 'El viaje de una compra',
  'Seis pasos, todos conectados. Cada uno con su responsable y su registro.')

const STEPS = [
  { n: '01', label: 'Lista del proyecto',  desc: 'Importamos el Excel con todos los materiales que el proyecto necesita',
    icon: '📋', who: 'Project Management entrega', color: C_IMPORT },
  { n: '02', label: 'Cotizamos',            desc: 'Le pedimos precio a cada proveedor con un PDF profesional generado',
    icon: '📧', who: 'Procurement gestiona', color: C_QUOTE },
  { n: '03', label: 'Capturamos precios',   desc: 'Cuando los proveedores responden, registramos los precios y el flete',
    icon: '💰', who: 'Procurement captura', color: C_PRICE },
  { n: '04', label: 'Orden de Compra',      desc: 'Un click y generamos la Orden oficial, lista para enviar al proveedor',
    icon: '📄', who: 'Sistema arma la OC', color: C_ORDER },
  { n: '05', label: 'Recepción móvil',      desc: 'Cuando llega el material al taller, lo recibimos desde el celular con foto',
    icon: '📱', who: 'Recepcionista en el taller', color: C_MOBILE },
  { n: '06', label: 'Listo en el taller',   desc: 'El material queda disponible y los proyectos saben qué tienen y qué falta',
    icon: '✅', who: 'Producción usa el material', color: C_DONE },
]

const cardW = 2.95
const cardH = 2.4
const row1Y = 1.75
const row2Y = 4.40
const gapX = 0.13
const startX = 0.45

STEPS.forEach((st, i) => {
  const isRow1 = i < 3
  const col = i % 3
  const y = isRow1 ? row1Y : row2Y
  const x = startX + col * (cardW + gapX)

  // Card más ancha (aprovechamos espacio: 3 por fila en vez de 4)
  const wCard = cardW + 1.0  // ampliar
  // Ajuste para que sigan siendo 3 por fila bien distribuidas
  const totalW = 12.4
  const w3 = (totalW - 2 * gapX) / 3
  const x3 = 0.45 + col * (w3 + gapX)

  drawDarkCard(s2, x3, y, w3, cardH, { accent: st.color, radius: 0.16 })

  s2.addText(st.n, {
    x: x3 + w3 - 1.2, y: y + 0.05, w: 1.2, h: 0.75,
    fontSize: 40, fontFace: 'Calibri', bold: true,
    color: st.color, transparency: 75, align: 'right',
  })
  s2.addText(st.icon, {
    x: x3 + 0.25, y: y + 0.3, w: 0.8, h: 0.7,
    fontSize: 38, valign: 'middle',
  })
  s2.addText(st.label, {
    x: x3 + 0.25, y: y + 1.1, w: w3 - 0.5, h: 0.45,
    fontSize: 17, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
  })
  s2.addText(st.who, {
    x: x3 + 0.25, y: y + 1.55, w: w3 - 0.5, h: 0.32,
    fontSize: 10, fontFace: 'Calibri', bold: true, color: st.color, charSpacing: 2,
  })
  s2.addText(st.desc, {
    x: x3 + 0.25, y: y + 1.85, w: w3 - 0.5, h: 0.55,
    fontSize: 11, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
  })
})

footer(s2, 'Cada paso queda registrado. En cualquier momento sabemos en qué estado está cada material.')

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 3 — PASO 1: IMPORTAR LISTA DEL PROYECTO (MTO)
// ═════════════════════════════════════════════════════════════════════════
const s3 = pres.addSlide()
s3.background = { color: BG_DARK }
header(s3, '02', 'Empezamos con la lista del proyecto',
  'Los materiales que necesita el proyecto, organizados automáticamente.')

// Card izquierda: ANTES
drawDarkCard(s3, 0.5, 1.75, 6.05, 5.0, {
  bg: '3B1F1F', borderColor: '7F1D1D', borderWidth: 1.5, radius: 0.18,
})
s3.addText('ANTES', {
  x: 0.7, y: 1.95, w: 5.7, h: 0.4,
  fontSize: 12, fontFace: 'Calibri', bold: true, color: 'FCA5A5', charSpacing: 4,
})
s3.addText('Excel suelto, planillas en papel', {
  x: 0.7, y: 2.4, w: 5.7, h: 0.5,
  fontSize: 19, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
})

const beforeItems = [
  '📑  Materiales anotados a mano o en archivos sueltos',
  '🔁  Si llega una nueva versión del proyecto, se reescribe todo',
  '❓  ¿Qué pedimos? ¿A quién? ¿Cuándo? Hay que preguntar',
  '⏱️  Procesar 100 materiales puede llevar varias horas',
  '👥  El conocimiento queda en la cabeza de una persona',
]
beforeItems.forEach((b, i) => {
  s3.addText(b, {
    x: 0.7, y: 3.15 + i * 0.55, w: 5.7, h: 0.5,
    fontSize: 12, fontFace: 'Calibri', color: 'FECACA', valign: 'top',
  })
})

// Card derecha: AHORA
drawDarkCard(s3, 6.75, 1.75, 6.05, 5.0, { accent: C_IMPORT, radius: 0.18 })
s3.addText('AHORA', {
  x: 6.95, y: 1.95, w: 5.7, h: 0.4,
  fontSize: 12, fontFace: 'Calibri', bold: true, color: C_IMPORT, charSpacing: 4,
})
s3.addText('Importamos el Excel y listo', {
  x: 6.95, y: 2.4, w: 5.7, h: 0.5,
  fontSize: 19, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
})

const afterItems = [
  '🎯  Subimos el Excel del proyecto en un click',
  '🗂️  El sistema organiza todo por proveedor automáticamente',
  '🏷️  Cada lote queda identificado: si subís una nueva versión, no se pisa',
  '⚡  100 materiales procesados en menos de 30 segundos',
  '🔍  Cualquier persona del equipo puede consultar el estado',
]
afterItems.forEach((b, i) => {
  s3.addText(b, {
    x: 6.95, y: 3.15 + i * 0.55, w: 5.7, h: 0.5,
    fontSize: 12, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
  })
})

footer(s3, 'La lista del proyecto es la fuente única de verdad: todos sabemos qué necesitamos y para cuándo.')

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 4 — PASO 2: COTIZAR CON PROVEEDORES
// ═════════════════════════════════════════════════════════════════════════
const s4 = pres.addSlide()
s4.background = { color: BG_DARK }
header(s4, '03', 'Cotizar con los proveedores',
  'Un PDF profesional por cada proveedor. Vos enviás, el sistema registra.')

// Layout: 3 cards en fila explicando el flujo
const stepsCotiz = [
  {
    icon: '📦',
    color: C_QUOTE,
    title: 'Agrupamos por proveedor',
    body: 'El sistema separa los materiales por vendor. Si un proveedor te vende 12 cosas, todas van juntas en una sola cotización.',
  },
  {
    icon: '📄',
    color: C_QUOTE,
    title: 'PDF profesional automático',
    body: 'Un click y bajás un PDF con tu marca, las descripciones, cantidades y código de proyecto. Listo para mandar.',
  },
  {
    icon: '✉️',
    color: C_QUOTE,
    title: 'Vos enviás por email',
    body: 'Usás tu cliente de correo normal (Outlook, Gmail). El sistema solo registra que ya cotizaste con ese vendor.',
  },
]

stepsCotiz.forEach((s, i) => {
  const w = 4.1
  const gap = 0.15
  const x = 0.45 + i * (w + gap)
  drawDarkCard(s4, x, 1.85, w, 4.8, { accent: s.color, radius: 0.18 })

  // Número grande paso
  s4.addText(`PASO ${i + 1}`, {
    x: x + 0.3, y: 2.05, w: w - 0.6, h: 0.4,
    fontSize: 11, fontFace: 'Calibri', bold: true, color: s.color, charSpacing: 4,
  })
  // Icono
  s4.addText(s.icon, {
    x: x + 0.3, y: 2.55, w: w - 0.6, h: 1.5,
    fontSize: 80, valign: 'middle', align: 'center',
  })
  // Título
  s4.addText(s.title, {
    x: x + 0.3, y: 4.15, w: w - 0.6, h: 0.6,
    fontSize: 17, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, align: 'center',
  })
  // Body
  s4.addText(s.body, {
    x: x + 0.3, y: 4.8, w: w - 0.6, h: 1.7,
    fontSize: 11.5, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
    align: 'center', lineSpacingMultiple: 1.3,
  })
})

footer(s4, 'Después de enviar, marcás "Cotización enviada" en el sistema y queda el registro de a quién pediste qué.')

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 5 — PASO 3 Y 4: PRECIOS Y ORDEN DE COMPRA
// ═════════════════════════════════════════════════════════════════════════
const s5 = pres.addSlide()
s5.background = { color: BG_DARK }
header(s5, '04', 'Precios y Orden de Compra',
  'Cuando vuelve la respuesta del proveedor, el sistema arma la Orden de Compra en segundos.')

// Card izquierda: capturar precios
drawDarkCard(s5, 0.45, 1.75, 6.2, 5.0, { accent: C_PRICE, radius: 0.18 })
s5.addText('PASO 3', {
  x: 0.7, y: 2.0, w: 5.7, h: 0.4,
  fontSize: 12, fontFace: 'Calibri', bold: true, color: C_PRICE, charSpacing: 4,
})
s5.addText('💰', {
  x: 0.7, y: 2.45, w: 0.7, h: 0.7,
  fontSize: 38, valign: 'middle',
})
s5.addText('Capturar precios del proveedor', {
  x: 1.5, y: 2.5, w: 5.0, h: 0.5,
  fontSize: 18, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
})

const capturarItems = [
  { t: 'Lo que llega del proveedor',          d: 'Email con precios. Nada de actualizar Excel a mano.' },
  { t: 'Ingresás los precios uno por uno',    d: 'Solo el precio unitario. El sistema calcula totales.' },
  { t: 'Agregás el costo del flete',          d: 'Si el proveedor cobra envío, lo sumás.' },
  { t: 'Subtotal y total en tiempo real',     d: 'Mientras escribís ya ves cuánto te va a salir.' },
]
capturarItems.forEach((it, i) => {
  const yi = 3.4 + i * 0.85
  s5.addShape('ellipse', {
    x: 0.85, y: yi + 0.05, w: 0.25, h: 0.25,
    fill: { color: C_PRICE }, line: { color: C_PRICE, width: 0 },
  })
  s5.addText(String(i + 1), {
    x: 0.85, y: yi + 0.05, w: 0.25, h: 0.25,
    fontSize: 10, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
    align: 'center', valign: 'middle',
  })
  s5.addText(it.t, {
    x: 1.2, y: yi, w: 5.2, h: 0.35,
    fontSize: 12, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, valign: 'top',
  })
  s5.addText(it.d, {
    x: 1.2, y: yi + 0.35, w: 5.2, h: 0.45,
    fontSize: 10.5, fontFace: 'Calibri', color: TEXT_LIGHT, valign: 'top',
  })
})

// Card derecha: generar OC
drawDarkCard(s5, 6.85, 1.75, 6.05, 5.0, { accent: C_ORDER, radius: 0.18 })
s5.addText('PASO 4', {
  x: 7.1, y: 2.0, w: 5.7, h: 0.4,
  fontSize: 12, fontFace: 'Calibri', bold: true, color: C_ORDER, charSpacing: 4,
})
s5.addText('📄', {
  x: 7.1, y: 2.45, w: 0.7, h: 0.7,
  fontSize: 38, valign: 'middle',
})
s5.addText('Generar Orden de Compra', {
  x: 7.9, y: 2.5, w: 4.8, h: 0.5,
  fontSize: 18, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
})

// Highlight card "un click"
s5.addShape('roundRect', {
  x: 7.1, y: 3.4, w: 5.55, h: 1.2,
  fill: { color: C_ORDER, transparency: 80 },
  line: { color: C_ORDER, transparency: 50, width: 1 },
  rectRadius: 0.1,
})
s5.addText('1 CLICK', {
  x: 7.3, y: 3.5, w: 5.2, h: 0.5,
  fontSize: 32, fontFace: 'Calibri', bold: true, color: C_ORDER,
  align: 'center', valign: 'middle',
})
s5.addText('y la Orden de Compra queda generada', {
  x: 7.3, y: 4.05, w: 5.2, h: 0.4,
  fontSize: 11, fontFace: 'Calibri', italic: true, color: 'D1FAE5',
  align: 'center',
})

const ocItems = [
  '✓  Número de OC oficial, único y consecutivo',
  '✓  PDF imprimible con todos los datos del proveedor',
  '✓  Vinculada al proyecto, al vendor y a los materiales',
  '✓  Estado: "Borrador" hasta que la marcás como enviada',
]
ocItems.forEach((it, i) => {
  s5.addText(it, {
    x: 7.1, y: 4.85 + i * 0.42, w: 5.55, h: 0.4,
    fontSize: 11, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
  })
})

footer(s5, 'En 5 minutos pasás de "tenemos el precio" a "Orden de Compra firmada y enviada al proveedor".')

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 6 — PASO 5: RECEPCIÓN MÓVIL (estrella)
// ═════════════════════════════════════════════════════════════════════════
const s6 = pres.addSlide()
s6.background = { color: BG_DARK }
header(s6, '05', 'Recepción desde el celular',
  'Cuando llega el material al taller, la app móvil cierra el ciclo. Sin papel, sin reescribir nada.')

// Mockup mental: card grande izquierda con "celular" + funciones
// Card grande izquierda con representación visual del celular
drawDarkCard(s6, 0.45, 1.75, 4.5, 5.0, { accent: C_MOBILE, radius: 0.18 })

// "Mockup" de celular (rectángulo vertical)
s6.addShape('roundRect', {
  x: 1.45, y: 2.15, w: 2.5, h: 4.3,
  fill: { color: '0F1410' },
  line: { color: C_MOBILE, width: 2 },
  rectRadius: 0.25,
})
// Notch
s6.addShape('roundRect', {
  x: 2.35, y: 2.2, w: 0.7, h: 0.1,
  fill: { color: '4A5240' }, line: { color: '4A5240', width: 0 },
  rectRadius: 0.05,
})

// Contenido del "celular"
s6.addText('OC-2026-0145', {
  x: 1.55, y: 2.45, w: 2.3, h: 0.3,
  fontSize: 11, fontFace: 'Calibri', bold: true, color: C_MOBILE, align: 'center',
})
s6.addText('RUGBY', {
  x: 1.55, y: 2.75, w: 2.3, h: 0.3,
  fontSize: 14, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, align: 'center',
})

// Items en el celular
const mockItems = [
  { label: 'Plywood 3/4"', qty: '✓ 28 / 28' },
  { label: 'MDF 1/2"',     qty: '✓ 4 / 4' },
  { label: 'Melamine B',   qty: '⚠ 50 / 57' },
  { label: 'Backer 1/4"',  qty: '✓ 14 / 14' },
]
mockItems.forEach((m, i) => {
  const yi = 3.25 + i * 0.5
  s6.addText(m.label, {
    x: 1.65, y: yi, w: 1.4, h: 0.3,
    fontSize: 9, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'middle',
  })
  s6.addText(m.qty, {
    x: 3.0, y: yi, w: 0.85, h: 0.3,
    fontSize: 9, fontFace: 'Calibri', bold: true,
    color: m.qty.startsWith('⚠') ? 'FBBF24' : C_DONE, align: 'right', valign: 'middle',
  })
})

// "Botón" foto
s6.addShape('roundRect', {
  x: 1.65, y: 5.6, w: 2.1, h: 0.5,
  fill: { color: C_MOBILE, transparency: 70 },
  line: { color: C_MOBILE, width: 0 },
  rectRadius: 0.08,
})
s6.addText('📷  TOMAR FOTO', {
  x: 1.65, y: 5.6, w: 2.1, h: 0.5,
  fontSize: 11, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
  align: 'center', valign: 'middle',
})

// Card derecha: funciones
drawDarkCard(s6, 5.15, 1.75, 7.7, 5.0, { accent: C_MOBILE, radius: 0.18 })
s6.addText('LA APP HACE TODO ESTO', {
  x: 5.45, y: 2.0, w: 7.1, h: 0.4,
  fontSize: 12, fontFace: 'Calibri', bold: true, color: C_MOBILE, charSpacing: 4,
})

const mobileFns = [
  { icon: '📋', t: 'Ve qué se ordenó',
    d: 'El recepcionista ve la lista de la OC sin necesitar imprimirla.' },
  { icon: '✓',  t: 'Marca qué llegó',
    d: 'Item por item. Si faltó algo o llegó de más, queda registrado.' },
  { icon: '📷', t: 'Toma foto del ticket y del material',
    d: 'Una prueba visual para cualquier reclamo posterior.' },
  { icon: '⚡', t: 'Genera el folio de recepción automáticamente',
    d: 'Sin pelearse con planillas ni números a mano.' },
  { icon: '🔔', t: 'Avisa a Procurement si hay diferencias',
    d: 'Si llegó parcial o con problemas, el sistema notifica.' },
]
mobileFns.forEach((f, i) => {
  const yi = 2.55 + i * 0.78
  s6.addText(f.icon, {
    x: 5.45, y: yi, w: 0.55, h: 0.55,
    fontSize: 22, valign: 'middle',
  })
  s6.addText(f.t, {
    x: 6.05, y: yi, w: 6.7, h: 0.35,
    fontSize: 13, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, valign: 'top',
  })
  s6.addText(f.d, {
    x: 6.05, y: yi + 0.35, w: 6.7, h: 0.4,
    fontSize: 10.5, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top',
  })
})

footer(s6, 'El recepcionista no necesita volver a la oficina ni esperar a nadie. Recibe en el momento que llega el camión.')

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 7 — ROLES
// ═════════════════════════════════════════════════════════════════════════
const s7 = pres.addSlide()
s7.background = { color: BG_DARK }
header(s7, '06', 'Quién hace qué',
  'Cuatro roles con responsabilidades claras. Cada uno usa lo que necesita y nada más.')

const ROLES = [
  {
    icon: '🛒', name: 'PROCUREMENT',
    color: R_PROC,
    tagline: 'El motor del proceso',
    actividades: [
      'Importa la lista del proyecto',
      'Cotiza con los proveedores',
      'Captura precios y genera Órdenes de Compra',
      'Resuelve diferencias en las recepciones',
    ],
    herramienta: 'Computadora · Sistema completo',
  },
  {
    icon: '📱', name: 'RECEPCIONISTA',
    color: R_RECEP,
    tagline: 'Cierra el ciclo en el taller',
    actividades: [
      'Recibe el material cuando llega el camión',
      'Marca qué se recibió y qué faltó',
      'Toma foto del ticket y del material',
      'Avisa diferencias con un click',
    ],
    herramienta: 'Celular · App móvil',
  },
  {
    icon: '📐', name: 'PROJECT MANAGEMENT',
    color: R_PM,
    tagline: 'Pide los materiales del proyecto',
    actividades: [
      'Define qué necesita el proyecto',
      'Sube el Excel con la lista de materiales',
      'Consulta el estado de las compras del proyecto',
      'Coordina con Procurement los plazos',
    ],
    herramienta: 'Computadora · Vista de proyecto',
  },
  {
    icon: '👁️', name: 'DIRECCIÓN',
    color: R_ADMIN,
    tagline: 'Ve todo, decide sobre lo importante',
    actividades: [
      'Dashboard con gasto por proyecto y por vendor',
      'Ve cuánto se compró, qué falta, dónde hay riesgo',
      'Autoriza compras urgentes o fuera de presupuesto',
      'Tiene historial completo de cualquier proyecto',
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

footer(s7, 'Cada quien usa la herramienta correcta para su tarea. Sin sobrecargar al taller con cosas de oficina.')

// ═════════════════════════════════════════════════════════════════════════
// SLIDE 8 — CASOS ESPECIALES (compras directas)
// ═════════════════════════════════════════════════════════════════════════
const s8 = pres.addSlide()
s8.background = { color: BG_DARK }
header(s8, '07', 'Casos especiales',
  'No todas las compras vienen del Excel del proyecto. El sistema cubre los otros caminos también.')

const CASOS = [
  {
    icon: '📦',
    color: C_ORDER,
    name: 'Del Excel del proyecto',
    badge: 'CAMINO PRINCIPAL',
    desc: 'La gran mayoría: viene de la lista (MTO) que entrega Project Management.',
    bullets: [
      'Ciclo completo: cotizar → captura → OC → recibir',
      'Vinculado al proyecto',
      'Aparece en el dashboard de gasto del proyecto',
    ],
  },
  {
    icon: '⚡',
    color: 'F87171',
    name: 'URGENTE',
    badge: 'CRÍTICA',
    desc: 'Material que se necesita YA y no estaba previsto. Salta el flujo de cotización.',
    bullets: [
      'OC directa sin cotizar formalmente',
      'Marcada como URGENTE para visibilidad',
      'Igual queda vinculada al proyecto si aplica',
    ],
  },
  {
    icon: '🎯',
    color: 'FBBF24',
    name: 'DIRECTA',
    badge: 'PUNTUAL',
    desc: 'Compras que no necesitan flujo formal de cotización pero sí registro.',
    bullets: [
      'OC creada directamente',
      'Útil para compras chicas o ya negociadas',
      'Mantiene trazabilidad completa',
    ],
  },
  {
    icon: '🔧',
    color: '60A5FA',
    name: 'OPERATIVA',
    badge: 'DÍA A DÍA',
    desc: 'Insumos del taller que no son de un proyecto: limpieza, oficina, mantenimiento.',
    bullets: [
      'No se asocia a un proyecto en particular',
      'Cuenta aparte para gasto operativo',
      'Igual queda en el historial general',
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
  // Badge
  s8.addShape('roundRect', {
    x: x + ccW - 1.5, y: y + 0.35, w: 1.3, h: 0.3,
    fill: { color: c.color, transparency: 75 },
    line: { color: c.color, width: 0 },
    rectRadius: 0.1,
  })
  s8.addText(c.badge, {
    x: x + ccW - 1.5, y: y + 0.35, w: 1.3, h: 0.3,
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

footer(s8, 'Cuatro caminos, una sola lógica: toda compra queda registrada con su contexto y su responsable.')

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

s9.addText('Compras transparentes', {
  x: 1.0, y: 1.05, w: 11, h: 0.85,
  fontSize: 40, fontFace: 'Calibri', bold: true, color: TEXT_WHITE,
})
s9.addText('y decisiones con datos', {
  x: 1.0, y: 1.85, w: 11, h: 0.85,
  fontSize: 40, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT,
})

const beneficios = [
  {
    icon: '🔍',
    title: 'Trazabilidad total',
    desc: 'Cualquier material: sabés quién lo pidió, cuándo se cotizó, qué Orden generó, cuándo llegó, quién lo recibió y con qué diferencias.',
  },
  {
    icon: '📊',
    title: 'Visibilidad ejecutiva',
    desc: 'Dashboard con gasto por proyecto, por vendor y por mes. Para Dirección, las compras ya no son una caja negra.',
  },
  {
    icon: '📱',
    title: 'Movilidad en el taller',
    desc: 'El recepcionista no vuelve a la oficina para registrar lo que llegó. Lo hace en el momento, con foto, desde su celular.',
  },
  {
    icon: '⏱️',
    title: 'Tiempo recuperado',
    desc: 'Lo que antes eran horas (importar, cotizar, comparar, armar OCs) ahora son minutos. El equipo se enfoca en lo importante.',
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
const outPath = String.raw`C:\Users\chali\OneDrive - Central Millwork\centralmillwork-app\guia_compras_2026_06_12.pptx`
pres.writeFile({ fileName: outPath }).then((name) => {
  console.log('OK guardado en:', name)
})
