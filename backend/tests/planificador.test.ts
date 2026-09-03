import { describe, it, expect } from 'vitest'
import { ubicarProyecto, type PlantillaRuta, type ColaIngeniero } from '@/modules/ingenieria/domain/planificador'

// Función PURA (no toca DB). Verifica el modelo de COLA SERIAL:
// el proyecto arranca cuando el ingeniero se libera; se elige al que se libera antes.
const F = new Set<string>() // sin feriados (hábiles = lun-vie)

// Ruta simplificada tipo "18 pasos": po(0)→meeting(1)→{long_leads(10), shop_drawings(10)},
// samples(10) SS con shop_drawings, review(10)→approval(0)→cnc(10)→fabrication(20).
// Roles: ingeniería = meeting/shop_drawings/samples/cnc; los demás son de otras áreas.
function mkPlantilla(): PlantillaRuta {
  return {
    pasos: [
      { clave: 'po', tipoId: 1, nombre: 'PO', rol: 'estimacion', dur: 0 },
      { clave: 'meeting', tipoId: 2, nombre: 'Meeting', rol: 'ingenieria', dur: 1 },
      { clave: 'long_leads', tipoId: 3, nombre: 'Long leads', rol: 'compras', dur: 10 },
      { clave: 'shop', tipoId: 4, nombre: 'Shop drawings', rol: 'ingenieria', dur: 10 },
      { clave: 'samples', tipoId: 5, nombre: 'Samples', rol: 'ingenieria', dur: 10 },
      { clave: 'review', tipoId: 6, nombre: 'Review', rol: 'cliente', dur: 10 },
      { clave: 'approval', tipoId: 7, nombre: 'Approval', rol: 'cliente', dur: 0 },
      { clave: 'cnc', tipoId: 8, nombre: 'CNC', rol: 'ingenieria', dur: 10 },
      { clave: 'fabrication', tipoId: 9, nombre: 'Fabrication', rol: 'produccion', dur: 20 },
    ],
    aristas: [
      { clave: 'meeting', dependeDe: 'po', tipo: 'FS', lag: 0 },
      { clave: 'long_leads', dependeDe: 'meeting', tipo: 'FS', lag: 0 },
      { clave: 'shop', dependeDe: 'meeting', tipo: 'FS', lag: 0 },
      { clave: 'samples', dependeDe: 'shop', tipo: 'SS', lag: 0 },
      { clave: 'review', dependeDe: 'shop', tipo: 'FS', lag: 0 },
      { clave: 'approval', dependeDe: 'review', tipo: 'FS', lag: 0 },
      { clave: 'cnc', dependeDe: 'approval', tipo: 'FS', lag: 0 },
      { clave: 'fabrication', dependeDe: 'cnc', tipo: 'FS', lag: 0 },
      { clave: 'fabrication', dependeDe: 'long_leads', tipo: 'FS', lag: 0 },
    ],
  }
}
const P = mkPlantilla()
const params = (fechaEntrega: string, diaCero = '2026-01-05') => ({ hoy: diaCero, diaCero, fechaEntrega, feriados: F })

describe('ubicarProyecto — cola serial por ingeniero', () => {
  it('cola vacía → el ingeniero arranca hoy (no lo empuja ningún piso)', () => {
    const colas: ColaIngeniero[] = [{ nombre: 'Ana', hace_cnc: false, n_pendientes: 0, fin_ultima: null }]
    const u = ubicarProyecto(P, colas, params('2026-06-30'))
    expect(u.ingeniero).toBe('Ana')
    expect(u.disponible_desde).toBe('2026-01-05')
    // meeting depende de po (día cero 05-ene, 0d) → arranca el hábil siguiente, sin piso extra
    expect(u.fechas.get('meeting')!.es).toBe('2026-01-06')
    expect(u.motivo).toBe('ok')
    expect(u.entra).toBe(true)
  })

  it('cola con fin futuro → el proyecto arranca cuando el ingeniero se libera (+1 hábil)', () => {
    const colas: ColaIngeniero[] = [{ nombre: 'Ana', hace_cnc: false, n_pendientes: 3, fin_ultima: '2026-02-20' }] // vie
    const u = ubicarProyecto(P, colas, params('2026-12-31'))
    expect(u.disponible_desde).toBe('2026-02-23') // lunes siguiente
    // las tareas de INGENIERÍA no arrancan antes de esa fecha
    expect(u.fechas.get('meeting')!.es >= '2026-02-23').toBe(true)
    expect(u.fechas.get('shop')!.es >= '2026-02-23').toBe(true)
    // po_execution NO es de ingeniería → sigue en el día cero (la firma), no se empuja
    expect(u.fechas.get('po')!.es).toBe('2026-01-05')
  })

  it('elige al ingeniero que se libera ANTES', () => {
    const colas: ColaIngeniero[] = [
      { nombre: 'Beto', hace_cnc: false, n_pendientes: 2, fin_ultima: '2026-03-15' },
      { nombre: 'Ana', hace_cnc: false, n_pendientes: 5, fin_ultima: '2026-01-30' }, // se libera antes
    ]
    const u = ubicarProyecto(P, colas, params('2026-12-31'))
    expect(u.ingeniero).toBe('Ana')
    expect(u.ranking[0].nombre).toBe('Ana')
    expect(u.ranking[1].nombre).toBe('Beto')
  })

  it('sin ingenieros activos → plan sin asignar, motivo sin_ingenieros', () => {
    const u = ubicarProyecto(P, [], params('2026-12-31'))
    expect(u.ingeniero).toBeNull()
    expect(u.motivo).toBe('sin_ingenieros')
    // igual calcula fechas (para que el PM asigne después)
    expect(u.fechas.get('po')!.es).toBe('2026-01-05')
  })

  it('motivo capacidad: la cadena entra desde hoy, pero el ingeniero está ocupado más allá de la fecha', () => {
    // Ana libre hoy entraría; pero su cola termina en junio y la entrega es en mayo.
    const colas: ColaIngeniero[] = [{ nombre: 'Ana', hace_cnc: false, n_pendientes: 8, fin_ultima: '2026-06-01' }]
    const u = ubicarProyecto(P, colas, params('2026-05-15'))
    expect(u.entra).toBe(false)
    expect(u.motivo).toBe('capacidad')
    expect(u.fin_desde_hoy <= '2026-05-15').toBe(true) // desde hoy sí entraba
    expect(u.fin_proyectado > '2026-05-15').toBe(true) // con la cola, no
  })

  it('motivo cadena: la fecha es tan cercana que ni con el ingeniero libre hoy entra', () => {
    const colas: ColaIngeniero[] = [{ nombre: 'Ana', hace_cnc: false, n_pendientes: 0, fin_ultima: null }]
    const u = ubicarProyecto(P, colas, params('2026-01-20')) // cadena ~ 2.5 meses, no entra en 2 semanas
    expect(u.entra).toBe(false)
    expect(u.motivo).toBe('cadena')
  })

  it('SS respetado: samples arranca junto con shop drawings (en paralelo, mismo ingeniero)', () => {
    const colas: ColaIngeniero[] = [{ nombre: 'Ana', hace_cnc: false, n_pendientes: 0, fin_ultima: null }]
    const u = ubicarProyecto(P, colas, params('2026-12-31'))
    expect(u.fechas.get('samples')!.es).toBe(u.fechas.get('shop')!.es)
  })
})
