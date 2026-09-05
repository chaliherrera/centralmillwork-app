// ─────────────────────────────────────────────────────────────────────────────
// Domain — Reordenar tareas del Gantt (recableado de dependencias, PURO)
// ─────────────────────────────────────────────────────────────────────────────
// El drag & drop edita la TOPOLOGÍA (aristas), nunca las fechas: las fechas las
// sigue decidiendo el CPM (holgura.ts). Al soltar la tarea X entre A (arriba) y B
// (abajo), esta función calcula el mínimo de cambios de dependencias para que X
// quede en ese lugar SIN perder coherencia:
//   1. Corta las aristas FS que contradicen el nuevo lugar.
//   2. Reconecta el hueco que deja X (como borrarTareaConReconexion).
//   3. Inserta X en el slot (X←A, B←X), sacando la arista directa B←A si existía.
//   4. Nunca crea SS ni toca SS existentes (los pares SS se mueven como bloque).
//   5. Rechaza candados (depósito), tareas hechas y ciclos.
// Es PURA: recibe el grafo en memoria y devuelve {remove, add}. No toca DB.
// ─────────────────────────────────────────────────────────────────────────────

export interface TareaRe { id: number; nombre: string; estado: string; orden_visual: number }
export interface AristaRe { tarea_id: number; depende_de_id: number; tipo: string; lag_dias: number; ignorada_at?: string | null }
export interface CambioArista { tarea_id: number; depende_de_id: number; tipo?: string; lag_dias?: number }
export interface MovResult {
  ok: boolean
  error?: string
  noop?: boolean
  remove: CambioArista[]
  add: CambioArista[]
  explicacion?: { quita: string[]; agrega: string[] }
}

type ParArista = { tarea_id: number; depende_de_id: number }

/** Adyacencia en el sentido del tiempo: depende_de_id → tarea_id (el predecesor apunta al sucesor). */
function adyacencia(aristas: ParArista[]): Map<number, number[]> {
  const adj = new Map<number, number[]>()
  for (const a of aristas) {
    if (!adj.has(a.depende_de_id)) adj.set(a.depende_de_id, [])
    adj.get(a.depende_de_id)!.push(a.tarea_id)
  }
  return adj
}

/** ¿`from` alcanza a `to` siguiendo las dependencias (from ocurre antes que to)? */
function alcanza(from: number, to: number, adj: Map<number, number[]>): boolean {
  if (from === to) return true
  const stack = [from]; const seen = new Set<number>([from])
  while (stack.length) {
    const n = stack.pop()!
    for (const m of adj.get(n) ?? []) {
      if (m === to) return true
      if (!seen.has(m)) { seen.add(m); stack.push(m) }
    }
  }
  return false
}

/** ¿El grafo tiene un ciclo? (Kahn: si no se pueden ordenar todos los nodos.) */
export function tieneCiclo(aristas: ParArista[], nodos: number[]): boolean {
  const indeg = new Map<number, number>(nodos.map((id) => [id, 0]))
  const adj = new Map<number, number[]>(nodos.map((id) => [id, []]))
  for (const a of aristas) {
    adj.get(a.depende_de_id)?.push(a.tarea_id)
    indeg.set(a.tarea_id, (indeg.get(a.tarea_id) ?? 0) + 1)
  }
  const q = nodos.filter((id) => (indeg.get(id) ?? 0) === 0)
  let vistos = 0
  while (q.length) {
    const n = q.shift()!; vistos++
    for (const m of adj.get(n) ?? []) {
      indeg.set(m, (indeg.get(m) ?? 0) - 1)
      if (indeg.get(m) === 0) q.push(m)
    }
  }
  return vistos !== nodos.length
}

const key = (t: number, d: number) => `${t}<${d}`

/**
 * Calcula el recableado para mover la tarea X al slot (A arriba, B abajo).
 * A/B = null significa "al principio" / "al final". La lista debe venir en orden
 * topológico (orden_visual). Devuelve {remove, add} o un error (candado/hecha/ciclo).
 */
