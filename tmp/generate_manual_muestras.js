// Manual de pruebas — Módulo de Muestras
// Mismo template que manual_produccion: margin bottom 90, footer dentro
// del espacio útil (H-100) para evitar páginas auto-generadas.
const PDFDocument = require('pdfkit')
const fs = require('fs')

const outPath = String.raw`C:\Users\chali\OneDrive - Central Millwork\centralmillwork-app\manual_muestras_take_off_2026_06_15.pdf`

const doc = new PDFDocument({
  size: 'LETTER',
  margins: { top: 50, bottom: 90, left: 50, right: 50 },
  autoFirstPage: true,
})
doc.pipe(fs.createWriteStream(outPath))

const W = doc.page.width
const H = doc.page.height
const ML = 50, MR = 50, MT = 50, MB = 90
const CW = W - ML - MR

const GOLD = '#9B7200'
const GOLD_LIGHT = '#DEA832'
const FOREST = '#2C3126'
const BG_PALE = '#F8F6F0'
const TEXT_DARK = '#1F1B14'
const TEXT_MUTED = '#6B6356'
const TEXT_LIGHT = '#9B9486'
const BLUE = '#2563EB'
const BLUE_PALE = '#DBEAFE'
const AMBER = '#D97706'
const AMBER_PALE = '#FEF3C7'
const GREEN = '#059669'
const GREEN_PALE = '#D1FAE5'
const RED = '#DC2626'
const RED_PALE = '#FEE2E2'
const PURPLE = '#7C3AED'
const PURPLE_PALE = '#EDE9FE'
const BORDER = '#E7E2D5'
const BORDER_DARK = '#D8D1C0'

const URL_APP = 'https://centralmillwork-frontend-production.up.railway.app'
const URL_LOGIN = `${URL_APP}/login`

let pageNum = 0

function drawPageChrome(title) {
  pageNum += 1
  doc.save()
  doc.rect(0, 0, W, 6).fill(GOLD_LIGHT)
  doc.restore()
  doc.save()
  doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold')
     .text('CENTRAL MILLWORK', ML, 18, { characterSpacing: 3, lineBreak: false })
  doc.fillColor(TEXT_MUTED).fontSize(8).font('Helvetica')
     .text(title, ML, 18, { width: CW, align: 'right', lineBreak: false })
  doc.restore()
  doc.save()
  doc.moveTo(ML, H - 110).lineTo(W - MR, H - 110).strokeColor(BORDER).lineWidth(0.5).stroke()
  doc.fillColor(TEXT_LIGHT).fontSize(8).font('Helvetica')
     .text(`Página ${pageNum} · Manual de pruebas · Módulo de Muestras · Junio 2026`,
           ML, H - 100, { width: CW, align: 'center', lineBreak: false })
  doc.restore()
  doc.x = ML
  doc.y = MT
}

function sectionTitle(num, title, subtitle) {
  doc.save()
  doc.fillColor(GOLD_LIGHT).fontSize(36).font('Helvetica-Bold').text(num, ML, MT + 10)
  doc.fillColor(FOREST).fontSize(22).font('Helvetica-Bold').text(title, ML + 50, MT + 22)
  if (subtitle) {
    doc.fillColor(TEXT_MUTED).fontSize(11).font('Helvetica-Oblique')
       .text(subtitle, ML + 50, MT + 50, { width: CW - 50 })
  }
  doc.moveTo(ML + 50, MT + 80).lineTo(ML + 90, MT + 80).strokeColor(GOLD_LIGHT).lineWidth(1.5).stroke()
  doc.restore()
  return MT + 100
}

function box(y, height, opts = {}) {
  const { fill = '#FFFFFF', border = BORDER, accent = null } = opts
  doc.save()
  doc.rect(ML, y, CW, height).fillAndStroke(fill, border)
  if (accent) {
    doc.rect(ML, y, CW, 4).fill(accent)
  }
  doc.restore()
}

function h3(text, y, color = FOREST) {
  doc.save()
  doc.fillColor(color).fontSize(13).font('Helvetica-Bold').text(text, ML, y)
  doc.restore()
  return y + 20
}

