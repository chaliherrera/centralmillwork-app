// ─────────────────────────────────────────────────────────────────────────────
// Domain — Generación y recálculo del plan de un proyecto
// ─────────────────────────────────────────────────────────────────────────────
// Orquesta el motor (fechas planeadas hacia atrás) + la captura de fechas
// reales + el semáforo, y persiste todo en schedule_hitos / schedule_planes /
// schedule_eventos.
//
// recomputeScheduleForProyecto() es el "hook" que otros módulos llaman DENTRO
// de su transacción (recepciones, producción, OC) — mismo patrón que
// recomputeMaterialesEstadoForOC. Es idempotente y barato de re-correr.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { calcularPlaneadas, HitoDef, DepDef } from './motor'
import { capturarFechasReales } from './captura'
import { loadFeriados, businessDaysBetween, ISODate } from './calendario'
import { logger } from '../../../utils/logger'

type QueryRunner = PoolClient | typeof pool
type Disparador = 'recepcion' | 'op' | 'oc' | 'manual' | 'cron'

const HOLGURA_VERDE = 3 // días hábiles

function todayISO(): ISODate {
  const t = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}

/** Mapea el rol responsable del hito al área para atribución de atrasos. */
function areaFromRol(rol: string | null): string {
  const r = (rol ?? '').toLowerCase()
  if (r.includes('estimat')) return 'estimating'
  if (r.includes('engineer')) return 'engineering'
  if (r.includes('procurement')) return 'procurement'
  if (r.includes('production') || r.includes('shop')) return 'production'
  if (r.includes('logistics')) return 'logistics'
  if (r.includes('field')) return 'field'
  if (r.includes('cfo') || r.includes('financial') || r.includes('office')) return 'finance'
  if (r.includes('pm')) return 'pm'
  return r || 'sin_asignar'
}

interface PlantillaHito {
  codigo: string
  dur_dias_default: number
  es_ancla: boolean
  rol_responsable: string | null
}

/**
 * Crea el plan de schedule de un proyecto a partir de una plantilla.
 * @returns el id del plan creado.
 * @throws si el proyecto ya tiene plan (scope proyecto) o la plantilla no existe.
 */
export async function generarPlan(
  runner: QueryRunner,
  proyectoId: number,
  fechaObjetivo: ISODate,
  plantillaNombre = 'Millwork estándar'
): Promise<number> {
  const { rows: pl } = await runner.query<{ id: number }>(
    `SELECT id FROM schedule_plantillas WHERE nombre = $1 AND activa = true`, [plantillaNombre])
  if (!pl[0]) throw new Error(`Plantilla "${plantillaNombre}" no encontrada.`)
  const plantillaId = pl[0].id

  const { rows: existing } = await runner.query<{ id: number }>(
    `SELECT id FROM schedule_planes WHERE proyecto_id = $1 AND scope = 'proyecto'`, [proyectoId])
  if (existing[0]) throw new Error('El proyecto ya tiene un plan de schedule.')

  const { rows: plan } = await runner.query<{ id: number }>(
    `INSERT INTO schedule_planes (proyecto_id, plantilla_id, scope, fecha_objetivo, fecha_objetivo_original)
       VALUES ($1, $2, 'proyecto', $3, $3) RETURNING id`,
    [proyectoId, plantillaId, fechaObjetivo])
  const planId = plan[0].id

  // Esqueleto de hitos (uno por hito de la plantilla)
  await runner.query(
    `INSERT INTO schedule_hitos (plan_id, codigo)
       SELECT $1, codigo FROM schedule_plantilla_hitos WHERE plantilla_id = $2`,
    [planId, plantillaId])

  await recomputeScheduleForProyecto(runner, proyectoId, 'manual')
  return planId
}

export interface RecomputeResult {
  skipped: boolean
  planId?: number
  semaforo?: string
  holguraDias?: number | null
}

/**
 * Recalcula el plan del proyecto: fechas planeadas + reales + semáforo, y
 * persiste. No hace nada si el proyecto no tiene plan.
 */
