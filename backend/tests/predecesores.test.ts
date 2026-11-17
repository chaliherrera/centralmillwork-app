import { describe, it, expect } from 'vitest'
import {
  parsearPredecesores, resolverPredecesores, formatearPredecesores,
  type PredRef,
} from '@/modules/ingenieria/domain/predecesores'

// Módulo PURO: parser de la columna "Predecesoras" estilo MS Project.
describe('parsearPredecesores — sintaxis válida', () => {
  const ok = (texto: string): PredRef[] => {
    const r = parsearPredecesores(texto)
    if (!r.ok) throw new Error('esperaba ok: ' + JSON.stringify(r.errores))
    return r.items
  }

  it('vacío = sin predecesores', () => {
    expect(ok('')).toEqual([])
    expect(ok('   ')).toEqual([])
  })

  it('número solo = FS sin lag', () => {
    expect(ok('5')).toEqual([{ fila: 5, tipo: 'FS', lag: 0 }])
  })

  it('tipo explícito, case-insensitive', () => {
    expect(ok('5FS')).toEqual([{ fila: 5, tipo: 'FS', lag: 0 }])
    expect(ok('5ss')).toEqual([{ fila: 5, tipo: 'SS', lag: 0 }])
    expect(ok('7FF')).toEqual([{ fila: 7, tipo: 'FF', lag: 0 }])
    expect(ok('3sf')).toEqual([{ fila: 3, tipo: 'SF', lag: 0 }])
  })

  it('alias en español FC/CC/CF', () => {
    expect(ok('5FC')).toEqual([{ fila: 5, tipo: 'FS', lag: 0 }])
    expect(ok('5CC')).toEqual([{ fila: 5, tipo: 'SS', lag: 0 }])
    expect(ok('5CF')).toEqual([{ fila: 5, tipo: 'SF', lag: 0 }])
  })

  it('desfase + y -', () => {
    expect(ok('5FS+2d')).toEqual([{ fila: 5, tipo: 'FS', lag: 2 }])
    expect(ok('5SS-1d')).toEqual([{ fila: 5, tipo: 'SS', lag: -1 }])
    expect(ok('5+2d')).toEqual([{ fila: 5, tipo: 'FS', lag: 2 }])  // sin tipo = FS
  })

  it('varios predecesores con coma y punto y coma', () => {
    expect(ok('3,5')).toEqual([{ fila: 3, tipo: 'FS', lag: 0 }, { fila: 5, tipo: 'FS', lag: 0 }])
    expect(ok('3FS+2d, 5SS-1d')).toEqual([{ fila: 3, tipo: 'FS', lag: 2 }, { fila: 5, tipo: 'SS', lag: -1 }])
    expect(ok('3;5')).toEqual([{ fila: 3, tipo: 'FS', lag: 0 }, { fila: 5, tipo: 'FS', lag: 0 }])
  })

  it('tolera espacios en el medio', () => {
    expect(ok(' 5 FF + 2 d ')).toEqual([{ fila: 5, tipo: 'FF', lag: 2 }])
  })
})

describe('parsearPredecesores — errores', () => {
  const err = (texto: string) => {
    const r = parsearPredecesores(texto)
    if (r.ok) throw new Error('esperaba error')
    return r.errores
  }

  it('SINTAXIS: texto que no arranca con número', () => {
    expect(err('hola')[0].codigo).toBe('SINTAXIS')
  })
  it('SINTAXIS: predecesor vacío (coma de más)', () => {
    expect(err('5,,3').some((e) => e.codigo === 'SINTAXIS')).toBe(true)
    expect(err('5,').some((e) => e.codigo === 'SINTAXIS')).toBe(true)
  })
  it('TIPO_INVALIDO', () => {
    expect(err('5XY')[0].codigo).toBe('TIPO_INVALIDO')
  })
  it('UNIDAD_INVALIDA', () => {
    expect(err('5FS+2w')[0].codigo).toBe('UNIDAD_INVALIDA')
    expect(err('5+3sem')[0].codigo).toBe('UNIDAD_INVALIDA')
  })
  it('LAG_FUERA_DE_RANGO', () => {
    expect(err('5FS+400d')[0].codigo).toBe('LAG_FUERA_DE_RANGO')
  })
  it('DUPLICADO', () => {
    expect(err('5,5SS')[0].codigo).toBe('DUPLICADO')
  })
  it('acumula varios errores, no corta en el primero', () => {
    const es = err('XY, 5+9w')
    expect(es.length).toBe(2)
  })
})

describe('resolverPredecesores — fila → id', () => {
  const orden = [101, 102, 103, 104]  // fila 1=101 … fila 4=104

  it('mapea fila a id', () => {
    const r = resolverPredecesores([{ fila: 1, tipo: 'FS', lag: 0 }, { fila: 3, tipo: 'SS', lag: 2 }], orden, 104)
    if (!r.ok) throw new Error('esperaba ok')
    expect(r.aristas).toEqual([
      { depende_de_id: 101, tipo: 'FS', lag: 0 },
      { depende_de_id: 103, tipo: 'SS', lag: 2 },
    ])
  })

  it('REF_INEXISTENTE: fila fuera de rango', () => {
    const r = resolverPredecesores([{ fila: 9, tipo: 'FS', lag: 0 }], orden, 104)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores[0].codigo).toBe('REF_INEXISTENTE')
  })

  it('AUTO_DEPENDENCIA: la fila apunta a la propia tarea', () => {
    const r = resolverPredecesores([{ fila: 2, tipo: 'FS', lag: 0 }], orden, 102)  // fila 2 = id 102 = tareaId
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores[0].codigo).toBe('AUTO_DEPENDENCIA')
  })
})

describe('formatearPredecesores — ida y vuelta', () => {
  const filaPorId = new Map([[101, 1], [102, 2], [103, 3]])

  it('omite FS y +0d', () => {
    expect(formatearPredecesores([{ depende_de_id: 101, tipo: 'FS', lag: 0 }], filaPorId)).toBe('1')
    expect(formatearPredecesores([{ depende_de_id: 103, tipo: 'SS', lag: 2 }], filaPorId)).toBe('3SS+2d')
    expect(formatearPredecesores([{ depende_de_id: 102, tipo: 'FF', lag: -1 }], filaPorId)).toBe('2FF-1d')
  })

  it('parsear(formatear(x)) es estable (canónico)', () => {
    const aristas = [
      { depende_de_id: 103, tipo: 'SS' as const, lag: 2 },
      { depende_de_id: 101, tipo: 'FS' as const, lag: 0 },
    ]
    const texto = formatearPredecesores(aristas, filaPorId)  // ordena por fila → "1,3SS+2d"
    expect(texto).toBe('1,3SS+2d')
    const r = parsearPredecesores(texto)
    if (!r.ok) throw new Error('reparse falló')
    expect(r.items).toEqual([{ fila: 1, tipo: 'FS', lag: 0 }, { fila: 3, tipo: 'SS', lag: 2 }])
  })
})
