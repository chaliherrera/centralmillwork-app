import { describe, it, expect } from 'vitest'
import { normalizeNotaScope } from '../../src/utils/informeNotas'

describe('normalizeNotaScope', () => {
  it('alcance proyecto: sin item ni material', () => {
    expect(normalizeNotaScope({})).toEqual({ item: null, material_id: null })
    expect(normalizeNotaScope({ item: '', material_id: null })).toEqual({ item: null, material_id: null })
    expect(normalizeNotaScope({ item: '   ' })).toEqual({ item: null, material_id: null })
  })

  it('alcance ítem: item sin material', () => {
    expect(normalizeNotaScope({ item: '12' })).toEqual({ item: '12', material_id: null })
    expect(normalizeNotaScope({ item: ' 7 ' })).toEqual({ item: '7', material_id: null })
  })

  it('alcance material+ítem', () => {
    expect(normalizeNotaScope({ item: '12', material_id: 1491 })).toEqual({ item: '12', material_id: 1491 })
    expect(normalizeNotaScope({ item: '12', material_id: '1491' })).toEqual({ item: '12', material_id: 1491 })
  })

  it('material sin item es inválido', () => {
    expect(() => normalizeNotaScope({ material_id: 1491 })).toThrow(/requiere item/)
  })

  it('material_id no entero / no positivo es inválido', () => {
    expect(() => normalizeNotaScope({ item: '12', material_id: 0 })).toThrow(/material_id/)
    expect(() => normalizeNotaScope({ item: '12', material_id: -3 })).toThrow(/material_id/)
    expect(() => normalizeNotaScope({ item: '12', material_id: 1.5 })).toThrow(/material_id/)
    expect(() => normalizeNotaScope({ item: '12', material_id: 'abc' })).toThrow(/material_id/)
  })
})
