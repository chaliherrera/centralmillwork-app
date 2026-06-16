// ─────────────────────────────────────────────────────────────────────────────
// Teams Bot — webhook + comandos (MVP, 2026-06-15)
// ─────────────────────────────────────────────────────────────────────────────
// Endpoint POST /api/teams-bot/webhook que recibe mensajes desde Microsoft
// Bot Connector Service y responde con Adaptive Cards.
//
// Comandos soportados:
//   ayuda                         lista los comandos
//   proyectos                     proyectos activos
//   resumen PRY-2026-XXX          KPIs del proyecto
//   pendientes PRY-2026-XXX       materiales pendientes
//   recibidos PRY-2026-XXX        materiales recibidos
//   item PRY-2026-XXX <item>      materiales del item N del proyecto
//   op OP-XX-XXX                  estación + operario + tiempo trabajando
//   fotos OP-XX-XXX               fotos de la estación anterior
//
// Autenticación:
//   - El bot valida la firma del request via Bot Framework SDK.
//   - Para el MVP, opera como "system" — cualquier user Teams autorizado a
//     hablar con el bot ve toda la info. La restricción es a nivel Teams
//     Admin Center (quién puede instalar el bot).
//
// Passthrough:
//   - Si BOT_APP_ID o BOT_APP_PASSWORD no están seteadas en env, el endpoint
//     devuelve 503 con un mensaje claro y loguea. No crashea el server.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express'
import {
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration,
  TurnContext,
  ActivityHandler,
  Attachment,
} from 'botbuilder'
import pool from '../db/pool'
import { logger } from '../utils/logger'
import { captureException } from '../utils/sentry'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../utils/supabase'

const router = Router()

// ─── Configuración del adapter ───────────────────────────────────────────
const BOT_APP_ID = process.env.BOT_APP_ID || ''
const BOT_APP_PASSWORD = process.env.BOT_APP_PASSWORD || ''
const BOT_ENABLED = !!(BOT_APP_ID && BOT_APP_PASSWORD)

let adapter: CloudAdapter | null = null

if (BOT_ENABLED) {
  const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
    MicrosoftAppId: BOT_APP_ID,
    MicrosoftAppPassword: BOT_APP_PASSWORD,
    MicrosoftAppType: 'SingleTenant',
    MicrosoftAppTenantId: process.env.BOT_TENANT_ID || undefined,
  })
  const botFrameworkAuth = createBotFrameworkAuthenticationFromConfiguration(null, credentialsFactory)
  adapter = new CloudAdapter(botFrameworkAuth)
  adapter.onTurnError = async (context, err) => {
    logger.error('teamsBot turn error', { err: String(err) })
    captureException(err as Error, { tags: { hot_path: 'teams_bot' } })
    await context.sendActivity('Algo salió mal procesando tu mensaje. Intentá de nuevo en un momento.')
  }
  logger.info('teamsBot: inicializado', { appIdPrefix: BOT_APP_ID.slice(0, 8) })
} else {
  logger.info('teamsBot: BOT_APP_ID/BOT_APP_PASSWORD no configurados, modo passthrough')
}

// ─── Adaptive Cards: helpers de construcción ─────────────────────────────

function adaptive(body: any[], actions?: any[]): Attachment {
  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      type: 'AdaptiveCard',
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.5',
      body,
      ...(actions ? { actions } : {}),
    },
  }
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://centralmillwork-frontend-production.up.railway.app'

