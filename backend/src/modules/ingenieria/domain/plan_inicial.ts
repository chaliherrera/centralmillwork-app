// ─────────────────────────────────────────────────────────────────────────────
// Domain — Generador del plan de ingeniería (Opción B)
// ─────────────────────────────────────────────────────────────────────────────
// Cuando el PM arranca un proyecto, se genera el ESPEJO COMPLETO del Excel: todas
// las tareas del catálogo (la rama de piedra solo si el proyecto tiene stone_total),
// con sus dependencias (plantilla `ing_tipo_deps`) y duraciones pre-llenadas del
// intake (items × día donde aplique; catálogo si no). El PM poda las que no aplican
// y asigna. Día cero provisional = hoy; se re-ancla a la firma del contrato.
// Idempotente: borra el plan 'app'/'reserva' previo (absorbe la reserva tentativa).
// NO toca proyectos importados del Excel (esos ya traen su plan).
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { calcularHolgura, TareaCPM, AristaCPM } from './holgura'
import { proponerIngeniero } from './reservas'
import { loadFeriados } from '../../schedule/domain/calendario'

type QueryRunner = PoolClient | typeof pool
const STONE_CLAVES = ['stone_measure', 'stone_fab', 'stone_install']

function hoyISO(): string { return new Date().toISOString().slice(0, 10) }

