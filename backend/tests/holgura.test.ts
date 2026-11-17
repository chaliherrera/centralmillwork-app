import { describe, it, expect } from 'vitest'
import { calcularHolgura, type TareaCPM, type AristaCPM } from '@/modules/ingenieria/domain/holgura'

// Función PURA (no toca DB). Verifica el CPM del módulo de Tareas de Ingeniería:
// holgura hacia atrás desde una fecha de entrega FIJA.
const F = new Set<string>() // sin feriados

describe('calcularHolgura (CPM sobre fecha fija)', () => {
  // A(5)→B(5)→C(3) es la cadena crítica; D(2) es rama paralela (dep A, junto a C).
  const tareas: TareaCPM[] = [{ id: 1, dur: 5 }, { id: 2, dur: 5 }, { id: 3, dur: 3 }, { id: 4, dur: 2 }]
  const aristas: AristaCPM[] = [
    { tareaId: 2, dependeDeId: 1, lag: 0 },
    { tareaId: 3, dependeDeId: 2, lag: 0 },
    { tareaId: 4, dependeDeId: 1, lag: 0 },
    { tareaId: 3, dependeDeId: 4, lag: 0 },
  ]

  it('camino crítico con holgura 0 y rama paralela con holgura', () => {
    const r = calcularHolgura(tareas, aristas, '2026-01-05', '2026-01-21', F)
    expect(r.holguraProyecto).toBe(0)
    expect(r.enRiesgo).toBe(false)
    expect(r.finProyectado).toBe('2026-01-21')
    expect(r.tareas.get(1)!.holguraDias).toBe(0) // A crítico
    expect(r.tareas.get(2)!.holguraDias).toBe(0) // B crítico
    expect(r.tareas.get(3)!.holguraDias).toBe(0) // C crítico
    expect(r.tareas.get(3)!.critico).toBe(true)
    expect(r.tareas.get(4)!.holguraDias).toBe(3) // D rama con holgura
    expect(r.tareas.get(4)!.critico).toBe(false)
  })

  it('extender una tarea mete el proyecto en RIESGO sin mover la entrega', () => {
    const t2 = [{ id: 1, dur: 5 }, { id: 2, dur: 5 }, { id: 3, dur: 8 }, { id: 4, dur: 2 }]
    const r = calcularHolgura(t2, aristas, '2026-01-05', '2026-01-21', F)
    expect(r.enRiesgo).toBe(true)
    expect(r.holguraProyecto).toBe(-5)
  })

  it('borrar una tarea de la cadena libera holgura (entrega fija)', () => {
    // Sin C: la cadena termina en B (EF Jan-19) -> holgura hasta Jan-22.
    const sinC = tareas.filter((t) => t.id !== 3)
    const aristasSinC = aristas.filter((a) => a.tareaId !== 3 && a.dependeDeId !== 3)
    const r = calcularHolgura(sinC, aristasSinC, '2026-01-05', '2026-01-21', F)
    expect(r.enRiesgo).toBe(false)
    expect(r.holguraProyecto).toBeGreaterThan(0) // aparece holgura
  })

  it('respeta el lag (FS+Nd) en la pasada hacia adelante', () => {
    // A(3) -> B(2) con lag 2: B arranca 2 días hábiles después del fin de A.
    const r = calcularHolgura(
      [{ id: 1, dur: 3 }, { id: 2, dur: 2 }],
      [{ tareaId: 2, dependeDeId: 1, lag: 2 }],
      '2026-03-02', '2026-03-31', F,
    )
    // A(3, inclusive): 02→04 mar. B arranca el día hábil siguiente + lag 2 = 09 mar; fin (dur2) = 10 mar.
    expect(r.tareas.get(1)!.earlyFinish).toBe('2026-03-04')
    expect(r.tareas.get(2)!.earlyStart).toBe('2026-03-09')
    expect(r.tareas.get(2)!.earlyFinish).toBe('2026-03-10')
  })

  it('detecta ciclos', () => {
    expect(() => calcularHolgura(
      [{ id: 1, dur: 1 }, { id: 2, dur: 1 }],
      [{ tareaId: 2, dependeDeId: 1, lag: 0 }, { tareaId: 1, dependeDeId: 2, lag: 0 }],
      '2026-01-05', '2026-01-22', F,
    )).toThrow()
  })
})