function p(text, y, opts = {}) {
  const { color = TEXT_DARK, size = 10, font = 'Helvetica', width = CW, indent = 0, lineGap = 2 } = opts
  doc.save()
  doc.fillColor(color).fontSize(size).font(font)
  doc.text(text, ML + indent, y, { width: width - indent, lineGap, align: opts.align || 'left' })
  const newY = doc.y
  doc.restore()
  return newY + 4
}

function bullet(label, text, y, opts = {}) {
  const { color = GREEN, size = 10 } = opts
  doc.save()
  doc.fillColor(color).fontSize(size).font('Helvetica-Bold').text('•', ML + 4, y)
  doc.fillColor(FOREST).fontSize(size).font('Helvetica-Bold').text(label, ML + 18, y, { continued: !!text })
  if (text) {
    doc.fillColor(TEXT_DARK).font('Helvetica').text(`  ${text}`, { width: CW - 18 })
  }
  const newY = doc.y
  doc.restore()
  return newY + 4
}

function step(num, label, body, y) {
  doc.save()
  doc.circle(ML + 12, y + 8, 11).fillAndStroke(GREEN, GREEN)
  doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold')
     .text(String(num), ML, y + 4, { width: 24, align: 'center' })
  doc.fillColor(FOREST).fontSize(11).font('Helvetica-Bold').text(label, ML + 34, y + 2, { width: CW - 34 })
  if (body) {
    doc.fillColor(TEXT_MUTED).fontSize(10).font('Helvetica')
       .text(body, ML + 34, y + 18, { width: CW - 34, lineGap: 1 })
  }
  doc.restore()
  return Math.max(y + 24, doc.y) + 8
}

function labelValue(label, value, y, opts = {}) {
  const { valueFont = 'Helvetica-Bold', valueColor = TEXT_DARK, valueSize = 12 } = opts
  doc.save()
  doc.fillColor(TEXT_MUTED).fontSize(8).font('Helvetica-Bold')
     .text(label.toUpperCase(), ML + 14, y, { characterSpacing: 2 })
  doc.fillColor(valueColor).fontSize(valueSize).font(valueFont).text(value, ML + 14, y + 12)
  doc.restore()
  return y + 36
}

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 1 — PORTADA
// ═══════════════════════════════════════════════════════════════════════
drawPageChrome('Portada')

doc.save()
doc.rect(0, MT + 100, 8, 280).fill(GOLD_LIGHT)
doc.restore()

doc.fillColor(GOLD).fontSize(10).font('Helvetica-Bold')
   .text('CENTRAL MILLWORK', 30, MT + 110, { characterSpacing: 4 })

doc.fillColor(FOREST).fontSize(38).font('Helvetica-Bold').text('Manual de pruebas', 30, MT + 140)
doc.fillColor(GOLD_LIGHT).fontSize(38).font('Helvetica-Bold').text('Módulo de Muestras', 30, MT + 192)

doc.moveTo(30, MT + 265).lineTo(150, MT + 265).strokeColor(GOLD_LIGHT).lineWidth(2).stroke()

doc.fillColor(TEXT_MUTED).fontSize(13).font('Helvetica-Oblique')
   .text('Guía operativa para el take-off de pruebas del módulo de Muestras.\nValidar el ciclo completo de 7 fases, desde la solicitud inicial hasta la aprobación del cliente.',
         30, MT + 280, { width: CW - 30, lineGap: 4 })

const tocY = MT + 370
doc.fillColor(FOREST).fontSize(11).font('Helvetica-Bold').text('CONTENIDO', 30, tocY, { characterSpacing: 3 })