export async function generarPlanIngenieria(
  runner: QueryRunner, proyectoId: number, opts?: { origen?: string; fechaInicio?: string }
): Promise<{ creadas: number; error?: string }> {
  const origen = opts?.origen ?? 'app'
  const { rows: pr } = await runner.query<{ codigo: string; items_qty: number | null; presupuesto: number | null; stone_total: number | null; fecha_objetivo: string | null }>(
    `SELECT p.codigo, p.items_qty, p.presupuesto, p.stone_total,
            to_char(sp.fecha_objetivo,'YYYY-MM-DD') AS fecha_objetivo
       FROM proyectos p
       LEFT JOIN schedule_planes sp ON sp.proyecto_id = p.id AND sp.scope = 'proyecto'
      WHERE p.id = $1`, [proyectoId])
  if (!pr[0]) return { creadas: 0, error: 'proyecto no encontrado' }
  const { codigo, items_qty, presupuesto, stone_total, fecha_objetivo } = pr[0]
  if (!fecha_objetivo) return { creadas: 0, error: 'el proyecto no tiene fecha comprometida' }
  const proyectoExt = codigo
  const hayStone = stone_total != null && Number(stone_total) > 0
  const fechaInicio = opts?.fechaInicio || hoyISO()

  // No pisar un plan REAL ya existente (importado del Excel o aceptado por el PM = 'app')
  const { rows: ex } = await runner.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ing_tareas WHERE proyecto_ext = $1 AND origen IN ('import_excel','app')`, [proyectoExt])
  if ((ex[0]?.n ?? 0) > 0) return { creadas: 0, error: 'el proyecto ya tiene un plan (del Excel o aceptado por el PM)' }

  // Idempotente: borra el plan BLANDO previo (sugerencia/reserva); nunca toca 'app'/'import_excel'
  await runner.query(`DELETE FROM ing_tareas WHERE proyecto_ext = $1 AND origen IN ('sugerencia','reserva')`, [proyectoExt])

  // Tipos a generar (stone solo si hay piedra)
  const { rows: tipos } = await runner.query<{ id: number; clave: string; nombre: string; dur_dias_tipico: number | null; dias_por_item: number | null }>(
    `SELECT id, clave, nombre, dur_dias_tipico, dias_por_item FROM ing_tarea_tipos`)
  const incluir = tipos.filter((t) => hayStone || !STONE_CLAVES.includes(t.clave))
  if (!incluir.length) return { creadas: 0, error: 'catálogo de tipos vacío' }

  // Encabezado del proyecto de ingeniería (fecha fija + inicio provisional = original)
  await runner.query(
    `INSERT INTO ing_proyectos (proyecto_ext, proyecto_id, fecha_inicio, fecha_entrega, fecha_inicio_original, n_items, presupuesto, origen)
       VALUES ($1,$2,$3,$4,$3,$5,$6,$7)
     ON CONFLICT (proyecto_ext) DO UPDATE SET proyecto_id=EXCLUDED.proyecto_id, fecha_inicio=EXCLUDED.fecha_inicio,
       fecha_entrega=EXCLUDED.fecha_entrega, fecha_inicio_original=EXCLUDED.fecha_inicio_original,
       n_items=EXCLUDED.n_items, presupuesto=EXCLUDED.presupuesto, origen=EXCLUDED.origen, updated_at=NOW()`,
    [proyectoExt, proyectoId, fechaInicio, fecha_objetivo, items_qty, presupuesto, origen])

  // Crear las tareas (sin asignado; se propone después con sus fechas)
  const idPorClave = new Map<string, number>()
  const durPorClave = new Map<string, number>()
  for (const t of incluir) {
    let dur = Math.max(1, t.dur_dias_tipico ?? 3)
    if (items_qty != null && items_qty > 0 && t.dias_por_item != null && Number(t.dias_por_item) > 0)
      dur = Math.max(1, Math.round(items_qty * Number(t.dias_por_item)))
    const { rows } = await runner.query<{ id: number }>(
      `INSERT INTO ing_tareas (proyecto_ext, proyecto_id, tipo_id, nombre, allocation_pct, dur_dias, estado, origen)
         VALUES ($1,$2,$3,$4,1.0,$5,'pendiente',$6) RETURNING id`,
      [proyectoExt, proyectoId, t.id, t.nombre, dur, origen])
    idPorClave.set(t.clave, rows[0].id)
    durPorClave.set(t.clave, dur)
  }

  // Dependencias desde la plantilla (solo entre tipos generados)
  const { rows: tdeps } = await runner.query<{ tipo_clave: string; depende_de_clave: string; tipo: string; lag_dias: number }>(
    `SELECT tipo_clave, depende_de_clave, tipo, lag_dias FROM ing_tipo_deps`)
  const aristas: AristaCPM[] = []
  for (const dep of tdeps) {
    const tId = idPorClave.get(dep.tipo_clave), dId = idPorClave.get(dep.depende_de_clave)
    if (tId && dId) {
      await runner.query(
        `INSERT INTO ing_tarea_deps (tarea_id, depende_de_id, tipo, lag_dias) VALUES ($1,$2,$3,$4) ON CONFLICT (tarea_id,depende_de_id) DO NOTHING`,
        [tId, dId, dep.tipo, dep.lag_dias])
      aristas.push({ tareaId: tId, dependeDeId: dId, lag: dep.lag_dias })
    }
  }

  // Fechas por CPM (early schedule) → se guardan para el heatmap
  const feriados = await loadFeriados(runner)
  const cpmTareas: TareaCPM[] = [...idPorClave.entries()].map(([clave, id]) => ({ id, dur: durPorClave.get(clave)! }))
  try {
    const r = calcularHolgura(cpmTareas, aristas, fechaInicio, fecha_objetivo, feriados)
    for (const [, id] of idPorClave) {
      const c = r.tareas.get(id)
      if (c) await runner.query(`UPDATE ing_tareas SET fecha_inicio=$2, fecha_fin=$3 WHERE id=$1`, [id, c.earlyStart, c.earlyFinish])
    }
  } catch { /* ciclo improbable: el plan queda sin fechas, pero existe */ }

  // Proponer ingeniero por tarea (según su ventana) — el PM confirma o cambia
  for (const [, id] of idPorClave) {
    const { rows: f } = await runner.query<{ fi: string | null; ff: string | null }>(
      `SELECT to_char(fecha_inicio,'YYYY-MM-DD') fi, to_char(fecha_fin,'YYYY-MM-DD') ff FROM ing_tareas WHERE id=$1`, [id])
    const ing = await proponerIngeniero(runner, f[0]?.fi ?? fechaInicio, f[0]?.ff ?? fecha_objetivo)
    if (ing) await runner.query(`UPDATE ing_tareas SET asignado_nombre=$2 WHERE id=$1`, [id, ing])
  }

  return { creadas: incluir.length }
}

/** El PM ACEPTA el plan sugerido: lo endurece (origen 'sugerencia' → 'app') preservando
 *  las ediciones que el PM haya hecho (podar/asignar/mover). Avanza el estado del deal. */
export async function aceptarPlanPM(runner: QueryRunner, proyectoId: number): Promise<{ aceptadas: number; error?: string }> {
  const { rows } = await runner.query<{ codigo: string }>(`SELECT codigo FROM proyectos WHERE id = $1`, [proyectoId])
  if (!rows[0]) return { aceptadas: 0, error: 'proyecto no encontrado' }
  const ext = rows[0].codigo
  const r = await runner.query(`UPDATE ing_tareas SET origen = 'app', updated_at = NOW() WHERE proyecto_ext = $1 AND origen = 'sugerencia'`, [ext])
  await runner.query(`UPDATE ing_proyectos SET origen = 'app', updated_at = NOW() WHERE proyecto_ext = $1 AND origen = 'sugerencia'`, [ext])
  await runner.query(`UPDATE proyectos SET deal_estado = 'plan_propuesto' WHERE id = $1`, [proyectoId])
  return { aceptadas: r.rowCount ?? 0 }
}

/** Re-ancla el día cero del plan de ingeniería a la firma del contrato y recalcula.
 *  Guarda el inicio original la primera vez; el delta documenta la demora del cliente. */
export async function reanclarPlanAFirma(runner: QueryRunner, proyectoId: number, fechaFirma: string): Promise<{ ok: boolean }> {
  const { rows } = await runner.query<{ proyecto_ext: string }>(
    `SELECT proyecto_ext FROM ing_proyectos WHERE proyecto_id = $1 AND origen = 'app'`, [proyectoId])
  if (!rows[0]) return { ok: false }
  await runner.query(
    `UPDATE ing_proyectos
        SET fecha_inicio_original = COALESCE(fecha_inicio_original, fecha_inicio),
            fecha_inicio = $2::date, updated_at = NOW()
      WHERE proyecto_id = $1 AND origen = 'app'`, [proyectoId, fechaFirma])
  return { ok: true }
}
