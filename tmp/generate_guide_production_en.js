// Production Module — English version (translated from guia_produccion)
// Same visual style, neutral descriptive tone. Highlights the Kiosk,
// stations, progress photos and real-time visibility.
const pptxgen = require('pptxgenjs')

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE'
pres.author = 'Central Millwork'
pres.title = 'Production Module — CEO Guide'

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

const C_PEND   = 'FBBF24'
const C_PROC   = '60A5FA'
const C_PAUSE  = 'F472B6'
const C_DONE   = '34D399'
const C_KIOSK  = 'A78BFA'
const C_PHOTO  = '38BDF8'
const C_LIVE   = 'F87171'

const C_ST_CNC      = '60A5FA'
const C_ST_EDGE     = 'A78BFA'
const C_ST_PAINT    = 'F472B6'
const C_ST_ASSEM    = 'FBBF24'
const C_ST_FINAL    = '38BDF8'
const C_ST_SHIP     = '34D399'

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
  slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 } })
  slide.addText(num, { x: 0.5, y: 0.4, w: 1.2, h: 0.7, fontSize: 44, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT })
  slide.addText(title, { x: 1.8, y: 0.5, w: 11, h: 0.6, fontSize: 30, fontFace: 'Calibri', bold: true, color: TEXT_WHITE })
  slide.addText(subtitle, { x: 1.8, y: 1.05, w: 11.5, h: 0.4, fontSize: 13, fontFace: 'Calibri', italic: true, color: TEXT_MUTED })
  slide.addShape('rect', { x: 1.8, y: 1.45, w: 1.2, h: 0.04, fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 } })
}
function footer(slide, text) {
  slide.addShape('rect', { x: 0.4, y: 7.05, w: 12.55, h: 0.03, fill: { color: GOLD_LIGHT, transparency: 50 }, line: { color: GOLD_LIGHT, width: 0 } })
  slide.addText(text, { x: 0.4, y: 7.15, w: 12.55, h: 0.3, fontSize: 10, fontFace: 'Calibri', italic: true, color: TEXT_LIGHT, align: 'center' })
}

// ═══ SLIDE 1 — HERO ═══
const hero = pres.addSlide()
hero.background = { color: BG_DARK }
hero.addShape('rect', { x: 0, y: 0, w: 0.5, h: 7.5, fill: { color: GOLD }, line: { color: GOLD, width: 0 } })
hero.addText('P', { x: 7.5, y: -1.0, w: 6.5, h: 9.5, fontSize: 600, fontFace: 'Calibri', bold: true, color: GOLD, transparency: 88, valign: 'middle' })
hero.addText('CENTRAL MILLWORK', { x: 1.0, y: 0.6, w: 8, h: 0.4, fontSize: 13, fontFace: 'Calibri', color: GOLD_LIGHT, bold: true, charSpacing: 6 })
hero.addText('Production', { x: 1.0, y: 1.4, w: 11, h: 0.95, fontSize: 56, fontFace: 'Calibri', bold: true, color: TEXT_WHITE })
hero.addText('Module', { x: 1.0, y: 2.3, w: 11, h: 0.95, fontSize: 56, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT })
hero.addShape('rect', { x: 1.0, y: 3.45, w: 1.5, h: 0.05, fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 } })
hero.addText('From the shop floor to the screen, synchronized in real time.', {
  x: 1.0, y: 3.7, w: 9.5, h: 0.7, fontSize: 22, fontFace: 'Calibri', italic: true, color: TEXT_MUTED,
})
const heroStats = [
  { num: '8',  label: 'specialized stations' },
  { num: '📲', label: 'touch kiosk on the shop floor' },
  { num: '📷', label: 'photos at every key step' },
  { num: '⚡', label: 'real-time visibility' },
]
heroStats.forEach((s, i) => {
  const x = 1.0 + i * 2.85
  hero.addText(s.num, { x, y: 5.7, w: 2.5, h: 0.7, fontSize: 38, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT })
  hero.addText(s.label, { x, y: 6.4, w: 2.5, h: 0.4, fontSize: 11, fontFace: 'Calibri', color: TEXT_MUTED })
})
hero.addText('LEADERSHIP BRIEFING · JUNE 2026', { x: 1.0, y: 7.18, w: 8, h: 0.3, fontSize: 9, fontFace: 'Calibri', color: TEXT_DIM, bold: true, charSpacing: 4 })