const toc = [
  ['1', 'Acceso al sistema y credenciales', '2'],
  ['2', 'El ciclo de una muestra · 7 estados', '3'],
  ['3', 'Antes de empezar · qué tener listo', '4'],
  ['4', 'Fase 1 — Crear la muestra (Ingeniería)', '5'],
  ['5', 'Fase 2 — Procurement decide compras', '6'],
  ['6', 'Fase 3 y 4 — Fabricación + Auto-QC', '7'],
  ['7', 'Fase 5 — Registrar envío al cliente', '8'],
  ['8', 'Fase 6 — Aprobar o rechazar', '9'],
  ['9', 'Verificaciones técnicas + Limpieza', '10'],
  ['10', 'Casos comunes y resolución', '11'],
]
let ty = tocY + 22
toc.forEach(([n, t, p]) => {
  doc.fillColor(GOLD).fontSize(10).font('Helvetica-Bold').text(n + '.', 30, ty, { width: 20 })
  doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica').text(t, 55, ty, { width: 380 })
  doc.fillColor(TEXT_MUTED).fontSize(10).font('Helvetica').text('pág. ' + p, 0, ty, { width: W - 50, align: 'right' })
  ty += 18
})

doc.fillColor(TEXT_LIGHT).fontSize(9).font('Helvetica-Oblique')
   .text('Generado el 15 de junio de 2026 · Documento interno · Mantener confidencial',
         30, H - 145, { width: CW, align: 'left', lineBreak: false })

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 2 — ACCESO AL SISTEMA
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Acceso al sistema')
let y = sectionTitle('01', 'Acceso al sistema', 'URLs, usuarios y contraseñas necesarios para hacer las pruebas.')

doc.fillColor(TEXT_MUTED).fontSize(9).font('Helvetica-Bold')
   .text('URL DE LA APLICACIÓN', ML, y, { characterSpacing: 2 })
y += 14
doc.fillColor(BLUE).fontSize(11).font('Courier').text(URL_LOGIN, ML, y, { link: URL_LOGIN, underline: true })
y += 24

// Roles y usuarios
y = h3('Usuarios disponibles por rol', y)

const users = [
  { rol: 'ADMIN',         email: 'chali@centralmillwork.com',    password: '(tu contraseña habitual)',     nota: 'Puede ejecutar TODOS los pasos. Para la primera pasada, hacés vos todo.' },
  { rol: 'ENGINEERING',   email: 'mathias@centralmillwork.com',  password: 'Pruebas2026! (a resetear)',    nota: 'Mathias. Crea muestra, aprueba o rechaza al final. Coordinar antes de resetear contraseña.' },
  { rol: 'SHOP_MANAGER',  email: 'shaggy@centralmillwork.com',   password: 'Produccion2026!',              nota: 'Inicia fabricación. Contraseña ya reseteada el 13/06.' },
  { rol: 'PROCUREMENT',   email: 'chali@centralmillwork.com',    password: '(tu contraseña habitual)',     nota: 'Chali ES Procurement. Lo opera desde su cuenta ADMIN — un ADMIN tiene permisos de todos los roles.' },
]

box(y, 170, { fill: BG_PALE, accent: GOLD_LIGHT })
let cy = y + 14
users.forEach((u, i) => {
  doc.fillColor(BLUE).fontSize(9).font('Helvetica-Bold').text(u.rol, ML + 14, cy, { width: 130, characterSpacing: 1 })
  doc.fillColor(TEXT_DARK).fontSize(9).font('Courier').text(u.email, ML + 150, cy, { width: 200 })
  doc.fillColor(AMBER).fontSize(9).font('Courier-Bold').text(u.password, ML + 350, cy, { width: 165 })
  doc.fillColor(TEXT_MUTED).fontSize(8).font('Helvetica-Oblique').text(u.nota, ML + 14, cy + 12, { width: CW - 28, lineGap: 1 })
  cy += 38
})
y += 185

box(y, 80, { fill: AMBER_PALE, border: AMBER, accent: AMBER })
doc.fillColor(AMBER).fontSize(10).font('Helvetica-Bold')
   .text('SUGERENCIA PARA LA PRIMERA PASADA', ML + 14, y + 12, { characterSpacing: 2 })
doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
   .text('Hacela vos solo con chali@ (ADMIN). El ADMIN tiene permisos de todos los roles, así podés validar el flow completo sin coordinar con nadie más. Si encontrás bugs, los arreglás antes de involucrar al equipo. Para una segunda pasada, ya con todos los roles reales (Daniela, Shaggy), se valida la experiencia de cada uno.',
         ML + 14, y + 30, { width: CW - 28, lineGap: 2 })

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 3 — EL CICLO
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('El ciclo de una muestra')
y = sectionTitle('02', 'El ciclo de una muestra', '7 estados conectados. Cada transición dispara una acción automática del sistema.')

