// Generador de manifest.zip para subir a Teams Admin Center.
// Incluye manifest.json + 2 iconos (192x192 color, 32x32 outline).
// Requiere: archiver para zip, sharp para resize de imágenes.
const fs = require('fs')
const path = require('path')
const JSZip = require('jszip')
const Jimp = require('jimp')

const BOT_APP_ID = 'cb9670f3-d72e-45ab-a1b7-5614936049da'
const LOGO_SOURCE = path.resolve(__dirname, '../frontend/public/logo_cm_sidebar.png')
const OUT_DIR = path.resolve(__dirname, 'teams-manifest-build')
const OUT_ZIP = String.raw`C:\Users\chali\OneDrive - Central Millwork\centralmillwork-app\central_millwork_bot_teams_manifest.zip`

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

// ─── manifest.json (Teams app schema 1.16) ───────────────────────────────
const manifest = {
  $schema: 'https://developer.microsoft.com/en-us/json-schemas/teams/v1.16/MicrosoftTeams.schema.json',
  manifestVersion: '1.16',
  version: '1.0.0',
  id: BOT_APP_ID,
  packageName: 'com.centralmillwork.bot',
  developer: {
    name: 'Central Millwork',
    websiteUrl: 'https://centralmillwork-frontend-production.up.railway.app',
    privacyUrl: 'https://centralmillwork-frontend-production.up.railway.app',
    termsOfUseUrl: 'https://centralmillwork-frontend-production.up.railway.app',
  },
  icons: { color: 'color.png', outline: 'outline.png' },
  name: { short: 'Central Bot', full: 'Central Millwork Bot' },
  description: {
    short: 'Consultas operativas de Central Millwork',
    full: 'Bot interno que responde consultas sobre proyectos, materiales, órdenes de compra y órdenes de producción. Tipeá "ayuda" para ver los comandos disponibles.',
  },
  accentColor: '#9B7200',
  bots: [{
    botId: BOT_APP_ID,
    scopes: ['personal', 'team', 'groupchat'],
    isNotificationOnly: false,
    supportsFiles: false,
    commandLists: [{
      scopes: ['personal', 'team', 'groupchat'],
      commands: [
        { title: 'ayuda',     description: 'Lista los comandos disponibles' },
        { title: 'proyectos', description: 'Proyectos activos' },
        { title: 'resumen',   description: 'KPIs de un proyecto. Ej: resumen PRY-2026-577' },
        { title: 'pendientes',description: 'Materiales pendientes. Ej: pendientes PRY-2026-577' },
        { title: 'recibidos', description: 'Materiales recibidos. Ej: recibidos PRY-2026-577' },
        { title: 'item',      description: 'Materiales del item N. Ej: item PRY-2026-577 5' },
        { title: 'op',        description: 'Estado de una OP. Ej: op OP-26-101' },
        { title: 'fotos',     description: 'Fotos de la estación anterior. Ej: fotos OP-26-101' },
      ],
    }],
  }],
  permissions: ['identity', 'messageTeamMembers'],
  validDomains: ['centralmillwork-backend-production.up.railway.app',
                 'centralmillwork-frontend-production.up.railway.app'],
}

fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log('manifest.json escrito')

// ─── Iconos ───────────────────────────────────────────────────────────────
async function buildIcons() {
  // color.png — 192x192, fondo forest oscuro detrás del logo
  const colorImg = await Jimp.read(LOGO_SOURCE)
  colorImg.contain(192, 192)
  const colorBg = new Jimp(192, 192, 0x1C1F18FF)
  colorBg.composite(colorImg, 0, 0)
  await colorBg.writeAsync(path.join(OUT_DIR, 'color.png'))

  // outline.png — 32x32, blanco puro sobre transparente.
  // Teams es estricto: pixel debe ser blanco (255,255,255) o transparente.
  const outImg = await Jimp.read(LOGO_SOURCE)
  outImg.contain(32, 32)
  outImg.scan(0, 0, outImg.bitmap.width, outImg.bitmap.height, function (_x, _y, idx) {
    const a = this.bitmap.data[idx + 3]
    if (a > 16) {
      this.bitmap.data[idx + 0] = 255
      this.bitmap.data[idx + 1] = 255
      this.bitmap.data[idx + 2] = 255
      this.bitmap.data[idx + 3] = 255
    } else {
      this.bitmap.data[idx + 3] = 0
    }
  })
  await outImg.writeAsync(path.join(OUT_DIR, 'outline.png'))

  console.log('Iconos generados')
}

async function buildZip() {
  const zip = new JSZip()
  zip.file('manifest.json', fs.readFileSync(path.join(OUT_DIR, 'manifest.json')))
  zip.file('color.png', fs.readFileSync(path.join(OUT_DIR, 'color.png')))
  zip.file('outline.png', fs.readFileSync(path.join(OUT_DIR, 'outline.png')))
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
  fs.writeFileSync(OUT_ZIP, buf)
  console.log('ZIP listo:', OUT_ZIP, '(' + (buf.length/1024).toFixed(1) + ' KB)')
}

(async () => {
  await buildIcons()
  await buildZip()
})().catch(e => { console.error(e); process.exit(1) })
