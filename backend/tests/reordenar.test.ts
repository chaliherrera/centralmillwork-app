import { describe, it, expect } from 'vitest'
import { planificarMovimiento, type TareaRe, type AristaRe, type MovResult } from '@/modules/ingenieria/domain/reordenar'

// Helpers ---------------------------------------------------------------------
function tareas(...ids: Array<[number, string] | [number, string, string]>): TareaRe[] {
  return ids.map(([id, nombre, estado], i) => ({ id, nombre, estado: estado ?? 'pendiente', orden_visual: i + 1 }))
}
function dep(t: number, d: number, tipo = 'FS', lag = 0, lock = false): AristaRe {
  return { tarea_id: t, depende_de_id: d, tipo, lag_dias: lag, ignorada_at: lock ? '2026-01-01' : null }
}
/** Aplica remove/add y devuelve un orden topológico (o null si hay ciclo). */
function ordenFinal(aristas: AristaRe[], res: MovResult, ids: number[]): number[] | null {
  const rm = new Set(res.remove.map((r) => `${r.tarea_id}<${r.depende_de_id}`))
  const fin = [...aristas.filter((a) => !rm.has(`${a.tarea_id}<${a.depende_de_id}`)), ...res.add.map((a) => ({ ...a, tipo: a.tipo ?? 'FS', lag_dias: a.lag_dias ?? 0 }))]
  const indeg = new Map(ids.map((id) => [id, 0])); const adj = new Map(ids.map((id) => [id, [] as number[]]))
  for (const a of fin) { adj.get(a.depende_de_id)!.push(a.tarea_id); indeg.set(a.tarea_id, indeg.get(a.tarea_id)! + 1) }
  const q = ids.filter((id) => indeg.get(id) === 0).sort((a, b) => a - b); const out: number[] = []
  while (q.length) { const n = q.shift()!; out.push(n); for (const m of adj.get(n)!) { indeg.set(m, indeg.get(m)! - 1); if (indeg.get(m) === 0) { q.push(m); q.sort((a, b) => a - b) } } }
  return out.length === ids.length ? out : null
}
const idx = (o: number[], id: number) => o.indexOf(id)

