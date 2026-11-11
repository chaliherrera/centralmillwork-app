import { describe, it, expect } from 'vitest'
import {
  evaluarCantidad, parsearCantidad, ExpresionInvalida,
} from '@/modules/estimados/domain/cantidad'

// Función PURA. Evalúa la cuenta que el estimador escribe como cantidad.
// En el Excel se tipea así dentro de la celda: =(4.17*2*2)+(3.25*2) → 23,18 LF.
// Eso no es un vicio, es el razonamiento; por eso se guarda la cuenta y no sólo
// el resultado. Acá entra texto del usuario, así que se prueba a conciencia.

describe('evaluarCantidad — lo que se escribe todos los días', () => {
  it('una cuenta real: estantes de una cocina', () => {
    expect(evaluarCantidad('(4.17*2*2)+(3.25*2)')).toBe(23.18)
  })

  it('acepta el = adelante, como se copia del Excel', () => {
    expect(evaluarCantidad('=(4.17*2*2)+(3.25*2)')).toBe(23.18)
  })

  it('un número pelado también es una cantidad', () => {
    expect(evaluarCantidad('8.7')).toBe(8.7)
    expect(evaluarCantidad('.5')).toBe(0.5)
    expect(evaluarCantidad('40')).toBe(40)
  })

  it('respeta la precedencia sin paréntesis', () => {
    expect(evaluarCantidad('2+3*4')).toBe(14)
    expect(evaluarCantidad('(2+3)*4')).toBe(20)
  })

  it('divide y anida', () => {
    expect(evaluarCantidad('96/12')).toBe(8)
    expect(evaluarCantidad('((2+2)*(3+3))/2')).toBe(12)
  })

  it('tolera espacios y el × ÷ del teclado', () => {
    expect(evaluarCantidad(' 4.17 × 2 ')).toBe(8.34)
    expect(evaluarCantidad('96 ÷ 12')).toBe(8)
  })

  it('redondea a 6 decimales, que es lo que guarda la columna', () => {
    expect(evaluarCantidad('1/3')).toBe(0.333333)
  })
})

describe('evaluarCantidad — lo que hay que rechazar', () => {
  const malas: [string, string][] = [
    ['', 'vacía'],
    ['   ', 'vacía'],
    ['4.17*', 'cortada'],
    ['(4.17*2', 'paréntesis'],
    ['4.17)*2', 'final'],
    ['4..17', 'número inválido'],
    ['8/0', 'dividir por cero'],
    ['-5', 'negativa'],
    ['2+2; DROP TABLE est_recetas', 'no entiendo'],
    ['require("fs")', 'no entiendo'],
    ['process.exit()', 'no entiendo'],
  ]
  for (const [expr, pista] of malas) {
    it(`rechaza ${JSON.stringify(expr)} y lo explica (${pista})`, () => {
      expect(() => evaluarCantidad(expr)).toThrow(ExpresionInvalida)
      try { evaluarCantidad(expr) } catch (e) {
        expect((e as Error).message.toLowerCase()).toContain(pista.toLowerCase())
      }
    })
  }

  it('no ejecuta nada de lo que le pasen: es un parser, no eval', () => {
    // Si esto fuera eval(), el string de abajo correría. Acá sólo tira error.
    expect(() => evaluarCantidad('globalThis.hackeado = 1')).toThrow(ExpresionInvalida)
    expect((globalThis as Record<string, unknown>).hackeado).toBeUndefined()
  })

  it('corta las expresiones absurdamente largas', () => {
    expect(() => evaluarCantidad('1+'.repeat(200) + '1')).toThrow(/demasiado larga/)
  })
})

describe('parsearCantidad — qué se guarda', () => {
  it('guarda la cuenta cuando hay razonamiento detrás', () => {
    expect(parsearCantidad('(4.17*2*2)+(3.25*2)'))
      .toEqual({ cantidad: 23.18, expresion: '(4.17*2*2)+(3.25*2)' })
  })

  it('no guarda expresión si escribió un número pelado', () => {
    expect(parsearCantidad('8.7')).toEqual({ cantidad: 8.7, expresion: null })
    expect(parsearCantidad('=40')).toEqual({ cantidad: 40, expresion: null })
  })

  it('acepta un número de verdad, no sólo texto', () => {
    expect(parsearCantidad(23.18)).toEqual({ cantidad: 23.18, expresion: null })
  })

  it('rechaza un número negativo o no finito', () => {
    expect(() => parsearCantidad(-1)).toThrow(ExpresionInvalida)
    expect(() => parsearCantidad(Number.NaN)).toThrow(ExpresionInvalida)
  })
})
