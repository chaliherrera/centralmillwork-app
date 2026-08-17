// ─────────────────────────────────────────────────────────────────────────────
// Domain — Checklist de instalación por item (OP) de cada proyecto
// ─────────────────────────────────────────────────────────────────────────────
// La lista de cosas a instalar de un proyecto = sus Órdenes de Producción
// (ordenes_produccion). Se deriva en vivo; acá solo guardamos el "instalado ✓"
// por item (op_id) con su foto y autor. Cuando TODOS los items del proyecto
// están instalados, el hito I-05 "Instalación en curso" se completa solo (P2).
// Si se desmarca uno y ya no están todos, I-05 vuelve a pendiente.
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

export interface InstallItem {
  op_id: number
  numero_orden: string
  numero_item: string
  cantidad: number
  unidad: string | null
  op_status: string
  instalado: boolean
  foto_url: string | null
  nota: string | null
  instalado_at: string | null
}

/** Lista de items a instalar de un proyecto (OPs + estado de instalación). */
export async function listInstallItems(runner: QueryRunner, proyectoId: number): Promise<InstallItem[]> {
  const { rows } = await runner.query<{
    op_id: number; numero_orden: string; numero_item: string; cantidad: number
    unidad: string | null; op_status: string; foto: string | null; nota: string | null
    instalado_at: string | null
  }>(
    `SELECT op.id AS op_id, op.numero_orden, op.numero_item, op.cantidad, op.unidad,
            op.status AS op_status, ii.foto, ii.nota,
            to_char(ii.instalado_at,'YYYY-MM-DD') AS instalado_at
       FROM ordenes_produccion op
       LEFT JOIN schedule_install_items ii ON ii.op_id = op.id AND ii.proyecto_id = op.proyecto_id
      WHERE op.proyecto_id = $1 AND op.status <> 'Cancelada'
      ORDER BY (ii.id IS NOT NULL), op.numero_item, op.id`, [proyectoId])
  return Promise.all(rows.map(async (r) => ({
    op_id: r.op_id, numero_orden: r.numero_orden, numero_item: r.numero_item,
    cantidad: r.cantidad, unidad: r.unidad, op_status: r.op_status,
    instalado: r.instalado_at !== null, foto_url: await signed(r.foto), nota: r.nota,
    instalado_at: r.instalado_at,
  })))
}

/** Cuenta total de items y cuántos instalados, para progreso. */
export async function contarInstall(runner: QueryRunner, proyectoId: number): Promise<{ total: number; instalados: number }> {
  const { rows } = await runner.query<{ total: string; instalados: string }>(
    `SELECT COUNT(op.*)::text AS total,
            COUNT(ii.id)::text AS instalados
       FROM ordenes_produccion op
       LEFT JOIN schedule_install_items ii ON ii.op_id = op.id AND ii.proyecto_id = op.proyecto_id
      WHERE op.proyecto_id = $1 AND op.status <> 'Cancelada'`, [proyectoId])
  return { total: Number(rows[0].total), instalados: Number(rows[0].instalados) }
}

/** Setea o limpia I-05 según si TODOS los items están instalados. */
async function sincronizarI05(runner: QueryRunner, proyectoId: number) {
  const { total, instalados } = await contarInstall(runner, proyectoId)
  const completo = total > 0 && instalados === total
  if (completo) {
    await runner.query(
      `UPDATE schedule_hitos sh SET fecha_real = COALESCE(fecha_real, NOW()),
              evidencia_ref = $2::jsonb, updated_at = NOW()
         FROM schedule_planes sp
        WHERE sp.id = sh.plan_id AND sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = 'I-05'`,
      [proyectoId, JSON.stringify({ source: 'install_items', total })])
  } else {
    // Si dejó de estar completo, I-05 vuelve a pendiente (evidencia manda).
    await runner.query(
      `UPDATE schedule_hitos sh SET fecha_real = NULL, evidencia_ref = NULL, updated_at = NOW()
         FROM schedule_planes sp
        WHERE sp.id = sh.plan_id AND sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = 'I-05'`,
      [proyectoId])
  }
}

/** Marca un item como instalado (upsert). Completa I-05 si quedan todos. */
export async function marcarInstalado(
  runner: QueryRunner, proyectoId: number, opId: number,
  foto: string | null, nota: string | null, usuarioId: string | null
): Promise<{ ok: boolean; error?: string }> {
  // El OP debe pertenecer al proyecto.
  const { rows } = await runner.query<{ id: number }>(
    `SELECT id FROM ordenes_produccion WHERE id = $1 AND proyecto_id = $2`, [opId, proyectoId])
  if (!rows[0]) return { ok: false, error: 'el item no pertenece a este proyecto' }

  await runner.query(
    `INSERT INTO schedule_install_items (proyecto_id, op_id, foto, nota, instalado_por)
       VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (proyecto_id, op_id) DO UPDATE
       SET foto = COALESCE(EXCLUDED.foto, schedule_install_items.foto),
           nota = COALESCE(EXCLUDED.nota, schedule_install_items.nota),
           instalado_por = EXCLUDED.instalado_por, instalado_at = NOW()`,
    [proyectoId, opId, foto, nota, usuarioId])

  await sincronizarI05(runner, proyectoId)
  await recomputeScheduleForProyecto(runner, proyectoId, 'op')
  return { ok: true }
}

/** Deshace la instalación de un item. Si ya no están todos, I-05 vuelve a pendiente. */
export async function desmarcarInstalado(
  runner: QueryRunner, proyectoId: number, opId: number
): Promise<{ ok: boolean }> {
  await runner.query(`DELETE FROM schedule_install_items WHERE proyecto_id = $1 AND op_id = $2`, [proyectoId, opId])
  await sincronizarI05(runner, proyectoId)
  await recomputeScheduleForProyecto(runner, proyectoId, 'op')
  return { ok: true }
}
