// Weekly report — Central Millwork (English version)
// 1-page slide, 16:9 widescreen, natural language for internal team
const pptxgen = require('pptxgenjs')

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE'
pres.author = 'Central Millwork'
pres.title = 'Weekly Report 2026-06-08'

// ─── Brand palette ───────────────────────────────────────────────────────────
const FOREST_DARK = '2C3126'
const FOREST_MID  = '4A5240'
const GOLD        = '9B7200'
const GOLD_LIGHT  = 'DEA832'
const BG          = 'F8F6F0'
const CARD_BG     = 'FFFFFF'
const CARD_BORDER = 'D8D1C0'
const TEXT_DARK   = '1F1B14'
const TEXT_MUTED  = '6B6356'
const CHECK_GREEN = '10B981'

const slide = pres.addSlide()
slide.background = { color: BG }

// ─── HEADER ──────────────────────────────────────────────────────────────────
slide.addText('Central Millwork · Weekly Report', {
  x: 0.4, y: 0.25, w: 12.5, h: 0.35,
  fontSize: 14, fontFace: 'Calibri', color: GOLD,
  bold: true, charSpacing: 2,
})
slide.addText('System improvements — June 1 to June 8, 2026', {
  x: 0.4, y: 0.6, w: 12.5, h: 0.55,
  fontSize: 28, fontFace: 'Calibri', bold: true,
  color: FOREST_DARK,
})
slide.addText('Progress summary on architecture, security, observability, and new features', {
  x: 0.4, y: 1.05, w: 12.5, h: 0.3,
  fontSize: 12, fontFace: 'Calibri', italic: true, color: TEXT_MUTED,
})

// ─── Helper to draw a quadrant ───────────────────────────────────────────────
function quadrant({ x, y, w, h, icon, title, tagline, bullets, accent }) {
  // Card background
  slide.addShape('roundRect', {
    x, y, w, h,
    fill: { color: CARD_BG },
    line: { color: CARD_BORDER, width: 1 },
    rectRadius: 0.12,
  })

  // Accent top border
  slide.addShape('rect', {
    x, y, w, h: 0.08,
    fill: { color: accent },
    line: { color: accent, width: 0 },
  })

  // Icon + title
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

// ─── QUADRANT 1: Stability & Security ────────────────────────────────────────
quadrant({
  x: 0.4, y: 1.5, w: 6.3, h: 2.7,
  icon: '🛡️',
  title: 'STABILITY & SECURITY',
  tagline: 'The system is now resilient to failures',
  accent: '2C3126',
  bullets: [
    'External audit with 9 virtual specialists — zero critical vulnerabilities',
    'Doubled simultaneous operations capacity without breaking',
    'PO, receiving, and quote numbers are now collision-proof',
    'Daily automatic backups enabled (Supabase Pro plan)',
    'Database fully reproducible from code (fresh setup possible)',
    '14 performance improvements — multi-second queries are now milliseconds',
  ],
})

// ─── QUADRANT 2: Observability & Quality ─────────────────────────────────────
quadrant({
  x: 6.85, y: 1.5, w: 6.05, h: 2.7,
  icon: '🚀',
  title: 'OBSERVABILITY & QUALITY',
  tagline: 'If something breaks, we will know',
  accent: GOLD,
  bullets: [
    'Sentry integrated — production bugs reported automatically',
    'White-screen-of-death eliminated — friendly fallback with action buttons',
    'Smarter notifications — no more stale events in the bell',
    'First automated test suite live (68 tests, all green)',
    'Email system wired up, ready to flip on (Procurement / Production)',
    '10 bugs caught and fixed by AI-assisted review',
  ],
})

// ─── QUADRANT 3: Samples Module ──────────────────────────────────────────────
quadrant({
  x: 0.4, y: 4.35, w: 6.3, h: 2.7,
  icon: '⚙️',
  title: 'SAMPLES MODULE',
  tagline: 'From sample request to approval — almost fully automated',
  accent: GOLD_LIGHT,
  bullets: [
    'Phase 1 + Phase 2 deployed (out of 7 phases in the full plan)',
    'Create sample → automatic task to Procurement (no WhatsApp pings)',
    'Procurement decides "no purchases" or creates linked PO in one click',
    'Once POs are received → automatic task for Shop Manager to start build',
    '3 samples have already completed the full cycle in real production',
    'Coming next: auto QC, pre-filled work orders, live email notifications',
  ],
})

// ─── QUADRANT 4: Key numbers ─────────────────────────────────────────────────
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
slide.addText('THE WEEK IN NUMBERS', {
  x: 7.7, y: 4.53, w: 4.5, h: 0.3,
  fontSize: 14, fontFace: 'Calibri', bold: true,
  color: FOREST_DARK, charSpacing: 1.5,
})
slide.addText('What we shipped in 7 days', {
  x: 7.7, y: 4.80, w: 4.5, h: 0.3,
  fontSize: 11, fontFace: 'Calibri', italic: true, color: TEXT_MUTED,
})

// 6 number tiles (2 cols × 3 rows)
const tiles = [
  { num: '20+',      label: 'Commits shipped to production' },
  { num: '5,000+',   label: 'Lines of code improved' },
  { num: '20',       label: 'Bugs fixed' },
  { num: '68',       label: 'New automated tests' },
  { num: '✓',        label: 'Daily backup active' },
  { num: '< 1s',     label: 'Average response time' },
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
slide.addText('Mature vibe-coding · Stripe-grade infrastructure at Central Millwork scale', {
  x: 0.4, y: 7.22, w: 12.55, h: 0.25,
  fontSize: 9, fontFace: 'Calibri', italic: true,
  color: TEXT_MUTED, align: 'center',
})

// Save
const outPath = String.raw`C:\Users\chali\OneDrive - Central Millwork\centralmillwork-app\weekly_report_2026_06_08_en.pptx`
pres.writeFile({ fileName: outPath }).then((name) => {
  console.log('OK saved to:', name)
})
