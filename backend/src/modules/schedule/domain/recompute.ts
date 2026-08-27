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

// Cierre hacia atrás (inferencia): si un hito está cumplido, sus predecesores
// en la cadena ocurrieron sí o sí antes → los damos por cumplidos. PERO no se
// infieren los que requieren prueba propia de un tercero o de plata: las
// aprobaciones del cliente (APROBABLES en portal.ts: E-05/E-07/I-07) y los
// pagos (C-04 down payment, X-03 pago final). Esos quedan visibles hasta que se
// registre el hecho real. (Códigos hardcodeados a propósito para evitar un
// import circular con portal.ts, que ya importa este módulo.)
const NO_INFERIR = new Set<string>(['E-05', 'E-07', 'I-07', 'C-04', 'X-03'])

// La inferencia es un CÁLCULO, no un hecho: aunque se persiste (para que la UI
// muestre el hito cumplido), NO debe tomarse como base en la próxima corrida —
// si no, un cumplido inferido se volvería permanente aunque se deshaga el hecho
// posterior que lo justificaba. Por eso ignoramos las fechas cuya evidencia es
// 'inferido' al leer el estado previo; la inferencia se re-deriva cada vez.
function esInferida(evidencia: unknown): boolean {
  return !!evidencia && typeof evidencia === 'object' && (evidencia as { source?: string }).source === 'inferido'
}

function todayISO(): ISODate {
  const t = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}

