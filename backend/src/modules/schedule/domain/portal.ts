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

type QueryRunner = PoolClient | typeof pool

// Hitos que el cliente puede APROBAR desde el portal (estaciones de acción).
export const APROBABLES: Record<string, string> = {
  'E-05': 'Muestras de terminación',
  'E-07': 'Planos de taller (shop drawings)',
  'I-07': 'Entrega final (sign-off)',
}

// El "recorrido del cliente": los momentos donde el cliente participa, en orden.
// tipo 'accion'  → el cliente aprueba desde el portal (botón).
// tipo 'estado'  → lo registra su dueño (DocuSign/Contabilidad); el cliente solo lo ve.
export const CLIENT_MOMENTS: Array<{ codigo: string; label: string; tipo: 'accion' | 'estado' }> = [
  { codigo: 'C-03', label: 'Firma de contrato', tipo: 'estado' },
  { codigo: 'C-04', label: 'Down Payment',       tipo: 'estado' },
  { codigo: 'E-05', label: 'Muestras',           tipo: 'accion' },
  { codigo: 'E-07', label: 'Planos de taller',   tipo: 'accion' },
  { codigo: 'I-07', label: 'Entrega (sign-off)', tipo: 'accion' },
  { codigo: 'X-03', label: 'Pago final',         tipo: 'estado' },
]

export type Decision = 'aprobado' | 'aprobado_con_comentarios' | 'rechazado'

export interface TokenInfo {
  proyectoId: number
  contactoNombre: string | null
}

/** Crea un token de acceso al portal para un contacto del cliente. */
export async function crearToken(
  runner: QueryRunner,
  proyectoId: number,
  contactoNombre: string | null,
  contactoEmail: string | null,
  createdBy: string | null
): Promise<{ id: number; token: string }> {
  const token = crypto.randomBytes(24).toString('hex') // 48 chars, no adivinable
  const { rows } = await runner.query<{ id: number }>(
    `INSERT INTO schedule_portal_tokens (token, proyecto_id, contacto_nombre, contacto_email, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [token, proyectoId, contactoNombre, contactoEmail, createdBy])
  return { id: rows[0].id, token }
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
    `SELECT proyecto_id, contacto_nombre FROM schedule_portal_tokens WHERE token = $1 AND activo = true`,
    [token])
  if (!rows[0]) return null
  await runner.query(`UPDATE schedule_portal_tokens SET last_access_at = NOW() WHERE token = $1`, [token])
  return { proyectoId: rows[0].proyecto_id, contactoNombre: rows[0].contacto_nombre }
}

export interface VistaPublica {
  proyecto: { nombre: string; cliente: string; fecha_objetivo: string | null; semaforo: string }
  contacto: string | null
  // El recorrido del cliente: sus momentos, con estado en el camino.
  momentos: Array<{ codigo: string; label: string; tipo: 'accion' | 'estado'; estado: 'done' | 'now' | 'future' }>
  // Solo las aprobaciones que YA corresponden (predecesores cumplidos, sin resolver).
  pendientes: Array<{ codigo: string; titulo: string; fecha_planeada: string | null; documento_url?: string | null }>
}

/**
 * Vista de solo-lectura para el cliente: su recorrido (momentos) + las
 * aprobaciones que le tocan ahora. Curada: sin costos, sin vendors, sin el
 * recorrido interno de los 58 hitos.
 */
export async function getVistaPublica(runner: QueryRunner, token: string): Promise<VistaPublica | null> {
  const info = await resolverToken(runner, token)
  if (!info) return null

  const { rows: pr } = await runner.query<{ nombre: string; cliente: string; fo: string | null; semaforo: string }>(
    `SELECT p.nombre, p.cliente,
            to_char(sp.fecha_objetivo,'YYYY-MM-DD') AS fo, sp.semaforo
       FROM proyectos p
       JOIN schedule_planes sp ON sp.proyecto_id = p.id AND sp.scope = 'proyecto'
      WHERE p.id = $1 LIMIT 1`, [info.proyectoId])
  if (!pr[0]) return null

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

  // Recorrido: el primer momento no cumplido es "now"; los siguientes "future".
  let yaHuboNow = false
  const momentos = CLIENT_MOMENTS.map((m) => {
    const h = st.get(m.codigo)
    let estado: 'done' | 'now' | 'future'
    if (h?.tiene_real) estado = 'done'
    else if (!yaHuboNow) { estado = 'now'; yaHuboNow = true }
    else estado = 'future'
    return { codigo: m.codigo, label: m.label, tipo: m.tipo, estado }
  })

  // Pendientes: aprobables ACTIVOS (no bloqueados por predecesores, sin resolver).
  const pendientesBase = CLIENT_MOMENTS
    .filter((m) => m.tipo === 'accion' && APROBABLES[m.codigo])
    .map((m) => ({ m, h: st.get(m.codigo) }))
    .filter(({ h }) => h && !h.tiene_real && h.estado !== 'no_aplica')
    .map(({ m, h }) => ({ codigo: m.codigo, titulo: APROBABLES[m.codigo], fecha_planeada: h!.fp }))

  // Para la aprobación de planos, adjuntar el PDF del último submittal.
  const pendientes = await Promise.all(pendientesBase.map(async (p) =>
    p.codigo === 'E-07' ? { ...p, documento_url: await latestSubmittalUrl(runner, info.proyectoId) } : p))

  return {
    proyecto: { nombre: pr[0].nombre, cliente: pr[0].cliente, fecha_objetivo: pr[0].fo, semaforo: pr[0].semaforo },
    contacto: info.contactoNombre,
    momentos,
    pendientes,
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
): Promise<{ ok: boolean; error?: string }> {
  const info = await resolverToken(runner, token)
  if (!info) return { ok: false, error: 'token inválido' }
  if (!APROBABLES[codigo]) return { ok: false, error: 'ese hito no es aprobable por el cliente' }

  const { rows: sh } = await runner.query<{ id: number; fecha_real: string | null }>(
    `SELECT sh.id, sh.fecha_real
       FROM schedule_hitos sh JOIN schedule_planes sp ON sp.id = sh.plan_id
      WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = $2`,
    [info.proyectoId, codigo])
  if (!sh[0]) return { ok: false, error: 'hito no encontrado en el plan' }
  if (sh[0].fecha_real) return { ok: false, error: 'este hito ya fue resuelto' }
  // Freno hacia adelante (server-side): no aprobar si faltan pasos previos.
  if (decision === 'aprobado' || decision === 'aprobado_con_comentarios') {
    const bloqueo = await bloqueoPorPredecesores(runner, info.proyectoId, codigo)
    if (bloqueo) return { ok: false, error: bloqueo }
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

  await recomputeScheduleForProyecto(runner, info.proyectoId, 'manual')
  return { ok: true }
}
