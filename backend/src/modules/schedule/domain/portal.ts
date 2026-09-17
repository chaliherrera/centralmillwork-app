// ─────────────────────────────────────────────────────────────────────────────
// Domain — Portal de cliente (Life of a Deal, Etapa 2)
// ─────────────────────────────────────────────────────────────────────────────
// Acceso público por token (sin cuenta). El cliente ve el estado de su proyecto
// y aprueba los hitos que dependen de él. Cada aprobación llena el hito con
// fecha real + autoría (P2). NUNCA se exponen costos, vendors ni márgenes —
// el schedule no los contiene, y esta capa solo devuelve estado y fechas.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto'
import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { recomputeScheduleForProyecto } from './recompute'
import { latestSubmittalUrl, marcarRespuestaSubmittal } from './submittals'
import { bloqueoPorPredecesores } from './gates'
import { logger } from '../../../utils/logger'
import { captureException } from '../../../utils/sentry'

type QueryRunner = PoolClient | typeof pool

// Hitos que el cliente puede APROBAR desde el portal (estaciones de acción).
// Textos EN inglés: el portal es para clientes US (decisión Q1). Solo se usan
// como etiqueta cara-al-cliente; el resto de los usos de APROBABLES son booleanos.
export const APROBABLES: Record<string, string> = {
  'E-05': 'Samples',
  'E-07': 'Shop drawings',
  'I-07': 'Final delivery (sign-off)',
}

// El "recorrido del cliente": los momentos donde el cliente participa, en orden.
// tipo 'accion'  → el cliente aprueba desde el portal (botón).
// tipo 'estado'  → lo registra su dueño (DocuSign/Contabilidad); el cliente solo lo ve.
// Labels EN inglés (portal cara-al-cliente, Q1).
export const CLIENT_MOMENTS: Array<{ codigo: string; label: string; tipo: 'accion' | 'estado' }> = [
  { codigo: 'PLAN', label: 'Plan approval',     tipo: 'accion' }, // el cliente lo aprueba desde el portal (mueve el deal)
  { codigo: 'C-03', label: 'Contract signed',   tipo: 'estado' },
  { codigo: 'C-04', label: 'Down payment',      tipo: 'estado' },
  { codigo: 'E-05', label: 'Samples',           tipo: 'accion' },
  { codigo: 'E-07', label: 'Shop drawings',     tipo: 'accion' },
  { codigo: 'I-07', label: 'Delivery sign-off', tipo: 'accion' },
  { codigo: 'X-03', label: 'Final payment',     tipo: 'estado' },
]

// Etiqueta (para el cliente) de cada código con el que decide, para el historial.
const LABEL_MOMENTO: Record<string, string> = Object.fromEntries(
  CLIENT_MOMENTS.map((m) => [m.codigo, m.label]))
// Rev A/B/C… a partir del número de versión del submittal.
const revLabel = (n: number) => `Rev ${String.fromCharCode(64 + n)}`

// Cronograma POR FASES para el cliente (Q6): cada paso de la ruta (tipo_clave) va
// a una fase cara-al-cliente. Se muestran solo las fases que el proyecto tiene.
const PHASE_OF: Record<string, string> = {
  po_execution: 'contract', material_deposit: 'contract',
  meeting_designer: 'engineering', long_leads: 'engineering', shop_drawings: 'engineering',
  samples: 'engineering', client_review: 'engineering', approval: 'engineering',
  field_measurements: 'engineering', sd_update: 'engineering', release: 'engineering',
  material_proc: 'materials',
  cnc: 'production', fabrication: 'production',
  shipment: 'installation', installation: 'installation',
  stone_measure: 'countertops', stone_fab: 'countertops', stone_install: 'countertops',
}
const PHASE_DEF: Array<{ key: string; label: string; detalle: string }> = [
  { key: 'contract',    label: 'Contract',     detalle: 'Signed & deposit received' },
  { key: 'engineering', label: 'Engineering',  detalle: 'Shop drawings & samples' },
  { key: 'materials',   label: 'Materials',    detalle: 'Procurement & delivery' },
  { key: 'production',  label: 'Production',    detalle: 'Fabrication in the shop' },
  { key: 'installation',label: 'Installation', detalle: 'Delivery & on-site install' },
  { key: 'countertops', label: 'Countertops',  detalle: 'Stone measure, fab & install' },
]