const states = [
  { n: '01', label: 'SOLICITADA',    desc: 'Ingeniería crea la muestra con código, tipo, descripción y sube el PDF de Sample Request.', who: 'INGENIERÍA' },
  { n: '02', label: 'EN_FABRICACION',desc: 'Procurement marcó "sin compras" o las OCs llegaron. Shop Manager abre el modal "Iniciar fabricación" con procesos pre-llenados según el tipo. Se crea OP tipo MUESTRA.', who: 'PROCUREMENT + SHOP MANAGER' },
  { n: '03', label: 'EN_QC',         desc: 'El operario en el kiosko completa el último proceso de la OP. La muestra pasa automáticamente a EN_QC. Email passthrough a SHOP_MANAGER.', who: 'SHOP_MANAGER + sistema' },
  { n: '04', label: 'ENVIADA',       desc: 'Logística (Procurement/Admin) registra el envío con destinatario, tracking y foto del paquete. Tareas SHOP_MANAGER auto-cerradas. Email passthrough a INGENIERIA.', who: 'PROCUREMENT / ADMIN' },
  { n: '05', label: 'ESPERANDO',     desc: 'El cliente revisa la muestra. Mientras tanto, la muestra queda en ENVIADA hasta que llega respuesta.', who: 'Cliente externo' },
  { n: '06', label: 'APROBADA',      desc: 'Ingeniería marca APROBADA. Se crea row en proyectos_muestras_aprobadas con snapshot inmutable (código, descripción, PDF, fecha).', who: 'INGENIERÍA / ADMIN' },
  { n: '07', label: 'RECHAZADA',     desc: 'Si el cliente rechaza: nueva V+1 con razón. Tarea PROCUREMENT auto-creada para revisar materiales. Vuelve a SOLICITADA hasta resolverse.', who: 'INGENIERÍA / ADMIN' },
]

const colW = (CW - 12) / 2
const rowH = 88
states.forEach((s, i) => {
  const col = i % 2
  const row = Math.floor(i / 2)
  const x = ML + col * (colW + 12)
  const ry = y + row * (rowH + 8)

  doc.save()
  doc.rect(x, ry, colW, rowH).fillAndStroke('#FFFFFF', BORDER)
  doc.rect(x, ry, 4, rowH).fill(GOLD_LIGHT)

  doc.fillColor(GOLD).fontSize(10).font('Helvetica-Bold').text(s.n, x + 14, ry + 8, { characterSpacing: 1 })
  doc.fillColor(FOREST).fontSize(12).font('Helvetica-Bold').text(s.label, x + 14, ry + 22)
  doc.fillColor(BLUE).fontSize(8).font('Helvetica-Bold').text(s.who, x + 14, ry + 38, { characterSpacing: 1 })
  doc.fillColor(TEXT_MUTED).fontSize(8.5).font('Helvetica').text(s.desc, x + 14, ry + 50, { width: colW - 28, lineGap: 1 })
  doc.restore()
})

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 4 — ANTES DE EMPEZAR
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Antes de empezar')
y = sectionTitle('03', 'Antes de empezar', 'Qué tener listo y qué esperar antes del take-off.')

y = h3('Prerequisitos técnicos', y)
y = bullet('Internet estable.', 'La app funciona online. Si se cae el WiFi, esperar a que vuelva antes de seguir.', y)
y = bullet('Login con chali@.', 'Hacé login con tu cuenta habitual antes de empezar.', y)
y = bullet('Un proyecto donde colgar la muestra.', 'Sugiero PRY-2026-577 (HYATT PHASE 1) o cualquiera activo. La muestra requiere proyecto para pasar a EN_FABRICACION.', y)
y = bullet('Un PDF dummy para el Sample Request.', 'Cualquier PDF chico (puede ser un PDF en blanco). Lo subís en Fase 1.', y)
y = bullet('Una imagen para la foto de envío.', 'Cualquier imagen del celular o computadora. La subís en Fase 5.', y)

