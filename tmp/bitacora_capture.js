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

// Pantallas a capturar: { name, url, caption, needsAuth, click? }
const SHOTS = [
  { name: '01-estimacion', url: `${FRONT}/estimacion`, needsAuth: true,
    caption: '1 · Estimación — la puerta de entrada: se elige el proyecto para arrancarlo en el schedule.' },
  { name: '02-portal-cliente', url: `${FRONT}/portal/9075fecc21cd5b2e59daa075c01901329b8246cbc39df46d`, needsAuth: false,
    caption: '2 · Portal del cliente — el cliente ve su recorrido y aprueba (sin usuario ni contraseña).' },
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

    for (const s of SHOTS) {
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
  const entradas = SHOTS.map((s) => {
    const p = path.join(OUT, `${s.name}.png`)
    if (!fs.existsSync(p)) return ''
    const b64 = fs.readFileSync(p).toString('base64')
    return `<figure class="entry">
      <figcaption>${s.caption}</figcaption>
      <img src="data:image/png;base64,${b64}" alt="${s.name}" />
    </figure>`
  }).join('\n')

  const html = `<div class="wrap">
  <header>
    <div class="brand">CENTRAL MILLWORK</div>
    <h1>Bitácora del Piloto</h1>
    <p class="sub">Life of a Deal — el recorrido de un proyecto real, paso a paso, en imágenes. Se va sumando a medida que avanzamos.</p>
  </header>
  ${entradas}
  <footer>Documento vivo — generado automáticamente desde el sistema en funcionamiento.</footer>
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