// Tareas del Gantt en las que participa el cliente (se resaltan en el portal):
// firma de contrato, depósito, aprobación de muestras, revisión y aprobación de planos.
export const CLIENT_TASK_CLAVES = new Set<string>(['po_execution', 'material_deposit', 'samples', 'client_review', 'approval'])

export type Decision = 'aprobado' | 'aprobado_con_comentarios' | 'rechazado'

export interface TokenInfo {
  proyectoId: number
  contactoNombre: string | null
}

// Vida por defecto de un link nuevo del portal (días). Cubre proyectos típicos;
// si un proyecto se estira, el PM genera un link nuevo desde la gestión de links.
const PORTAL_TOKEN_DIAS_DEFAULT = 180

/** Crea un token de acceso al portal para un contacto del cliente. */
export async function crearToken(
  runner: QueryRunner,
  proyectoId: number,
  contactoNombre: string | null,
  contactoEmail: string | null,
  createdBy: string | null,
  expiraEnDias: number = PORTAL_TOKEN_DIAS_DEFAULT,
): Promise<{ id: number; token: string }> {
  const token = crypto.randomBytes(24).toString('hex') // 48 chars, no adivinable
  const { rows } = await runner.query<{ id: number }>(
    `INSERT INTO schedule_portal_tokens (token, proyecto_id, contacto_nombre, contacto_email, created_by, expires_at)
       VALUES ($1,$2,$3,$4,$5, NOW() + ($6 || ' days')::interval) RETURNING id`,
    [token, proyectoId, contactoNombre, contactoEmail, createdBy, String(expiraEnDias)])
  return { id: rows[0].id, token }
}

/** Asegura que el proyecto tenga un token de portal ACTIVO para este contacto:
 *  si ya hay uno, le completa/actualiza nombre y email; si no, lo crea. Lo usa el
 *  "envío consciente" de planos, para que el destinatario tenga acceso + reciba el
 *  email. Devuelve el token (para armar el link). */
export async function asegurarContactoPortal(
  runner: QueryRunner, proyectoId: number, nombre: string | null, email: string | null, createdBy: string | null,
): Promise<{ token: string }> {
  const { rows } = await runner.query<{ id: number; token: string }>(
    `SELECT id, token FROM schedule_portal_tokens
      WHERE proyecto_id = $1 AND activo = true AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC LIMIT 1`, [proyectoId])
  const ex = rows[0]
  if (ex) {
    // Actualiza solo con valores no vacíos (no borra lo que ya había).
    await runner.query(
      `UPDATE schedule_portal_tokens
          SET contacto_nombre = COALESCE(NULLIF($2,''), contacto_nombre),
              contacto_email  = COALESCE(NULLIF($3,''), contacto_email)
        WHERE id = $1`, [ex.id, nombre ?? '', email ?? ''])
    return { token: ex.token }
  }
  const nuevo = await crearToken(runner, proyectoId, nombre, email, createdBy)
  return { token: nuevo.token }
}

/** Revoca (desactiva) un token del portal. Deja de funcionar de inmediato. */
export async function revocarToken(runner: QueryRunner, proyectoId: number, tokenId: number): Promise<boolean> {
  const { rowCount } = await runner.query(
    `UPDATE schedule_portal_tokens SET activo = false WHERE id = $1 AND proyecto_id = $2 AND activo = true`,
    [tokenId, proyectoId])
  return (rowCount ?? 0) > 0
}