y += 8
y = h3('Importante: Resend está en passthrough', y)

box(y, 75, { fill: AMBER_PALE, border: AMBER, accent: AMBER })
doc.fillColor(AMBER).fontSize(10).font('Helvetica-Bold')
   .text('LOS EMAILS NO SE MANDAN REALES', ML + 14, y + 12, { characterSpacing: 2 })
doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
   .text('El sistema dispara 4 notificaciones por email durante el ciclo (a Procurement, Shop Manager x2, Engineering). Hoy quedan registradas en los logs de Railway pero NO se envían a destinatarios reales. Es lo esperado para la primera prueba: nadie del equipo se ve interrumpido.',
         ML + 14, y + 28, { width: CW - 28, lineGap: 2 })
y += 90

y = h3('Cómo verificar los emails passthrough', y)
y = step(1, 'Abrir Railway → centralmillwork-backend → Deploy Logs.', null, y)
y = step(2, 'Filtrar por la palabra "mailer".', 'Vas a ver líneas tipo "mailer: passthrough" con destinatario, asunto y tags.', y)
y = step(3, 'Cada email aparece con su evento.', 'Por ejemplo: "evento=muestra_en_qc" o "evento=muestra_enviada".', y)

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 5 — FASE 1
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Fase 1 — Crear la muestra')
y = sectionTitle('04', 'Fase 1 · Crear la muestra', 'Rol: INGENIERÍA. Hoy lo hacés vos como ADMIN.')

y = h3('Pasos', y)
y += 4
y = step(1, 'Login con chali@centralmillwork.com.', null, y)
y = step(2, 'Menú lateral → "Muestras".', 'Te lleva al kanban con las columnas SOLICITADA, EN_FABRICACION, EN_QC, ENVIADA, APROBADA, RECHAZADA.', y)
y = step(3, 'Botón "Nueva muestra" (arriba a la derecha).', null, y)
y = step(4, 'Llenar el formulario:',
         '· Código: SMP-TEST-2026-01 (cualquier código único)\n· Tipo: PUERTA (recomendado, tiene 5 procesos pre-llenados)\n· Descripción: "Muestra de prueba para take-off de Muestras"\n· Proyecto: PRY-2026-577 (o cualquier activo)\n· Prioridad: MEDIA', y)
y = step(5, 'Confirmar la creación.', 'Estado inicial: SOLICITADA.', y)
y = step(6, 'En el detalle de la muestra → tab "Archivos" → subir un PDF dummy.',
         'Tipo: sample_request. Versión: V1. Sin esto, no podrás pasar a EN_FABRICACION después.', y)

y += 8
y = h3('Qué verificar', y)
y = bullet('Estado SOLICITADA en el kanban.', 'La card aparece en la columna correspondiente.', y)
y = bullet('Tab Timeline.', 'Debería tener un primer evento "comentario · muestra creada".', y)
y = bullet('Logs Railway.', 'mailer: passthrough con destinatario procurement. Tag: muestra_solicitada.', y)
y = bullet('Tarea creada para Procurement (visible solo para ADMIN).', 'Menú "Tareas" → vas a ver "Materiales para muestra SMP-TEST-2026-01".', y)

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 6 — FASE 2
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Fase 2 — Procurement decide compras')
y = sectionTitle('05', 'Fase 2 · Procurement decide compras', 'Rol: PROCUREMENT = Chali. Lo hacés desde tu cuenta ADMIN.')

y = h3('Opción A — "Sin compras" (camino rápido)', y)
y = p('Si los materiales para la muestra ya están en el taller o no requieren compra:', y, { lineGap: 2 })
y += 4
y = step(1, 'En el detalle de la muestra → tab "OCs".', null, y)
y = step(2, 'Botón "Marcar sin compras necesarias".', 'Te pide motivo opcional. Confirmar.', y)
y = step(3, 'El sistema dispara automáticamente:',
         '· Cierra la tarea PROCUREMENT.\n· Crea tarea SHOP_MANAGER "Listo para fabricar SMP-TEST-2026-01".\n· Email passthrough a shaggy@.', y)

