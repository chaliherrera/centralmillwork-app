// ─────────────────────────────────────────────────────────────────────────────
// Domain — Field / Install: punch list + sign-off en obra
// ─────────────────────────────────────────────────────────────────────────────
// Lo que el Field Specialist releva desde el móvil, en la obra:
//   · Check-in (I-04) y avance (I-05) → reusan el endpoint de archivo/foto.
//   · Punch list (I-06) → ítems con foto de problema/resuelto; al resolverse
//     todos, I-06 se completa solo.
//   · Sign-off del cliente en obra (I-07) → firma capturada in situ; completa
//     I-07 (alternativa al portal).
// Todo con evidencia real (P2). Fotos en Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { supabase, supabaseEnabled, SUPABASE_BUCKET } from '../../../utils/supabase'
import { recomputeScheduleForProyecto } from './recompute'

type QueryRunner = PoolClient | typeof pool
const SIGNED_TTL = 3600

async function signed(filename: string | null): Promise<string | null> {
  if (!filename || !supabaseEnabled || !supabase) return null
  const { data } = await supabase.storage.from(SUPABASE_BUCKET).createSignedUrl(filename, SIGNED_TTL)
  return data?.signedUrl ?? null
}

async function completarHito(runner: QueryRunner, proyectoId: number, codigo: string, evidencia: object) {
  await runner.query(
    `UPDATE schedule_hitos sh SET fecha_real = NOW(), evidencia_ref = $3::jsonb, updated_at = NOW()
       FROM schedule_planes sp
      WHERE sp.id = sh.plan_id AND sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = $2
        AND sh.fecha_real IS NULL`,
    [proyectoId, codigo, JSON.stringify(evidencia)])
}

// ── PUNCH LIST ───────────────────────────────────────────────────────────────
export interface PunchItem {
  id: number; descripcion: string; area: string | null; estado: string
  foto_problema_url: string | null; foto_resuelto_url: string | null; created_at: string
}

export async function crearPunchItem(
  runner: QueryRunner, proyectoId: number, descripcion: string, area: string | null,
  fotoProblema: string | null, usuarioId: string | null
): Promise<{ id: number }> {
  const { rows } = await runner.query<{ id: number }>(
    `INSERT INTO schedule_punch_items (proyecto_id, descripcion, area, foto_problema, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [proyectoId, descripcion, area, fotoProblema, usuarioId])
  return { id: rows[0].id }
}

export async function resolverPunchItem(
  runner: QueryRunner, itemId: number, fotoResuelto: string | null, usuarioId: string | null
): Promise<{ ok: boolean; proyectoId?: number }> {
  const { rows } = await runner.query<{ proyecto_id: number }>(
    `UPDATE schedule_punch_items
        SET estado = 'resuelto', foto_resuelto = COALESCE($2, foto_resuelto),
            resolved_by = $3, resolved_at = NOW()
      WHERE id = $1 AND estado <> 'resuelto' RETURNING proyecto_id`,
    [itemId, fotoResuelto, usuarioId])
  if (!rows[0]) return { ok: false }
  const proyectoId = rows[0].proyecto_id

  // ¿Quedan ítems abiertos? Si no, y hay al menos uno, se completa I-06.
  const { rows: cnt } = await runner.query<{ abiertos: string; total: string }>(
    `SELECT COUNT(*) FILTER (WHERE estado = 'abierto')::text AS abiertos, COUNT(*)::text AS total
       FROM schedule_punch_items WHERE proyecto_id = $1`, [proyectoId])
  if (Number(cnt[0].total) > 0 && Number(cnt[0].abiertos) === 0) {
    await completarHito(runner, proyectoId, 'I-06', { source: 'punch_list', total: Number(cnt[0].total) })
  }
  await recomputeScheduleForProyecto(runner, proyectoId, 'op')
  return { ok: true, proyectoId }
}

export async function listPunch(runner: QueryRunner, proyectoId: number): Promise<PunchItem[]> {
  const { rows } = await runner.query<{
    id: number; descripcion: string; area: string | null; estado: string
    foto_problema: string | null; foto_resuelto: string | null; created_at: string
  }>(
    `SELECT id, descripcion, area, estado, foto_problema, foto_resuelto,
            to_char(created_at,'YYYY-MM-DD') AS created_at
       FROM schedule_punch_items WHERE proyecto_id = $1 ORDER BY created_at DESC, id DESC`, [proyectoId])
  return Promise.all(rows.map(async (r) => ({
    id: r.id, descripcion: r.descripcion, area: r.area, estado: r.estado,
    foto_problema_url: await signed(r.foto_problema), foto_resuelto_url: await signed(r.foto_resuelto),
    created_at: r.created_at,
  })))
}

// El check-in (I-04) y el avance (I-05) son manual_futuro no-APROBABLES: reusan
// el endpoint de archivo/foto existente (POST .../hito/:codigo/archivo). No
// necesitan lógica propia acá.

// ── SIGN-OFF DEL CLIENTE EN OBRA (completa I-07) ─────────────────────────────
export async function registrarSignoff(
  runner: QueryRunner, proyectoId: number, nombreCliente: string | null, firma: string | null
): Promise<void> {
  await completarHito(runner, proyectoId, 'I-07',
    { source: 'field_signoff', cliente: nombreCliente || undefined, firma: firma || undefined })
  await recomputeScheduleForProyecto(runner, proyectoId, 'op')
}