// FF (finish-to-finish) y SF (start-to-finish) estilo MS Project. 02-mar-2026 = lunes.
describe('calcularHolgura — tipos FF y SF', () => {
  const entrega = '2026-04-30'

  it('FF: B termina con el fin de A (lag 0)', () => {
    // A(5): 02→06 mar. B(2) FF A: fin(B) = fin(A) = 06; inicio(B) = 05.
    const r = calcularHolgura(
      [{ id: 1, dur: 5 }, { id: 2, dur: 2 }],
      [{ tareaId: 2, dependeDeId: 1, lag: 0, tipo: 'FF' }],
      '2026-03-02', entrega, F,
    )
    expect(r.tareas.get(1)!.earlyFinish).toBe('2026-03-06')
    expect(r.tareas.get(2)!.earlyStart).toBe('2026-03-05')
    expect(r.tareas.get(2)!.earlyFinish).toBe('2026-03-06')
  })

  it('FF con lag +2d y -1d corre el fin de B', () => {
    const mas = calcularHolgura(
      [{ id: 1, dur: 5 }, { id: 2, dur: 2 }],
      [{ tareaId: 2, dependeDeId: 1, lag: 2, tipo: 'FF' }],
      '2026-03-02', entrega, F,
    )
    expect(mas.tareas.get(2)!.earlyStart).toBe('2026-03-09')
    expect(mas.tareas.get(2)!.earlyFinish).toBe('2026-03-10')
    const menos = calcularHolgura(
      [{ id: 1, dur: 5 }, { id: 2, dur: 2 }],
      [{ tareaId: 2, dependeDeId: 1, lag: -1, tipo: 'FF' }],
      '2026-03-02', entrega, F,
    )
    expect(menos.tareas.get(2)!.earlyStart).toBe('2026-03-04')
    expect(menos.tareas.get(2)!.earlyFinish).toBe('2026-03-05')
  })

  it('FF: sucesor más largo que el predecesor se ancla al inicio y termina ≥ que A', () => {
    // B(10) FF A(5): la cota caería antes del inicio → clampa a fechaInicio; EF(B) ≥ EF(A).
    const r = calcularHolgura(
      [{ id: 1, dur: 5 }, { id: 2, dur: 10 }],
      [{ tareaId: 2, dependeDeId: 1, lag: 0, tipo: 'FF' }],
      '2026-03-02', entrega, F,
    )
    expect(r.tareas.get(2)!.earlyStart).toBe('2026-03-02')
    expect(r.tareas.get(2)!.earlyFinish >= r.tareas.get(1)!.earlyFinish).toBe(true)
  })

  it('SF: B termina cuando arranca A (A demorada por "no antes de")', () => {
    // A arranca 09-mar (piso). B(2) SF A: fin(B) = hábil anterior al inicio de A = 06; inicio(B) = 05.
    const r = calcularHolgura(
      [{ id: 1, dur: 5, noAntesDe: '2026-03-09' }, { id: 2, dur: 2 }],
      [{ tareaId: 2, dependeDeId: 1, lag: 0, tipo: 'SF' }],
      '2026-03-02', entrega, F,
    )
    expect(r.tareas.get(1)!.earlyStart).toBe('2026-03-09')
    expect(r.tareas.get(2)!.earlyStart).toBe('2026-03-05')
    expect(r.tareas.get(2)!.earlyFinish).toBe('2026-03-06')
  })

  it('SF hito (0 días) coincide con el inicio de A', () => {
    const r = calcularHolgura(
      [{ id: 1, dur: 5, noAntesDe: '2026-03-09' }, { id: 2, dur: 0 }],
      [{ tareaId: 2, dependeDeId: 1, lag: 0, tipo: 'SF' }],
      '2026-03-02', entrega, F,
    )
    expect(r.tareas.get(2)!.earlyStart).toBe('2026-03-09')
    expect(r.tareas.get(2)!.earlyFinish).toBe('2026-03-09')
  })
})
