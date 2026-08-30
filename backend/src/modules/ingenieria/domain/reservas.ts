// ─────────────────────────────────────────────────────────────────────────────
// Domain — Reserva de capacidad de Ingeniería
// ─────────────────────────────────────────────────────────────────────────────
// Cuando Estimados crea un proyecto factible, RESERVA los espacios de Ingeniería
// (tareas provisionales, origen='reserva'). Consumen capacidad → la próxima
// cotización cuenta con eso. El PM las CONFIRMA y asigna el ingeniero real.
// Se liberan (DELETE) si el proyecto se rechaza y no fueron confirmadas.
//
// Duraciones: hoy del catálogo (dur_dias_tipico). Cuando llegue el modelo por
// tamaño (histórico), solo cambia `duracionesPara`. Un único punto de cambio.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { calcularPlaneadas, HitoDef, DepDef } from '../../schedule/domain/motor'
import { loadFeriados, subBusinessDays, ISODate } from '../../schedule/domain/calendario'

type QueryRunner = PoolClient | typeof pool

// Tipos de tarea que son ESFUERZO DE INGENIERÍA (consumen capacidad de un ingeniero).
// Son las ÚNICAS etapas que llevan ingeniero asignado — coincide con el Excel real,
// donde solo shop_drawings y cnc traen ingeniero; el resto (fabricación, envío,
// instalación, compras…) es de otras áreas y va sin ingeniero.
export const RESERVA_CLAVES = ['shop_drawings', 'cnc']

async function dryRun(runner: QueryRunner, plantillaId: number, fecha: string): Promise<Map<string, ISODate>> {
  const { rows: h } = await runner.query<{ codigo: string; dur_dias_default: number; es_ancla: boolean }>(
    `SELECT codigo, dur_dias_default, es_ancla FROM schedule_plantilla_hitos WHERE plantilla_id = $1`, [plantillaId])
  const { rows: d } = await runner.query<{ hito_codigo: string; depende_de_codigo: string }>(
    `SELECT hito_codigo, depende_de_codigo FROM schedule_plantilla_dependencias WHERE plantilla_id = $1`, [plantillaId])
  const hitos: HitoDef[] = h.map((x) => ({ codigo: x.codigo, dur: x.dur_dias_default, es_ancla: x.es_ancla }))
  const deps: DepDef[] = d.map((x) => ({ hito: x.hito_codigo, dependeDe: x.depende_de_codigo }))
  const feriados = await loadFeriados(runner)
  return calcularPlaneadas(hitos, deps, fecha, feriados).planeadas
}

/** Duraciones (días hábiles) por tipo de tarea de la reserva.
 *  REGLA ACTIVADA (decisión de Chali): si el proyecto trae #ítems y el tipo define
 *  dias_por_item (shop drawings = 1 día/ítem, migración 057), la duración = ítems ×
 *  días-por-ítem. Sin #ítems, cae al catálogo (dur_dias_tipico). El presupuesto
 *  queda como gancho futuro. Único punto de cambio. */
async function duracionesPara(runner: QueryRunner, _presupuesto: number | null, itemsQty: number | null): Promise<Map<string, { id: number; nombre: string; hito: string | null; dur: number }>> {
  const { rows } = await runner.query<{ id: number; clave: string; nombre: string; hito_codigo: string | null; dur_dias_tipico: number | null; dias_por_item: number | null }>(
    `SELECT id, clave, nombre, hito_codigo, dur_dias_tipico, dias_por_item FROM ing_tarea_tipos WHERE clave = ANY($1)`, [RESERVA_CLAVES])
  const m = new Map<string, { id: number; nombre: string; hito: string | null; dur: number }>()
  for (const r of rows) {
    let dur = Math.max(1, r.dur_dias_tipico ?? 3)
    if (itemsQty != null && itemsQty > 0 && r.dias_por_item != null && Number(r.dias_por_item) > 0) {
      dur = Math.max(1, Math.round(itemsQty * Number(r.dias_por_item)))
    }
    m.set(r.clave, { id: r.id, nombre: r.nombre, hito: r.hito_codigo, dur })
  }
  return m
}

