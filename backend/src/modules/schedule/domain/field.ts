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

// ── COLA DE INSTALACIÓN (para el móvil del Field Specialist) ─────────────────
// Proyectos con plan cuya entrega (I-07) todavía no ocurrió. Cada uno trae el
// estado de sus hitos de instalación (I-04..I-07) y cuántos ítems de punch list
// quedan abiertos, para que el móvil arme la lista sin más llamadas.
export interface InstallHito { codigo: string; nombre: string; fecha_real: string | null; fecha_planeada: string | null }
export interface InstallProyecto {
  proyecto_id: number; codigo: string; nombre: string; cliente: string | null
  fecha_objetivo: string | null; punch_abiertos: number; hitos: InstallHito[]
}

const INSTALL_CODES = ['I-04', 'I-05', 'I-06', 'I-07']

export async function listInstallQueue(runner: QueryRunner): Promise<InstallProyecto[]> {
  const { rows } = await runner.query<{
    proyecto_id: number; codigo: string; nombre: string; cliente: string | null
    fecha_objetivo: string | null; hito_codigo: string; hito_nombre: string
    fecha_real: string | null; fecha_planeada: string | null; punch_abiertos: string
  }>(
    `SELECT sp.proyecto_id, p.codigo, p.nombre, p.cliente,
            to_char(sp.fecha_objetivo,'YYYY-MM-DD') AS fecha_objetivo,
            sh.codigo AS hito_codigo, ph.nombre AS hito_nombre,
            to_char(sh.fecha_real,'YYYY-MM-DD') AS fecha_real,
            to_char(sh.fecha_planeada,'YYYY-MM-DD') AS fecha_planeada,
            (SELECT COUNT(*) FROM schedule_punch_items pi
              WHERE pi.proyecto_id = sp.proyecto_id AND pi.estado = 'abierto')::text AS punch_abiertos
       FROM schedule_planes sp
       JOIN proyectos p ON p.id = sp.proyecto_id
       JOIN schedule_hitos sh ON sh.plan_id = sp.id
       JOIN schedule_plantilla_hitos ph ON ph.plantilla_id = sp.plantilla_id AND ph.codigo = sh.codigo
      WHERE sp.scope = 'proyecto' AND sh.codigo = ANY($1)
        AND EXISTS (
          SELECT 1 FROM schedule_hitos i7 WHERE i7.plan_id = sp.id
            AND i7.codigo = 'I-07' AND i7.fecha_real IS NULL)
      ORDER BY sp.fecha_objetivo NULLS LAST, sp.proyecto_id, ph.orden`, [INSTALL_CODES])

  const porProyecto = new Map<number, InstallProyecto>()
  for (const r of rows) {
    let p = porProyecto.get(r.proyecto_id)
    if (!p) {
      p = {
        proyecto_id: r.proyecto_id, codigo: r.codigo, nombre: r.nombre, cliente: r.cliente,
        fecha_objetivo: r.fecha_objetivo, punch_abiertos: Number(r.punch_abiertos), hitos: [],
      }
      porProyecto.set(r.proyecto_id, p)
    }
    p.hitos.push({ codigo: r.hito_codigo, nombre: r.hito_nombre, fecha_real: r.fecha_real, fecha_planeada: r.fecha_planeada })
  }
  return [...porProyecto.values()]
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