function fmt$ (n: number | string): string {
  const v = typeof n === 'string' ? parseFloat(n) : n
  if (!Number.isFinite(v)) return '$0'
  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

// ─── Comandos: cada uno arma un Attachment ───────────────────────────────

async function cmdAyuda(): Promise<Attachment> {
  return adaptive([
    { type: 'TextBlock', text: 'Central Millwork Bot', weight: 'Bolder', size: 'Large', color: 'Accent' },
    { type: 'TextBlock', text: 'Comandos disponibles', isSubtle: true, spacing: 'None' },
    { type: 'Container', items: [
      { type: 'FactSet', facts: [
        { title: 'ayuda',                         value: 'esta lista' },
        { title: 'proyectos',                     value: 'proyectos activos' },
        { title: 'resumen PRY-2026-XXX',          value: 'KPIs del proyecto' },
        { title: 'pendientes PRY-2026-XXX',       value: 'materiales por llegar' },
        { title: 'recibidos PRY-2026-XXX',        value: 'materiales que llegaron' },
        { title: 'item PRY-2026-XXX <n>',         value: 'materiales del item' },
        { title: 'op OP-XX-XXX',                  value: 'estación + operario + tiempo' },
        { title: 'fotos OP-XX-XXX',               value: 'fotos de la estación anterior' },
      ]},
    ]},
    { type: 'TextBlock', text: 'Ejemplo: `resumen PRY-2026-577`', isSubtle: true, wrap: true },
  ])
}

async function cmdProyectos(): Promise<Attachment> {
  const { rows } = await pool.query<{
    id: number; codigo: string; nombre: string; estado: string; cliente: string;
  }>(
    `SELECT id, codigo, nombre, estado, cliente
       FROM proyectos
      WHERE estado = 'activo'
      ORDER BY codigo`
  )
  if (rows.length === 0) {
    return adaptive([
      { type: 'TextBlock', text: 'Sin proyectos activos', weight: 'Bolder' },
    ])
  }
  return adaptive([
    { type: 'TextBlock', text: `${rows.length} proyectos activos`, weight: 'Bolder', size: 'Medium', color: 'Accent' },
    { type: 'Container', items: rows.map((p) => ({
      type: 'TextBlock', wrap: true,
      text: `**${p.codigo}** — ${p.nombre}\n${p.cliente || ''}`,
    })) },
    { type: 'TextBlock', text: 'Probá: `resumen PRY-2026-XXX` con el código', isSubtle: true, spacing: 'Medium' },
  ])
}

async function cmdResumen(proyectoCodigo: string): Promise<Attachment> {
  const { rows: [proyecto] } = await pool.query<{
    id: number; codigo: string; nombre: string; cliente: string; estado: string;
  }>('SELECT id, codigo, nombre, cliente, estado FROM proyectos WHERE codigo = $1', [proyectoCodigo])
  if (!proyecto) return adaptiveError(`No encontré el proyecto ${proyectoCodigo}`)

  const { rows: [mats] } = await pool.query<{
    total: string; pendientes: string; cotizados: string; ordenados: string; recibidos: string; en_stock: string;
    monto_total: string; monto_comprado: string; monto_recibido: string;
  }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE estado_cotiz = 'PENDIENTE')::text AS pendientes,
       COUNT(*) FILTER (WHERE estado_cotiz = 'COTIZADO')::text  AS cotizados,
       COUNT(*) FILTER (WHERE estado_cotiz = 'ORDENADO')::text  AS ordenados,
       COUNT(*) FILTER (WHERE estado_cotiz = 'RECIBIDO')::text  AS recibidos,
       COUNT(*) FILTER (WHERE estado_cotiz = 'EN_STOCK')::text  AS en_stock,
       COALESCE(SUM(total_price), 0)::text AS monto_total,
       COALESCE(SUM(total_price) FILTER (WHERE estado_cotiz IN ('ORDENADO','RECIBIDO')), 0)::text AS monto_comprado,
       COALESCE(SUM(total_price) FILTER (WHERE estado_cotiz = 'RECIBIDO'), 0)::text AS monto_recibido
     FROM materiales_mto WHERE proyecto_id = $1`,
    [proyecto.id]
  )

  const { rows: [ocs] } = await pool.query<{ total: string; activas: string; recibidas: string }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE estado NOT IN ('cancelada','recibida'))::text AS activas,
       COUNT(*) FILTER (WHERE estado = 'recibida')::text AS recibidas
     FROM ordenes_compra WHERE proyecto_id = $1`,
    [proyecto.id]
  )

  const total = parseInt(mats.total) || 0
  const recibidos = parseInt(mats.recibidos) || 0
  const avance = total > 0 ? Math.round((recibidos / total) * 100) : 0

  return adaptive([
    { type: 'Container', style: 'emphasis', items: [
      { type: 'TextBlock', text: `📦 ${proyecto.codigo}`, weight: 'Bolder', size: 'Large' },
      { type: 'TextBlock', text: proyecto.nombre, wrap: true, isSubtle: true, spacing: 'None' },
      ...(proyecto.cliente ? [{ type: 'TextBlock', text: proyecto.cliente, isSubtle: true, spacing: 'None' }] : []),
    ]},
    { type: 'FactSet', facts: [
      { title: 'Avance',          value: `${avance}% (${recibidos} de ${total})` },
      { title: 'Pendientes',      value: mats.pendientes },
      { title: 'Cotizados',       value: mats.cotizados },
      { title: 'Ordenados',       value: mats.ordenados },
      { title: 'Recibidos',       value: mats.recibidos },
      { title: 'En stock propio', value: mats.en_stock },
    ]},
    { type: 'TextBlock', text: '💰 Dinero', weight: 'Bolder', spacing: 'Medium' },
    { type: 'FactSet', facts: [
      { title: 'Comprado', value: fmt$(mats.monto_comprado) },
      { title: 'Recibido', value: fmt$(mats.monto_recibido) },
      { title: 'OCs activas / total', value: `${ocs.activas} / ${ocs.total}` },
    ]},
  ], [
    { type: 'Action.OpenUrl', title: 'Abrir en la app', url: `${FRONTEND_URL}/proyectos/${proyecto.id}` },
  ])
}

