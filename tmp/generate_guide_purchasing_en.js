// Purchasing Module — English version (translated from guia_compras_v2)
// Same visual style, neutral descriptive tone.
const pptxgen = require('pptxgenjs')

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE'
pres.author = 'Central Millwork'
pres.title = 'Purchasing Module — CEO Guide'

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

const C_IMPORT  = 'FBBF24'
const C_QUOTE   = '60A5FA'
const C_PRICE   = 'A78BFA'
const C_ORDER   = '34D399'
const C_MOBILE  = 'F472B6'
const C_DONE    = '10B981'

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
hero.addText('C', { x: 7.5, y: -1.0, w: 6.5, h: 9.5, fontSize: 600, fontFace: 'Calibri', bold: true, color: GOLD, transparency: 88, valign: 'middle' })
hero.addText('CENTRAL MILLWORK', { x: 1.0, y: 0.6, w: 8, h: 0.4, fontSize: 13, fontFace: 'Calibri', color: GOLD_LIGHT, bold: true, charSpacing: 6 })
hero.addText('Purchasing', { x: 1.0, y: 1.4, w: 11, h: 0.95, fontSize: 56, fontFace: 'Calibri', bold: true, color: TEXT_WHITE })
hero.addText('Module', { x: 1.0, y: 2.3, w: 11, h: 0.95, fontSize: 56, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT })
hero.addShape('rect', { x: 1.0, y: 3.45, w: 1.5, h: 0.05, fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 } })
hero.addText('From the MTO to material received at the shop.', { x: 1.0, y: 3.7, w: 9.5, h: 0.7, fontSize: 22, fontFace: 'Calibri', italic: true, color: TEXT_MUTED })

const heroStats = [
  { num: '6', label: 'steps in the journey' },
  { num: '0', label: 'paper spreadsheets' },
  { num: '100%', label: 'fully traceable' },
  { num: '📱', label: 'mobile receiving' },
]
heroStats.forEach((s, i) => {
  const x = 1.0 + i * 2.85
  hero.addText(s.num, { x, y: 5.7, w: 2.5, h: 0.7, fontSize: 38, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT })
  hero.addText(s.label, { x, y: 6.4, w: 2.5, h: 0.4, fontSize: 11, fontFace: 'Calibri', color: TEXT_MUTED })
})
hero.addText('LEADERSHIP BRIEFING · JUNE 2026', { x: 1.0, y: 7.18, w: 8, h: 0.3, fontSize: 9, fontFace: 'Calibri', color: TEXT_DIM, bold: true, charSpacing: 4 })

// ═══ SLIDE 2 — THE JOURNEY ═══
const s2 = pres.addSlide()
s2.background = { color: BG_DARK }
header(s2, '01', 'The journey of a purchase',
  'Six connected steps. Each with its owner and its record.')

const STEPS = [
  { n: '01', label: 'MTO',              desc: 'The project\'s material list is imported as an Excel file', icon: '📋', who: 'Project Management delivers', color: C_IMPORT },
  { n: '02', label: 'Quoting',          desc: 'Each vendor receives a professional PDF requesting prices', icon: '📧', who: 'Procurement handles',    color: C_QUOTE },
  { n: '03', label: 'Price capture',    desc: 'Vendor responses arrive and prices and freight are recorded', icon: '💰', who: 'Procurement captures',   color: C_PRICE },
  { n: '04', label: 'Purchase Order',   desc: 'In one click the official PO is generated, ready to send',     icon: '📄', who: 'System builds the PO',  color: C_ORDER },
  { n: '05', label: 'Mobile receiving', desc: 'When materials arrive, receiving happens on a phone with photos', icon: '📱', who: 'Receiving clerk at the shop', color: C_MOBILE },
  { n: '06', label: 'Ready at the shop', desc: 'Material becomes available and projects see what they have',  icon: '✅', who: 'Production uses the material', color: C_DONE },
]

