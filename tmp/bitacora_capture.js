// Motor de captura de la Bitácora del Piloto.
// Chrome headless + DevTools Protocol (ws). Inyecta el JWT en localStorage para
// capturar pantallas YA LOGUEADAS a disco. Reutilizable: editá SHOTS y corré.
//
//   node tmp/bitacora_capture.js
//
// Requiere: backend en :4000, frontend en :3000, Chrome instalado. Usa `ws` del
// node_modules del repo. Guarda PNGs en docs/bitacora-piloto/.

const http = require('http')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const WebSocket = require('ws')

const FRONT = 'http://localhost:3000'
const API = 'http://localhost:4000/api'
const OUT = path.join(__dirname, '..', 'docs', 'bitacora-piloto')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const CREDS = { email: 'chali@centralmillwork.com', password: 'demo1234' }

// Estaciones del recorrido del piloto, EN ORDEN. Se capturan a medida que
// probamos, con datos reales. `capture:true` marca las que se toman en esta
// corrida (las demás quedan como pendientes en la bitácora). `url` puede faltar
// en pasos que se capturan a mano.
const SHOTS = [
  { name: '00-crear-proyecto', capture: false, needsAuth: true,
    caption: '1 · Crear el proyecto — el estimador crea el proyecto en el menú Proyectos. Paso previo obligatorio.' },
  { name: '01-estimados', capture: false, needsAuth: true, url: `${FRONT}/estimados`,
    caption: '2 · Estimados — arrancar el proyecto en el schedule: fecha de entrega + contrato firmado (día cero).' },
  { name: '02-schedule-nace', capture: false, needsAuth: true,
    caption: '3 · El schedule nace — el journey map con la entrega objetivo y el primer hito cumplido.' },
  { name: '03-ingenieria', capture: false, needsAuth: true,
    caption: '4 · Ingeniería — submittals de planos, CNC, release a producción (por construir).' },
  { name: '04-compras-oc', capture: false, needsAuth: true,
    caption: '5 · Compras — emisión de OC; el schedule prende el hito de materiales solo.' },
  { name: '05-recepcion', capture: false, needsAuth: true,
    caption: '6 · Recepción — material recibido; avanza el schedule automáticamente.' },
  { name: '06-produccion', capture: false, needsAuth: true,
    caption: '7 · Producción — la OP avanza por las estaciones del taller.' },
  { name: '07-qc', capture: false, needsAuth: true,
    caption: '8 · QC — inspección de calidad.' },
  { name: '08-despacho', capture: false, needsAuth: true,
    caption: '9 · Despacho — BOL y número de precinto.' },
  { name: '09-instalacion', capture: false, needsAuth: true,
    caption: '10 · Instalación — desde el móvil: check-in, avance por item, punch list.' },
  { name: '10-entrega', capture: false, needsAuth: true,
    caption: '11 · Entrega — sign-off del cliente; proyecto ENTREGADO.' },
  { name: '11-portal-cliente', capture: false, needsAuth: false,
    caption: '12 · Portal del cliente — su recorrido en vivo, aprobaciones incluidas.' },
]

const post = (url, body) => new Promise((res, rej) => {
  const data = JSON.stringify(body)
  const u = new URL(url)
  const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (r) => {
    let b = ''; r.on('data', (c) => b += c); r.on('end', () => res(JSON.parse(b || '{}')))
  })
  req.on('error', rej); req.write(data); req.end()
})

const getJSON = (url) => new Promise((res, rej) => {
  http.get(url, (r) => { let b = ''; r.on('data', (c) => b += c); r.on('end', () => res(JSON.parse(b))) }).on('error', rej)
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let msgId = 0
function cdp(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId
    const onMsg = (raw) => {
      const m = JSON.parse(raw)
      if (m.id === id) { ws.off('message', onMsg); m.error ? reject(new Error(m.error.message)) : resolve(m.result) }
    }
    ws.on('message', onMsg)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const aCapturar = SHOTS.filter((s) => s.capture && s.url)
  if (aCapturar.length === 0) {
    // Nada para capturar: solo (re)armar la bitácora con lo que ya hay.
    buildHtml()
    console.log('Bitácora armada (sin capturas nuevas):', path.join(OUT, 'BITACORA_PILOTO.html'))
    return
  }

  const { token } = await post(`${API}/auth/login`, CREDS)
  if (!token) throw new Error('login falló — ¿backend en :4000 y password demo1234?')
  console.log('JWT obtenido.')

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=9222', '--window-size=1440,900',
    `--user-data-dir=${path.join(require('os').tmpdir(), 'cm-bitacora-profile')}`,
    'about:blank',
  ], { stdio: 'ignore' })
  try {
    await sleep(2500)
    const targets = await getJSON('http://localhost:9222/json')
    const page = targets.find((t) => t.type === 'page')
    const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 })
    await new Promise((r) => ws.on('open', r))
    await cdp(ws, 'Page.enable'); await cdp(ws, 'Runtime.enable')
    await cdp(ws, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

    for (const s of aCapturar) {
      if (s.needsAuth) {
        // Cargar el origen y sembrar el token en localStorage, luego navegar.
        await cdp(ws, 'Page.navigate', { url: `${FRONT}/login` }); await sleep(1200)
        await cdp(ws, 'Runtime.evaluate', { expression: `localStorage.setItem('cm_token', ${JSON.stringify(token)})` })
      }
      await cdp(ws, 'Page.navigate', { url: s.url })
      await sleep(3500) // carga SPA + fetch de datos
      const { data } = await cdp(ws, 'Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(path.join(OUT, `${s.name}.png`), Buffer.from(data, 'base64'))
      console.log('capturado:', s.name)
    }
    ws.close()
  } finally {
    chrome.kill()
  }

  // Armar la página de la bitácora (imágenes embebidas → auto-contenida).
  buildHtml()
  console.log('Listo. PNGs + BITACORA_PILOTO.html en', OUT)
}