async function cmdMateriales(proyectoCodigo: string, modo: 'PENDIENTE' | 'RECIBIDO'): Promise<Attachment> {
  const { rows: [proyecto] } = await pool.query<{ id: number; codigo: string; nombre: string }>(
    'SELECT id, codigo, nombre FROM proyectos WHERE codigo = $1', [proyectoCodigo]
  )
  if (!proyecto) return adaptiveError(`No encontré el proyecto ${proyectoCodigo}`)

  // Si modo=PENDIENTE incluyo COTIZADO+PENDIENTE (lo que "todavía no llegó")
  const estadosCond = modo === 'PENDIENTE'
    ? "estado_cotiz IN ('PENDIENTE','COTIZADO','ORDENADO')"
    : "estado_cotiz = 'RECIBIDO'"

  const { rows: agrupados } = await pool.query<{ vendor: string; cantidad: string; monto: string }>(
    `SELECT COALESCE(vendor, '(sin vendor)') AS vendor,
            COUNT(*)::text AS cantidad,
            COALESCE(SUM(total_price), 0)::text AS monto
       FROM materiales_mto
      WHERE proyecto_id = $1 AND ${estadosCond}
      GROUP BY vendor
      ORDER BY COUNT(*) DESC
      LIMIT 15`,
    [proyecto.id]
  )

  if (agrupados.length === 0) {
    return adaptive([
      { type: 'TextBlock', text: `Sin materiales ${modo === 'PENDIENTE' ? 'pendientes' : 'recibidos'}`,
        weight: 'Bolder' },
      { type: 'TextBlock', text: proyecto.codigo + ' — ' + proyecto.nombre, isSubtle: true, wrap: true },
    ])
  }

  const total = agrupados.reduce((a, b) => a + (parseInt(b.cantidad) || 0), 0)
  const monto = agrupados.reduce((a, b) => a + (parseFloat(b.monto) || 0), 0)
  const titulo = modo === 'PENDIENTE' ? 'Materiales pendientes' : 'Materiales recibidos'
  const emoji = modo === 'PENDIENTE' ? '⏳' : '✅'

  return adaptive([
    { type: 'TextBlock', text: `${emoji} ${titulo}`, weight: 'Bolder', size: 'Medium' },
    { type: 'TextBlock', text: `${proyecto.codigo} — ${total} materiales · ${fmt$(monto)}`, isSubtle: true, spacing: 'None' },
    { type: 'Container', items: agrupados.map((g) => ({
      type: 'ColumnSet', columns: [
        { type: 'Column', width: 'stretch', items: [
          { type: 'TextBlock', text: `**${g.vendor}**`, wrap: true },
        ]},
        { type: 'Column', width: 'auto', items: [
          { type: 'TextBlock', text: `${g.cantidad}  ·  ${fmt$(g.monto)}` },
        ]},
      ]
    })) },
  ], [
    { type: 'Action.OpenUrl', title: 'Abrir proyecto', url: `${FRONTEND_URL}/proyectos/${proyecto.id}` },
  ])
}

