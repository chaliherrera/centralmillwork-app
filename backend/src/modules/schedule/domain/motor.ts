// ─────────────────────────────────────────────────────────────────────────────
// Domain — Motor de cálculo de fechas planeadas (hacia atrás desde la entrega)
// ─────────────────────────────────────────────────────────────────────────────
// Implementa el "reloj hacia atrás" del Mapa de Hitos (Principio P5): desde la
// fecha objetivo de entrega, calcula la fecha límite de cada hito respetando
// duraciones (en días hábiles) y dependencias.
//
// Algoritmo (ver docs/SCHEDULE_ETAPA1_DISENO_TECNICO.md §5):
//   1. Se arma el DAG de dependencias y su orden topológico (detecta ciclos).
//   2. Se identifica el hito ANCLA (es_ancla, normalmente I-07 "entrega") y el
//      conjunto A = ancla + todos sus ancestros (los que deben cumplirse antes
//      de la entrega — la "espina dorsal crítica").
//   3. Pasada HACIA ATRÁS sobre A: el ancla se fija en la fecha objetivo; cada
//      predecesor = la fecha más temprana que le exijan sus sucesores
//      (fecha_sucesor − duración_sucesor). El más apremiante manda (P7).
//   4. Pasada HACIA ADELANTE para los hitos fuera de A (ramas laterales y
//      post-entrega, ej. cobro X-03): fecha = fin del último predecesor +
//      su propia duración.
//
// Funciones PURAS: no tocan DB ni Express. Testeable en aislamiento.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ISODate,
  subBusinessDays,
  addBusinessDays,
} from './calendario'

export interface HitoDef {
  codigo: string
  /** duración en días hábiles */
  dur: number
  es_ancla: boolean
}

export interface DepDef {
  /** el hito que depende */
  hito: string
  /** su predecesor */
  dependeDe: string
}

export interface MotorResultado {
  /** codigo → fecha planeada (deadline de cumplimiento del hito) */
  planeadas: Map<string, ISODate>
  /** fecha de inicio requerida del proyecto (el ancestro más temprano de la entrega) */
  fechaInicioRequerida: ISODate | null
}

/**
 * Calcula la fecha planeada de cada hito a partir de la fecha objetivo.
 * @throws si el grafo tiene un ciclo o no hay hito ancla.
 */
export function calcularPlaneadas(
  hitos: HitoDef[],
  deps: DepDef[],
  fechaObjetivo: ISODate,
  feriados: Set<ISODate>
): MotorResultado {
  const dur = new Map<string, number>()
  for (const h of hitos) dur.set(h.codigo, Math.max(0, h.dur | 0))

  const ancla = hitos.find((h) => h.es_ancla)
  if (!ancla) throw new Error('La plantilla no tiene hito ancla (es_ancla).')

  // pred[x] = de qué depende x ; succ[x] = quiénes dependen de x
  const pred = new Map<string, string[]>()
  const succ = new Map<string, string[]>()
  for (const h of hitos) { pred.set(h.codigo, []); succ.set(h.codigo, []) }
  for (const d of deps) {
    if (!pred.has(d.hito) || !pred.has(d.dependeDe)) continue
    pred.get(d.hito)!.push(d.dependeDe)
    succ.get(d.dependeDe)!.push(d.hito)
  }

  // Orden topológico (Kahn). indegree = cantidad de predecesores.
  const indeg = new Map<string, number>()
  for (const h of hitos) indeg.set(h.codigo, pred.get(h.codigo)!.length)
  const queue = hitos.filter((h) => indeg.get(h.codigo) === 0).map((h) => h.codigo)
  const topo: string[] = []
  while (queue.length) {
    const n = queue.shift()!
    topo.push(n)
    for (const s of succ.get(n)!) {
      indeg.set(s, indeg.get(s)! - 1)
      if (indeg.get(s) === 0) queue.push(s)
    }
  }
  if (topo.length !== hitos.length) {
    throw new Error('El grafo de dependencias tiene un ciclo — no se puede programar.')
  }

  // A = ancla + ancestros (BFS hacia atrás por pred)
  const enA = new Set<string>([ancla.codigo])
  const stack = [ancla.codigo]
  while (stack.length) {
    const n = stack.pop()!
    for (const p of pred.get(n)!) if (!enA.has(p)) { enA.add(p); stack.push(p) }
  }

  const planeadas = new Map<string, ISODate>()

  // Pasada HACIA ATRÁS sobre A: procesar sucesores antes que predecesores
  // (orden topológico inverso).
  planeadas.set(ancla.codigo, fechaObjetivo)
  for (let i = topo.length - 1; i >= 0; i--) {
    const n = topo[i]
    if (!enA.has(n) || n === ancla.codigo) continue
    let mejor: ISODate | null = null
    for (const s of succ.get(n)!) {
      if (!enA.has(s)) continue
      const fin = planeadas.get(s)
      if (!fin) continue
      const req = subBusinessDays(fin, dur.get(s) ?? 0, feriados) // fin del predecesor = inicio del sucesor
      if (mejor === null || req < mejor) mejor = req
    }
    // Si por algún motivo no tiene sucesores en A, cae a la fecha objetivo.
    planeadas.set(n, mejor ?? fechaObjetivo)
  }

  // Pasada HACIA ADELANTE para los que NO están en A (ramas laterales y
  // post-entrega): fin = último predecesor + duración propia.
  for (const n of topo) {
    if (enA.has(n)) continue
    const preds = pred.get(n)!
    if (preds.length === 0) {
      // raíz suelta fuera de la espina — sin restricción; ancla como default.
      planeadas.set(n, fechaObjetivo)
      continue
    }
    let maxFin: ISODate | null = null
    for (const p of preds) {
      const finP = planeadas.get(p)
      if (finP && (maxFin === null || finP > maxFin)) maxFin = finP
    }
    planeadas.set(n, addBusinessDays(maxFin ?? fechaObjetivo, dur.get(n) ?? 0, feriados))
  }

  // Fecha de inicio requerida = el ancestro con la fecha planeada más temprana
  let fechaInicioRequerida: ISODate | null = null
  for (const c of enA) {
    const f = planeadas.get(c)
    if (f && (fechaInicioRequerida === null || f < fechaInicioRequerida)) fechaInicioRequerida = f
  }

  return { planeadas, fechaInicioRequerida }
}
