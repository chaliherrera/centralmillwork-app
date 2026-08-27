// ─────────────────────────────────────────────────────────────────────────────
// Domain — Holgura y riesgo de las tareas de Ingeniería (CPM sobre fecha FIJA)
// ─────────────────────────────────────────────────────────────────────────────
// El "híbrido" que pidió Chali para el módulo de Tareas de Ingeniería:
//   · La fecha de ENTREGA del proyecto es FIJA (no se mueve nunca).
//   · Cada tarea tiene duración (días hábiles) y dependencias con lag (FS+Nd).
//   · Editar tareas (agregar/borrar/cambiar duración) recalcula todo:
//       - si la cadena termina ANTES de la entrega → HOLGURA (verde),
//       - si termina DESPUÉS → RIESGO (rojo), comunicable con antelación.
//
// Es el Método del Camino Crítico (CPM) clásico:
//   1. Pasada HACIA ADELANTE desde la fecha de inicio del proyecto:
//      ES/EF (early start/finish) — dónde caen las tareas.
//   2. Pasada HACIA ATRÁS desde la fecha de entrega FIJA:
//      LS/LF (late start/finish) — lo más tarde que pueden caer sin mover la entrega.
//   3. Holgura(t) = LF(t) − EF(t). Camino crítico = holgura 0. Riesgo = holgura < 0.
//
// Función PURA: no toca DB ni Express (calendario.ts es puro). Testeable aislada.
// NO reusa motor.ts (ese es para la plantilla de 54 hitos del schedule maestro y
// no maneja lags ni pares Start/Finish — acá necesitamos ambos).
// ─────────────────────────────────────────────────────────────────────────────

import { ISODate, subBusinessDays, addBusinessDays, businessDaysBetween } from '../../schedule/domain/calendario'

export interface TareaCPM {
  id: number
  /** duración en días hábiles */
  dur: number
}

export interface AristaCPM {
  /** la tarea que depende (sucesor) */
  tareaId: number
  /** su predecesor */
  dependeDeId: number
  /** lag en días hábiles (FS+Nd). Puede ser negativo (adelanto). */
  lag: number
}

export interface HolguraTarea {
  earlyStart: ISODate
  earlyFinish: ISODate
  lateStart: ISODate
  lateFinish: ISODate
  /** LF − EF en días hábiles. > 0 holgura, 0 crítico, < 0 riesgo. */
  holguraDias: number
  critico: boolean
}

export interface HolguraProyecto {
  tareas: Map<number, HolguraTarea>
  /** fecha en que termina la cadena (max early-finish). null si no hay tareas. */
  finProyectado: ISODate | null
  /** entrega − finProyectado en días hábiles. ≥ 0 hay holgura, < 0 hay riesgo. */
  holguraProyecto: number
  enRiesgo: boolean
}

/**
 * Calcula ES/EF/LS/LF y holgura de cada tarea (CPM) contra la fecha de entrega FIJA.
 * @param fechaInicio  ancla de la pasada hacia adelante (inicio del proyecto).
 * @param fechaEntrega ancla de la pasada hacia atrás (entrega FIJA — sagrada).
 * @throws si el grafo de dependencias tiene un ciclo.
 */
