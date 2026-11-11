import { describe, it, expect } from 'vitest'
import { normalizeSeleccion } from '../../src/utils/informes'

describe('normalizeSeleccion', () => {
  it('normaliza proyectos con ítems', () => {
    expect(normalizeSeleccion([{ proyecto_id: 28, items: ['12', '15'] }]))
      .toEqual([{ proyecto_id: 28, items: ['12', '15'] }])
  })

  it('items vacío = todos (se conserva [])', () => {
    expect(normalizeSeleccion([{ proyecto_id: 28, items: [] }]))
      .toEqual([{ proyecto_id: 28, items: [] }])
    expect(normalizeSeleccion([{ proyecto_id: 28 }]))
      .toEqual([{ proyecto_id: 28, items: [] }])
  })

  it('deduplica y recorta ítems', () => {
    expect(normalizeSeleccion([{ proyecto_id: 7, items: [' 1 ', '1', '2', ''] }]))
      .toEqual([{ proyecto_id: 7, items: ['1', '2'] }])
  })

  it('acepta varios proyectos', () => {
    const r = normalizeSeleccion([
      { proyecto_id: 28, items: ['12'] },
      { proyecto_id: 41, items: [] },
    ])
    expect(r).toHaveLength(2)
    expect(r[1]).toEqual({ proyecto_id: 41, items: [] })
  })

  it('rechaza no-array', () => {
    expect(() => normalizeSeleccion({} as unknown)).toThrow(/array/)
  })

  it('rechaza proyecto_id inválido', () => {
    expect(() => normalizeSeleccion([{ proyecto_id: 0, items: [] }])).toThrow(/proyecto_id/)
    expect(() => normalizeSeleccion([{ proyecto_id: 'x', items: [] }])).toThrow(/proyecto_id/)
  })

  it('rechaza proyecto_id duplicado', () => {
    expect(() => normalizeSeleccion([
      { proyecto_id: 28, items: [] }, { proyecto_id: 28, items: ['1'] },
    ])).toThrow(/duplicado/)
  })
})