/** Valida un token activo y devuelve a qué proyecto/contacto corresponde. */
export async function resolverToken(runner: QueryRunner, token: string): Promise<TokenInfo | null> {
  const { rows } = await runner.query<{ proyecto_id: number; contacto_nombre: string | null }>(
    `SELECT proyecto_id, contacto_nombre FROM schedule_portal_tokens
      WHERE token = $1 AND activo = true AND (expires_at IS NULL OR expires_at > NOW())`,
    [token])
  if (!rows[0]) return null
  await runner.query(`UPDATE schedule_portal_tokens SET last_access_at = NOW() WHERE token = $1`, [token])
  return { proyectoId: rows[0].proyecto_id, contactoNombre: rows[0].contacto_nombre }
}

export interface VistaPublica {
  proyecto: { nombre: string; cliente: string; fecha_objetivo: string | null; semaforo: string }
  contacto: string | null
  // El recorrido del cliente: sus momentos, con estado en el camino.
  // 'na' = no aplica a este proyecto (no bloquea el journey).
  momentos: Array<{ codigo: string; label: string; tipo: 'accion' | 'estado'; estado: 'done' | 'now' | 'future' | 'na' }>
  // Solo las aprobaciones que YA corresponden (predecesores cumplidos, sin resolver).
  pendientes: Array<{ codigo: string; titulo: string; fecha_planeada: string | null; documento_url?: string | null }>
  // El Gantt completo del proyecto (la propuesta): tareas con fechas; las del cliente marcadas.
  gantt: Array<{ nombre: string; inicio: string | null; fin: string | null; estado: string; es_cliente: boolean }>
  // Cronograma POR FASES para el cliente (solo las fases que el proyecto tiene).
  fases: Array<{ key: string; label: string; detalle: string; inicio: string | null; fin: string | null; estado: 'done' | 'now' | 'future'; n_done: number; n_total: number }>
  // Historial "tus decisiones": lo que el cliente ya aprobó/rechazó/comentó (más reciente primero).
  decisiones: Array<{ fecha: string; que: string; decision: 'aprobado' | 'aprobado_con_comentarios' | 'rechazado'; comentario: string | null }>
  // Estado post-decisión de los planos (mensaje "mientras tanto"), o null si no aplica.
  planosEstado: { rev: string; estado: 'cambios' | 'aprobado'; mensaje: string } | null
}

/**
 * Vista de solo-lectura para el cliente: su recorrido (momentos) + las
 * aprobaciones que le tocan ahora. Curada: sin costos, sin vendors, sin el
 * recorrido interno de los 58 hitos.
 */
export async function getVistaPublica(runner: QueryRunner, token: string): Promise<VistaPublica | null> {
  const info = await resolverToken(runner, token)
  if (!info) return null
  return armarVistaPublica(runner, info.proyectoId, info.contactoNombre)
}

/** Arma la vista del portal a partir del proyecto (sin token). La usan el portal
 *  público (vía getVistaPublica) y la CONSOLA de admin (preview del portal). */
