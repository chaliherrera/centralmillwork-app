// ─────────────────────────────────────────────────────────────────────────────
// Test #2: State machine de Muestras — 7×7 table-driven
// ─────────────────────────────────────────────────────────────────────────────
// Verifica la INTEGRIDAD del modelo de transiciones (la data, no la HTTP).
// Cada estado tiene transiciones válidas + reglas de negocio críticas
// codificadas como invariantes.
//
// Por qué: TRANSICIONES es el modelo MÁS importante del state machine canónico
// del repo (el patrón que se replicará en OC y Producción). Una modificación
// accidental rompe el workflow del cliente sin error visible.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  TRANSICIONES,
  ESTADOS,
  type EstadoMuestra,
} from '../../src/controllers/muestrasController'

describe('TRANSICIONES de Muestras', () => {
  describe('invariantes estructurales', () => {
    it('cada estado tiene un array de transiciones definido', () => {
      for (const estado of ESTADOS) {
        expect(TRANSICIONES[estado]).toBeDefined()
        expect(Array.isArray(TRANSICIONES[estado])).toBe(true)
      }
    })

    it('todos los destinos son estados válidos', () => {
      for (const estado of ESTADOS) {
        for (const destino of TRANSICIONES[estado]) {
          expect(ESTADOS).toContain(destino)
        }
      }
    })

    it('no hay self-loops (ningún estado va a sí mismo)', () => {
      for (const estado of ESTADOS) {
        expect(TRANSICIONES[estado]).not.toContain(estado)
      }
    })

    it('no hay destinos duplicados en cada origen', () => {
      for (const estado of ESTADOS) {
        const dests = TRANSICIONES[estado]
        expect(new Set(dests).size).toBe(dests.length)
      }
    })
  })

  describe('reglas de negocio críticas', () => {
    it('ARCHIVADA es estado terminal (sin transiciones salientes)', () => {
      expect(TRANSICIONES.ARCHIVADA).toEqual([])
    })

    it('TODO estado puede ir a ARCHIVADA (excepto la propia ARCHIVADA)', () => {
      for (const estado of ESTADOS) {
        if (estado === 'ARCHIVADA') continue
        expect(TRANSICIONES[estado]).toContain('ARCHIVADA')
      }
    })

    it('APROBADA solo puede archivarse (estado de éxito, no editable)', () => {
      expect(TRANSICIONES.APROBADA).toEqual(['ARCHIVADA'])
    })

    it('ENVIADA puede APROBARSE o RECHAZARSE (respuesta del cliente)', () => {
      expect(TRANSICIONES.ENVIADA).toContain('APROBADA')
      expect(TRANSICIONES.ENVIADA).toContain('RECHAZADA')
    })

    it('EN_QC puede ir a ENVIADA (QC pass) o volver a EN_FABRICACION (QC fail)', () => {
      expect(TRANSICIONES.EN_QC).toContain('ENVIADA')
      expect(TRANSICIONES.EN_QC).toContain('EN_FABRICACION')
    })

    it('RECHAZADA puede volver a SOLICITADA o EN_FABRICACION (crea V2)', () => {
      expect(TRANSICIONES.RECHAZADA).toContain('SOLICITADA')
      expect(TRANSICIONES.RECHAZADA).toContain('EN_FABRICACION')
    })

    it('SOLICITADA NO puede saltar directo a EN_QC (debe pasar por fabricación)', () => {
      expect(TRANSICIONES.SOLICITADA).not.toContain('EN_QC')
    })

    it('SOLICITADA NO puede saltar directo a APROBADA (atajo peligroso)', () => {
      expect(TRANSICIONES.SOLICITADA).not.toContain('APROBADA')
    })
  })

  describe('matriz 7×7 — todas las transiciones posibles', () => {
    // Matriz EXPLÍCITA de lo que esperamos. Si cambia el TRANSICIONES sin
    // actualizar esta tabla, los tests fallan: forzamos consciencia del cambio.
    const ESPERADAS: Record<EstadoMuestra, EstadoMuestra[]> = {
      SOLICITADA:     ['EN_FABRICACION', 'ARCHIVADA'],
      EN_FABRICACION: ['EN_QC', 'SOLICITADA', 'ARCHIVADA'],
      EN_QC:          ['ENVIADA', 'EN_FABRICACION', 'ARCHIVADA'],
      ENVIADA:        ['APROBADA', 'RECHAZADA', 'ARCHIVADA'],
      APROBADA:       ['ARCHIVADA'],
      RECHAZADA:      ['SOLICITADA', 'EN_FABRICACION', 'ARCHIVADA'],
      ARCHIVADA:      [],
    }

    it.each(ESTADOS)('desde %s las transiciones permitidas son las esperadas', (origen) => {
      const sorted = (arr: readonly EstadoMuestra[]) => [...arr].sort()
      expect(sorted(TRANSICIONES[origen])).toEqual(sorted(ESPERADAS[origen]))
    })

    it.each(ESTADOS.flatMap((o) => ESTADOS.map((d) => ({ origen: o, destino: d }))))(
      'transición $origen → $destino',
      ({ origen, destino }) => {
        const esEsperada = ESPERADAS[origen].includes(destino)
        const esPermitida = TRANSICIONES[origen].includes(destino)
        expect(esPermitida).toBe(esEsperada)
      }
    )
  })
})
