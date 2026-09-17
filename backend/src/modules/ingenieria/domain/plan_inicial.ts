// ─────────────────────────────────────────────────────────────────────────────
// Domain — Generador del plan de ingeniería (Opción B)
// ─────────────────────────────────────────────────────────────────────────────
// Cuando el PM arranca un proyecto, se genera el ESPEJO COMPLETO del Excel: todas
// las tareas del catálogo (la rama de piedra solo si el proyecto tiene stone_total),
// con sus dependencias (plantilla `ing_tipo_deps`) y duraciones pre-llenadas del
// intake (items × día donde aplique; catálogo si no). El PM poda las que no aplican
// y asigna. Día cero provisional = hoy; se re-ancla a la firma del contrato.
// Idempotente: borra el plan BLANDO previo ('sugerencia') y lo regenera.
// NO toca proyectos importados del Excel ni el plan ya aceptado ('app').
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { recomputarYGuardar } from './tareas'
import { loadFeriados } from '../../schedule/domain/calendario'
import { crearToken } from '../../schedule/domain/portal'
import { cargarPlantillaRuta, cargarColaIngenieros, ubicarProyecto, ROLES_INGENIERO, type Ubicacion } from './planificador'
import { logger } from '../../../utils/logger'
import { captureException } from '../../../utils/sentry'

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

  // Idempotente: borra el plan BLANDO previo (sugerencia); nunca toca 'app'/'import_excel'
  await runner.query(`DELETE FROM ing_tareas WHERE proyecto_ext = $1 AND origen = 'sugerencia'`, [proyectoExt])

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
  if (c03[0]?.firma) {
    try { await reanclarPlanAFirma(runner, proyectoId, c03[0].firma) }
    catch (err) { logger.error('aceptarPlanPM: reanclarPlanAFirma falló', { proyectoId, err: (err as Error)?.message }); captureException(err, { tags: { area: 'aceptar_plan_reanclar' }, extra: { proyectoId } }) }
  } else {
    // Sin firma aún: igual proyectamos el journey desde el plan recién endurecido, para que
    // los hitos de schedule_hitos queden con su estado real (no_aplica los que aún no aplican)
    // ANTES de que el cliente vea el portal. Si no, quedan en 'pendiente' (default) y el portal
    // los muestra como aprobables. reanclarPlanAFirma ya recomputa en la otra rama.
    try { await recomputarYGuardar(runner, ext) }
    catch (err) { logger.error('aceptarPlanPM: recomputarYGuardar falló', { proyectoId, ext, err: (err as Error)?.message }); captureException(err, { tags: { area: 'aceptar_plan_recompute' }, extra: { proyectoId, ext } }) }
  }
  return { aceptadas: r.rowCount ?? 0 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handoff Estimados → Cliente → PM (decisión de Chali):
//   plan_propuesto → (Estimados envía) → esperando_cliente → (Estimados registra
//   la respuesta del cliente) → aprobado → (el PM ACTIVA) → proyecto 'activo'.
// El PM es quien activa: no pierde control y todo su plan se enciende de una.
// Cada transición valida el estado previo (máquina de estados honesta).
// ─────────────────────────────────────────────────────────────────────────────

/** Estimados manda el schedule al cliente para su aprobación. Deja listo (o reusa) el
 *  link del portal del cliente para poder verlo/abrirlo/compartirlo desde la bandeja. */
export async function enviarAClienteDeal(runner: QueryRunner, proyectoId: number, createdBy: string | null = null): Promise<{ ok: boolean; error?: string; token?: string }> {
  const { rowCount } = await runner.query(
    `UPDATE proyectos SET deal_estado = 'esperando_cliente' WHERE id = $1 AND deal_estado = 'plan_propuesto'`, [proyectoId])
  if (!rowCount) return { ok: false, error: 'el plan tiene que estar aceptado por el PM antes de mandarlo al cliente' }
  // Congelar la fecha que verá el cliente = la fecha interna actual. A partir de acá, si el PM
  // mueve la fecha interna, el cliente NO lo ve (2.2): sólo cambia si se le re-comunica.
  await runner.query(
    `UPDATE schedule_planes SET fecha_cliente = fecha_objetivo
      WHERE proyecto_id = $1 AND scope = 'proyecto'`, [proyectoId])
  // Reusa el token activo del proyecto o crea uno (a nombre del cliente).
  const ex = await runner.query<{ token: string }>(
    `SELECT token FROM schedule_portal_tokens WHERE proyecto_id = $1 AND activo = true ORDER BY created_at DESC LIMIT 1`, [proyectoId])
  let token = ex.rows[0]?.token
  if (!token) {
    const cli = await runner.query<{ cliente: string | null }>(`SELECT cliente FROM proyectos WHERE id = $1`, [proyectoId])
    token = (await crearToken(runner, proyectoId, cli.rows[0]?.cliente ?? null, null, createdBy)).token
  }
  return { ok: true, token }
}

/** Estimados registra que el cliente aprobó el schedule. */
export async function registrarAprobacionCliente(runner: QueryRunner, proyectoId: number): Promise<{ ok: boolean; error?: string }> {
  const { rowCount } = await runner.query(
    `UPDATE proyectos SET deal_estado = 'aprobado', deal_aprobado_at = NOW() WHERE id = $1 AND deal_estado = 'esperando_cliente'`, [proyectoId])
  return rowCount ? { ok: true } : { ok: false, error: 'el schedule tiene que estar enviado al cliente primero' }
}

/** El PM activa el proyecto: prospecto → activo (todo el plan queda en marcha). */
export async function activarProyecto(runner: QueryRunner, proyectoId: number): Promise<{ ok: boolean; error?: string }> {
  const { rowCount } = await runner.query(
    `UPDATE proyectos SET estado = 'activo' WHERE id = $1 AND deal_estado = 'aprobado' AND estado = 'prospecto'`, [proyectoId])
  return rowCount ? { ok: true } : { ok: false, error: 'el cliente todavía no aprobó el schedule' }
}

/**
 * Estimados da de baja un deal en curso: lo PAUSA (reactivable) o lo CANCELA.
 * Único punto que puede cerrar un deal — Estimados tiene el contacto con el cliente.
 * En ambos casos se LIBERA TODA la reserva de Ingeniería (se borran las tareas del
 * proyecto → el ingeniero recupera su capacidad) y se revocan los links del portal.
 * Al PM se le avisa por su ESCRITORIO (tarea area='admin'), no por email.
 */
export async function cerrarDeal(
  runner: QueryRunner, proyectoId: number, accion: 'pausar' | 'cancelar', usuarioNombre: string | null = null
): Promise<{ ok: boolean; error?: string }> {
  const { rows } = await runner.query<{ codigo: string; nombre: string; estado: string }>(
    `SELECT codigo, nombre, estado FROM proyectos WHERE id = $1`, [proyectoId])
  const p = rows[0]
  if (!p) return { ok: false, error: 'proyecto no encontrado' }
  if (p.estado !== 'prospecto') {
    return { ok: false, error: 'solo se puede pausar o cancelar un deal en curso (todavía sin activar)' }
  }

  // 1) Liberar TODA la Ingeniería: borrar las tareas del proyecto devuelve la capacidad
  //    del ingeniero (el heatmap de carga sólo cuenta tareas vivas del proyecto).
  await runner.query(`DELETE FROM ing_tareas WHERE proyecto_id = $1`, [proyectoId])
  // 2) Revocar los links del portal: el cliente deja de ver el schedule.
  await runner.query(
    `UPDATE schedule_portal_tokens SET activo = false WHERE proyecto_id = $1 AND activo = true`, [proyectoId])
  // 3) Estado del proyecto: en_pausa (reactivable) o cancelado. El deal se cierra (deal_estado → NULL);
  //    si más adelante se retoma, Estimados vuelve a arrancar el flujo desde cero.
  const nuevoEstado = accion === 'pausar' ? 'en_pausa' : 'cancelado'
  await runner.query(
    `UPDATE proyectos SET estado = $2, deal_estado = NULL WHERE id = $1`, [proyectoId, nuevoEstado])

  // 4) Avisar al PM por su escritorio (tabla tareas, area='admin' = bandeja del PM).
  const verbo = accion === 'pausar' ? 'pausado' : 'cancelado'
  const quien = usuarioNombre ? ` (${usuarioNombre})` : ''
  const cierre = accion === 'pausar'
    ? 'El proyecto queda EN PAUSA y se puede reactivar más adelante.'
    : 'El proyecto queda CANCELADO.'
  await runner.query(
    `INSERT INTO tareas (area, title, description, priority, from_email, subject, source_email_id, origen, source_ref)
       VALUES ('admin',$1,$2,'high','sistema@centralmillwork.com',$3,NULL,'sistema',$4)
     ON CONFLICT (source_ref) WHERE origen='sistema' AND source_ref IS NOT NULL DO NOTHING`,
    [`Deal ${verbo}: ${p.codigo} — ${p.nombre}`,
     `Estimados ${verbo} el deal ${p.codigo} (${p.nombre})${quien}.\n` +
     `Se liberó la reserva de Ingeniería (el ingeniero recuperó esa capacidad) y se dieron de baja los links del portal.\n\n` +
     cierre,
     `Deal ${verbo}: ${p.codigo}`,
     `deal:${proyectoId}:${accion}:${Date.now()}`])

  logger.info('deal cerrado por Estimados', { proyectoId, accion, codigo: p.codigo })
  return { ok: true }
}

export interface DealEnCurso {
  proyecto_id: number; codigo: string; nombre: string; cliente: string | null
  estado: string; deal_estado: string; fecha_objetivo: string | null; n_tareas: number
  fecha_realista: string | null    // fin real del plan (última tarea) — la fecha que compromete el PM
  portal_token: string | null
  deal_aprobado_at: string | null   // cuándo aprobó el cliente (ISO), para la confirmación en Estimados
  cliente_rechazo: boolean          // el cliente rechazó el plan desde el portal (2.6)
}

/** Deals post-aceptación del PM que siguen en curso (prospecto): esperando el handoff
 *  al cliente o la activación. Alimenta el tracker de Estimados y el de "activar" del PM. */
export async function listDealsEnCurso(runner: QueryRunner): Promise<DealEnCurso[]> {
  const { rows } = await runner.query<DealEnCurso>(
    `SELECT p.id AS proyecto_id, p.codigo, p.nombre, p.cliente, p.estado, p.deal_estado,
            to_char(sp.fecha_objetivo,'YYYY-MM-DD') AS fecha_objetivo,
            to_char(p.deal_aprobado_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS deal_aprobado_at,
            (SELECT count(*)::int FROM ing_tareas t WHERE t.proyecto_id = p.id AND t.origen = 'app') AS n_tareas,
            (SELECT to_char(MAX(t.fecha_fin),'YYYY-MM-DD') FROM ing_tareas t WHERE t.proyecto_id = p.id AND t.origen = 'app') AS fecha_realista,
            (SELECT spt.token FROM schedule_portal_tokens spt WHERE spt.proyecto_id = p.id AND spt.activo = true ORDER BY spt.created_at DESC LIMIT 1) AS portal_token,
            -- 2.6: ¿el cliente RECHAZÓ el plan? (última decisión del portal sobre PLAN).
            COALESCE((SELECT (ev.payload->>'decision') = 'rechazado'
                        FROM schedule_eventos ev
                        JOIN schedule_planes sp2 ON sp2.id = ev.plan_id AND sp2.scope = 'proyecto'
                       WHERE sp2.proyecto_id = p.id AND ev.hito_codigo = 'PLAN' AND ev.disparado_por = 'portal'
                       ORDER BY ev.created_at DESC LIMIT 1), false) AS cliente_rechazo
       FROM proyectos p
       LEFT JOIN schedule_planes sp ON sp.proyecto_id = p.id AND sp.scope = 'proyecto'
      WHERE p.estado = 'prospecto' AND p.deal_estado IN ('esperando_pm','plan_propuesto','esperando_cliente','aprobado')
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