export async function armarVistaPublica(
  runner: QueryRunner, proyectoId: number, contactoNombre: string | null,
): Promise<VistaPublica | null> {
  const info = { proyectoId, contactoNombre }

  const { rows: pr } = await runner.query<{ nombre: string; cliente: string; fo: string | null; semaforo: string; deal_estado: string }>(
    `SELECT p.nombre, p.cliente, p.deal_estado,
            -- El cliente ve la fecha COMUNICADA (fecha_cliente); la interna del PM no filtra.
            to_char(COALESCE(sp.fecha_cliente, sp.fecha_objetivo),'YYYY-MM-DD') AS fo, sp.semaforo
       FROM proyectos p
       JOIN schedule_planes sp ON sp.proyecto_id = p.id AND sp.scope = 'proyecto'
      WHERE p.id = $1 LIMIT 1`, [info.proyectoId])
  if (!pr[0]) return null
  // El cliente ya aprobó el plan cuando el deal llegó a 'aprobado' (queda en ese
  // estado también tras activar el proyecto). Los proyectos heredados (pre
  // máquina de deals, los 28 de prod) tienen deal_estado NULL: son proyectos ya
  // activos cuyo plan está aprobado de facto. Tratamos NULL como aprobado — si
  // no, el momento "Aprobación del plan" queda trabado en "now" sin ninguna
  // acción posible (planPendiente solo aparece con 'esperando_cliente') y el
  // journey del cliente se ve roto.
  const planAprobado = pr[0].deal_estado === 'aprobado' || pr[0].deal_estado == null

  // Estado de los hitos que son "momentos del cliente"
  const codigos = CLIENT_MOMENTS.map((m) => m.codigo)
  const { rows } = await runner.query<{ codigo: string; estado: string; fp: string | null; tiene_real: boolean }>(
    `SELECT sh.codigo, sh.estado, to_char(sh.fecha_planeada,'YYYY-MM-DD') AS fp,
            (sh.fecha_real IS NOT NULL) AS tiene_real
       FROM schedule_hitos sh
       JOIN schedule_planes sp ON sp.id = sh.plan_id
      WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = ANY($2)`,
    [info.proyectoId, codigos])
  const st = new Map(rows.map((r) => [r.codigo, r]))

  // Recorrido del cliente, respetando pasos EN PARALELO y los NO_APLICA:
  //   done   = ya cumplido (lo ve tildado)
  //   na     = no aplica a este proyecto (p.ej. sin muestras / sin piedra) → no bloquea
  //   now    = está en marcha / le toca ahora
  //   future = todavía no arrancó
  // Varios momentos pueden estar 'now' a la vez: muestras (E-05) y planos (E-07)
  // suelen ir en paralelo. Antes la lógica era estrictamente secuencial (el primer
  // no-cumplido = 'now', el resto 'future') e ignoraba los no_aplica.
  const hoyISO = new Date().toISOString().slice(0, 10)
  const momentos = CLIENT_MOMENTS.map((m) => {
    const h = st.get(m.codigo)
    // 'PLAN' no es un hito del schedule: su estado sale del deal (aprobación del cliente).
    const cumplido = m.codigo === 'PLAN' ? planAprobado : (h?.tiene_real ?? false)
    let estado: 'done' | 'now' | 'future' | 'na'
    if (cumplido) estado = 'done'
    else if (h?.estado === 'no_aplica') estado = 'na'
    else {
      // En marcha si ya está en riesgo/vencido, o si su fecha planeada ya llegó.
      // PLAN pendiente: en marcha cuando el deal está esperando la respuesta del cliente.
      const enMarcha = m.codigo === 'PLAN'
        ? pr[0].deal_estado === 'esperando_cliente'
        : (h?.estado === 'vencido' || h?.estado === 'en_riesgo' || (h?.fp != null && h.fp <= hoyISO))
      estado = enMarcha ? 'now' : 'future'
    }
    return { codigo: m.codigo, label: m.label, tipo: m.tipo, estado }
  })
  // Si nada quedó 'now' (todo lo activo es futuro), destacamos el próximo como 'now'
  // para que el cliente siempre vea "qué sigue" (sin inventar un paso no_aplica).
  if (!momentos.some((x) => x.estado === 'now')) {
    const next = momentos.find((x) => x.estado === 'future')
    if (next) next.estado = 'now'
  }

  // E-05 (muestras) solo es aprobable en el portal si hay una muestra ENVIADA
  // esperando respuesta del cliente (Q3). Sin muestra enviada, no se ofrece.
  const { countMuestrasEnviadas } = await import('../../muestras/domain/respuestaCliente')
  const muestrasEnviadas = await countMuestrasEnviadas(runner, info.proyectoId)

  // Pendientes: aprobables ACTIVOS (no bloqueados por predecesores, sin resolver).
  const pendientesBase = CLIENT_MOMENTS
    .filter((m) => m.tipo === 'accion' && APROBABLES[m.codigo])
    .map((m) => ({ m, h: st.get(m.codigo) }))
    .filter(({ m, h }) => h && !h.tiene_real && h.estado !== 'no_aplica'
      && (m.codigo !== 'E-05' || muestrasEnviadas > 0))
    .map(({ m, h }) => ({ codigo: m.codigo, titulo: APROBABLES[m.codigo], fecha_planeada: h!.fp }))

  // Para la aprobación de planos, adjuntar el PDF del último submittal.
  const pendientes = await Promise.all(pendientesBase.map(async (p) =>
    p.codigo === 'E-07' ? { ...p, documento_url: await latestSubmittalUrl(runner, info.proyectoId) } : p))

  // 'Aprobación del plan': acción del cliente mientras el deal espera su OK. Va primero.
  const planPendiente = pr[0].deal_estado === 'esperando_cliente'
    ? [{ codigo: 'PLAN', titulo: 'Aprobación del plan de trabajo', fecha_planeada: null as string | null }]
    : []

  // El Gantt completo (la propuesta): todas las tareas con fecha; se marcan las del cliente.
  // Sin costos ni responsables — el schedule no los tiene y esta capa es pública.
  const { rows: gr } = await runner.query<{ nombre: string; inicio: string | null; fin: string | null; estado: string; clave: string | null }>(
    `SELECT t.nombre, to_char(t.fecha_inicio,'YYYY-MM-DD') AS inicio, to_char(t.fecha_fin,'YYYY-MM-DD') AS fin,
            t.estado, tt.clave
       FROM ing_tareas t
       LEFT JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
      WHERE t.proyecto_id = $1 AND t.fecha_inicio IS NOT NULL AND t.fecha_fin IS NOT NULL AND t.estado <> 'na'
      ORDER BY t.fecha_inicio, t.id`, [info.proyectoId])
  const gantt = gr.map((g) => ({ nombre: g.nombre, inicio: g.inicio, fin: g.fin, estado: g.estado, es_cliente: !!g.clave && CLIENT_TASK_CLAVES.has(g.clave) }))

  // Cronograma POR FASES (Q6): agrupa las tareas de la ruta por fase cara-al-cliente.
  const fMap = new Map<string, { inicio: string | null; fin: string | null; nTotal: number; nDone: number; nStarted: number }>()
  for (const g of gr) {
    const pk = PHASE_OF[g.clave ?? '']
    if (!pk) continue
    const a = fMap.get(pk) ?? { inicio: null, fin: null, nTotal: 0, nDone: 0, nStarted: 0 }
    a.nTotal++
    if (g.estado === 'hecha') { a.nDone++; a.nStarted++ }
    else if (g.estado === 'en_curso') a.nStarted++
    if (g.inicio && (!a.inicio || g.inicio < a.inicio)) a.inicio = g.inicio
    if (g.fin && (!a.fin || g.fin > a.fin)) a.fin = g.fin
    fMap.set(pk, a)
  }
  const fases = PHASE_DEF.filter((p) => fMap.has(p.key)).map((p) => {
    const a = fMap.get(p.key)!
    const estado: 'done' | 'now' | 'future' = a.nDone === a.nTotal ? 'done' : a.nStarted > 0 ? 'now' : 'future'
    return { key: p.key, label: p.label, detalle: p.detalle, inicio: a.inicio, fin: a.fin, estado, n_done: a.nDone, n_total: a.nTotal }
  })

  // Historial "tus decisiones": lo que el cliente aprobó/rechazó/comentó desde el
  // portal (schedule_eventos disparados por el portal). Le da constancia de sus
  // respuestas y cierra el círculo de cada decisión.
  const { rows: dec } = await runner.query<{ hito_codigo: string | null; fecha: string; payload: { decision?: string; comentario?: string } | null }>(
    `SELECT ev.hito_codigo, to_char(ev.created_at,'YYYY-MM-DD') AS fecha, ev.payload
       FROM schedule_eventos ev
       JOIN schedule_planes sp ON sp.id = ev.plan_id
      WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND ev.disparado_por = 'portal'
      ORDER BY ev.created_at DESC`, [info.proyectoId])
  const decisiones = dec.map((d) => ({
    fecha: d.fecha,
    que: (d.hito_codigo && LABEL_MOMENTO[d.hito_codigo]) || 'Tu proyecto',
    decision: (d.payload?.decision as 'aprobado' | 'aprobado_con_comentarios' | 'rechazado' | undefined) ?? 'aprobado',
    comentario: d.payload?.comentario ?? null,
  }))

  // Estado post-decisión de los planos: si el cliente pidió cambios en la última
  // revisión, el equipo prepara la siguiente. Le contamos ese "mientras tanto"
  // (si no, el portal no mostraba nada entre el rechazo y la Rev siguiente).
  const { rows: sub } = await runner.query<{ version_numero: number; estado: string | null }>(
    `SELECT version_numero, estado FROM schedule_submittals
      WHERE proyecto_id = $1 ORDER BY version_numero DESC LIMIT 1`, [info.proyectoId])
  let planosEstado: { rev: string; estado: 'cambios' | 'aprobado'; mensaje: string } | null = null
  if (sub[0]?.estado) {
    const rev = revLabel(sub[0].version_numero)
    if (sub[0].estado === 'rechazado' || sub[0].estado === 'aprobado_con_comentarios') {
      planosEstado = { rev, estado: 'cambios', mensaje: `You requested changes to the shop drawings (${rev}). Our team is preparing the next version for your review.` }
    } else if (sub[0].estado === 'aprobado') {
      planosEstado = { rev, estado: 'aprobado', mensaje: `You approved the shop drawings (${rev}). Your project has moved into production.` }
    }
  }

  return {
    proyecto: { nombre: pr[0].nombre, cliente: pr[0].cliente, fecha_objetivo: pr[0].fo, semaforo: pr[0].semaforo },
    contacto: info.contactoNombre,
    momentos,
    pendientes: [...planPendiente, ...pendientes],
    gantt,
    fases,
    decisiones,
    planosEstado,
  }
}

