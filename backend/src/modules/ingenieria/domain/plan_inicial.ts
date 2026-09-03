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
import { recomputarYGuardar } from './tareas'
import { loadFeriados } from '../../schedule/domain/calendario'
import { cargarPlantillaRuta, cargarColaIngenieros, ubicarProyecto, ROLES_INGENIERO, type Ubicacion } from './planificador'

type QueryRunner = PoolClient | typeof pool

function hoyISO(): string { return new Date().toISOString().slice(0, 10) }

export async function generarPlanIngenieria(
  runner: QueryRunner, proyectoId: number, opts?: { origen?: string }
): Promise<{ creadas: number; error?: string; ubicacion?: Ubicacion }> {
  const origen = opts?.origen ?? 'app'
  const { rows: pr } = await runner.query<{ codigo: string; items_qty: number | null; presupuesto: number | null; stone_total: number | null; incluye: boolean; fecha_objetivo: string | null }>(
    `SELECT p.codigo, p.items_qty, p.presupuesto, p.stone_total,
            COALESCE(p.incluye_instalacion, TRUE) AS incluye,
            to_char(sp.fecha_objetivo,'YYYY-MM-DD') AS fecha_objetivo
       FROM proyectos p
       LEFT JOIN schedule_planes sp ON sp.proyecto_id = p.id AND sp.scope = 'proyecto'
      WHERE p.id = $1`, [proyectoId])
  if (!pr[0]) return { creadas: 0, error: 'proyecto no encontrado' }
  const { codigo, items_qty, presupuesto, stone_total, incluye, fecha_objetivo } = pr[0]
  if (!fecha_objetivo) return { creadas: 0, error: 'el proyecto no tiene fecha comprometida' }
  const proyectoExt = codigo
  const hayStone = stone_total != null && Number(stone_total) > 0
  const incluyeInstalacion = incluye ?? true
  const diaCero = hoyISO()   // provisional; se re-ancla a la firma del contrato

  // No pisar un plan REAL ya existente (importado del Excel o aceptado por el PM = 'app')
  const { rows: ex } = await runner.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ing_tareas WHERE proyecto_ext = $1 AND origen IN ('import_excel','app')`, [proyectoExt])
  if ((ex[0]?.n ?? 0) > 0) return { creadas: 0, error: 'el proyecto ya tiene un plan (del Excel o aceptado por el PM)' }

  // Idempotente: borra el plan BLANDO previo (sugerencia/reserva); nunca toca 'app'/'import_excel'
  await runner.query(`DELETE FROM ing_tareas WHERE proyecto_ext = $1 AND origen IN ('sugerencia','reserva')`, [proyectoExt])

  // ── FUENTE ÚNICA: el planificador decide ingeniero + fechas (misma lógica que la
  //    factibilidad). El plan de ingeniería arranca cuando el ingeniero se LIBERA (cola
  //    serial), no hoy; el día cero (contrato) queda en `diaCero` y se persiste el piso.
  const feriados = await loadFeriados(runner)
  const plantilla = await cargarPlantillaRuta(runner, { itemsQty: items_qty, hayStone, incluyeInstalacion })
  if (!plantilla.pasos.length) return { creadas: 0, error: 'catálogo de tipos vacío' }
  const colas = await cargarColaIngenieros(runner, { excluirProyectoExt: proyectoExt })
  const u = ubicarProyecto(plantilla, colas, { hoy: diaCero, diaCero, fechaEntrega: fecha_objetivo, feriados })

  // Encabezado (día cero = hoy; fecha_entrega fija). El re-anclaje moverá SOLO el día cero.
  await runner.query(
    `INSERT INTO ing_proyectos (proyecto_ext, proyecto_id, fecha_inicio, fecha_entrega, fecha_inicio_original, n_items, presupuesto, origen)
       VALUES ($1,$2,$3,$4,$3,$5,$6,$7)
     ON CONFLICT (proyecto_ext) DO UPDATE SET proyecto_id=EXCLUDED.proyecto_id, fecha_inicio=EXCLUDED.fecha_inicio,
       fecha_entrega=EXCLUDED.fecha_entrega, fecha_inicio_original=EXCLUDED.fecha_inicio_original,
       n_items=EXCLUDED.n_items, presupuesto=EXCLUDED.presupuesto, origen=EXCLUDED.origen, updated_at=NOW()`,
    [proyectoExt, proyectoId, diaCero, fecha_objetivo, items_qty, presupuesto, origen])

  // Tareas con las fechas del planificador. A las de INGENIERÍA (rol ingenieria/field) se
  // les asigna el ingeniero elegido y su piso `no_antes_de` = cuándo se libera (para que
  // el recompute reproduzca la ubicación y el re-anclaje no la borre). allocation_pct = 1.0.
  const idPorClave = new Map<string, number>()
  for (const fp of u.fechas.values()) {
    const esIng = ROLES_INGENIERO.has(fp.rol ?? '')
    const { rows } = await runner.query<{ id: number }>(
      `INSERT INTO ing_tareas (proyecto_ext, proyecto_id, tipo_id, nombre, asignado_nombre, allocation_pct, dur_dias, fecha_inicio, fecha_fin, no_antes_de, estado, origen)
         VALUES ($1,$2,$3,$4,$5,1.0,$6,$7,$8,$9,'pendiente',$10) RETURNING id`,
      [proyectoExt, proyectoId, fp.tipoId, fp.nombre, esIng ? u.ingeniero : null, fp.dur, fp.es, fp.ef, esIng ? u.disponible_desde : null, origen])
    idPorClave.set(fp.clave, rows[0].id)
  }

  // Dependencias (de la plantilla, solo entre tipos generados)
  for (const a of plantilla.aristas) {
    const tId = idPorClave.get(a.clave), dId = idPorClave.get(a.dependeDe)
    if (tId && dId) await runner.query(
      `INSERT INTO ing_tarea_deps (tarea_id, depende_de_id, tipo, lag_dias) VALUES ($1,$2,$3,$4) ON CONFLICT (tarea_id,depende_de_id) DO NOTHING`,
      [tId, dId, a.tipo, a.lag])
  }

  return { creadas: u.fechas.size, ubicacion: u }
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
  // Si el contrato YA se firmó (C-03 cerrado) antes de que el PM acepte, re-anclar ahora a
  // la firma — así el día cero queda bien sin importar el orden firma/aceptación (Chali).
  const { rows: c03 } = await runner.query<{ firma: string | null }>(
    `SELECT to_char(sh.fecha_real,'YYYY-MM-DD') AS firma
       FROM schedule_hitos sh JOIN schedule_planes sp ON sp.id = sh.plan_id
      WHERE sp.proyecto_id = $1 AND sp.scope = 'proyecto' AND sh.codigo = 'C-03' AND sh.fecha_real IS NOT NULL`, [proyectoId])
  if (c03[0]?.firma) { try { await reanclarPlanAFirma(runner, proyectoId, c03[0].firma) } catch { /* best-effort */ } }
  return { aceptadas: r.rowCount ?? 0 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handoff Estimados → Cliente → PM (decisión de Chali):
//   plan_propuesto → (Estimados envía) → esperando_cliente → (Estimados registra
//   la respuesta del cliente) → aprobado → (el PM ACTIVA) → proyecto 'activo'.
// El PM es quien activa: no pierde control y todo su plan se enciende de una.
// Cada transición valida el estado previo (máquina de estados honesta).
// ─────────────────────────────────────────────────────────────────────────────

/** Estimados manda el schedule al cliente para su aprobación. */
export async function enviarAClienteDeal(runner: QueryRunner, proyectoId: number): Promise<{ ok: boolean; error?: string }> {
  const { rowCount } = await runner.query(
    `UPDATE proyectos SET deal_estado = 'esperando_cliente' WHERE id = $1 AND deal_estado = 'plan_propuesto'`, [proyectoId])
  return rowCount ? { ok: true } : { ok: false, error: 'el plan tiene que estar aceptado por el PM antes de mandarlo al cliente' }
}

/** Estimados registra que el cliente aprobó el schedule. */
export async function registrarAprobacionCliente(runner: QueryRunner, proyectoId: number): Promise<{ ok: boolean; error?: string }> {
  const { rowCount } = await runner.query(
    `UPDATE proyectos SET deal_estado = 'aprobado' WHERE id = $1 AND deal_estado = 'esperando_cliente'`, [proyectoId])
  return rowCount ? { ok: true } : { ok: false, error: 'el schedule tiene que estar enviado al cliente primero' }
}

/** El PM activa el proyecto: prospecto → activo (todo el plan queda en marcha). */
export async function activarProyecto(runner: QueryRunner, proyectoId: number): Promise<{ ok: boolean; error?: string }> {
  const { rowCount } = await runner.query(
    `UPDATE proyectos SET estado = 'activo' WHERE id = $1 AND deal_estado = 'aprobado' AND estado = 'prospecto'`, [proyectoId])
  return rowCount ? { ok: true } : { ok: false, error: 'el cliente todavía no aprobó el schedule' }
}

export interface DealEnCurso {
  proyecto_id: number; codigo: string; nombre: string; cliente: string | null
  estado: string; deal_estado: string; fecha_objetivo: string | null; n_tareas: number
}

/** Deals post-aceptación del PM que siguen en curso (prospecto): esperando el handoff
 *  al cliente o la activación. Alimenta el tracker de Estimados y el de "activar" del PM. */
export async function listDealsEnCurso(runner: QueryRunner): Promise<DealEnCurso[]> {
  const { rows } = await runner.query<DealEnCurso>(
    `SELECT p.id AS proyecto_id, p.codigo, p.nombre, p.cliente, p.estado, p.deal_estado,
            to_char(sp.fecha_objetivo,'YYYY-MM-DD') AS fecha_objetivo,
            (SELECT count(*)::int FROM ing_tareas t WHERE t.proyecto_id = p.id AND t.origen = 'app') AS n_tareas
       FROM proyectos p
       LEFT JOIN schedule_planes sp ON sp.proyecto_id = p.id AND sp.scope = 'proyecto'
      WHERE p.estado = 'prospecto' AND p.deal_estado IN ('plan_propuesto','esperando_cliente','aprobado')
      ORDER BY p.codigo`)
  return rows
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
  // Mover el día cero desincroniza las fechas GUARDADAS de las tareas (que lee el heatmap
  // de carga) del Gantt (que recalcula al vuelo). Recalcular y guardar deja todo en sync.
  await recomputarYGuardar(runner, rows[0].proyecto_ext)
  return { ok: true }
}