async function cmdItem(proyectoCodigo: string, itemId: string): Promise<Attachment> {
  const { rows: [proyecto] } = await pool.query<{ id: number; codigo: string }>(
    'SELECT id, codigo FROM proyectos WHERE codigo = $1', [proyectoCodigo]
  )
  if (!proyecto) return adaptiveError(`No encontré el proyecto ${proyectoCodigo}`)

  // El campo item de materiales_mto puede contener "1-3,5" para indicar múltiples items.
  // Expandimos y filtramos.
  const { rows: mats } = await pool.query<{
    codigo: string; descripcion: string; vendor: string; qty: string;
    unit_price: string; total_price: string; estado_cotiz: string;
  }>(
    `WITH expanded AS (
       SELECT m.*, TRIM(item_num) AS item_real
         FROM materiales_mto m
         CROSS JOIN UNNEST(REGEXP_SPLIT_TO_ARRAY(COALESCE(m.item, ''), '[-,]')) AS item_num
        WHERE m.proyecto_id = $1
     )
     SELECT codigo, descripcion, vendor, qty::text, unit_price::text, total_price::text, estado_cotiz
       FROM expanded
      WHERE TRIM(item_real) = TRIM($2)
      ORDER BY estado_cotiz, codigo
      LIMIT 30`,
    [proyecto.id, itemId]
  )

  if (mats.length === 0) {
    return adaptive([
      { type: 'TextBlock', text: `Sin materiales para el item "${itemId}"`, weight: 'Bolder' },
      { type: 'TextBlock', text: `Proyecto ${proyecto.codigo}`, isSubtle: true },
    ])
  }

  const estadoEmoji = (e: string) =>
    e === 'RECIBIDO' ? '✅' : e === 'ORDENADO' ? '🚚' : e === 'COTIZADO' ? '💰' : e === 'EN_STOCK' ? '📦' : '⏳'

  return adaptive([
    { type: 'TextBlock', text: `Item ${itemId} · ${proyecto.codigo}`, weight: 'Bolder', size: 'Medium' },
    { type: 'TextBlock', text: `${mats.length} materiales`, isSubtle: true, spacing: 'None' },
    { type: 'Container', items: mats.map((m) => ({
      type: 'TextBlock', wrap: true,
      text: `${estadoEmoji(m.estado_cotiz)}  **${m.codigo || '—'}** — ${m.descripcion}\n${m.vendor || '(sin vendor)'} · qty ${m.qty} · ${fmt$(m.total_price)}`,
    })) },
  ])
}

