// ─────────────────────────────────────────────────────────────────────────────
// Domain — Archivos por hito (Ingeniería: CNC, etc.)
// ─────────────────────────────────────────────────────────────────────────────
// Adjunta un archivo (ya subido a storage por el controller) a un hito y lo
// completa con evidencia real (P2). Primer uso: archivos CNC de E-11. Solo
// hitos manual_futuro que no son del cliente ni instrumentados.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../../../utils/supabase'
import { recomputeScheduleForProyecto } from './recompute'
import { APROBABLES } from './portal'
import { bloqueoPorPredecesores } from './gates'

type QueryRunner = PoolClient | typeof pool
const SIGNED_TTL = 3600

export interface ArchivoHito {
  id: number; original_name: string | null; size_bytes: number | null; created_at: string; url: string | null
}

async function signed(filename: string): Promise<string | null> {
  if (!supabaseEnabled || !supabase) return null
  const { data } = await supabase.storage.from(SUPABASE_BUCKET).createSignedUrl(filename, SIGNED_TTL)
  return data?.signedUrl ?? null
}

export interface SubirResult { ok: boolean; error?: string; id?: number }

/** Adjunta un archivo a un hito y lo completa (si no lo estaba). */
export interface SubirArchivoOpts {
  // Cola offline del móvil: idempotencia + hora/lugar reales de la obra.
  clientId?: string | null
  clientTs?: string | null
  gps?: { lat: number; lng: number } | null
}

export async function subirArchivoHito(
  runner: QueryRunner,
  proyectoId: number,
  codigo: string,
  file: { filename: string; original_name: string; size: number },
  usuarioId: string | null,
  nota?: string | null,
  opts: SubirArchivoOpts = {}
): Promise<SubirResult> {
  const { rows } = await runner.query<{ fuente_dato: string; fecha_real: string | null }>(
    `SELECT ph.fuente_dato, sh.fecha_real
       FROM schedule_hitos sh
       JOIN schedule_planes sp ON sp.id = sh.plan_id
       JOIN schedule_plantilla_hitos ph ON ph.plantilla_id = sp.plantilla_id AND ph.codigo = sh.codigo
      WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = $2`, [proyectoId, codigo])
  const h = rows[0]
  if (!h) return { ok: false, error: 'hito no encontrado en el plan' }
  if (h.fuente_dato !== 'manual_futuro' || APROBABLES[codigo])
    return { ok: false, error: 'este hito no admite archivos por acá' }
  // Freno hacia adelante: si este archivo completaría el hito, exigir que los
  // pasos previos ya estén cumplidos (no adjuntar el archivo si no).
  if (!h.fecha_real) {
    const bloqueo = await bloqueoPorPredecesores(runner, proyectoId, codigo)
    if (bloqueo) return { ok: false, error: bloqueo }
  }

  const clientId = opts.clientId ?? null
  const ins = await runner.query<{ id: number }>(
    `INSERT INTO schedule_hito_archivos (proyecto_id, hito_codigo, filename, original_name, size_bytes, subido_por, client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (client_id) WHERE client_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [proyectoId, codigo, file.filename, file.original_name, file.size, usuarioId, clientId])

  // Reintento de la cola offline (mismo client_id): no re-completar ni duplicar.
  if (!ins.rows[0]) {
    const { rows: ex } = await runner.query<{ id: number }>(
      `SELECT id FROM schedule_hito_archivos WHERE client_id = $1`, [clientId])
    return { ok: true, id: ex[0]?.id }
  }

  // Completar el hito si aún no tenía fecha real (el primer archivo lo cierra).
  // fecha_real usa la hora REAL de la obra (client_ts) si vino; si no, NOW().
  if (!h.fecha_real) {
    const evidencia = JSON.stringify({
      source: 'archivo', archivo: file.original_name, nota: nota || undefined,
      gps: opts.gps ?? undefined,
    })
    await runner.query(
      `UPDATE schedule_hitos sh SET fecha_real = COALESCE($4::timestamptz, NOW()), evidencia_ref = $3::jsonb, updated_at = NOW()
         FROM schedule_planes sp
        WHERE sp.id = sh.plan_id AND sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = $2`,
      [proyectoId, codigo, evidencia, opts.clientTs ?? null])
  }
  await recomputeScheduleForProyecto(runner, proyectoId, 'manual')
  return { ok: true, id: ins.rows[0].id }
}

export async function listArchivosHito(runner: QueryRunner, proyectoId: number, codigo: string): Promise<ArchivoHito[]> {
  const { rows } = await runner.query<{ id: number; original_name: string | null; size_bytes: number | null; created_at: string; filename: string }>(
    `SELECT id, original_name, size_bytes, filename, to_char(created_at,'YYYY-MM-DD') AS created_at
       FROM schedule_hito_archivos WHERE proyecto_id = $1 AND hito_codigo = $2 ORDER BY created_at DESC`,
    [proyectoId, codigo])
  return Promise.all(rows.map(async (r) => ({
    id: r.id, original_name: r.original_name, size_bytes: r.size_bytes, created_at: r.created_at, url: await signed(r.filename),
  })))
}