/** Propone el ingeniero MENOS cargado en la ventana [inicio, fin] (incluye a los
 *  que están totalmente libres). Es una propuesta: el PM la confirma o la cambia. */
export async function proponerIngeniero(runner: QueryRunner, inicio: string, fin: string): Promise<string | null> {
  // Fuente canónica de ingenieros = ing_ingenieros (activo). Fallback al pool histórico
  // (DISTINCT asignado_nombre) si la tabla estuviera vacía. Elige al MENOS cargado en la
  // ventana [inicio, fin]. Es una propuesta: el PM confirma o cambia.
  const { rows } = await runner.query<{ nombre: string }>(
    `WITH engs AS (
        SELECT nombre FROM ing_ingenieros WHERE activo
        UNION
        SELECT DISTINCT asignado_nombre FROM ing_tareas
         WHERE asignado_nombre IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM ing_ingenieros)
     )
     SELECT e.nombre
       FROM engs e
       LEFT JOIN ing_tareas t ON t.asignado_nombre = e.nombre AND t.estado NOT IN ('hecha','na')
            AND t.origen <> 'sugerencia'
            AND t.fecha_inicio <= $2 AND t.fecha_fin >= $1
      GROUP BY e.nombre
      ORDER BY COUNT(t.id) ASC, e.nombre
      LIMIT 1`, [inicio, fin])
  return rows[0]?.nombre ?? null
}

/** Crea la reserva de Ingeniería para un proyecto (idempotente). */
export async function crearReserva(runner: QueryRunner, proyectoId: number): Promise<{ creadas: number }> {
  const { rows: ya } = await runner.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ing_tareas WHERE proyecto_id = $1 AND origen = 'reserva'`, [proyectoId])
  if ((ya[0]?.n ?? 0) > 0) return { creadas: 0 }

  const { rows: planes } = await runner.query<{ plantilla_id: number; fecha: string; codigo: string; presupuesto: number | null; items_qty: number | null }>(
    `SELECT sp.plantilla_id, to_char(sp.fecha_objetivo,'YYYY-MM-DD') AS fecha, p.codigo, p.presupuesto, p.items_qty
       FROM schedule_planes sp JOIN proyectos p ON p.id = sp.proyecto_id
      WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto' LIMIT 1`, [proyectoId])
  if (!planes[0]) return { creadas: 0 }
  const { plantilla_id, fecha, codigo, presupuesto, items_qty } = planes[0]

  const planeadas = await dryRun(runner, plantilla_id, fecha)
  const feriados = await loadFeriados(runner)
  const tipos = await duracionesPara(runner, presupuesto, items_qty)

  // Recurso de CNC. HOY Santos es el único que hace CNC (= el cuello), así que la
  // reserva de CNC se propone para él. FUTURO: el objetivo es que cada ingeniero
  // genere sus propios CNC; cuando haya más de uno, cae a proponerIngeniero (menos
  // cargado). Sea como sea, es una PROPUESTA: el PM la confirma o la cambia.
  const { rows: cncEng } = await runner.query<{ asignado_nombre: string }>(
    `SELECT DISTINCT t.asignado_nombre FROM ing_tareas t JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
      WHERE tt.clave = 'cnc' AND t.asignado_nombre IS NOT NULL`)
  const cncRecurso = cncEng.length === 1 ? cncEng[0].asignado_nombre : null

  let creadas = 0
  for (const clave of RESERVA_CLAVES) {
    const t = tipos.get(clave)
    if (!t || !t.hito) continue
    const deadline = planeadas.get(t.hito)
    if (!deadline) continue
    const inicio = subBusinessDays(deadline, t.dur, feriados)
    // Toda tarea reservada lleva un ingeniero PROPUESTO (nunca vacía): CNC → Santos
    // (o el menos cargado si hubiera varios); el resto → el menos cargado en la ventana.
    const asignado = (clave === 'cnc' ? cncRecurso : null) ?? await proponerIngeniero(runner, inicio, deadline)
    await runner.query(
      `INSERT INTO ing_tareas (proyecto_ext, proyecto_id, tipo_id, nombre, asignado_nombre, allocation_pct, dur_dias, fecha_inicio, fecha_fin, estado, origen)
         VALUES ($1,$2,$3,$4,$5,1.0,$6,$7,$8,'pendiente','reserva')`,
      [codigo, proyectoId, t.id, `${t.nombre} (reserva)`, asignado, t.dur, inicio, deadline])
    creadas++
  }
  return { creadas }
}