async function cmdOP(opNumero: string): Promise<Attachment> {
  const { rows: [op] } = await pool.query<{
    id: number; numero_orden: string; numero_item: string; status: string;
    estacion_actual: string | null; operador_nombre: string | null;
    proyecto_codigo: string | null; proyecto_nombre: string | null;
    fecha_inicio: string | null; tiempo_minutos: number | null;
  }>(
    `SELECT op.id, op.numero_orden, op.numero_item, op.status, op.estacion_actual,
            p.codigo AS proyecto_codigo, p.nombre AS proyecto_nombre,
            pt.nombre_completo AS operador_nombre,
            op.fecha_inicio::text,
            CASE WHEN op.fecha_inicio IS NOT NULL
                 THEN EXTRACT(EPOCH FROM (NOW() - op.fecha_inicio))/60
                 ELSE NULL END AS tiempo_minutos
       FROM ordenes_produccion op
       LEFT JOIN proyectos p ON p.id = op.proyecto_id
       LEFT JOIN personal_taller pt ON pt.id = op.personal_asignado_id
      WHERE op.numero_orden = $1`,
    [opNumero]
  )
  if (!op) return adaptiveError(`No encontré la OP ${opNumero}`)

  const horas = op.tiempo_minutos ? Math.floor(op.tiempo_minutos / 60) : 0
  const minutos = op.tiempo_minutos ? Math.round(op.tiempo_minutos % 60) : 0
  const tiempo = op.tiempo_minutos ? (horas > 0 ? `${horas}h ${minutos}min` : `${minutos}min`) : 'no iniciada'

  // Procesos para ver dónde va y cuáles faltan
  const { rows: procesos } = await pool.query<{ estacion: string; secuencia: number; completado: boolean }>(
    `SELECT estacion, secuencia, completado
       FROM orden_procesos
      WHERE orden_id = $1 ORDER BY secuencia`,
    [op.id]
  )

  const proxima = procesos.find((p) => !p.completado && p.estacion !== op.estacion_actual)?.estacion ?? '—'

  return adaptive([
    { type: 'Container', style: 'emphasis', items: [
      { type: 'TextBlock', text: `🔧 ${op.numero_orden}`, weight: 'Bolder', size: 'Large' },
      { type: 'TextBlock', text: `Item: ${op.numero_item}`, isSubtle: true, spacing: 'None' },
      ...(op.proyecto_codigo ? [{ type: 'TextBlock', text: `${op.proyecto_codigo} — ${op.proyecto_nombre}`, isSubtle: true, spacing: 'None' }] : []),
    ]},
    { type: 'FactSet', facts: [
      { title: 'Estado',          value: op.status },
      { title: 'Estación actual', value: op.estacion_actual || '—' },
      { title: 'Operario',        value: op.operador_nombre || '—' },
      { title: 'Tiempo activo',   value: tiempo },
      { title: 'Próxima estación', value: proxima },
    ]},
    { type: 'TextBlock', text: 'Ruta de procesos', weight: 'Bolder', spacing: 'Medium' },
    { type: 'Container', items: [{
      type: 'TextBlock', wrap: true,
      text: procesos.map((p) => `${p.completado ? '✓' : (p.estacion === op.estacion_actual ? '▶' : '○')} ${p.estacion}`).join('  ·  '),
    }]},
  ], [
    { type: 'Action.OpenUrl', title: 'Abrir en la app', url: `${FRONTEND_URL}/produccion/ordenes/${op.id}` },
  ])
}

