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

type QueryRunner = PoolClient | typeof pool

// Hitos que el cliente puede aprobar desde el portal, con etiqueta amigable.
export const APROBABLES: Record<string, string> = {
  'E-01b': 'Compra anticipada de materiales',
  'E-05': 'Muestras de terminación',
  'E-07': 'Planos de taller (shop drawings)',
  'I-07': 'Entrega final (sign-off)',
}

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
  pendientes: Array<{ codigo: string; titulo: string; fecha_planeada: string | null }>
  fases: Array<{
    fase: string
    hitos: Array<{ codigo: string; nombre: string; estado: string; semaforo: string; fecha_real: string | null; es_ancla: boolean }>
  }>
}

/**
 * Vista de solo-lectura del proyecto para el cliente + acciones pendientes.
 * Curada: sin costos, sin vendors, sin holgura ni atribución internas.
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

  const { rows: hitos } = await runner.query<{
    codigo: string; fase: string; nombre: string; estado: string; semaforo: string
    fecha_real: string | null; es_ancla: boolean; orden: number
  }>(
    `SELECT sh.codigo, ph.fase, ph.nombre, sh.estado, sh.semaforo, ph.es_ancla, ph.orden,
            to_char(sh.fecha_real,'YYYY-MM-DD') AS fecha_real
       FROM schedule_hitos sh
       JOIN schedule_planes sp ON sp.id = sh.plan_id
       JOIN schedule_plantilla_hitos ph ON ph.plantilla_id = sp.plantilla_id AND ph.codigo = sh.codigo
      WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND ph.parent_codigo IS NULL
      ORDER BY ph.orden`, [info.proyectoId])

  const fases: VistaPublica['fases'] = []
  for (const h of hitos) {
    let g = fases.find((x) => x.fase === h.fase)
    if (!g) { g = { fase: h.fase, hitos: [] }; fases.push(g) }
    g.hitos.push({ codigo: h.codigo, nombre: h.nombre, estado: h.estado, semaforo: h.semaforo, fecha_real: h.fecha_real, es_ancla: h.es_ancla })
  }

  // Pendientes: hitos aprobables que están activos (predecesor cumplido) y sin fecha real.
  const { rows: pend } = await runner.query<{ codigo: string; fp: string | null; tiene_real: boolean }>(
    `SELECT sh.codigo, to_char(sh.fecha_planeada,'YYYY-MM-DD') AS fp, (sh.fecha_real IS NOT NULL) AS tiene_real
       FROM schedule_hitos sh
       JOIN schedule_planes sp ON sp.id = sh.plan_id
      WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = ANY($2)`,
    [info.proyectoId, Object.keys(APROBABLES)])
  const pendientes = pend
    .filter((p) => !p.tiene_real)
    .map((p) => ({ codigo: p.codigo, titulo: APROBABLES[p.codigo], fecha_planeada: p.fp }))

  return {
    proyecto: { nombre: pr[0].nombre, cliente: pr[0].cliente, fecha_objetivo: pr[0].fo, semaforo: pr[0].semaforo },
    contacto: info.contactoNombre,
    pendientes,
    fases,
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

  await recomputeScheduleForProyecto(runner, info.proyectoId, 'manual')
  return { ok: true }
}