export interface ReservaTarea { id: number; nombre: string; asignado_nombre: string | null; fecha_inicio: string | null; fecha_fin: string | null; tipo_clave: string | null }
export interface ReservaProyecto { proyecto_id: number; proyecto_codigo: string; proyecto_nombre: string; proyecto_ext: string | null; fecha_objetivo: string | null; tareas: ReservaTarea[] }

/** Planes SUGERIDOS pendientes de aceptación del PM (el deal está en 'esperando_pm').
 *  Son el plan completo (origen='sugerencia'); el PM los revisa/poda y acepta. */
export async function listReservasPendientes(runner: QueryRunner): Promise<ReservaProyecto[]> {
  const { rows } = await runner.query<ReservaTarea & { proyecto_id: number; proyecto_codigo: string; proyecto_nombre: string; proyecto_ext: string | null; fecha_objetivo: string | null }>(
    `SELECT t.id, t.nombre, t.asignado_nombre, tt.clave AS tipo_clave,
            to_char(t.fecha_inicio,'YYYY-MM-DD') AS fecha_inicio, to_char(t.fecha_fin,'YYYY-MM-DD') AS fecha_fin,
            p.id AS proyecto_id, p.codigo AS proyecto_codigo, p.nombre AS proyecto_nombre, t.proyecto_ext,
            to_char(sp.fecha_objetivo,'YYYY-MM-DD') AS fecha_objetivo
       FROM ing_tareas t
       JOIN proyectos p ON p.id = t.proyecto_id
       LEFT JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
       LEFT JOIN schedule_planes sp ON sp.proyecto_id = t.proyecto_id AND sp.scope = 'proyecto'
      WHERE t.origen = 'sugerencia'
      ORDER BY p.codigo, t.fecha_inicio`)
  const byP = new Map<number, ReservaProyecto>()
  for (const r of rows) {
    let g = byP.get(r.proyecto_id)
    if (!g) { g = { proyecto_id: r.proyecto_id, proyecto_codigo: r.proyecto_codigo, proyecto_nombre: r.proyecto_nombre, proyecto_ext: r.proyecto_ext, fecha_objetivo: r.fecha_objetivo, tareas: [] }; byP.set(r.proyecto_id, g) }
    g.tareas.push({ id: r.id, nombre: r.nombre, asignado_nombre: r.asignado_nombre, fecha_inicio: r.fecha_inicio, fecha_fin: r.fecha_fin, tipo_clave: r.tipo_clave })
  }
  return [...byP.values()]
}

/** El PM confirma la reserva de un proyecto y (opcional) asigna ingenieros. */
export async function confirmarReserva(
  runner: QueryRunner, proyectoId: number, usuarioId: string | null,
  asignaciones?: { id: number; asignado_nombre: string }[]
): Promise<{ confirmadas: number }> {
  if (asignaciones?.length) {
    for (const a of asignaciones) {
      await runner.query(`UPDATE ing_tareas SET asignado_nombre = $2, updated_at = NOW() WHERE id = $1 AND proyecto_id = $3 AND origen = 'reserva'`,
        [a.id, a.asignado_nombre || null, proyectoId])
    }
  }
  const { rowCount } = await runner.query(
    `UPDATE ing_tareas SET reserva_confirmada_at = NOW(), reserva_confirmada_por = $2, updated_at = NOW()
      WHERE proyecto_id = $1 AND origen = 'reserva' AND reserva_confirmada_at IS NULL`,
    [proyectoId, usuarioId])
  return { confirmadas: rowCount ?? 0 }
}

/** Libera (borra) la reserva NO confirmada de un proyecto (si se rechaza). */
export async function liberarReserva(runner: QueryRunner, proyectoId: number): Promise<{ liberadas: number }> {
  const { rowCount } = await runner.query(
    `DELETE FROM ing_tareas WHERE proyecto_id = $1 AND origen = 'reserva' AND reserva_confirmada_at IS NULL`, [proyectoId])
  return { liberadas: rowCount ?? 0 }
}