export function calcularHolgura(
  tareas: TareaCPM[],
  aristas: AristaCPM[],
  fechaInicio: ISODate,
  fechaEntrega: ISODate,
  feriados: Set<ISODate>,
): HolguraProyecto {
  const dur = new Map<number, number>()
  for (const t of tareas) dur.set(t.id, Math.max(0, Math.round(t.dur)))

  // pred[x] = [{de, lag}] de qué depende x ; succ[x] = [{a, lag}] quiénes dependen de x
  const pred = new Map<number, { id: number; lag: number }[]>()
  const succ = new Map<number, { id: number; lag: number }[]>()
  for (const t of tareas) { pred.set(t.id, []); succ.set(t.id, []) }
  for (const a of aristas) {
    if (!pred.has(a.tareaId) || !pred.has(a.dependeDeId)) continue  // aristas colgadas: ignorar
    pred.get(a.tareaId)!.push({ id: a.dependeDeId, lag: a.lag })
    succ.get(a.dependeDeId)!.push({ id: a.tareaId, lag: a.lag })
  }

  // Orden topológico (Kahn). indegree = cantidad de predecesores.
  const indeg = new Map<number, number>()
  for (const t of tareas) indeg.set(t.id, pred.get(t.id)!.length)
  const queue = tareas.filter((t) => indeg.get(t.id) === 0).map((t) => t.id)
  const topo: number[] = []
  while (queue.length) {
    const n = queue.shift()!
    topo.push(n)
    for (const s of succ.get(n)!) {
      indeg.set(s.id, indeg.get(s.id)! - 1)
      if (indeg.get(s.id) === 0) queue.push(s.id)
    }
  }
  if (topo.length !== tareas.length) {
    throw new Error('El grafo de dependencias de Ingeniería tiene un ciclo — no se puede calcular.')
  }

  // Desplazamiento de N días hábiles (N puede ser negativo).
  const shift = (d: ISODate, n: number) => (n >= 0 ? addBusinessDays(d, n, feriados) : subBusinessDays(d, -n, feriados))
  const unshift = (d: ISODate, n: number) => (n >= 0 ? subBusinessDays(d, n, feriados) : addBusinessDays(d, -n, feriados))
  // Duración INCLUSIVE (como Smartsheet): una tarea de 5 días arranca lunes y termina
  // viernes = ocupa 5 hábiles → fin = inicio + (dur−1). Hito de 0 días = mismo día.
  const finDe = (ini: ISODate, d: number) => (d <= 0 ? ini : addBusinessDays(ini, d - 1, feriados))
  const inicioDe = (fin: ISODate, d: number) => (d <= 0 ? fin : subBusinessDays(fin, d - 1, feriados))
  // FS: un sucesor con duración arranca el DÍA HÁBIL SIGUIENTE al fin del predecesor
  // (gap 1); un HITO (0 días) es COINCIDENTE con el fin del predecesor (gap 0), como
  // en Smartsheet (Release, PO Execution, Approvals, Shipment…). + el lag de la arista.
  const gapDe = (d: number) => (d <= 0 ? 0 : 1)

  // ── Pasada HACIA ADELANTE: ES/EF desde la fecha de inicio ──
  const ES = new Map<number, ISODate>()
  const EF = new Map<number, ISODate>()
  for (const n of topo) {
    const preds = pred.get(n)!
    const gap = gapDe(dur.get(n) ?? 0)
    let es = fechaInicio
    for (const p of preds) {
      const cand = shift(EF.get(p.id)!, gap + p.lag)   // fin del predecesor + gap del sucesor + lag
      if (cand > es) es = cand
    }
    ES.set(n, es)
    EF.set(n, finDe(es, dur.get(n) ?? 0))
  }

  // ── Pasada HACIA ATRÁS: LS/LF desde la entrega FIJA (topo inverso) ──
  const LS = new Map<number, ISODate>()
  const LF = new Map<number, ISODate>()
  for (let i = topo.length - 1; i >= 0; i--) {
    const n = topo[i]
    const succs = succ.get(n)!
    let lf = fechaEntrega
    let first = true
    for (const s of succs) {
      const cand = unshift(LS.get(s.id)!, gapDe(dur.get(s.id) ?? 0) + s.lag)   // simétrico: gap según el sucesor + lag
      if (first || cand < lf) { lf = cand; first = false }
    }
    LF.set(n, lf)
    LS.set(n, inicioDe(lf, dur.get(n) ?? 0))
  }

  // ── Holgura por tarea + estado del proyecto ──
  const out = new Map<number, HolguraTarea>()
  let finProyectado: ISODate | null = null
  let minHolgura = Infinity
  for (const t of tareas) {
    const ef = EF.get(t.id)!, lf = LF.get(t.id)!
    const holguraDias = businessDaysBetween(ef, lf, feriados)   // LF − EF
    out.set(t.id, {
      earlyStart: ES.get(t.id)!, earlyFinish: ef,
      lateStart: LS.get(t.id)!, lateFinish: lf,
      holguraDias, critico: false,
    })
    if (finProyectado === null || ef > finProyectado) finProyectado = ef
    if (holguraDias < minHolgura) minHolgura = holguraDias
  }
  // Camino crítico = las tareas con la MENOR holgura de la red (la cadena que
  // define el fin). Si el proyecto está tenso contra la entrega, esa holgura es 0;
  // si termina antes, es la holgura del proyecto — pero siguen siendo las críticas.
  if (Number.isFinite(minHolgura)) for (const h of out.values()) h.critico = h.holguraDias === minHolgura

  const holguraProyecto = finProyectado ? businessDaysBetween(finProyectado, fechaEntrega, feriados) : 0
  return { tareas: out, finProyectado, holguraProyecto, enRiesgo: holguraProyecto < 0 }
}