export function planificarMovimiento(
  tareas: TareaRe[], aristas: AristaRe[], X: number, A: number | null, B: number | null,
): MovResult {
  const byId = new Map(tareas.map((t) => [t.id, t]))
  const tx = byId.get(X)
  if (!tx) return { ok: false, error: 'tarea no encontrada', remove: [], add: [] }
  if (tx.estado === 'hecha' || tx.estado === 'na') return { ok: false, error: 'no se puede reordenar una tarea ya realizada', remove: [], add: [] }
  if (A !== null && !byId.has(A)) return { ok: false, error: 'destino inválido', remove: [], add: [] }
  if (B !== null && !byId.has(B)) return { ok: false, error: 'destino inválido', remove: [], add: [] }

  const posA = A === null ? -Infinity : byId.get(A)!.orden_visual
  const posB = B === null ? Infinity : byId.get(B)!.orden_visual
  const pos = (id: number) => byId.get(id)?.orden_visual ?? 0

  // No se puede soltar por encima de las tareas ya hechas (el pasado no se reordena).
  const ultHecha = Math.max(-Infinity, ...tareas.filter((t) => t.estado === 'hecha' || t.estado === 'na').map((t) => t.orden_visual))
  if (posA < ultHecha) return { ok: false, error: 'no se puede mover una tarea antes de las ya realizadas', remove: [], add: [] }

  const remove: CambioArista[] = []
  const add: CambioArista[] = []
  const cutPreds = new Set<number>()
  const cutSuccs = new Set<number>()

  // ── 1) Cortar las aristas FS que contradicen el nuevo lugar ──────────────────
  const predsX = aristas.filter((a) => a.tarea_id === X)   // X ← p
  const succsX = aristas.filter((a) => a.depende_de_id === X) // s ← X
  for (const a of predsX) {
    if (a.tipo === 'SS') continue                            // los SS se conservan (bloque)
    if (pos(a.depende_de_id) > posA) {                       // el predecesor quedaría después
      if (a.ignorada_at) return { ok: false, error: 'esa dependencia tiene un candado (depósito): movela después del depósito o abrí el candado', remove: [], add: [] }
      remove.push({ tarea_id: a.tarea_id, depende_de_id: a.depende_de_id })
      cutPreds.add(a.depende_de_id)
    }
  }
  for (const a of succsX) {
    if (a.tipo === 'SS') continue
    if (pos(a.tarea_id) < posB) {                            // el sucesor quedaría antes
      if (a.ignorada_at) return { ok: false, error: 'esa dependencia tiene un candado', remove: [], add: [] }
      remove.push({ tarea_id: a.tarea_id, depende_de_id: a.depende_de_id })
      cutSuccs.add(a.tarea_id)
    }
  }

  const removeSet = new Set(remove.map((r) => key(r.tarea_id, r.depende_de_id)))
  const working = aristas.filter((a) => !removeSet.has(key(a.tarea_id, a.depende_de_id)))
  const existe = (t: number, d: number) =>
    working.some((a) => a.tarea_id === t && a.depende_de_id === d) || add.some((a) => a.tarea_id === t && a.depende_de_id === d)

  // ── 2) Reconectar el hueco (como borrarTareaConReconexion): para cada par
  //       (predecesor p, sucesor s) de X cuya conexión a través de X se cortó
  //       (p cortado, o s cortado), s pasa a esperar a p (s ← p) — salvo que ya
  //       exista o p ya alcance a s por otro camino ─────────────────────────────
  const allPreds = predsX.map((a) => a.depende_de_id)
  const allSuccs = succsX.map((a) => a.tarea_id)
  for (const p of allPreds) {
    for (const s of allSuccs) {
      if (p === s || (!cutPreds.has(p) && !cutSuccs.has(s))) continue
      if (existe(s, p)) continue
      if (alcanza(p, s, adyacencia([...working, ...add]))) continue
      add.push({ tarea_id: s, depende_de_id: p, tipo: 'FS', lag_dias: 0 })
    }
  }

  // ── 3) Insertar X en el slot ─────────────────────────────────────────────────
  if (A !== null && !existe(X, A) && !alcanza(A, X, adyacencia([...working, ...add]))) add.push({ tarea_id: X, depende_de_id: A, tipo: 'FS', lag_dias: 0 })
  if (B !== null && !existe(B, X) && !alcanza(X, B, adyacencia([...working, ...add]))) add.push({ tarea_id: B, depende_de_id: X, tipo: 'FS', lag_dias: 0 })
  // Sacar la arista directa B←A (FS, lag 0) si existía: ahora X va en el medio.
  if (A !== null && B !== null) {
    const ba = working.find((a) => a.tarea_id === B && a.depende_de_id === A && a.tipo !== 'SS' && (a.lag_dias || 0) === 0)
    if (ba) remove.push({ tarea_id: B, depende_de_id: A })
  }

  if (remove.length === 0 && add.length === 0) return { ok: true, noop: true, remove: [], add: [] }

  // ── 9) Validar que el grafo final sea acíclico ───────────────────────────────
  const finalRemove = new Set(remove.map((r) => key(r.tarea_id, r.depende_de_id)))
  const finalAristas = [...aristas.filter((a) => !finalRemove.has(key(a.tarea_id, a.depende_de_id))), ...add]
  if (tieneCiclo(finalAristas, tareas.map((t) => t.id))) return { ok: false, error: 'ese movimiento crearía un ciclo de dependencias', remove: [], add: [] }

  const nombre = (id: number) => byId.get(id)?.nombre ?? `#${id}`
  return {
    ok: true, remove, add,
    explicacion: {
      quita: remove.map((r) => `${nombre(r.tarea_id)} ← ${nombre(r.depende_de_id)}`),
      agrega: add.map((a) => `${nombre(a.tarea_id)} ← ${nombre(a.depende_de_id)}`),
    },
  }
}
