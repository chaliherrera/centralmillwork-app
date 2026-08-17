// ─────────────────────────────────────────────────────────────────────────────
// Domain — Submittals de planos (Ingeniería)
// ─────────────────────────────────────────────────────────────────────────────
// Ingeniería emite los shop drawings al cliente. El primer submittal (Rev A)
// completa E-06 (planos emitidos); las revisiones (Rev B…) completan E-08. El
// cliente ve el PDF real en el portal y aprueba/rechaza sobre él (E-07).
// El PDF ya viene subido a Supabase por el controller; acá se registra + se
// completa el hito correspondiente con evidencia (P2).
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../../../utils/supabase'
import { recomputeScheduleForProyecto } from './recompute'
import { bloqueoPorPredecesores } from './gates'

type QueryRunner = PoolClient | typeof pool
const SIGNED_TTL = 3600

export interface Submittal {
  id: number
  version_numero: number
  version_label: string
  original_name: string | null
  estado: string
  comentarios_cliente: string | null
  created_at: string
  url: string | null
}

const revLabel = (n: number) => `Rev ${String.fromCharCode(64 + n)}` // 1→Rev A

async function signed(filename: string): Promise<string | null> {
  if (!supabaseEnabled || !supabase) return null
  const { data } = await supabase.storage.from(SUPABASE_BUCKET).createSignedUrl(filename, SIGNED_TTL)
  return data?.signedUrl ?? null
}

/**
 * Registra un submittal ya subido a storage y completa el hito que corresponde
 * (E-06 si es la Rev A, E-08 si es una revisión). Recalcula el schedule.
 */
export type CrearSubmittalResult =
  | { ok: true; id: number; version_numero: number; version_label: string }
  | { ok: false; error: string }

export async function crearSubmittal(
  runner: QueryRunner,
  proyectoId: number,
  file: { filename: string; original_name: string; size: number },
  usuarioId: string | null
): Promise<CrearSubmittalResult> {
  const { rows: mx } = await runner.query<{ v: number }>(
    `SELECT COALESCE(MAX(version_numero), 0) AS v FROM schedule_submittals WHERE proyecto_id = $1`, [proyectoId])
  const version = Number(mx[0]?.v ?? 0) + 1

  // Rev A → E-06 (planos emitidos); revisiones → E-08 (resubmittal).
  const codigo = version === 1 ? 'E-06' : 'E-08'
  // Freno hacia adelante: no emitir si faltan pasos previos (no crear el registro).
  const bloqueo = await bloqueoPorPredecesores(runner, proyectoId, codigo)
  if (bloqueo) return { ok: false, error: bloqueo }

  const { rows } = await runner.query<{ id: number }>(
    `INSERT INTO schedule_submittals (proyecto_id, version_numero, filename, original_name, size_bytes, emitido_por)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [proyectoId, version, file.filename, file.original_name, file.size, usuarioId])
  const submittalId = rows[0].id

  const evidencia = JSON.stringify({ source: 'submittal', version, submittal_id: submittalId, archivo: file.original_name })
  await runner.query(
    `UPDATE schedule_hitos sh SET fecha_real = NOW(), evidencia_ref = $3::jsonb, updated_at = NOW()
       FROM schedule_planes sp
      WHERE sp.id = sh.plan_id AND sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = $2`,
    [proyectoId, codigo, evidencia])

  await recomputeScheduleForProyecto(runner, proyectoId, 'manual')
  return { ok: true, id: submittalId, version_numero: version, version_label: revLabel(version) }
}

/** Lista los submittals del proyecto (más nuevo primero), con URL firmada. */
export async function listSubmittals(runner: QueryRunner, proyectoId: number): Promise<Submittal[]> {
  const { rows } = await runner.query<{
    id: number; version_numero: number; original_name: string | null; estado: string
    comentarios_cliente: string | null; created_at: string; filename: string
  }>(
    `SELECT id, version_numero, original_name, estado, comentarios_cliente, filename,
            to_char(created_at,'YYYY-MM-DD') AS created_at
       FROM schedule_submittals WHERE proyecto_id = $1 ORDER BY version_numero DESC`, [proyectoId])
  return Promise.all(rows.map(async (r) => ({
    id: r.id, version_numero: r.version_numero, version_label: revLabel(r.version_numero),
    original_name: r.original_name, estado: r.estado, comentarios_cliente: r.comentarios_cliente,
    created_at: r.created_at, url: await signed(r.filename),
  })))
}

/** El submittal más reciente (para el portal: que el cliente vea el PDF). */
export async function latestSubmittalUrl(runner: QueryRunner, proyectoId: number): Promise<string | null> {
  const { rows } = await runner.query<{ filename: string }>(
    `SELECT filename FROM schedule_submittals WHERE proyecto_id = $1 ORDER BY version_numero DESC LIMIT 1`, [proyectoId])
  if (!rows[0]) return null
  return signed(rows[0].filename)
}

/** Marca la respuesta del cliente sobre el último submittal (desde el portal). */
export async function marcarRespuestaSubmittal(
  runner: QueryRunner, proyectoId: number, estado: string, comentarios: string | null
): Promise<void> {
  await runner.query(
    `UPDATE schedule_submittals SET estado = $2, comentarios_cliente = $3, respondido_at = NOW()
      WHERE id = (SELECT id FROM schedule_submittals WHERE proyecto_id = $1 ORDER BY version_numero DESC LIMIT 1)`,
    [proyectoId, estado, comentarios])
}
