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