const cardH = 2.4
const row1Y = 1.75
const row2Y = 4.40
const gapX = 0.13
STEPS.forEach((st, i) => {
  const isRow1 = i < 3
  const col = i % 3
  const y = isRow1 ? row1Y : row2Y
  const totalW = 12.4
  const w3 = (totalW - 2 * gapX) / 3
  const x3 = 0.45 + col * (w3 + gapX)
  drawDarkCard(s2, x3, y, w3, cardH, { accent: st.color, radius: 0.16 })
  s2.addText(st.n, { x: x3 + w3 - 1.2, y: y + 0.05, w: 1.2, h: 0.75, fontSize: 40, fontFace: 'Calibri', bold: true, color: st.color, transparency: 75, align: 'right' })
  s2.addText(st.icon, { x: x3 + 0.25, y: y + 0.3, w: 0.8, h: 0.7, fontSize: 38, valign: 'middle' })
  s2.addText(st.label, { x: x3 + 0.25, y: y + 1.1, w: w3 - 0.5, h: 0.45, fontSize: 17, fontFace: 'Calibri', bold: true, color: TEXT_WHITE })
  s2.addText(st.who, { x: x3 + 0.25, y: y + 1.55, w: w3 - 0.5, h: 0.32, fontSize: 10, fontFace: 'Calibri', bold: true, color: st.color, charSpacing: 2 })
  s2.addText(st.desc, { x: x3 + 0.25, y: y + 1.85, w: w3 - 0.5, h: 0.55, fontSize: 11, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top' })
})
footer(s2, 'Every step is recorded. At any moment the status of every material is known.')

// ═══ SLIDE 3 — MTO IMPORT (infographic) ═══
const s3 = pres.addSlide()
s3.background = { color: BG_DARK }
header(s3, '02', 'MTO Import',
  'The project\'s Excel becomes a structured, queryable list in seconds.')

drawDarkCard(s3, 0.45, 1.85, 12.4, 0.85, { bg: '2A2F22', borderColor: GOLD_LIGHT, borderWidth: 1, radius: 0.14 })
s3.addText('📊', { x: 0.7, y: 1.95, w: 0.7, h: 0.7, fontSize: 32, valign: 'middle' })
s3.addText('The Excel is imported and organized by vendor', {
  x: 1.5, y: 1.95, w: 11.2, h: 0.4, fontSize: 17, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, valign: 'middle',
})
s3.addText('Each batch keeps its own identity: a new version doesn\'t overwrite previous data.', {
  x: 1.5, y: 2.32, w: 11.2, h: 0.35, fontSize: 11, fontFace: 'Calibri', italic: true, color: TEXT_MUTED, valign: 'top',
})

const flow = [
  { icon: '📁', title: 'Project MTO file',  desc: 'The Excel delivered by Project Management with the material list.', color: C_IMPORT },
  { icon: '⬆️', title: 'System upload',     desc: 'A single click uploads the file. No prep or reformatting required.', color: C_QUOTE },
  { icon: '🗂️', title: 'Auto-organization', desc: 'Materials are grouped by vendor. Each batch gets its own date and unique ID.', color: C_PRICE },
  { icon: '✨', title: 'Queryable list',    desc: 'Available to the whole team. Shows what to quote, what\'s priced, what arrived.', color: C_DONE },
]
const flowY = 3.05
const flowH = 3.6
const flowCardW = 2.85
const flowGap = 0.27
flow.forEach((f, i) => {
  const x = 0.45 + i * (flowCardW + flowGap)
  drawDarkCard(s3, x, flowY, flowCardW, flowH, { accent: f.color, radius: 0.18 })
  s3.addShape('ellipse', { x: x + (flowCardW - 1.5) / 2, y: flowY + 0.4, w: 1.5, h: 1.5, fill: { color: f.color, transparency: 85 }, line: { color: f.color, transparency: 50, width: 2 } })
  s3.addText(f.icon, { x: x + (flowCardW - 1.5) / 2, y: flowY + 0.4, w: 1.5, h: 1.5, fontSize: 60, valign: 'middle', align: 'center' })
  s3.addText(`STEP ${i + 1}`, { x, y: flowY + 2.05, w: flowCardW, h: 0.3, fontSize: 10, fontFace: 'Calibri', bold: true, color: f.color, align: 'center', charSpacing: 4 })
  s3.addText(f.title, { x: x + 0.2, y: flowY + 2.4, w: flowCardW - 0.4, h: 0.45, fontSize: 15, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, align: 'center' })
  s3.addText(f.desc, { x: x + 0.2, y: flowY + 2.9, w: flowCardW - 0.4, h: 0.65, fontSize: 10.5, fontFace: 'Calibri', color: TEXT_MUTED, align: 'center', valign: 'top', lineSpacingMultiple: 1.25 })
  if (i < flow.length - 1) {
    s3.addText('→', { x: x + flowCardW + 0.02, y: flowY + flowH / 2 - 0.3, w: 0.25, h: 0.5, fontSize: 32, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT, align: 'center', valign: 'middle' })
  }
})
footer(s3, 'What used to take hours by hand now resolves in seconds. The project\'s list is the single source of truth.')

// ═══ SLIDE 4 — QUOTING ═══
const s4 = pres.addSlide()
s4.background = { color: BG_DARK }
header(s4, '03', 'Quoting with vendors',
  'One professional PDF per vendor. The email is sent and the request is recorded.')
const stepsCotiz = [
  { icon: '📦', color: C_QUOTE, title: 'Grouping by vendor', body: 'The system splits materials by vendor. If a single vendor supplies 12 items, they all land in one quote request.' },
  { icon: '📄', color: C_QUOTE, title: 'Auto-generated professional PDF', body: 'One click generates a PDF with the company brand, descriptions, quantities and project code. Ready to send.' },
  { icon: '✉️', color: C_QUOTE, title: 'Email delivery', body: 'The email goes out from the standard client (Outlook, Gmail). The system records what was requested from each vendor.' },
]
stepsCotiz.forEach((s, i) => {
  const w = 4.1
  const gap = 0.15
  const x = 0.45 + i * (w + gap)
  drawDarkCard(s4, x, 1.85, w, 4.8, { accent: s.color, radius: 0.18 })
  s4.addText(`STEP ${i + 1}`, { x: x + 0.3, y: 2.05, w: w - 0.6, h: 0.4, fontSize: 11, fontFace: 'Calibri', bold: true, color: s.color, charSpacing: 4 })
  s4.addText(s.icon, { x: x + 0.3, y: 2.55, w: w - 0.6, h: 1.5, fontSize: 80, valign: 'middle', align: 'center' })
  s4.addText(s.title, { x: x + 0.3, y: 4.15, w: w - 0.6, h: 0.6, fontSize: 17, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, align: 'center' })
  s4.addText(s.body, { x: x + 0.3, y: 4.8, w: w - 0.6, h: 1.7, fontSize: 11.5, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top', align: 'center', lineSpacingMultiple: 1.3 })
})
footer(s4, 'Every quote request is logged with its folio and the date it was sent.')

// ═══ SLIDE 5 — PRICES & PO ═══
const s5 = pres.addSlide()
s5.background = { color: BG_DARK }
header(s5, '04', 'Prices and Purchase Order',
  'When the vendor\'s response comes back, the Purchase Order is built in seconds.')
drawDarkCard(s5, 0.45, 1.75, 6.2, 5.0, { accent: C_PRICE, radius: 0.18 })
s5.addText('STEP 3', { x: 0.7, y: 2.0, w: 5.7, h: 0.4, fontSize: 12, fontFace: 'Calibri', bold: true, color: C_PRICE, charSpacing: 4 })
s5.addText('💰', { x: 0.7, y: 2.45, w: 0.7, h: 0.7, fontSize: 38, valign: 'middle' })
s5.addText('Vendor price capture', { x: 1.5, y: 2.5, w: 5.0, h: 0.5, fontSize: 18, fontFace: 'Calibri', bold: true, color: TEXT_WHITE })

const capturarItems = [
  { t: 'The vendor\'s response arrives', d: 'Email with prices. No manual Excel update needed.' },
  { t: 'Prices are entered one by one',  d: 'Only the unit price. The system computes line totals.' },
  { t: 'Freight cost is added',           d: 'If the vendor charges shipping, it\'s added to the order total.' },
  { t: 'Subtotal and total in real time', d: 'As data is entered, the running total is visible.' },
]
capturarItems.forEach((it, i) => {
  const yi = 3.4 + i * 0.85
  s5.addShape('ellipse', { x: 0.85, y: yi + 0.05, w: 0.25, h: 0.25, fill: { color: C_PRICE }, line: { color: C_PRICE, width: 0 } })
  s5.addText(String(i + 1), { x: 0.85, y: yi + 0.05, w: 0.25, h: 0.25, fontSize: 10, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, align: 'center', valign: 'middle' })
  s5.addText(it.t, { x: 1.2, y: yi, w: 5.2, h: 0.35, fontSize: 12, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, valign: 'top' })
  s5.addText(it.d, { x: 1.2, y: yi + 0.35, w: 5.2, h: 0.45, fontSize: 10.5, fontFace: 'Calibri', color: TEXT_LIGHT, valign: 'top' })
})

drawDarkCard(s5, 6.85, 1.75, 6.05, 5.0, { accent: C_ORDER, radius: 0.18 })
s5.addText('STEP 4', { x: 7.1, y: 2.0, w: 5.7, h: 0.4, fontSize: 12, fontFace: 'Calibri', bold: true, color: C_ORDER, charSpacing: 4 })
s5.addText('📄', { x: 7.1, y: 2.45, w: 0.7, h: 0.7, fontSize: 38, valign: 'middle' })
s5.addText('Purchase Order generation', { x: 7.9, y: 2.5, w: 4.8, h: 0.5, fontSize: 18, fontFace: 'Calibri', bold: true, color: TEXT_WHITE })
s5.addShape('roundRect', { x: 7.1, y: 3.4, w: 5.55, h: 1.2, fill: { color: C_ORDER, transparency: 80 }, line: { color: C_ORDER, transparency: 50, width: 1 }, rectRadius: 0.1 })
s5.addText('1 CLICK', { x: 7.3, y: 3.5, w: 5.2, h: 0.5, fontSize: 32, fontFace: 'Calibri', bold: true, color: C_ORDER, align: 'center', valign: 'middle' })
s5.addText('and the Purchase Order is ready', { x: 7.3, y: 4.05, w: 5.2, h: 0.4, fontSize: 11, fontFace: 'Calibri', italic: true, color: 'D1FAE5', align: 'center' })

const ocItems = [
  '✓  Official, unique, sequential PO number',
  '✓  Printable PDF with all vendor information',
  '✓  Linked to project, vendor and materials',
  '✓  Initial status: "Draft" until marked as sent',
]
ocItems.forEach((it, i) => { s5.addText(it, { x: 7.1, y: 4.85 + i * 0.42, w: 5.55, h: 0.4, fontSize: 11, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top' }) })
footer(s5, 'In 5 minutes the team moves from "we have the vendor\'s price" to "PO signed and sent".')

// ═══ SLIDE 6 — MOBILE RECEIVING ═══
const s6 = pres.addSlide()
s6.background = { color: BG_DARK }
header(s6, '05', 'Receiving from a phone',
  'When materials arrive at the shop, the mobile app closes the loop. No paper, no rewriting.')
drawDarkCard(s6, 0.45, 1.75, 4.5, 5.0, { accent: C_MOBILE, radius: 0.18 })
s6.addShape('roundRect', { x: 1.45, y: 2.15, w: 2.5, h: 4.3, fill: { color: '0F1410' }, line: { color: C_MOBILE, width: 2 }, rectRadius: 0.25 })
s6.addShape('roundRect', { x: 2.35, y: 2.2, w: 0.7, h: 0.1, fill: { color: '4A5240' }, line: { color: '4A5240', width: 0 }, rectRadius: 0.05 })
s6.addText('PO-2026-0145', { x: 1.55, y: 2.45, w: 2.3, h: 0.3, fontSize: 11, fontFace: 'Calibri', bold: true, color: C_MOBILE, align: 'center' })
s6.addText('RUGBY', { x: 1.55, y: 2.75, w: 2.3, h: 0.3, fontSize: 14, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, align: 'center' })
const mockItems = [
  { label: 'Plywood 3/4"', qty: '✓ 28 / 28' },
  { label: 'MDF 1/2"',     qty: '✓ 4 / 4' },
  { label: 'Melamine B',   qty: '⚠ 50 / 57' },
  { label: 'Backer 1/4"',  qty: '✓ 14 / 14' },
]
mockItems.forEach((m, i) => {
  const yi = 3.25 + i * 0.5
  s6.addText(m.label, { x: 1.65, y: yi, w: 1.4, h: 0.3, fontSize: 9, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'middle' })
  s6.addText(m.qty, { x: 3.0, y: yi, w: 0.85, h: 0.3, fontSize: 9, fontFace: 'Calibri', bold: true, color: m.qty.startsWith('⚠') ? 'FBBF24' : C_DONE, align: 'right', valign: 'middle' })
})
s6.addShape('roundRect', { x: 1.65, y: 5.6, w: 2.1, h: 0.5, fill: { color: C_MOBILE, transparency: 70 }, line: { color: C_MOBILE, width: 0 }, rectRadius: 0.08 })
s6.addText('📷  TAKE PHOTO', { x: 1.65, y: 5.6, w: 2.1, h: 0.5, fontSize: 11, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, align: 'center', valign: 'middle' })

drawDarkCard(s6, 5.15, 1.75, 7.7, 5.0, { accent: C_MOBILE, radius: 0.18 })
s6.addText('THE APP HANDLES ALL OF THIS', { x: 5.45, y: 2.0, w: 7.1, h: 0.4, fontSize: 12, fontFace: 'Calibri', bold: true, color: C_MOBILE, charSpacing: 4 })

const mobileFns = [
  { icon: '📋', t: 'Shows what was ordered',                  d: 'The PO list is on screen — no printouts required.' },
  { icon: '✓',  t: 'Records what arrived',                    d: 'Item by item. If something is missing or extra, it\'s logged on the spot.' },
  { icon: '📷', t: 'Captures the delivery ticket and material', d: 'Visual evidence is attached to the receipt for any future dispute.' },
  { icon: '⚡', t: 'Generates the receipt folio automatically', d: 'Sequential numbering, no fighting with paper or manual counters.' },
  { icon: '🔔', t: 'Alerts Procurement if there\'s a discrepancy', d: 'If the shipment arrived partial or with issues, the system notifies right away.' },
]
mobileFns.forEach((f, i) => {
  const yi = 2.55 + i * 0.78
  s6.addText(f.icon, { x: 5.45, y: yi, w: 0.55, h: 0.55, fontSize: 22, valign: 'middle' })
  s6.addText(f.t, { x: 6.05, y: yi, w: 6.7, h: 0.35, fontSize: 13, fontFace: 'Calibri', bold: true, color: TEXT_WHITE, valign: 'top' })
  s6.addText(f.d, { x: 6.05, y: yi + 0.35, w: 6.7, h: 0.4, fontSize: 10.5, fontFace: 'Calibri', color: TEXT_MUTED, valign: 'top' })
})
footer(s6, 'Receiving happens the moment the truck arrives — no walking back to the office, no double-entry.')

// ═══ SLIDE 7 — ROLES ═══
const s7 = pres.addSlide()
s7.background = { color: BG_DARK }
header(s7, '06', 'Who does what',
  'Four roles with clear responsibilities. Each uses what they need and nothing more.')
const ROLES = [
  { icon: '🛒', name: 'PROCUREMENT', color: R_PROC, tagline: 'The engine of the process', actividades: [
    'Imports the project\'s material list', 'Quotes with vendors and captures prices',
    'Generates the Purchase Orders', 'Resolves receiving discrepancies',
  ], herramienta: 'Computer · Full system' },
  { icon: '📱', name: 'RECEIVING CLERK', color: R_RECEP, tagline: 'Closes the loop at the shop', actividades: [
    'Receives materials when the truck arrives', 'Records what arrived and what didn\'t',
    'Takes photos of ticket and material', 'Reports discrepancies on the spot',
  ], herramienta: 'Phone · Mobile app' },
  { icon: '📐', name: 'PROJECT MANAGEMENT', color: R_PM, tagline: 'Defines what the project needs', actividades: [
    'Establishes what materials each project requires', 'Hands the MTO Excel to Procurement',
    'Consults the project\'s purchasing status', 'Coordinates timelines with Procurement',
  ], herramienta: 'Computer · Project view' },
  { icon: '👁️', name: 'LEADERSHIP', color: R_ADMIN, tagline: 'Sees everything, decides what matters', actividades: [
    'Dashboard with spend by project and vendor', 'Detects where risk or overspend appears',
    'Authorizes urgent or over-budget purchases', 'Accesses the full history of any project',
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
footer(s7, 'Each role uses the right tool for its task, without burdening the shop with office concerns.')

// ═══ SLIDE 8 — SPECIAL CASES ═══
const s8 = pres.addSlide()
s8.background = { color: BG_DARK }
header(s8, '07', 'Special cases',
  'Not every purchase comes from the project\'s MTO. The system covers the other paths too.')
const CASOS = [
  { icon: '📦', color: C_ORDER, name: 'From the project MTO', badge: 'MAIN PATH',
    desc: 'The vast majority: comes from the Excel that Project Management delivers.',
    bullets: ['Full cycle: quote → capture → PO → receiving', 'Linked to the project', 'Appears in the project\'s spend dashboard'] },
  { icon: '⚡', color: 'F87171', name: 'URGENT', badge: 'CRITICAL',
    desc: 'Material needed immediately and not previously planned. Skips the formal quoting flow.',
    bullets: ['Direct PO without formal quoting', 'Marked URGENT for executive visibility', 'Linked to a project when applicable'] },
  { icon: '🎯', color: 'FBBF24', name: 'DIRECT', badge: 'ONE-OFF',
    desc: 'Purchases that don\'t need a formal quoting flow but still need to be recorded.',
    bullets: ['PO created directly in the system', 'Useful for small or pre-negotiated purchases', 'Maintains full traceability'] },
  { icon: '🔧', color: '60A5FA', name: 'OPERATIONAL', badge: 'DAY-TO-DAY',
    desc: 'Shop supplies that aren\'t part of any project: cleaning, office, maintenance.',
    bullets: ['Not associated with a specific project', 'Separate bucket for operational spend', 'Logged in the company-wide history'] },
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
footer(s8, 'Four paths, one logic: every purchase is recorded with its context and its owner.')

// ═══ SLIDE 9 — IMPACT ═══
const s9 = pres.addSlide()
s9.background = { color: BG_FOREST }
s9.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.15, fill: { color: GOLD_LIGHT }, line: { color: GOLD_LIGHT, width: 0 } })
s9.addText('WHAT WE GAIN', { x: 1.0, y: 0.5, w: 11, h: 0.4, fontSize: 13, fontFace: 'Calibri', color: GOLD_LIGHT, bold: true, charSpacing: 6 })
s9.addText('Transparent purchasing', { x: 1.0, y: 1.05, w: 11, h: 0.85, fontSize: 40, fontFace: 'Calibri', bold: true, color: TEXT_WHITE })
s9.addText('and data-driven decisions', { x: 1.0, y: 1.85, w: 11, h: 0.85, fontSize: 40, fontFace: 'Calibri', bold: true, color: GOLD_LIGHT })

const beneficios = [
  { icon: '🔍', title: 'Full traceability', desc: 'For any material: who ordered it, when it was quoted, which PO it generated, when it arrived, who received it, and any discrepancies.' },
  { icon: '📊', title: 'Executive visibility', desc: 'Dashboard with spend by project, vendor and month. Purchasing is no longer a black box for Leadership.' },
  { icon: '📱', title: 'Mobility on the shop floor', desc: 'Receiving is recorded the moment materials arrive — with a photo, from a phone. No paper, no double-entry.' },
  { icon: '⏱️', title: 'Time recovered', desc: 'What used to take hours (import, quote, compare, build POs) now takes minutes. The team focuses on what matters.' },
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

const outPath = String.raw`C:\Users\chali\OneDrive - Central Millwork\centralmillwork-app\purchasing_module_en_2026_06_12.pptx`
pres.writeFile({ fileName: outPath }).then((name) => console.log('OK saved to:', name))