y += 8
y = h3('Opción B — Crear OC asociada (camino largo)', y)
y = p('Si los materiales requieren compra a un proveedor:', y, { lineGap: 2 })
y += 4
y = step(1, 'Tab OCs → botón "Crear OC".',
         'Modal pre-llenado con el proyecto y vinculado a la muestra.', y)
y = step(2, 'Llenar vendor, items, precio y guardar.', null, y)
y = step(3, 'Marcar la OC como "recibida" manualmente.',
         'En /ordenes-compra → editar estado a recibida. (En la realidad esto pasa cuando llega la mercadería al taller.)', y)
y = step(4, 'Verificar que el sistema cierra la tarea PROCUREMENT y crea la SHOP_MANAGER.', null, y)

y += 8
y = h3('Sugerencia para la prueba', y)
box(y, 50, { fill: BLUE_PALE, border: BLUE, accent: BLUE })
doc.fillColor(BLUE).fontSize(10).font('Helvetica-Bold').text('USAR OPCIÓN A', ML + 14, y + 12, { characterSpacing: 2 })
doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
   .text('Para la primera pasada usá "sin compras necesarias". Es más rápido y valida el flow sin tener que crear/recibir una OC. La opción B la podés probar después en una segunda pasada.',
         ML + 14, y + 28, { width: CW - 28, lineGap: 1 })

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 7 — FASES 3 + 4
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Fase 3 — Fabricar y completar')
y = sectionTitle('06', 'Fase 3 y 4 · Fabricar + Auto-QC', 'Rol: SHOP_MANAGER + operario en kiosko.')

y = h3('Fase 3 — Iniciar fabricación (Shop Manager)', y)
y += 4
y = step(1, 'Logout y login con shaggy@centralmillwork.com / Produccion2026!.',
         'O quedate como chali y simulá. Pero el experience del modal lo ve el SHOP_MANAGER.', y)
y = step(2, '/muestras → click en la muestra creada → estado SOLICITADA.', null, y)
y = step(3, 'Botón "Iniciar fabricación".',
         'Se abre el modal con procesos pre-llenados según el tipo PUERTA: cnc → edge_banding → assembly → pintura → final. Editables.', y)
y = step(4, 'Confirmar (dejar la ruta default).',
         '· Se crea OP con número OP-MS-2026-XXX.\n· Tipo: MUESTRA.\n· La muestra pasa a EN_FABRICACION.', y)

y += 8
y = h3('Fase 4 — Operario completa procesos (kiosko)', y)
y += 4
y = step(1, 'Abrir el kiosko en un iPad con WiFi.',
         'URL: ' + URL_APP + '/kiosko', y)
y = step(2, 'Login con un PIN de operario (ver pins_operarios_2026_06_15.pdf).',
         'La OP-MS-XXX debe aparecer en la lista del operario asignado al primer proceso.', y)
y = step(3, 'Completar cada proceso uno por uno hasta el último.',
         'Tomar las fotos requeridas si la estación las pide. Si no querés tomarlas, usar ADMIN para forzar avance.', y)
y = step(4, 'Al completar el ÚLTIMO proceso → muestra pasa automáticamente a EN_QC.',
         'Verificar: log Railway "notifyMuestraEnQC: dispatched passthrough=true" + email a SHOP_MANAGER.', y)

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 8 — FASE 5
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Fase 5 — Registrar envío')
y = sectionTitle('07', 'Fase 5 · Registrar envío al cliente', 'Rol: PROCUREMENT = Chali. Lo hacés desde tu cuenta ADMIN.')

y = h3('Pasos', y)
y += 4
y = step(1, 'Login con chali@ (o cualquier rol con permiso de envío).', null, y)
y = step(2, '/muestras → click en la muestra → estado EN_QC.', null, y)
y = step(3, 'Botón "Registrar envío" (visible para PROCUREMENT/ADMIN).',
         'Se abre el modal.', y)
y = step(4, 'Llenar:',
         '· Destinatario: "Cliente de prueba"\n· Dirección: cualquier dirección (opcional)\n· Carrier: FedEx, UPS o "Manual"\n· Tracking #: cualquier número o vacío\n· Notas: opcional', y)
