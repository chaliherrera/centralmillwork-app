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
import { bloqueoPorPredecesores } from './gates'

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
  fecha_objetivo: string | null; punch_abiertos: number
  items_total: number; items_instalados: number; hitos: InstallHito[]
}

const INSTALL_CODES = ['I-04', 'I-05', 'I-06', 'I-07']

export async function listInstallQueue(runner: QueryRunner): Promise<InstallProyecto[]> {
  const { rows } = await runner.query<{
    proyecto_id: number; codigo: string; nombre: string; cliente: string | null
    fecha_objetivo: string | null; hito_codigo: string; hito_nombre: string
    fecha_real: string | null; fecha_planeada: string | null; punch_abiertos: string
    items_total: string; items_instalados: string
  }>(
    `SELECT sp.proyecto_id, p.codigo, p.nombre, p.cliente,
            to_char(sp.fecha_objetivo,'YYYY-MM-DD') AS fecha_objetivo,
            sh.codigo AS hito_codigo, ph.nombre AS hito_nombre,
            to_char(sh.fecha_real,'YYYY-MM-DD') AS fecha_real,
            to_char(sh.fecha_planeada,'YYYY-MM-DD') AS fecha_planeada,
            (SELECT COUNT(*) FROM schedule_punch_items pi
              WHERE pi.proyecto_id = sp.proyecto_id AND pi.estado = 'abierto')::text AS punch_abiertos,
            (SELECT COUNT(*) FROM ordenes_produccion op
              WHERE op.proyecto_id = sp.proyecto_id AND op.status <> 'Cancelada'
                AND op.tipo IS DISTINCT FROM 'MUESTRA')::text AS items_total,
            (SELECT COUNT(*) FROM schedule_install_items si
              WHERE si.proyecto_id = sp.proyecto_id)::text AS items_instalados
       FROM schedule_planes sp
       JOIN proyectos p ON p.id = sp.proyecto_id
       JOIN schedule_hitos sh ON sh.plan_id = sp.id
       JOIN schedule_plantilla_hitos ph ON ph.plantilla_id = sp.plantilla_id AND ph.codigo = sh.codigo
      WHERE sp.scope = 'proyecto' AND sh.codigo = ANY($1)
        AND EXISTS (
          SELECT 1 FROM schedule_hitos i7 WHERE i7.plan_id = sp.id
            AND i7.codigo = 'I-07' AND i7.fecha_real IS NULL)
        -- Gate del handoff (Chali 2026-09-08): Campo verifica en el móvil SOLO después de
        -- que el PM inició la instalación (tarea 'installation' en_curso). Antes de eso el
        -- proyecto no aparece en la cola.
        AND EXISTS (
          SELECT 1 FROM ing_tareas t
            JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
            JOIN ing_proyectos ip ON ip.proyecto_ext = t.proyecto_ext
           WHERE ip.proyecto_id = sp.proyecto_id AND tt.clave = 'installation' AND t.estado = 'en_curso')
      ORDER BY sp.fecha_objetivo NULLS LAST, sp.proyecto_id, ph.orden`, [INSTALL_CODES])

  const porProyecto = new Map<number, InstallProyecto>()
  for (const r of rows) {
    let p = porProyecto.get(r.proyecto_id)
    if (!p) {
      p = {
        proyecto_id: r.proyecto_id, codigo: r.codigo, nombre: r.nombre, cliente: r.cliente,
        fecha_objetivo: r.fecha_objetivo, punch_abiertos: Number(r.punch_abiertos),
        items_total: Number(r.items_total), items_instalados: Number(r.items_instalados), hitos: [],
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
  foto_problema_url: string | null; foto_resuelto_url: string | null
  nota_resuelto: string | null; created_at: string
}

export async function crearPunchItem(
  runner: QueryRunner, proyectoId: number, descripcion: string, area: string | null,
  fotoProblema: string | null, usuarioId: string | null,
  // Cola offline: clientId = idempotency key del teléfono (reintento no duplica);
  // clientTs = hora real en que se creó en obra (no la hora en que volvió la señal).
  clientId: string | null = null, clientTs: string | null = null
): Promise<{ id: number }> {
  const { rows } = await runner.query<{ id: number }>(
    `INSERT INTO schedule_punch_items (proyecto_id, descripcion, area, foto_problema, created_by, client_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7::timestamptz, NOW()))
     ON CONFLICT (client_id) WHERE client_id IS NOT NULL
       DO UPDATE SET descripcion = schedule_punch_items.descripcion
     RETURNING id`,
    [proyectoId, descripcion, area, fotoProblema, usuarioId, clientId, clientTs])
  return { id: rows[0].id }
}

export async function resolverPunchItem(
  runner: QueryRunner, itemId: number, fotoResuelto: string | null, usuarioId: string | null,
  nota: string | null = null
): Promise<{ ok: boolean; already?: boolean; proyectoId?: number }> {
  const { rows } = await runner.query<{ proyecto_id: number }>(
    `UPDATE schedule_punch_items
        SET estado = 'resuelto', foto_resuelto = COALESCE($2, foto_resuelto),
            nota_resuelto = COALESCE($4, nota_resuelto),
            resolved_by = $3, resolved_at = NOW()
      WHERE id = $1 AND estado <> 'resuelto' RETURNING proyecto_id`,
    [itemId, fotoResuelto, usuarioId, nota])
  if (!rows[0]) {
    // Idempotencia (reintento de la cola offline): si ya estaba resuelto, es éxito
    // silencioso; si no existe, sí es error real.
    const { rows: ex } = await runner.query<{ proyecto_id: number; estado: string }>(
      `SELECT proyecto_id, estado FROM schedule_punch_items WHERE id = $1`, [itemId])
    if (ex[0]?.estado === 'resuelto') return { ok: true, already: true, proyectoId: ex[0].proyecto_id }
    return { ok: false }
  }
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
    foto_problema: string | null; foto_resuelto: string | null; nota_resuelto: string | null; created_at: string
  }>(
    `SELECT id, descripcion, area, estado, foto_problema, foto_resuelto, nota_resuelto,
            to_char(created_at,'YYYY-MM-DD') AS created_at
       FROM schedule_punch_items WHERE proyecto_id = $1 ORDER BY created_at DESC, id DESC`, [proyectoId])
  return Promise.all(rows.map(async (r) => ({
    id: r.id, descripcion: r.descripcion, area: r.area, estado: r.estado,
    foto_problema_url: await signed(r.foto_problema), foto_resuelto_url: await signed(r.foto_resuelto),
    nota_resuelto: r.nota_resuelto, created_at: r.created_at,
  })))
}

// El check-in (I-04) y el avance (I-05) son manual_futuro no-APROBABLES: reusan
// el endpoint de archivo/foto existente (POST .../hito/:codigo/archivo). No
// necesitan lógica propia acá.

// ── SIGN-OFF DEL CLIENTE EN OBRA (completa I-07) ─────────────────────────────
export async function registrarSignoff(
  runner: QueryRunner, proyectoId: number, nombreCliente: string | null, firma: string | null
): Promise<{ ok: boolean; already?: boolean; error?: string }> {
  // Idempotencia (reintento de la cola offline): si I-07 ya se registró, éxito
  // silencioso — no re-corremos gates ni recompute.
  const { rows: done } = await runner.query<{ fecha_real: string | null }>(
    `SELECT sh.fecha_real FROM schedule_hitos sh
       JOIN schedule_planes sp ON sp.id = sh.plan_id
      WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = 'I-07'`, [proyectoId])
  if (done[0]?.fecha_real) return { ok: true, already: true }

  // Punch list sin defectos: I-06 solo se cierra solo al RESOLVER un punch item
  // existente (resolverPunchItem), así que una instalación sin defectos nunca lo
  // cerraba y el sign-off quedaba trabado. Si no quedan defectos ABIERTOS, el punch
  // list está satisfecho → cerramos I-06 acá. Si hay defectos abiertos NO se cierra,
  // y el freno de predecesores de abajo bloquea el sign-off como corresponde.
  const { rows: pu } = await runner.query<{ abiertos: string }>(
    `SELECT count(*) FILTER (WHERE estado = 'abierto')::text AS abiertos
       FROM schedule_punch_items WHERE proyecto_id = $1`, [proyectoId])
  if (Number(pu[0]?.abiertos ?? 0) === 0) {
    await completarHito(runner, proyectoId, 'I-06', { source: 'punch_list', sin_defectos: true })
  }
  // Freno hacia adelante (server-side): no cerrar la entrega si faltan pasos
  // previos (punch list, instalación…). Antes esto solo lo frenaba la UI móvil.
  const bloqueo = await bloqueoPorPredecesores(runner, proyectoId, 'I-07')
  if (bloqueo) return { ok: false, error: bloqueo }
  await completarHito(runner, proyectoId, 'I-07',
    { source: 'field_signoff', cliente: nombreCliente || undefined, firma: firma || undefined })
  await recomputeScheduleForProyecto(runner, proyectoId, 'op')
  return { ok: true }
}

// ── REPORTE DE DAÑO / FALTANTE EN OBRA (→ tarea al PM) ───────────────────────
// Field reporta desde el móvil un daño o faltante encontrado en obra. NO es un
// punch item (decisión de Chali 2026-09-20: "solo al PM"): crea una tarea en el
// escritorio del PM del proyecto (área 'administracion', que ve PROJECT_MANAGEMENT).
// El código del proyecto va en `subject` (el filtro por proyecto busca ahí; la
// tabla tareas no tiene proyecto_id). Idempotente por source_ref (índice único
// parcial cuando origen='sistema'): un reintento de la cola offline no duplica.
export async function crearReporteObra(
  runner: QueryRunner, proyectoId: number, descripcion: string,
  fotoUrl: string | null, clientId: string | null, usuario: string | null
): Promise<{ ok: boolean; error?: string }> {
  const { rows: p } = await runner.query<{ codigo: string; nombre: string }>(
    `SELECT codigo, nombre FROM proyectos WHERE id = $1`, [proyectoId])
  if (!p[0]) return { ok: false, error: 'Proyecto no encontrado' }

  const ref = `obra:${proyectoId}:${clientId ?? Date.now()}`
  const cuerpo = `Reporte de obra${usuario ? ` — ${usuario}` : ''}:\n\n${descripcion}` +
    (fotoUrl ? `\n\nFoto: ${fotoUrl}` : '')

  await runner.query(
    `INSERT INTO tareas (area, title, description, priority, from_email, subject, source_email_id, origen, source_ref)
       VALUES ('administracion',$1,$2,'high','sistema@centralmillwork.com',$3,NULL,'sistema',$4)
     ON CONFLICT (source_ref) WHERE origen='sistema' AND source_ref IS NOT NULL DO NOTHING`,
    [`Reporte de obra: ${p[0].codigo} — ${p[0].nombre}`,
     cuerpo,
     `Reporte de obra: ${p[0].codigo}`,
     ref])
  return { ok: true }
}