describe('reordenar — recableado de dependencias', () => {
  it('cadena simple: mover 2 entre 3 y 4 → 1,3,2,4', () => {
    const T = tareas([1, 'po'], [2, 'B'], [3, 'C'], [4, 'D'])
    const A = [dep(2, 1), dep(3, 2), dep(4, 3)]
    const r = planificarMovimiento(T, A, 2, 3, 4)
    expect(r.ok).toBe(true)
    const o = ordenFinal(A, r, [1, 2, 3, 4])!
    expect(o).not.toBeNull()
    expect(idx(o, 3)).toBeLessThan(idx(o, 2))   // 2 después de 3
    expect(idx(o, 2)).toBeLessThan(idx(o, 4))   // 2 antes de 4
  })

  it('material_proc entre 6 y 7: reparenta a field, NO serializa sd_update, conserva depósito', () => {
    // 1 po, 2 deposit(candado sobre 9), 5 approval, 6 field, 7 sd_update, 9 material_proc, 10 fabrication
    const T = tareas([1, 'po'], [2, 'deposit'], [5, 'approval'], [6, 'field'], [7, 'sd_update'], [9, 'material_proc'], [10, 'fabrication'])
    const A = [
      dep(5, 1), dep(6, 5), dep(7, 6),
      dep(9, 5), dep(9, 2, 'FS', 0, true),   // material_proc ← approval y ← deposit (CANDADO, se conserva)
      dep(10, 9),                             // fabrication ← material_proc (se conserva)
    ]
    const r = planificarMovimiento(T, A, 9, 6, 7)   // mover material_proc entre field(6) y sd_update(7)
    expect(r.ok).toBe(true)
    // NO obliga a sd_update a esperar a material_proc (no serializa)
    expect(r.add.some((a) => a.tarea_id === 7 && a.depende_de_id === 9)).toBe(false)
    const o = ordenFinal(A, r, [1, 2, 5, 6, 7, 9, 10])!
    expect(o).not.toBeNull()
    expect(idx(o, 6)).toBeLessThan(idx(o, 9))    // 9 arranca después de field (reparentado)
    expect(idx(o, 2)).toBeLessThan(idx(o, 9))    // el depósito (candado) sigue antes de 9
    expect(idx(o, 9)).toBeLessThan(idx(o, 10))   // fabricación sigue después de 9
  })

  it('candado: cortar una arista con candado → rechazo', () => {
    const T = tareas([1, 'po'], [2, 'deposit'], [9, 'material_proc'])
    const A = [dep(9, 2, 'FS', 0, true)]   // 9 ← deposit CANDADO
    const r = planificarMovimiento(T, A, 9, 1, 2)   // intentar mover 9 antes del depósito
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/candado/)
  })

  it('par SS: no se corta la arista SS (se conserva como bloque)', () => {
    // samples(4) SS shop_drawings(3): arrancan juntas. Mover samples no rompe el SS.
    const T = tareas([3, 'shop'], [4, 'samples'], [5, 'approval'])
    const A = [dep(4, 3, 'SS'), dep(5, 4)]
    const r = planificarMovimiento(T, A, 4, 5, null)   // mover samples al final
    expect(r.ok).toBe(true)
    // La arista SS (4←3) NO debe estar en remove
    expect(r.remove.some((x) => x.tarea_id === 4 && x.depende_de_id === 3)).toBe(false)
  })

  it('tarea hecha: rechazo', () => {
    const T = tareas([1, 'A', 'hecha'], [2, 'B'])
    const r = planificarMovimiento(T, [dep(2, 1)], 1, 2, null)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/realizada/)
  })

  it('no se puede soltar antes de una tarea ya hecha', () => {
    const T = tareas([1, 'A', 'hecha'], [2, 'B'], [3, 'C'])
    const A = [dep(2, 1), dep(3, 2)]
    const r = planificarMovimiento(T, A, 3, null, 1)   // intentar mover C al principio (antes de A hecha)
    expect(r.ok).toBe(false)
  })

  it('no-op: soltar entre los vecinos actuales no cambia nada', () => {
    const T = tareas([1, 'A'], [2, 'B'], [3, 'C'])
    const A = [dep(2, 1), dep(3, 2)]
    const r = planificarMovimiento(T, A, 2, 1, 3)   // B ya está entre A y C
    expect(r.ok).toBe(true)
    expect(r.noop).toBe(true)
    expect(r.remove.length + r.add.length).toBe(0)
  })

  it('B←A con lag se conserva (no se saca la arista directa)', () => {
    const T = tareas([1, 'A'], [3, 'C'], [2, 'B'])   // orden visual A(1), C(2), B(3)
    const A = [dep(3, 1, 'FS', 5)]   // C ← A con lag 5 (intencional)
    const r = planificarMovimiento(T, A, 2, 1, 3)   // insertar B entre A y C
    expect(r.ok).toBe(true)
    // La arista C←A con lag 5 NO se saca (solo se saca la directa FS lag 0)
    expect(r.remove.some((x) => x.tarea_id === 3 && x.depende_de_id === 1)).toBe(false)
  })

  it('mover al final (B=null): sin ciclo, queda al final', () => {
    const T = tareas([1, 'A'], [2, 'B'], [3, 'C'], [4, 'D'])
    const A = [dep(2, 1), dep(3, 2), dep(4, 3)]
    const r = planificarMovimiento(T, A, 2, 4, null)
    expect(r.ok).toBe(true)
    const o = ordenFinal(A, r, [1, 2, 3, 4])!
    expect(o).not.toBeNull()
    expect(idx(o, 4)).toBeLessThan(idx(o, 2))   // 2 al final, después de 4
  })

  it('B con varios predecesores: X se suma como uno más sin romper los otros', () => {
    // fabrication(10) depende de release(8), cnc(9), material(7). Insertar X(6) antes de fabrication.
    const T = tareas([5, 'approval'], [6, 'X'], [7, 'material'], [8, 'release'], [9, 'cnc'], [10, 'fabrication'])
    const A = [dep(6, 5), dep(10, 7), dep(10, 8), dep(10, 9)]
    const r = planificarMovimiento(T, A, 6, 9, 10)   // mover X entre cnc(9) y fabrication(10)
    expect(r.ok).toBe(true)
    const o = ordenFinal(A, r, [5, 6, 7, 8, 9, 10])!
    expect(o).not.toBeNull()
    // fabrication sigue después de sus 3 predecesores originales
    for (const p of [7, 8, 9]) expect(idx(o, p)).toBeLessThan(idx(o, 10))
    expect(idx(o, 6)).toBeLessThan(idx(o, 10))   // y ahora también después de X
  })

  it('ramas paralelas: reordenar NUNCA serializa (no agrega B←X)', () => {
    // long_leads(2) y shop_drawings(3) dependen AMBAS de meeting(1) → corren en paralelo.
    // Arrastrar long_leads entre meeting y shop_drawings NO debe crear shop_drawings ← long_leads
    // (que sumaría los 20 días de long lead al camino de shop drawings).
    const T = tareas([1, 'meeting'], [3, 'shop_drawings'], [2, 'long_leads'])
    const A = [dep(2, 1), dep(3, 1)]                    // ambas ← meeting
    const r = planificarMovimiento(T, A, 2, 1, 3)       // mover long_leads entre meeting y shop_drawings
    expect(r.ok).toBe(true)
    expect(r.add.some((a) => a.tarea_id === 3 && a.depende_de_id === 2)).toBe(false)  // NUNCA shop←long
  })

  it('reparenta cortando el predecesor tardío, sin serializar el paralelo (caso del bug real)', () => {
    // meeting(1) → shop_drawings(3) → samples(4, SS). long_leads(2) quedó ← samples (arista
    // aberrante que lo atrasa a la posición 6). Arrastrarlo arriba debe: cortar 2←samples,
    // reparentarlo a meeting, y NO hacer que shop ni samples esperen a long_leads.
    const T = tareas([1, 'meeting'], [3, 'shop_drawings'], [4, 'samples'], [2, 'long_leads'])
    const A = [dep(3, 1), dep(4, 3, 'SS'), dep(2, 4)]   // long_leads ← samples (tardía/aberrante)
    const r = planificarMovimiento(T, A, 2, 1, 3)       // mover long_leads entre meeting y shop_drawings
    expect(r.ok).toBe(true)
    expect(r.remove.some((x) => x.tarea_id === 2 && x.depende_de_id === 4)).toBe(true)   // corta la tardía
    expect(r.add.some((a) => a.tarea_id === 2 && a.depende_de_id === 1)).toBe(true)      // reparenta a meeting
    expect(r.add.some((a) => a.tarea_id === 3 && a.depende_de_id === 2)).toBe(false)     // NO shop←long
    expect(r.add.some((a) => a.tarea_id === 4 && a.depende_de_id === 2)).toBe(false)     // NO samples←long
    const o = ordenFinal(A, r, [1, 2, 3, 4])!
    expect(o).not.toBeNull()
    expect(idx(o, 1)).toBeLessThan(idx(o, 2))    // long_leads después de meeting
  })
})