/**
 * Aplica la decisión del cliente sobre un hito aprobable. Aprobar/aprobar-con-
 * comentarios completa el hito con fecha real + autoría; rechazar solo registra
 * el evento (el hito sigue pendiente). Recalcula el schedule al final.
 */
export async function aplicarAprobacion(
  runner: QueryRunner,
  token: string,
  codigo: string,
  decision: Decision,
  comentario: string | null
): Promise<{ ok: boolean; error?: string; proyectoId?: number }> {
  const info = await resolverToken(runner, token)
  // Mensajes de error del portal EN INGLÉS (los ve el cliente, Q1).
  if (!info) return { ok: false, error: 'Invalid or expired link.' }

  // 'PLAN' no es un hito del schedule: es la aprobación del plan por el cliente, que
  // mueve el deal a 'aprobado'. Se resuelve acá y no sigue por la lógica de hitos.
  if (codigo === 'PLAN') {
    if (decision === 'aprobado' || decision === 'aprobado_con_comentarios') {
      const { registrarAprobacionCliente } = await import('../../ingenieria/domain/plan_inicial')
      const r = await registrarAprobacionCliente(runner, info.proyectoId)
      if (!r.ok) return { ok: false, error: 'This plan isn\'t ready for approval yet.' }
    }
    // Traza de la decisión (best-effort): no debe frenar la aprobación.
    try {
      const { rows: plan } = await runner.query<{ id: number }>(
        `SELECT id FROM schedule_planes WHERE proyecto_id = $1 AND scope = 'proyecto'`, [info.proyectoId])
      if (plan[0]) await runner.query(
        `INSERT INTO schedule_eventos (plan_id, hito_codigo, tipo, descripcion, disparado_por, payload)
           VALUES ($1,'PLAN','fecha_real',$2,'portal',$3::jsonb)`,
        [plan[0].id, `Cliente${info.contactoNombre ? ` (${info.contactoNombre})` : ''}: ${decision.replace(/_/g, ' ')} — Aprobación del plan`,
         JSON.stringify({ source: 'portal', contacto: info.contactoNombre, decision, comentario: comentario || undefined })])
    } catch { /* traza best-effort */ }
    return { ok: true, proyectoId: info.proyectoId }
  }

  if (!APROBABLES[codigo]) return { ok: false, error: 'This item isn\'t available for your approval.' }

  const { rows: sh } = await runner.query<{ id: number; fecha_real: string | null }>(
    `SELECT sh.id, sh.fecha_real
       FROM schedule_hitos sh JOIN schedule_planes sp ON sp.id = sh.plan_id
      WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = $2`,
    [info.proyectoId, codigo])
  if (!sh[0]) return { ok: false, error: 'Item not found.' }
  if (sh[0].fecha_real) return { ok: false, error: 'This item was already resolved.' }
  // Freno hacia adelante (server-side): no aprobar si faltan pasos previos.
  if (decision === 'aprobado' || decision === 'aprobado_con_comentarios') {
    const bloqueo = await bloqueoPorPredecesores(runner, info.proyectoId, codigo)
    // El detalle de predecesores es interno (español) → mensaje genérico al cliente.
    if (bloqueo) return { ok: false, error: 'This step isn\'t ready to approve yet — an earlier step is still in progress.' }
  }

  const evidencia = JSON.stringify({
    source: 'portal', contacto: info.contactoNombre, decision, comentario: comentario || undefined,
  })

  const { rows: plan } = await runner.query<{ id: number }>(
    `SELECT id FROM schedule_planes WHERE proyecto_id = $1 AND scope = 'proyecto'`, [info.proyectoId])

  if (decision === 'aprobado' || decision === 'aprobado_con_comentarios') {
    await runner.query(
      `UPDATE schedule_hitos SET fecha_real = NOW(), evidencia_ref = $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [sh[0].id, evidencia])
  }
  await runner.query(
    `INSERT INTO schedule_eventos (plan_id, hito_codigo, tipo, descripcion, disparado_por, payload)
       VALUES ($1,$2,'fecha_real',$3,'portal',$4::jsonb)`,
    [plan[0].id, codigo,
     `Cliente${info.contactoNombre ? ` (${info.contactoNombre})` : ''}: ${decision.replace(/_/g, ' ')} — ${APROBABLES[codigo]}`,
     evidencia])

  // Si es la aprobación de planos, dejar registro en el submittal correspondiente.
  if (codigo === 'E-07') {
    await marcarRespuestaSubmittal(runner, info.proyectoId, decision, comentario).catch(() => {})
  }

  // Cablear la decisión del cliente a la RUTA de ingeniería (escritorio del rol que sigue):
  // E-07 aprobado→cierra gate / rechazado→reabre planos / con comentarios→a sd_update;
  // E-05 muestras→avisa al ingeniero. Import dinámico (evita ciclo schedule↔ingenieria).
  try {
    const { sincronizarDecisionCliente } = await import('../../ingenieria/domain/tareas')
    await sincronizarDecisionCliente(runner, info.proyectoId, codigo, decision, comentario)
  } catch (err) {
    // Best-effort: no romper la respuesta del portal. Pero NO tragar el error en
    // silencio: si falla, el cliente ve "aprobado" y la ruta de Ingeniería no avanza,
    // y nadie se entera. Lo dejamos visible en logs + Sentry para diagnosticarlo.
    logger.error('portal: sincronizarDecisionCliente falló', {
      proyectoId: info.proyectoId, codigo, decision, err: (err as Error)?.message,
    })
    captureException(err, { tags: { area: 'portal_sync' }, extra: { proyectoId: info.proyectoId, codigo, decision } })
  }

  await recomputeScheduleForProyecto(runner, info.proyectoId, 'manual')
  return { ok: true, proyectoId: info.proyectoId }
}