y = step(5, 'Foto del paquete (opcional pero recomendado para validar el feature).',
         'Subir cualquier imagen. Se sube al bucket privado de Supabase y queda con signed URL.', y)
y = step(6, 'Confirmar.', null, y)

y += 8
y = h3('Qué verificar', y)
y = bullet('Estado pasa a ENVIADA.', null, y)
y = bullet('Tab Envíos del drawer.', 'Aparece la card con destinatario, tracking, thumbnail clickeable.', y)
y = bullet('Tareas SHOP_MANAGER auto-cerradas.', '(El ADMIN puede verlo en menú Tareas filtrando por la muestra.)', y)
y = bullet('Log Railway:', 'notifyMuestraEnviada: dispatched. Email passthrough a daniela@ (ENGINEERING).', y)

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 9 — FASE 6
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Fase 6 — Aprobar o rechazar')
y = sectionTitle('08', 'Fase 6 · Aprobar o rechazar', 'Rol: ENGINEERING o ADMIN.')

y = h3('Opción A — Aprobar (cerrar el ciclo)', y)
y += 4
y = step(1, 'En el detalle de la muestra (estado ENVIADA) → botón "Pasar a Aprobada".',
         'Solo visible para ADMIN y ENGINEERING. SHOP_MANAGER no puede aprobar.', y)
y = step(2, 'Confirmar.',
         '· Estado pasa a APROBADA.\n· Se inserta row en proyectos_muestras_aprobadas con snapshot inmutable (código, descripción, PDF).\n· fecha_aprobacion_cliente registrada.', y)
y = step(3, 'Verificar en /proyectos/PRY-2026-577 → tab "Muestras aprobadas".',
         'Debería aparecer la card de SMP-TEST-2026-01 con el PDF descargable.', y)

y += 8
y = h3('Opción B — Rechazar (probar ciclo de revisión)', y)
y += 4
y = step(1, 'En lugar de "Pasar a Aprobada" → "Pasar a Rechazada".', null, y)
y = step(2, 'Se te pide razón del rechazo del cliente.',
         'Cualquier texto sirve para la prueba. Ej: "Color de la pintura no coincide".', y)
y = step(3, 'Verificar:',
         '· Estado pasa a RECHAZADA.\n· Se crea V2 automáticamente.\n· Tarea PROCUREMENT creada (revisar materiales para V2).\n· Tarea adicional para ingeniería: subir nuevo Sample Request V2.', y)
y = step(4, 'Probar reapertura: como ENGINEERING o ADMIN, pasar de RECHAZADA → SOLICITADA.',
         'Requiere subir PDF sample_request V2 antes. El sistema te lo recuerda con un mensaje claro.', y)

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 10 — VERIFICACIONES + LIMPIEZA
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Verificaciones técnicas y limpieza')
y = sectionTitle('09', 'Verificaciones técnicas y limpieza', 'Cómo confirmar que cada paso funcionó y borrar la muestra de prueba al final.')

y = h3('Verificaciones técnicas (todas en Railway → backend → Logs)', y)
y = p('Filtrar por la palabra clave correspondiente para cada evento:', y, { lineGap: 2 })
y += 4

const events = [
  { fase: 'F1',  trigger: 'Crear muestra',           palabra: 'tarea pendiente procurement' },
  { fase: 'F2A', trigger: 'Marcar sin compras',      palabra: 'tareasShopManager + mailer passthrough' },
  { fase: 'F3',  trigger: 'Iniciar fabricación',     palabra: 'muestra iniciar-fabricacion ok' },
  { fase: 'F4',  trigger: 'Completar último proceso', palabra: 'notifyMuestraEnQC: dispatched' },
  { fase: 'F5',  trigger: 'Registrar envío',          palabra: 'notifyMuestraEnviada: dispatched' },
  { fase: 'F6',  trigger: 'Aprobar',                   palabra: 'muestra aprobada vinculada a proyecto' },
]
events.forEach((e) => {
  doc.fillColor(BLUE).fontSize(9).font('Helvetica-Bold').text(e.fase, ML + 4, y, { width: 30, characterSpacing: 1 })
  doc.fillColor(FOREST).fontSize(9.5).font('Helvetica-Bold').text(e.trigger, ML + 36, y, { width: 180 })
  doc.fillColor(TEXT_DARK).fontSize(9).font('Courier').text(e.palabra, ML + 220, y, { width: CW - 220 })
  y += 16
})