export async function recomputeScheduleForProyecto(
  runner: QueryRunner,
  proyectoId: number,
  disparadoPor: 'recepcion' | 'op' | 'oc' | 'manual' | 'cron' = 'manual'
): Promise<RecomputeResult> {
  const { rows: planes } = await runner.query<{ id: number; plantilla_id: number; fecha_objetivo: string }>(
    `SELECT id, plantilla_id, to_char(fecha_objetivo,'YYYY-MM-DD') AS fecha_objetivo
       FROM schedule_planes WHERE proyecto_id = $1 AND scope = 'proyecto' LIMIT 1`, [proyectoId])
  const plan = planes[0]
  if (!plan) return { skipped: true }

  const { rows: hitosRows } = await runner.query<PlantillaHito>(
    `SELECT codigo, dur_dias_default, es_ancla, rol_responsable
       FROM schedule_plantilla_hitos WHERE plantilla_id = $1`, [plan.plantilla_id])
  const { rows: depRows } = await runner.query<{ hito_codigo: string; depende_de_codigo: string }>(
    `SELECT hito_codigo, depende_de_codigo
       FROM schedule_plantilla_dependencias WHERE plantilla_id = $1`, [plan.plantilla_id])

  const hitos: HitoDef[] = hitosRows.map((h) => ({ codigo: h.codigo, dur: h.dur_dias_default, es_ancla: h.es_ancla }))
  const deps: DepDef[] = depRows.map((d) => ({ hito: d.hito_codigo, dependeDe: d.depende_de_codigo }))
  const rolPorCodigo = new Map(hitosRows.map((h) => [h.codigo, h.rol_responsable]))

  const feriados = await loadFeriados(runner)
  const { planeadas } = calcularPlaneadas(hitos, deps, plan.fecha_objetivo, feriados)
  const reales = await capturarFechasReales(runner, proyectoId)
  const hoy = todayISO()

  // pred map para lógica "gris" (predecesores sin cumplir)
  const pred = new Map<string, string[]>()
  for (const h of hitos) pred.set(h.codigo, [])
  for (const d of deps) pred.get(d.hito)?.push(d.dependeDe)
  const cumplidos = new Set<string>()
  for (const [c, cap] of reales) if (cap.fecha_real) cumplidos.add(c)

  let peor = 'gris'
  let minHolgura: number | null = null
  const rank: Record<string, number> = { gris: 0, verde: 1, amarillo: 2, rojo: 3 }

  for (const h of hitos) {
    const planeada = planeadas.get(h.codigo) ?? null
    const cap = reales.get(h.codigo)
    const fechaReal = cap?.fecha_real ?? null

    let estado: string
    let semaforo: string
    let holgura: number | null = null
    let atribucion: string | null = null
    let proyectada = planeada

    if (fechaReal) {
      estado = 'cumplido'
      semaforo = 'verde'
      proyectada = fechaReal
      if (planeada) {
        holgura = businessDaysBetween(fechaReal, planeada, feriados) // + = cumplido antes
        if (holgura < 0) atribucion = areaFromRol(rolPorCodigo.get(h.codigo) ?? null)
      }
    } else {
      const preds = pred.get(h.codigo) ?? []
      const listoParaActuar = preds.every((p) => cumplidos.has(p))
      if (!listoParaActuar) {
        estado = 'no_aplica'
        semaforo = 'gris'
      } else if (planeada) {
        holgura = businessDaysBetween(hoy, planeada, feriados) // días hábiles de hoy al deadline
        proyectada = planeada < hoy ? hoy : planeada
        if (holgura < 0) { estado = 'vencido'; semaforo = 'rojo'; atribucion = areaFromRol(rolPorCodigo.get(h.codigo) ?? null) }
        else if (holgura < HOLGURA_VERDE) { estado = 'en_riesgo'; semaforo = 'amarillo' }
        else { estado = 'pendiente'; semaforo = 'verde' }
      } else {
        estado = 'pendiente'; semaforo = 'gris'
      }
    }

    if (estado !== 'cumplido' && semaforo !== 'gris') {
      if (rank[semaforo] > rank[peor]) peor = semaforo
      if (holgura !== null && (minHolgura === null || holgura < minHolgura)) minHolgura = holgura
    }

    await runner.query(
      `INSERT INTO schedule_hitos
         (plan_id, codigo, fecha_planeada, fecha_baseline, fecha_real, fecha_proyectada,
          estado, semaforo, holgura_dias, atribucion_atraso, evidencia_ref, updated_at)
       VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (plan_id, codigo) DO UPDATE SET
         fecha_planeada    = EXCLUDED.fecha_planeada,
         fecha_baseline    = COALESCE(schedule_hitos.fecha_baseline, EXCLUDED.fecha_planeada),
         fecha_real        = EXCLUDED.fecha_real,
         fecha_proyectada  = EXCLUDED.fecha_proyectada,
         estado            = EXCLUDED.estado,
         semaforo          = EXCLUDED.semaforo,
         holgura_dias      = EXCLUDED.holgura_dias,
         atribucion_atraso = EXCLUDED.atribucion_atraso,
         evidencia_ref     = EXCLUDED.evidencia_ref,
         updated_at        = NOW()`,
      [plan.id, h.codigo, planeada, fechaReal ? `${fechaReal} 12:00:00` : null, proyectada,
       estado, semaforo, holgura, atribucion, cap?.evidencia ? JSON.stringify(cap.evidencia) : null])
  }

  await runner.query(
    `UPDATE schedule_planes SET semaforo = $2, holgura_dias = $3, updated_at = NOW() WHERE id = $1`,
    [plan.id, peor, minHolgura])

  await runner.query(
    `INSERT INTO schedule_eventos (plan_id, tipo, descripcion, disparado_por)
       VALUES ($1, 'recalculo', $2, $3)`,
    [plan.id, `Recálculo (${disparadoPor}). Semáforo ${peor}${minHolgura !== null ? `, holgura mín ${minHolgura}d` : ''}.`, disparadoPor])

  return { skipped: false, planId: plan.id, semaforo: peor, holguraDias: minHolgura }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrappers "safe" para llamar POST-COMMIT desde otros módulos (fire-and-forget).
// Abren su propia conexión y transacción; si algo falla, loguean pero NO
// propagan el error — el flujo principal (recepción/OP) ya commiteó y no debe
// romperse por el schedule. Proyectos sin plan salen por el early-return barato.
// ─────────────────────────────────────────────────────────────────────────────

/** Recalcula el schedule de un proyecto en su propia txn. Best-effort. */
export async function recomputeScheduleSafe(proyectoId: number, disparadoPor: Disparador): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await recomputeScheduleForProyecto(client, proyectoId, disparadoPor)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    logger.error('recomputeScheduleSafe error', { proyectoId, err })
  } finally {
    client.release()
  }
}

/** Idem, resolviendo el proyecto desde una OC. Best-effort. */
export async function recomputeScheduleForOCSafe(ocId: number, disparadoPor: Disparador): Promise<void> {
  try {
    const { rows } = await pool.query<{ proyecto_id: number | null }>(
      `SELECT proyecto_id FROM ordenes_compra WHERE id = $1`, [ocId])
    const pid = rows[0]?.proyecto_id
    if (pid) await recomputeScheduleSafe(pid, disparadoPor)
  } catch (err) {
    logger.error('recomputeScheduleForOCSafe error', { ocId, err })
  }
}