async function cmdFotos(opNumero: string): Promise<Attachment> {
  const { rows: [op] } = await pool.query<{ id: number; numero_orden: string; estacion_actual: string | null }>(
    'SELECT id, numero_orden, estacion_actual FROM ordenes_produccion WHERE numero_orden = $1', [opNumero]
  )
  if (!op) return adaptiveError(`No encontré la OP ${opNumero}`)

  // Estación anterior = última con completado=true y secuencia menor a la actual
  let estacionAnterior: string | null = null
  if (op.estacion_actual) {
    const { rows: [estAnt] } = await pool.query<{ estacion: string }>(
      `SELECT estacion
         FROM orden_procesos
        WHERE orden_id = $1 AND completado = true
          AND secuencia < (SELECT secuencia FROM orden_procesos
                            WHERE orden_id = $1 AND estacion = $2 LIMIT 1)
        ORDER BY secuencia DESC LIMIT 1`,
      [op.id, op.estacion_actual]
    )
    estacionAnterior = estAnt?.estacion ?? null
  } else {
    // Si no hay estación actual (orden completada), tomar la última completada
    const { rows: [ultima] } = await pool.query<{ estacion: string }>(
      `SELECT estacion FROM orden_procesos
        WHERE orden_id = $1 AND completado = true
        ORDER BY secuencia DESC LIMIT 1`,
      [op.id]
    )
    estacionAnterior = ultima?.estacion ?? null
  }

  if (!estacionAnterior) {
    return adaptive([
      { type: 'TextBlock', text: `Sin estación anterior con fotos`, weight: 'Bolder' },
      { type: 'TextBlock', text: `${op.numero_orden}`, isSubtle: true },
    ])
  }

  const { rows: fotos } = await pool.query<{ id: number; filename: string }>(
    `SELECT id, filename FROM orden_avance_fotos
      WHERE orden_id = $1 AND estacion = $2
      ORDER BY created_at`,
    [op.id, estacionAnterior]
  )

  if (fotos.length === 0) {
    return adaptive([
      { type: 'TextBlock', text: `Sin fotos en ${estacionAnterior}`, weight: 'Bolder' },
      { type: 'TextBlock', text: `${op.numero_orden}`, isSubtle: true },
    ])
  }

  // Generar signed URLs (bucket privado de fotos de producción).
  // Patrón ya usado en avancesFotosController/qcController.
  const bucket = process.env.SUPABASE_BUCKET_PRODUCCION || SUPABASE_BUCKET
  const urls: string[] = []
  if (supabaseEnabled && supabase) {
    for (const f of fotos.slice(0, 5)) {
      const { data } = await supabase.storage.from(bucket).createSignedUrl(f.filename, 3600)
      if (data?.signedUrl) urls.push(data.signedUrl)
    }
  }

  return adaptive([
    { type: 'TextBlock', text: `📷 Fotos de ${estacionAnterior}`, weight: 'Bolder', size: 'Medium' },
    { type: 'TextBlock', text: `${op.numero_orden} · ${fotos.length} fotos (mostrando primeras ${urls.length})`, isSubtle: true, spacing: 'None' },
    ...urls.map((u) => ({ type: 'Image', url: u, size: 'Large' })),
  ], [
    { type: 'Action.OpenUrl', title: 'Ver todas en la app', url: `${FRONTEND_URL}/produccion/ordenes/${op.id}` },
  ])
}

function adaptiveError(message: string): Attachment {
  return adaptive([
    { type: 'TextBlock', text: '⚠️ ' + message, color: 'Attention', wrap: true },
    { type: 'TextBlock', text: 'Tipeá `ayuda` para ver los comandos.', isSubtle: true },
  ])
}

// ─── Parser de comandos ─────────────────────────────────────────────────

interface ParsedCmd {
  cmd: 'ayuda' | 'proyectos' | 'resumen' | 'pendientes' | 'recibidos' | 'item' | 'op' | 'fotos' | 'unknown'
  args: string[]
}

function parseCommand(text: string): ParsedCmd {
  const cleaned = text.replace(/<at>.*?<\/at>/g, '').trim().toLowerCase()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { cmd: 'ayuda', args: [] }

  const head = parts[0]
  const rest = parts.slice(1).map((s) => s.toUpperCase())

  if (['ayuda', 'help', '?'].includes(head)) return { cmd: 'ayuda', args: [] }
  if (['proyectos', 'projects'].includes(head)) return { cmd: 'proyectos', args: [] }
  if (head === 'resumen') return { cmd: 'resumen', args: rest }
  if (head === 'pendientes') return { cmd: 'pendientes', args: rest }
  if (head === 'recibidos') return { cmd: 'recibidos', args: rest }
  if (head === 'item') return { cmd: 'item', args: rest }
  if (head === 'op') return { cmd: 'op', args: rest }
  if (head === 'fotos') return { cmd: 'fotos', args: rest }
  return { cmd: 'unknown', args: [head, ...rest] }
}

