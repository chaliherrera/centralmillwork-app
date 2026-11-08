// ─────────────────────────────────────────────────────────────────────────────
// Tests: recepción por CANTIDADES — funciones puras (utils/recepcionCantidades.ts)
// ─────────────────────────────────────────────────────────────────────────────
// Cubren el "puente booleano", la validación de exceso, el estado derivado por ítem
// y el parseo de cantidades. Son el corazón de la feature: si alguien rompe un
// umbral o el redondeo, estos tests lo atrapan antes de que llegue a producción.
//
// No tocan la BD (todo es aritmética pura). Verifican especialmente los bordes que
// marcó el review de integridad (Fable): redondeo a 3 decimales para que la coma
// flotante no genere falsos "excesos", y valores inválidos que NO deben caer
// silenciosamente al camino legado.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  puenteRecibido,
  validarAcumulado,
  estadoItemPorCantidad,
  estadoItemReadiness,
  parseCantidad,
} from '../../src/utils/recepcionCantidades'

describe('puenteRecibido — ¿la entrega deja el material completo?', () => {
  it('es false cuando lo acumulado no llega a lo ordenado (parcial)', () => {
    expect(puenteRecibido(0, 4, 10)).toBe(false)   // primera entrega 4 de 10
    expect(puenteRecibido(4, 5, 10)).toBe(false)   // 4 previos + 5 = 9 < 10
  })

  it('es true cuando lo acumulado alcanza exactamente lo ordenado', () => {
    expect(puenteRecibido(4, 6, 10)).toBe(true)    // 4 + 6 = 10
    expect(puenteRecibido(0, 10, 10)).toBe(true)   // de una
  })

  it('es true cuando lo acumulado supera lo ordenado (se acepta, p.ej. reorden)', () => {
    expect(puenteRecibido(8, 5, 10)).toBe(true)    // 13 >= 10
  })

  it('redondea a 3 decimales: 0.1 + 0.2 cuenta como 0.3 (no queda "faltante" por épsilon)', () => {
    expect(puenteRecibido(0.1, 0.2, 0.3)).toBe(true)
    expect(puenteRecibido(2.7, 0.3, 3)).toBe(true)
  })

  it('maneja decimales reales (numeric(12,3))', () => {
    expect(puenteRecibido(1.5, 1.5, 3)).toBe(true)
    expect(puenteRecibido(1.5, 1.4, 3)).toBe(false)
  })
})

describe('validarAcumulado — no recibir más de lo ordenado', () => {
  it('ok cuando lo acumulado no supera lo ordenado', () => {
    expect(validarAcumulado(0, 7, 12)).toEqual({ ok: true, acumulado: 7 })
    expect(validarAcumulado(7, 5, 12)).toEqual({ ok: true, acumulado: 12 }) // llega justo
  })

  it('NO ok cuando lo acumulado supera lo ordenado', () => {
    expect(validarAcumulado(7, 6, 12)).toEqual({ ok: false, acumulado: 13 })
    expect(validarAcumulado(0, 999, 12)).toEqual({ ok: false, acumulado: 999 })
  })

  it('redondea el acumulado a 3 decimales (no bloquea por coma flotante)', () => {
    // 0.1 + 0.2 = 0.30000000000000004 sin redondeo => falso "exceso"
    expect(validarAcumulado(0.1, 0.2, 0.3)).toEqual({ ok: true, acumulado: 0.3 })
  })
})

describe('estadoItemPorCantidad — estado derivado del ítem', () => {
  it('con cantidades: PENDIENTE / PARCIAL / RECIBIDO según el acumulado', () => {
    expect(estadoItemPorCantidad(12, 0, false)).toEqual({ estado: 'PENDIENTE', sin_cantidad: false })
    expect(estadoItemPorCantidad(12, 7, false)).toEqual({ estado: 'PARCIAL', sin_cantidad: false })
    expect(estadoItemPorCantidad(12, 12, false)).toEqual({ estado: 'RECIBIDO', sin_cantidad: false })
    expect(estadoItemPorCantidad(12, 15, false)).toEqual({ estado: 'RECIBIDO', sin_cantidad: false }) // de más
  })

  it('LEGADO (cantidad ordenada desconocida): respeta el booleano histórico y marca sin_cantidad', () => {
    expect(estadoItemPorCantidad(null, 0, true)).toEqual({ estado: 'RECIBIDO', sin_cantidad: true })
    expect(estadoItemPorCantidad(null, 0, false)).toEqual({ estado: 'PENDIENTE', sin_cantidad: true })
  })
})