/** Mapea el rol responsable del hito al área para atribución de atrasos. */
export function areaFromRol(rol: string | null): string {
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

/** Atribución del atraso de un hito. C-03 (contrato firmado = día cero): mientras el
 *  cliente no firme, el atraso es SUYO (no de Estimación) — decisión de Chali, para
 *  documentar la demora del cliente y poder renegociar la fecha. El resto va por rol. */
function atribucionDe(codigo: string, rol: string | null): string {
  if (codigo === 'C-03') return 'cliente'
  return areaFromRol(rol)
}

interface PlantillaHito {
  codigo: string
  dur_dias_default: number
  es_ancla: boolean
  rol_responsable: string | null
  fuente_dato: string
  tipo: string
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

/**
 * Mueve la fecha de entrega comprometida (P1: es sagrada — moverla es una
 * decisión humana que queda registrada). Preserva fecha_objetivo_original.
 */
export async function cambiarFechaObjetivo(
  runner: QueryRunner,
  proyectoId: number,
  nuevaFecha: ISODate,
  usuarioNombre: string | null
): Promise<{ ok: boolean; error?: string; anterior?: string }> {
  const { rows } = await runner.query<{ id: number; actual: string }>(
    `SELECT id, to_char(fecha_objetivo,'YYYY-MM-DD') AS actual
       FROM schedule_planes WHERE proyecto_id = $1 AND scope = 'proyecto'`, [proyectoId])
  if (!rows[0]) return { ok: false, error: 'el proyecto no tiene plan de schedule' }
  const anterior = rows[0].actual
  if (anterior === nuevaFecha) return { ok: true, anterior }

  await runner.query(
    `UPDATE schedule_planes SET fecha_objetivo = $2, updated_at = NOW() WHERE id = $1`,
    [rows[0].id, nuevaFecha])
  await runner.query(
    `INSERT INTO schedule_eventos (plan_id, tipo, descripcion, disparado_por)
       VALUES ($1, 'fecha_objetivo', $2, 'manual')`,
    [rows[0].id, `Fecha de entrega movida de ${anterior} a ${nuevaFecha}${usuarioNombre ? ` por ${usuarioNombre}` : ''}.`])

  await recomputeScheduleForProyecto(runner, proyectoId, 'manual')
  return { ok: true, anterior }
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
    `SELECT codigo, dur_dias_default, es_ancla, rol_responsable, fuente_dato, tipo
       FROM schedule_plantilla_hitos WHERE plantilla_id = $1`, [plan.plantilla_id])

  // Fechas reales ya guardadas (ej. cargadas por el portal de cliente o a mano):
  // para los hitos NO instrumentados hay que preservarlas — el recompute no las pisa.
  const { rows: existentes } = await runner.query<{ codigo: string; fecha_real: string | null; evidencia_ref: unknown }>(
    `SELECT codigo, to_char(fecha_real,'YYYY-MM-DD') AS fecha_real, evidencia_ref
       FROM schedule_hitos WHERE plan_id = $1`, [plan.id])
  const realExistente = new Map(existentes.map((e) => [e.codigo, e]))
  const fuentePorCodigo = new Map(hitosRows.map((h) => [h.codigo, h.fuente_dato]))
  const { rows: depRows } = await runner.query<{ hito_codigo: string; depende_de_codigo: string }>(
    `SELECT hito_codigo, depende_de_codigo
       FROM schedule_plantilla_dependencias WHERE plantilla_id = $1`, [plan.plantilla_id])

  const hitos: HitoDef[] = hitosRows.map((h) => ({ codigo: h.codigo, dur: h.dur_dias_default, es_ancla: h.es_ancla }))
  const deps: DepDef[] = depRows.map((d) => ({ hito: d.hito_codigo, dependeDe: d.depende_de_codigo }))
  const rolPorCodigo = new Map(hitosRows.map((h) => [h.codigo, h.rol_responsable]))
  const tipoPorCodigo = new Map(hitosRows.map((h) => [h.codigo, h.tipo]))

  const feriados = await loadFeriados(runner)
  const { planeadas } = calcularPlaneadas(hitos, deps, plan.fecha_objetivo, feriados)
  const reales = await capturarFechasReales(runner, proyectoId)
  const hoy = todayISO()

  // pred map para lógica "gris" (predecesores sin cumplir)
  const pred = new Map<string, string[]>()
  for (const h of hitos) pred.set(h.codigo, [])
  for (const d of deps) pred.get(d.hito)?.push(d.dependeDe)
  // "Revisión suelta" = hito continuo (tipo='cont') del que NADIE depende (ej.
  // E-12 gestión de riesgo, M-01 revisión de compras, P-04 3-Week Lookahead).
  // Es una vigilancia recurrente, no una tarea con deadline que "vence": no debe
  // pintarse de rojo ni ensuciar el semáforo. (Los 'cont' CON sucesores —P-05,
  // QC-01, I-05— sí son progreso real y siguen su curso normal.)
  const tieneDependientes = new Set<string>()
  for (const d of deps) tieneDependientes.add(d.dependeDe)
  const esRevisionSuelta = (codigo: string) =>
    tipoPorCodigo.get(codigo) === 'cont' && !tieneDependientes.has(codigo)
  // "Cumplidos" = hitos con fecha real REAL (capturada O preservada manual/portal).
  // Debe incluir las manuales, si no un hito aprobado por el portal no destraba
  // a su sucesor.
  const cumplidos = new Set<string>()
  for (const h of hitos) {
    let fr = reales.get(h.codigo)?.fecha_real ?? null
    if (fr === null && fuentePorCodigo.get(h.codigo) === 'manual_futuro') {
      const ex = realExistente.get(h.codigo)
      if (ex && !esInferida(ex.evidencia_ref)) fr = ex.fecha_real ?? null // no tomar inferidas como base
    }
    if (fr) cumplidos.add(h.codigo)
  }

  // ── Cierre hacia atrás (inferencia) ─────────────────────────────────────────
  // Subimos por la cadena desde cada hito cumplido: todos sus predecesores
  // (menos los de NO_INFERIR) se dan por cumplidos "por inferencia". Así el
  // tablero no se contradice (ej.: material comprado ⇒ MTO y budget validados;
  // contrato firmado ⇒ contrato revisado). Un hito con hecho real captado más
  // tarde igual gana: la inferencia solo rellena huecos.
  const inferidos = new Set<string>()
  {
    const stack = [...cumplidos]
    const visto = new Set<string>(cumplidos)
    while (stack.length) {
      const codigo = stack.pop()!
      for (const p of pred.get(codigo) ?? []) {
        if (visto.has(p)) continue
        visto.add(p)
        stack.push(p) // seguir subiendo, aun a través de un excluido
        // Solo se infieren pasos administrativos (manual_futuro): nunca hitos
        // instrumentados (producción/QC/material), que dependen de un hecho
        // físico real — fabricarlos sería peor que dejarlos pendientes.
        if (!cumplidos.has(p) && !NO_INFERIR.has(p) && fuentePorCodigo.get(p) === 'manual_futuro') {
          inferidos.add(p)
        }
      }
    }
  }
  for (const c of inferidos) cumplidos.add(c) // destraban a sus sucesores

  let peor = 'gris'
  let minHolgura: number | null = null
  const rank: Record<string, number> = { gris: 0, verde: 1, amarillo: 2, rojo: 3 }

  for (const h of hitos) {
    const planeada = planeadas.get(h.codigo) ?? null
    const cap = reales.get(h.codigo)
    let fechaReal = cap?.fecha_real ?? null
    let evidencia: unknown = cap?.evidencia ?? null
    // Hito no instrumentado con fecha ya cargada (portal/manual): preservarla.
    // Pero NO las inferidas: esas se re-derivan abajo, nunca se preservan.
    if (fechaReal === null && fuentePorCodigo.get(h.codigo) === 'manual_futuro') {
      const ex = realExistente.get(h.codigo)
      if (ex?.fecha_real && !esInferida(ex.evidencia_ref)) { fechaReal = ex.fecha_real; evidencia = ex.evidencia_ref ?? null }
    }
    // Cierre hacia atrás: si no tiene hecho real pero un paso posterior sí,
    // se da por cumplido en su fecha planeada (holgura 0, sin atribución).
    if (fechaReal === null && inferidos.has(h.codigo)) {
      fechaReal = planeada ?? hoy
      evidencia = { source: 'inferido', nota: 'implícito: un paso posterior ya está cumplido' }
    }

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
        if (holgura < 0) atribucion = atribucionDe(h.codigo, rolPorCodigo.get(h.codigo) ?? null)
      }
    } else if (tipoPorCodigo.get(h.codigo) === 'cond') {
      // Hito condicional (solo ocurre si algo puntual pasa: reproceso, resubmittal…).
      // Si no está cumplido, es neutro: ni rojo, ni cuenta para el semáforo global,
      // ni aparece como pendiente. Se materializa recién si alguien lo registra.
      estado = 'no_aplica'
      semaforo = 'gris'
    } else if (esRevisionSuelta(h.codigo)) {
      // Revisión continua sin sucesores (E-12, M-01, P-04): chequeo recurrente,
      // siempre disponible. Aparece en el escritorio como pendiente pero NUNCA
      // vencido/rojo, sin margen ni atribución, y no ensucia el semáforo global.
      estado = 'pendiente'
      semaforo = 'verde'
    } else {
      const preds = pred.get(h.codigo) ?? []
      // Un predecesor condicional no bloquea (es opcional): cuenta como satisfecho.
      const listoParaActuar = preds.every((p) => cumplidos.has(p) || tipoPorCodigo.get(p) === 'cond')
      if (!listoParaActuar) {
        estado = 'no_aplica'
        semaforo = 'gris'
      } else if (planeada) {
        holgura = businessDaysBetween(hoy, planeada, feriados) // días hábiles de hoy al deadline
        proyectada = planeada < hoy ? hoy : planeada
        if (holgura < 0) { estado = 'vencido'; semaforo = 'rojo'; atribucion = atribucionDe(h.codigo, rolPorCodigo.get(h.codigo) ?? null) }
        else if (holgura < HOLGURA_VERDE) { estado = 'en_riesgo'; semaforo = 'amarillo' }
        else { estado = 'pendiente'; semaforo = 'verde' }
      } else {
        estado = 'pendiente'; semaforo = 'gris'
      }
    }

    // Las revisiones sueltas (E-12, M-01, P-04) no cuentan para el semáforo global.
    if (estado !== 'cumplido' && semaforo !== 'gris' && !esRevisionSuelta(h.codigo)) {
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
       estado, semaforo, holgura, atribucion, evidencia ? JSON.stringify(evidencia) : null])
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

/** Idem, resolviendo el proyecto desde una OP (orden de producción). Best-effort. */
export async function recomputeScheduleForOPSafe(ordenId: number, disparadoPor: Disparador): Promise<void> {
  try {
    const { rows } = await pool.query<{ proyecto_id: number | null }>(
      `SELECT proyecto_id FROM ordenes_produccion WHERE id = $1`, [ordenId])
    const pid = rows[0]?.proyecto_id
    if (pid) await recomputeScheduleSafe(pid, disparadoPor)
  } catch (err) {
    logger.error('recomputeScheduleForOPSafe error', { ordenId, err })
  }
}