async function dispatch(parsed: ParsedCmd): Promise<Attachment> {
  try {
    switch (parsed.cmd) {
      case 'ayuda':      return await cmdAyuda()
      case 'proyectos':  return await cmdProyectos()
      case 'resumen':
        if (!parsed.args[0]) return adaptiveError('Necesito el código del proyecto. Ej: `resumen PRY-2026-577`')
        return await cmdResumen(parsed.args[0])
      case 'pendientes':
        if (!parsed.args[0]) return adaptiveError('Necesito el código del proyecto. Ej: `pendientes PRY-2026-577`')
        return await cmdMateriales(parsed.args[0], 'PENDIENTE')
      case 'recibidos':
        if (!parsed.args[0]) return adaptiveError('Necesito el código del proyecto. Ej: `recibidos PRY-2026-577`')
        return await cmdMateriales(parsed.args[0], 'RECIBIDO')
      case 'item':
        if (parsed.args.length < 2) return adaptiveError('Necesito proyecto e item. Ej: `item PRY-2026-577 5`')
        return await cmdItem(parsed.args[0], parsed.args[1])
      case 'op':
        if (!parsed.args[0]) return adaptiveError('Necesito el número de OP. Ej: `op OP-26-101`')
        return await cmdOP(parsed.args[0])
      case 'fotos':
        if (!parsed.args[0]) return adaptiveError('Necesito el número de OP. Ej: `fotos OP-26-101`')
        return await cmdFotos(parsed.args[0])
      default:
        return adaptiveError(`No entendí "${parsed.args.join(' ')}". Probá \`ayuda\`.`)
    }
  } catch (err) {
    logger.error('teamsBot dispatch error', { err: String(err), cmd: parsed.cmd })
    captureException(err as Error, { tags: { hot_path: 'teams_bot_dispatch' } })
    return adaptiveError('Algo salió mal procesando tu pedido. Probá de nuevo.')
  }
}

// ─── ActivityHandler: recibe el message activity y responde ──────────────

class CentralMillworkBot extends ActivityHandler {
  constructor() {
    super()
    this.onMessage(async (context, next) => {
      const text = context.activity.text || ''
      const userEmail =
        (context.activity.from as any)?.aadObjectId
        || context.activity.from?.id
        || 'unknown'
      logger.info('teamsBot message', { from: userEmail, text })

      const parsed = parseCommand(text)
      const card = await dispatch(parsed)
      await context.sendActivity({ attachments: [card] })
      await next()
    })

    this.onMembersAdded(async (context, next) => {
      const added = context.activity.membersAdded ?? []
      for (const member of added) {
        if (member.id !== context.activity.recipient.id) {
          await context.sendActivity({
            attachments: [await cmdAyuda()],
          })
        }
      }
      await next()
    })
  }
}

const bot = new CentralMillworkBot()

// ─── Endpoint ────────────────────────────────────────────────────────────

router.post('/webhook', async (req: Request, res: Response) => {
  if (!BOT_ENABLED || !adapter) {
    logger.warn('teamsBot webhook: deshabilitado (sin BOT_APP_ID/BOT_APP_PASSWORD)')
    res.status(503).json({ error: 'bot not configured', message: 'Falta configurar BOT_APP_ID y BOT_APP_PASSWORD en el server.' })
    return
  }
  try {
    await adapter.process(req, res, async (ctx: TurnContext) => {
      await bot.run(ctx)
    })
  } catch (err) {
    logger.error('teamsBot webhook unexpected', { err: String(err) })
    captureException(err as Error, { tags: { hot_path: 'teams_bot_webhook' } })
    if (!res.headersSent) res.status(500).json({ error: 'internal' })
  }
})

// Endpoint de salud (sin auth) para confirmar deploy
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    enabled: BOT_ENABLED,
    appIdPrefix: BOT_APP_ID ? BOT_APP_ID.slice(0, 8) : null,
    tenantConfigured: !!process.env.BOT_TENANT_ID,
  })
})

export default router