// ═══ SLIDE 2 — THE JOURNEY OF A WORK ORDER ═══
const s2 = pres.addSlide()
s2.background = { color: BG_DARK }
header(s2, '01', 'The journey of a work order',
  'From entering the shop to delivery. Every move is recorded.')

const STEPS = [
  { n: '01', label: 'Pending',     desc: 'The work order is created with materials reserved and processes defined',
    icon: '📥', who: 'Shop Manager plans', color: C_PEND },
  { n: '02', label: 'In progress', desc: 'Operators work step by step, each at their specialized station',
    icon: '⚙️', who: 'Operators execute', color: C_PROC },
  { n: '03', label: 'Paused',      desc: 'If waiting is needed (material, validation, client), the pause is visible to everyone',
    icon: '⏸️', who: 'Reason recorded', color: C_PAUSE },
  { n: '04', label: 'Completed',   desc: 'All processes done, photos archived, ready for delivery',
    icon: '✅', who: 'Automatic close', color: C_DONE },
]
const cardH = 2.65
const cardY = 2.0
const gapX = 0.18
const totalW = 12.4
const w4 = (totalW - 3 * gapX) / 4
STEPS.forEach((st, i) => {
  const x = 0.45 + i * (w4 + gapX)
  drawDarkCard(s2, x, cardY, w4, cardH, { accent: st.color, radius: 0.18 })
  s2.addText(st.n, { x: x + w4 - 1.2, y: cardY + 0.05, w: 1.2, h: 0.75, fontSize: 42, fontFace: 'Calibri', bold: true, color: st.color, transparency: 75, align: 'right' })
  s2.addText(st.icon, { x: x + 0.25, y: cardY + 0.3, w: 0.8, h: 0.7, fontSize: 40, valign: 'middle' })
  s2.addText(st.label, { x: x + 0.25, y: cardY + 1.1, w: w4 - 0.5, h: 0.45, fontSize: 18, fontFace: 'Calibri', bold: true, color: TEXT_WHITE })
  s2.addText(st.who, { x: x + 0.25, y: cardY + 1.55, w: w4 - 0.5, h: 0.32, fontSize: 10, fontFace: 'Calibri', bold: true, color: st.color, charSpacing: 2 })
  s2.addText(st.desc, { x: x + 0.25, y: cardY + 1.9, w: w4 - 0.5, h: 0.7, fontSize: 11, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top' })
})
drawDarkCard(s2, 0.45, 5.1, 12.4, 1.7, { bg: '2A2F22', borderColor: GOLD_LIGHT, borderWidth: 1, radius: 0.16 })
s2.addText('🎯', { x: 0.7, y: 5.3, w: 0.8, h: 1.0, fontSize: 50, valign: 'middle' })
s2.addText('One source of truth for the entire shop', { x: 1.7, y: 5.3, w: 11, h: 0.5, fontSize: 18, fontFace: 'Calibri', bold: true, color: TEXT_WHITE })
s2.addText('At any moment, from any screen, anyone can see exactly which station each order is at, who is working on it and how long it has been there.', {
  x: 1.7, y: 5.85, w: 11, h: 0.85, fontSize: 12, fontFace: 'Calibri', italic: true, color: TEXT_MUTED, valign: 'top',
})
footer(s2, 'Moving from one state to the next requires an explicit action and is tied to a specific operator and timestamp.')

// ═══ SLIDE 3 — THE KIOSK ═══
const s3 = pres.addSlide()
s3.background = { color: BG_DARK }
header(s3, '02', 'The Kiosk: the system on the shop floor',
  'A touch screen where operators live the system without ever touching a computer.')

drawDarkCard(s3, 0.45, 1.75, 5.2, 5.0, { accent: C_KIOSK, radius: 0.18 })
s3.addShape('roundRect', { x: 0.8, y: 2.1, w: 4.5, h: 3.4, fill: { color: '0F1410' }, line: { color: C_KIOSK, width: 2 }, rectRadius: 0.15 })
s3.addText('CNC · Station 1', { x: 1.0, y: 2.3, w: 4.1, h: 0.35, fontSize: 13, fontFace: 'Calibri', bold: true, color: C_KIOSK, align: 'center' })
s3.addText('WO-2026-0287  ·  Pico Bay #4', { x: 1.0, y: 2.6, w: 4.1, h: 0.3, fontSize: 10, fontFace: 'Calibri', color: TEXT_MUTED, align: 'center' })

s3.addShape('roundRect', { x: 1.1, y: 3.05, w: 3.9, h: 0.8, fill: { color: C_KIOSK, transparency: 85 }, line: { color: C_KIOSK, transparency: 50, width: 1 }, rectRadius: 0.08 })
s3.addText('👤  Victor M.', { x: 1.2, y: 3.1, w: 2, h: 0.35, fontSize: 13, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, valign: 'middle' })
s3.addText('⏱  2h 47min', { x: 3.5, y: 3.1, w: 1.5, h: 0.35, fontSize: 13, fontFace: 'Calibri', bold: true, color: C_KIOSK, align: 'right', valign: 'middle' })
s3.addText('Started at 7:23 AM', { x: 1.2, y: 3.45, w: 3.7, h: 0.3, fontSize: 9, fontFace: 'Calibri', italic: true, color: 'D1D5DB' })

s3.addShape('roundRect', { x: 1.1, y: 4.05, w: 1.85, h: 1.15, fill: { color: C_DONE, transparency: 70 }, line: { color: C_DONE, width: 0 }, rectRadius: 0.1 })
s3.addText('✓\nCOMPLETE', { x: 1.1, y: 4.05, w: 1.85, h: 1.15, fontSize: 13, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, align: 'center', valign: 'middle' })
s3.addShape('roundRect', { x: 3.15, y: 4.05, w: 1.85, h: 1.15, fill: { color: C_PAUSE, transparency: 70 }, line: { color: C_PAUSE, width: 0 }, rectRadius: 0.1 })
s3.addText('⏸\nPAUSE', { x: 3.15, y: 4.05, w: 1.85, h: 1.15, fontSize: 13, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, align: 'center', valign: 'middle' })

s3.addText('TOUCH SCREEN · SHOP FLOOR', { x: 0.8, y: 5.7, w: 4.5, h: 0.4, fontSize: 11, fontFace: 'Calibri', bold: true, color: C_KIOSK, align: 'center', charSpacing: 4 })
s3.addText('No keyboard, no mouse, no fighting with a PC', { x: 0.8, y: 6.05, w: 4.5, h: 0.35, fontSize: 10, fontFace: 'Calibri', italic: true, color: TEXT_MUTED, align: 'center' })

drawDarkCard(s3, 5.85, 1.75, 7.0, 5.0, { accent: C_KIOSK, radius: 0.18 })
s3.addText('HOW IT WORKS', { x: 6.15, y: 2.0, w: 6.5, h: 0.4, fontSize: 12, fontFace: 'Calibri', bold: true, color: C_KIOSK, charSpacing: 4 })

const kioskFns = [
  { icon: '🔑', t: 'Identification with personal PIN',
    d: 'Each operator has their PIN. The system knows who did what and when.' },
  { icon: '👆', t: 'Start an item',
    d: 'A single tap marks the start of work. The timer kicks off the moment.' },
  { icon: '⏸️', t: 'Pause with a reason',
    d: 'If work has to stop (waiting for material, another task), the reason is logged — and visible to Leadership.' },
  { icon: '✅', t: 'Complete and move forward',
    d: 'When the step is done, the order travels by itself to the next station. The next operator finds it waiting.' },
  { icon: '📊', t: 'Real-time, effortlessly',
    d: 'Every tap is recorded. Hours worked accumulate without any timesheet.' },
]
kioskFns.forEach((f, i) => {
  const yi = 2.55 + i * 0.82
  s3.addText(f.icon, { x: 6.15, y: yi, w: 0.55, h: 0.55, fontSize: 22, valign: 'middle' })
  s3.addText(f.t, { x: 6.75, y: yi, w: 6.0, h: 0.35, fontSize: 13, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, valign: 'top' })
  s3.addText(f.d, { x: 6.75, y: yi + 0.35, w: 6.0, h: 0.45, fontSize: 10.5, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top' })
})
footer(s3, 'The operator doesn\'t need to learn computers. The Kiosk speaks their language: tap, see, advance.')

// ═══ SLIDE 4 — STATIONS ═══
const s4 = pres.addSlide()
s4.background = { color: BG_DARK }
header(s4, '03', 'The shop\'s stations',
  'Eight specialized stations. Every order goes through only the ones it needs, in the right order.')

drawDarkCard(s4, 0.45, 1.85, 12.4, 0.75, { bg: '2A2F22', borderColor: GOLD_LIGHT, borderWidth: 1, radius: 0.14 })
s4.addText('🏭', { x: 0.7, y: 1.95, w: 0.7, h: 0.6, fontSize: 28, valign: 'middle' })
s4.addText('Each station works at its own pace. The system coordinates them so no one has to flag the next one.', {
  x: 1.45, y: 1.95, w: 11.3, h: 0.6, fontSize: 13, fontFace: 'Calibri', italic: true, color: TEXT_MUTED, valign: 'middle',
})

const STATIONS = [
  { id: 'CNC',          icon: '🪚', desc: 'Precision machine cutting of parts',     color: C_ST_CNC },
  { id: 'Edge Banding', icon: '📏', desc: 'Edge application to part borders',        color: C_ST_EDGE },
  { id: 'Laminate',     icon: '📐', desc: 'Surface lamination',                       color: C_ST_CNC },
  { id: 'Paint',        icon: '🎨', desc: 'Finishing and final color',                color: C_ST_PAINT },
  { id: 'Assembly',     icon: '🔧', desc: 'Putting finished parts together',          color: C_ST_ASSEM },
  { id: 'Final',        icon: '✨', desc: 'Details, polishing and inspection',        color: C_ST_FINAL },
  { id: 'Check-in',     icon: '📋', desc: 'Verification, counting and prep',          color: C_ST_EDGE },
  { id: 'Shipping',     icon: '📦', desc: 'Packaging and delivery preparation',       color: C_ST_SHIP },
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
  s4.addText(st.icon, { x: x + 0.2, y: y + 0.2, w: 0.7, h: 0.7, fontSize: 30, valign: 'middle' })
  s4.addText(`${i + 1}`, { x: x + stW - 0.7, y: y + 0.05, w: 0.6, h: 0.6, fontSize: 26, fontFace: 'Calibri', bold: true, color: st.color, transparency: 65, align: 'right' })
  s4.addText(st.id, { x: x + 0.2, y: y + 0.85, w: stW - 0.3, h: 0.35, fontSize: 14, fontFace: 'Calibri', bold: true, color: TEXT_WHITE })
  s4.addText(st.desc, { x: x + 0.2, y: y + 1.2, w: stW - 0.3, h: 0.55, fontSize: 9.5, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top' })
})
drawDarkCard(s4, 0.45, 6.4, 12.4, 0.55, { bg: '2A2F22', borderColor: '4A5240', radius: 0.14 })
s4.addText('Orders go only through the stations their type requires. A hardware sample skips CNC. A large cabinet doesn\'t.', {
  x: 0.7, y: 6.4, w: 12.0, h: 0.55, fontSize: 11, fontFace: 'Calibri', italic: true, color: TEXT_MUTED, align: 'center', valign: 'middle',
})
footer(s4, 'Each order\'s route is set up front. The system carries it from station to station without manual handoff.')

// ═══ SLIDE 5 — PROGRESS PHOTOS ═══
const s5 = pres.addSlide()
s5.background = { color: BG_DARK }
header(s5, '04', 'Progress photos at every station',
  'Before closing a step, the work is documented. Visual evidence, archived for good.')

drawDarkCard(s5, 0.45, 1.75, 5.7, 5.0, { accent: C_PHOTO, radius: 0.18 })
s5.addText('HOW IT WORKS', { x: 0.7, y: 2.0, w: 5.2, h: 0.4, fontSize: 12, fontFace: 'Calibri', bold: true, color: C_PHOTO, charSpacing: 4 })
s5.addText('The camera as a requirement', { x: 0.7, y: 2.4, w: 5.2, h: 0.5, fontSize: 19, fontFace: 'Calibri', bold: true, color: TEXT_WHITE })

const fotoPoints = [
  { icon: '📸', t: 'Photo required to advance',
    d: 'At critical stations, no photo means the step can\'t be marked complete.' },
  { icon: '🔢', t: 'Configurable minimum count',
    d: 'Each station defines how many photos it asks for (1, 3, 5). Default is 3 angles.' },
  { icon: '📂', t: 'Filed with the order',
    d: 'Photos stay linked to the work order, available whenever needed.' },
  { icon: '🔍', t: 'Visible at any time',
    d: 'Leadership, supervision or customer service can review the work remotely.' },
]
fotoPoints.forEach((p, i) => {
  const yi = 3.15 + i * 0.85
  s5.addText(p.icon, { x: 0.85, y: yi, w: 0.6, h: 0.6, fontSize: 26, valign: 'middle' })
  s5.addText(p.t, { x: 1.5, y: yi, w: 4.5, h: 0.35, fontSize: 13, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, valign: 'top' })
  s5.addText(p.d, { x: 1.5, y: yi + 0.35, w: 4.5, h: 0.5, fontSize: 10.5, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top' })
})

drawDarkCard(s5, 6.35, 1.75, 6.5, 5.0, { accent: C_PHOTO, radius: 0.18 })
s5.addText('EXAMPLE: WO-2026-0287 · CNC', { x: 6.6, y: 2.0, w: 6.0, h: 0.4, fontSize: 11, fontFace: 'Calibri', bold: true, color: C_PHOTO, charSpacing: 3 })

const photos = [
  { tag: 'Main piece',      op: 'Side A' },
  { tag: 'Main piece',      op: 'Side B' },
  { tag: 'Pre-assembly',    op: 'Top face' },
  { tag: 'Detail',          op: 'Bottom corner' },
  { tag: 'Detail',          op: 'Edges' },
  { tag: 'Assembly',        op: 'Full view' },
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
  s5.addShape('roundRect', { x, y, w: pW, h: pH, fill: { color: '0F1410' }, line: { color: C_PHOTO, transparency: 70, width: 1 }, rectRadius: 0.08 })
  s5.addText('📷', { x, y: y + 0.05, w: pW, h: 0.8, fontSize: 36, valign: 'middle', align: 'center' })
  s5.addText(ph.tag, { x: x + 0.1, y: y + 0.9, w: pW - 0.2, h: 0.25, fontSize: 8.5, fontFace: 'Calibri', bold: true, color: C_PHOTO, valign: 'top' })
  s5.addText(ph.op, { x: x + 0.1, y: y + 1.15, w: pW - 0.2, h: 0.25, fontSize: 8, fontFace: 'Calibri', italic: true, color: TEXT_MUTED, valign: 'top' })
})
s5.addText('6 photos · captured today 9:42 AM  ·  Operator: Victor M.', { x: 6.6, y: 5.85, w: 6.0, h: 0.3, fontSize: 9, fontFace: 'Calibri', italic: true, color: TEXT_LIGHT, align: 'center' })
footer(s5, 'Quality is documented, not assumed. Any later dispute is settled with evidence already on file.')

// ═══ SLIDE 6 — REAL-TIME ═══
const s6 = pres.addSlide()
s6.background = { color: BG_DARK }
header(s6, '05', 'Real-time on every screen',
  'What happens on the shop floor shows up — instantly — in the office and at Leadership.')

const vistas = [
  { title: 'THE SHOP MAP', icon: '🗺️', color: C_LIVE, badge: 'OPERATIONS',
    items: [
      'Visual map with all 8 stations',
      'Each order appears as a card',
      'Color shows real-time status',
      'Timers run while the operator works',
    ] },
  { title: 'ORDER TIMELINE', icon: '📈', color: C_PROC, badge: 'TRACEABILITY',
    items: [
      'Timeline of the full work order',
      'Start and end for every station',
      'Responsible operator at each step',
      'Pauses with their reason and duration',
    ] },
  { title: 'REPORTS & METRICS', icon: '📊', color: C_DONE, badge: 'LEADERSHIP',
    items: [
      'Hours worked by operator and project',
      'Average time per station',
      'Real vs estimated comparison',
      'Weekly report ready to present',
    ] },
]
const vW = 4.1
const vH = 4.95
const vY = 1.85
const vGap = 0.15
vistas.forEach((v, i) => {
  const x = 0.45 + i * (vW + vGap)
  drawDarkCard(s6, x, vY, vW, vH, { accent: v.color, radius: 0.18 })
  s6.addShape('roundRect', { x: x + 0.3, y: vY + 0.25, w: 1.5, h: 0.3, fill: { color: v.color, transparency: 75 }, line: { color: v.color, width: 0 }, rectRadius: 0.1 })
  s6.addText(v.badge, { x: x + 0.3, y: vY + 0.25, w: 1.5, h: 0.3, fontSize: 8.5, fontFace: 'Calibri', bold: true, color: v.color, align: 'center', valign: 'middle', charSpacing: 1.5 })
  s6.addText(v.icon, { x: x + 0.3, y: vY + 0.7, w: vW - 0.6, h: 1.3, fontSize: 72, valign: 'middle', align: 'center' })
  s6.addText(v.title, { x: x + 0.3, y: vY + 2.15, w: vW - 0.6, h: 0.45, fontSize: 15, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, align: 'center', charSpacing: 2 })
  s6.addShape('line', { x: x + 0.6, y: vY + 2.7, w: vW - 1.2, h: 0, line: { color: '4A5240', width: 1 } })
  v.items.forEach((it, ti) => {
    const ty = vY + 2.9 + ti * 0.45
    s6.addShape('ellipse', { x: x + 0.4, y: ty + 0.08, w: 0.15, h: 0.15, fill: { color: v.color }, line: { color: v.color, width: 0 } })
    s6.addText(it, { x: x + 0.65, y: ty, w: vW - 0.85, h: 0.4, fontSize: 10.5, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top' })
  })
})
footer(s6, 'No weekly Excel report to build. The metrics are always there, ready for whoever wants to look.')

// ═══ SLIDE 7 — ROLES ═══
const s7 = pres.addSlide()
s7.background = { color: BG_DARK }
header(s7, '06', 'Who does what',
  'Four roles, each with the tool the job requires.')

const ROLES = [
  { icon: '🧑‍🏭', name: 'OPERATOR', color: R_OPER, tagline: 'The one doing the work',
    actividades: [
      'Identifies with their PIN at the Kiosk',
      'Starts, pauses and completes each item',
      'Captures the required progress photos',
      'No computer skills needed',
    ], herramienta: 'Touch Kiosk · Their station' },
  { icon: '👷', name: 'SHOP MANAGER', color: R_SHOP, tagline: 'Orchestrates the shop floor',
    actividades: [
      'Creates and plans work orders',
      'Assigns operators to stations',
      'Resolves bottlenecks and pauses',
      'Supervises the day\'s progress',
    ], herramienta: 'Computer · Production view' },
  { icon: '📐', name: 'PROJECT MANAGEMENT', color: R_PM, tagline: 'Tracks the project\'s progress',
    actividades: [
      'Sees which orders are at each station',
      'Checks estimated vs actual time',
      'Anticipates deliveries and updates clients',
      'Reviews progress photos and quality',
    ], herramienta: 'Computer · Project view' },
  { icon: '👁️', name: 'LEADERSHIP', color: R_ADMIN, tagline: 'Sees the operation from above',
    actividades: [
      'Productivity metrics by operator',
      'Efficiency comparison between stations',
      'Real vs estimated cost',
      'Weekly report built without manual work',
    ], herramienta: 'Computer · Executive dashboard' },
]
const laneW = 2.95
const laneY = 1.75
const laneH = 5.3
const laneGap = 0.13
ROLES.forEach((rol, i) => {
  const x = 0.45 + i * (laneW + laneGap)
  drawDarkCard(s7, x, laneY, laneW, laneH, { radius: 0.18 })
  s7.addShape('rect', { x, y: laneY, w: laneW, h: 1.35, fill: { color: rol.color, transparency: 80 }, line: { color: rol.color, width: 0 } })
  s7.addText(rol.icon, { x: x + 0.3, y: laneY + 0.2, w: 1.0, h: 1.0, fontSize: 50, valign: 'middle' })
  s7.addText(rol.name, { x: x + 0.25, y: laneY + 0.95, w: laneW - 0.5, h: 0.35, fontSize: 13, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, charSpacing: 3 })
  s7.addText(rol.tagline, { x: x + 0.25, y: laneY + 1.55, w: laneW - 0.5, h: 0.4, fontSize: 11, fontFace: 'Calibri', italic: true, bold: true, color: rol.color })
  s7.addShape('roundRect', { x: x + 0.25, y: laneY + 2.0, w: laneW - 0.5, h: 0.4, fill: { color: rol.color, transparency: 80 }, line: { color: rol.color, transparency: 60, width: 1 }, rectRadius: 0.1 })
  s7.addText(rol.herramienta.toUpperCase(), { x: x + 0.25, y: laneY + 2.0, w: laneW - 0.5, h: 0.4, fontSize: 8.5, fontFace: 'Calibri', bold: true, color: rol.color, align: 'center', valign: 'middle', charSpacing: 1.5 })
  s7.addShape('line', { x: x + 0.3, y: laneY + 2.6, w: laneW - 0.6, h: 0, line: { color: '4A5240', width: 1 } })
  rol.actividades.forEach((t, ti) => {
    const ty = laneY + 2.8 + ti * 0.58
    s7.addShape('ellipse', { x: x + 0.3, y: ty + 0.08, w: 0.15, h: 0.15, fill: { color: rol.color }, line: { color: rol.color, width: 0 } })
    s7.addText(t, { x: x + 0.55, y: ty, w: laneW - 0.75, h: 0.55, fontSize: 10, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top' })
  })
})
footer(s7, 'The shop floor doesn\'t use what the office uses. And the office stays out of the shop\'s flow.')

// ═══ SLIDE 8 — SPECIAL CASES ═══
const s8 = pres.addSlide()
s8.background = { color: BG_DARK }
header(s8, '07', 'Beyond regular production',
  'The system also orchestrates samples, justified pauses and special work.')

const CASOS = [
  { icon: '🧪', color: 'A78BFA', name: 'Samples as production', badge: 'SAMPLES',
    desc: 'Samples built for the client enter the same production flow.',
    bullets: [
      'Marked with a special badge at the Kiosk',
      'Processes pre-filled by sample type (door, cabinet, hardware…)',
      'On completion, they automatically move to QC',
    ] },
  { icon: '⏸️', color: C_PAUSE, name: 'Pauses with a reason', badge: 'JUSTIFIED',
    desc: 'When work stops, it isn\'t "it stopped, oh well." The reason is recorded.',
    bullets: [
      'Reason chosen from a list (waiting for material, validation, etc.)',
      'Pause time quantified',
      'Visible in metrics to detect patterns',
    ] },
  { icon: '🔁', color: 'F87171', name: 'Rework and reopening', badge: 'CORRECTION',
    desc: 'If an order needs to go back to a previous station, history isn\'t lost.',
    bullets: [
      'Controlled, recorded reopening',
      'Full history remains intact',
      'Reason for the rework is documented',
    ] },
  { icon: '⏱️', color: '60A5FA', name: 'Hours and real cost', badge: 'DATA',
    desc: 'Every minute of work accumulates automatically — the basis for real cost.',
    bullets: [
      'Hours by operator, station and project',
      'Comparison vs estimated time',
      'Basis for better future estimates',
    ] },
]
const ccW = 6.05
const ccH = 2.6
const cardsXY = [{ x: 0.45, y: 1.75 }, { x: 6.85, y: 1.75 }, { x: 0.45, y: 4.45 }, { x: 6.85, y: 4.45 }]
CASOS.forEach((c, i) => {
  const { x, y } = cardsXY[i]
  drawDarkCard(s8, x, y, ccW, ccH, { accent: c.color, radius: 0.16 })
  s8.addText(c.icon, { x: x + 0.25, y: y + 0.25, w: 0.85, h: 0.85, fontSize: 38, valign: 'middle' })
  s8.addText(c.name, { x: x + 1.15, y: y + 0.28, w: ccW - 2.5, h: 0.45, fontSize: 17, fontFace: 'Calibri', bold: true, color: TEXT_WHITE })
  s8.addShape('roundRect', { x: x + ccW - 1.6, y: y + 0.35, w: 1.4, h: 0.3, fill: { color: c.color, transparency: 75 }, line: { color: c.color, width: 0 }, rectRadius: 0.1 })
  s8.addText(c.badge, { x: x + ccW - 1.6, y: y + 0.35, w: 1.4, h: 0.3, fontSize: 8, fontFace: 'Calibri', bold: true, color: c.color, align: 'center', valign: 'middle', charSpacing: 1 })
  s8.addText(c.desc, { x: x + 1.15, y: y + 0.78, w: ccW - 1.4, h: 0.55, fontSize: 11, fontFace: 'Calibri', italic: true, color: TEXT_MUTED, valign: 'top' })
  c.bullets.forEach((b, bi) => {
    s8.addText('•  ' + b, { x: x + 0.3, y: y + 1.35 + bi * 0.38, w: ccW - 0.55, h: 0.35, fontSize: 10, fontFace: 'Calibri', color: TEXT_LIGHT, valign: 'top' })
  })
})
footer(s8, 'One system orchestrates regular production, samples, rework and metrics — all coexisting without friction.')

// ═══ SLIDE 9 — IMPACT ═══
const s9 = pres.addSlide()
s9.background = { color: BG_FOREST }
s9.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.15, fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 } })
s9.addText('WHAT WE GAIN', { x: 1.0, y: 0.5, w: 11, h: 0.4, fontSize: 13, fontFace: 'Calibri', color: GOLD_LIGHT, bold: true, charSpacing: 6 })
s9.addText('An orchestrated shop', { x: 1.0, y: 1.05, w: 11, h: 0.85, fontSize: 40, fontFace: 'Calibri', bold: true, color: TEXT_WHITE })
s9.addText('and a measurable operation', { x: 1.0, y: 1.85, w: 11, h: 0.85, fontSize: 40, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT })

const beneficios = [
  { icon: '🎯', title: 'Full flow control', desc: 'Every order moves between stations without anyone having to call ahead. Pauses have reason and duration.' },
  { icon: '📷', title: 'Documented quality', desc: 'Photos at every critical station, archived with the order. Any later question has visual evidence to back it.' },
  { icon: '⚡', title: 'Live visibility',     desc: 'What\'s happening on the shop floor shows up instantly in the office and at Leadership. No manual reports.' },
  { icon: '📈', title: 'Data to decide on',  desc: 'Real hours by operator, station and project. A solid foundation for better quotes and better operations.' },
]
const bcardW = 5.95
const bcardH = 2.0
const bcardX = [1.0, 6.95, 1.0, 6.95]
const bcardY = [3.05, 3.05, 5.15, 5.15]
beneficios.forEach((b, i) => {
  const x = bcardX[i]
  const y = bcardY[i]
  s9.addShape('roundRect', { x, y, w: bcardW, h: bcardH, fill: { color: CARD_DARKER }, line: { color: '4A5240', width: 1 }, rectRadius: 0.14 })
  s9.addText(b.icon, { x: x + 0.3, y: y + 0.3, w: 1.0, h: 1.0, fontSize: 44, valign: 'middle' })
  s9.addText(b.title, { x: x + 1.45, y: y + 0.35, w: bcardW - 1.6, h: 0.5, fontSize: 18, fontFace: 'Calibri', bold: true, color: TEXT_WHITE })
  s9.addText(b.desc, { x: x + 1.45, y: y + 0.85, w: bcardW - 1.6, h: 1.0, fontSize: 11.5, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top', lineSpacingMultiple: 1.3 })
})
s9.addText('Central Millwork · June 2026', { x: 1.0, y: 7.18, w: 11, h: 0.25, fontSize: 10, fontFace: 'Calibri', color: TEXT_LIGHT, italic: true, charSpacing: 2 })

const outPath = String.raw`C:\Users\chali\OneDrive - Central Millwork\centralmillwork-app\production_module_en_2026_06_12.pptx`
pres.writeFile({ fileName: outPath }).then((name) => console.log('OK saved to:', name))