function buildHtml() {
  const capturadas = SHOTS.filter((s) => fs.existsSync(path.join(OUT, `${s.name}.png`))).length
  const entradas = SHOTS.map((s) => {
    const p = path.join(OUT, `${s.name}.png`)
    if (fs.existsSync(p)) {
      const b64 = fs.readFileSync(p).toString('base64')
      return `<figure class="entry">
        <figcaption>${s.caption}</figcaption>
        <img src="data:image/png;base64,${b64}" alt="${s.name}" />
      </figure>`
    }
    return `<div class="pending"><span class="dot"></span>${s.caption}</div>`
  }).join('\n')

  const intro = capturadas === 0
    ? '<p class="sub">Todavía no arrancamos las pruebas. Estas son las estaciones que vamos a capturar, en orden, con datos reales — cada una se convierte en una foto cuando la probemos.</p>'
    : '<p class="sub">Life of a Deal — el recorrido de un proyecto real, paso a paso, en imágenes. Las capturadas se muestran; las que faltan quedan como pasos pendientes.</p>'

  const html = `<div class="wrap">
  <header>
    <div class="brand">CENTRAL MILLWORK</div>
    <h1>Bitácora del Piloto</h1>
    ${intro}
  </header>
  ${entradas}
  <footer>Documento vivo — se genera desde el sistema en funcionamiento a medida que avanza el piloto.</footer>
</div>
<style>
  :root { --forest:#2c3126; --gold:#C18A2D; --cream:#F4F5F2; --ink:#1F2419; --stone:#5A5F52; --line:#e5e3dc; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--cream); color:var(--ink); font-family:'Segoe UI',system-ui,Arial,sans-serif; }
  .wrap { max-width: 1000px; margin: 0 auto; padding: 40px 20px 60px; }
  header { text-align:center; margin-bottom: 36px; }
  .brand { color:var(--gold); font-size:13px; font-weight:800; letter-spacing:3px; }
  h1 { font-size: 34px; margin:6px 0 8px; color:var(--forest); }
  .sub { color:var(--stone); font-size:15px; max-width:640px; margin: 0 auto; line-height:1.5; }
  .entry { margin: 0 0 30px; background:#fff; border:1px solid var(--line); border-radius:16px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,.05), 0 12px 30px rgba(0,0,0,.04); }
  figcaption { padding:16px 20px; font-size:15px; font-weight:600; color:var(--forest); border-bottom:1px solid var(--line); background:#faf8f2; }
  .entry img { display:block; width:100%; height:auto; }
  .pending { display:flex; align-items:center; gap:12px; padding:14px 18px; margin:0 0 10px; background:#fff; border:1px dashed var(--line); border-radius:12px; color:var(--stone); font-size:14px; }
  .pending .dot { width:9px; height:9px; border-radius:50%; background:var(--line); flex-shrink:0; }
  footer { text-align:center; color:var(--stone); font-size:13px; font-style:italic; margin-top:30px; }
  @media (prefers-color-scheme: dark) {
    body { background:#1b1e17; color:#e8e6df; }
    .entry { background:#23271e; border-color:#3a3f31; }
    figcaption { background:#2c3126; color:#E8C684; border-color:#3a3f31; }
    h1 { color:#fff; } .sub, footer { color:#b8bdaa; }
  }
</style>`
  fs.writeFileSync(path.join(OUT, 'BITACORA_PILOTO.html'), html)
}
main().catch((e) => { console.error(e); process.exit(1) })