y += 10
y = h3('Limpieza post-prueba (cuando termines)', y)
y = p('Para no dejar la muestra test en la BD de producción:', y, { lineGap: 2 })
y += 4
y = step(1, 'Archivar la muestra desde la UI.',
         'En el detalle → "Pasar a Archivada". Estado terminal. La muestra desaparece del kanban principal pero queda en la BD.', y)
y = step(2, 'Si querés borrar todo:',
         'Pedile a Claude (Chali). Va a hacer DELETE en cascada de: muestra, eventos, archivos, envíos, OPs MUESTRA, OCs asociadas si las hubo.', y)
y = step(3, 'Verificar las tareas pendientes.',
         'Si quedaron tareas SHOP_MANAGER o ENGINEERING sin cerrar, marcarlas como completadas a mano desde el menú Tareas.', y)

// ═══════════════════════════════════════════════════════════════════════
// PÁGINA 11 — TROUBLESHOOTING
// ═══════════════════════════════════════════════════════════════════════
doc.addPage()
drawPageChrome('Casos comunes y resolución')
y = sectionTitle('10', 'Casos comunes y resolución', 'Qué hacer si algo no anda como esperabas.')

const cases = [
  {
    title: 'No puedo pasar a EN_FABRICACION (botón no aparece)',
    body: 'Posibles causas: (1) La muestra no tiene proyecto asignado — editar la muestra y vincular un proyecto. (2) Hay OCs asociadas que no están en estado "recibida". Marcalas como recibidas o cancelalas. (3) No subiste el PDF de Sample Request V1 — tab Archivos, subir un PDF cualquiera con tipo "sample_request".',
    color: RED, bg: RED_PALE,
  },
  {
    title: 'El modal "Iniciar fabricación" no carga procesos pre-llenados',
    body: 'Verificar que la muestra tenga tipo asignado (PUERTA, HARDWARE, CABINET, ACABADO). Si es "OTRO" el modal abre vacío y se arma la ruta a mano. La tabla muestras_procesos_default solo tiene seed para los 4 tipos principales.',
    color: AMBER, bg: AMBER_PALE,
  },
  {
    title: 'El operario no ve la OP en el kiosko',
    body: 'Verificar que el operario esté asignado a la estación actual de la OP. Si la primera estación es "cnc" y el operario solo tiene "assembly", no la ve. Como ADMIN, agregalo a la estación desde Personal → editar.',
    color: BLUE, bg: BLUE_PALE,
  },
  {
    title: 'El kiosko exige fotos pero no quiero tomar',
    body: 'Para la prueba, podés avanzar la OP desde la app web (rol ADMIN). En /produccion/ordenes/:id → botón "Avanzar etapa" con bypass de foto. La transición auto-QC al final SÍ ocurre igual.',
    color: PURPLE, bg: PURPLE_PALE,
  },
  {
    title: 'No veo logs "notifyMuestra..." en Railway',
    body: 'Confirmar que el deploy más reciente tenga el código de Muestras F4/F5 (commit aa49598 o posterior — del 9 de junio en adelante). Si está en una versión vieja, redeploy con el último commit. En Deploy Logs filtrar por "muestra" para ver todos los eventos relacionados.',
    color: GREEN, bg: GREEN_PALE,
  },
]

cases.forEach((c) => {
  box(y, 72, { fill: c.bg, border: c.color, accent: c.color })
  doc.fillColor(c.color).fontSize(11).font('Helvetica-Bold').text(c.title, ML + 14, y + 14, { width: CW - 28 })
  doc.fillColor(TEXT_DARK).fontSize(10).font('Helvetica')
     .text(c.body, ML + 14, y + 32, { width: CW - 28, lineGap: 2 })
  y += 82
})

doc.end()
console.log('OK guardado en:', outPath)