describe('parseCantidad — normaliza la entrada del body', () => {
  it('devuelve null para ausente / vacío (= "no mandó cantidad", camino legado)', () => {
    expect(parseCantidad(undefined)).toBeNull()
    expect(parseCantidad(null)).toBeNull()
    expect(parseCantidad('')).toBeNull()
  })

  it('acepta números y strings numéricos, redondeando a 3 decimales', () => {
    expect(parseCantidad(7)).toBe(7)
    expect(parseCantidad('7')).toBe(7)
    expect(parseCantidad('7.5')).toBe(7.5)
    expect(parseCantidad(1.23456)).toBe(1.235)
    expect(parseCantidad(0)).toBe(0)
  })

  it('devuelve null para inválidos (negativos / no numéricos) — el controlador los corta con 400', () => {
    expect(parseCantidad(-1)).toBeNull()
    expect(parseCantidad('-5')).toBeNull()
    expect(parseCantidad('abc')).toBeNull()
    expect(parseCantidad(NaN)).toBeNull()
    expect(parseCantidad(Infinity)).toBeNull()
  })
})

describe('estadoItemReadiness — estado del ítem para PM/Shop', () => {
  const base = { total: 3, disponibles: 0, en_transito: 0, pendientes: 0 }

  it('LISTO cuando todos los materiales comprables están en el taller', () => {
    expect(estadoItemReadiness({ ...base, disponibles: 3 })).toBe('LISTO')
  })

  it('LISTO cuando el ítem es 100% propio (total = 0)', () => {
    expect(estadoItemReadiness({ total: 0, disponibles: 0, en_transito: 0, pendientes: 0 })).toBe('LISTO')
  })

  it('PARCIAL cuando algunos llegaron completos y otros no', () => {
    expect(estadoItemReadiness({ ...base, disponibles: 1 })).toBe('PARCIAL')
    // aunque haya uno en tránsito, si ya hay disponibles es PARCIAL
    expect(estadoItemReadiness({ ...base, disponibles: 1, en_transito: 1 })).toBe('PARCIAL')
  })

  it('EN_TRANSITO cuando nada está completo pero llegó parte de algún material', () => {
    expect(estadoItemReadiness({ ...base, disponibles: 0, en_transito: 1 })).toBe('EN_TRANSITO')
  })

  it('ORDENADO cuando todo está pedido y nada llegó (ni siquiera parcial)', () => {
    expect(estadoItemReadiness({ ...base, disponibles: 0, en_transito: 0, pendientes: 0 })).toBe('ORDENADO')
  })

  it('PENDIENTE cuando hay materiales sin ordenar', () => {
    expect(estadoItemReadiness({ ...base, disponibles: 0, en_transito: 0, pendientes: 2 })).toBe('PENDIENTE')
  })

  it('prioridad correcta: EN_TRANSITO gana a ORDENADO, PARCIAL gana a EN_TRANSITO', () => {
    // ítem con 1 recibido-parcial (en tránsito) y 1 solo ordenado => EN_TRANSITO (nada completo)
    expect(estadoItemReadiness({ total: 2, disponibles: 0, en_transito: 1, pendientes: 0 })).toBe('EN_TRANSITO')
    // ítem con 1 completo y 1 en tránsito => PARCIAL
    expect(estadoItemReadiness({ total: 2, disponibles: 1, en_transito: 1, pendientes: 0 })).toBe('PARCIAL')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Escenario integrado: recepción parcial → resto, tal como lo hace el backend.
// Simula lo que ocurre cuando el usuario carga cantidades en varias entregas.
// ─────────────────────────────────────────────────────────────────────────────
describe('escenario: recibir 4, luego 6, de un ordenado de 10', () => {
  const ordenado = 10

  it('primera entrega (4): válida, parcial', () => {
    const cant = parseCantidad(4)!
    const acumPrevio = 0
    expect(validarAcumulado(acumPrevio, cant, ordenado).ok).toBe(true)
    expect(puenteRecibido(acumPrevio, cant, ordenado)).toBe(false) // aún no completo
  })

  it('segunda entrega (6): válida, completa', () => {
    const cant = parseCantidad(6)!
    const acumPrevio = 4 // lo de la primera entrega
    const v = validarAcumulado(acumPrevio, cant, ordenado)
    expect(v).toEqual({ ok: true, acumulado: 10 })
    expect(puenteRecibido(acumPrevio, cant, ordenado)).toBe(true) // completo
  })

  it('intentar recibir 999 sobre lo ya recibido: inválido (exceso)', () => {
    const cant = parseCantidad(999)!
    const acumPrevio = 4
    expect(validarAcumulado(acumPrevio, cant, ordenado).ok).toBe(false)
  })
})
