import { describe, it, expect } from 'vitest'
import { proyectarHitos, type HitoPlantilla, type PasoFechas, type ProyeccionInput } from '@/modules/schedule/domain/proyeccion'

const F = new Set<string>()            // sin feriados
const HOY = '2026-09-04'
const ENTREGA = '2027-01-15'
const FINPROY = '2026-12-20'

function hito(codigo: string, over: Partial<HitoPlantilla> = {}): HitoPlantilla {
  return {
    codigo, tipo: 'normal', gantt_clave: null, gantt_ancla: null, gantt_lag_dias: 0,
    rol_responsable: 'engineering', fuente_dato: 'manual_futuro', es_ancla: false, ...over,
  }
}
function paso(es: string, ef: string, ls: string, lf: string): PasoFechas { return { es, ef, ls, lf } }

function run(over: Partial<ProyeccionInput>): ReturnType<typeof proyectarHitos> {
  const base: ProyeccionInput = {
    hitos: [], deps: [], pasos: new Map(), reales: new Map(),
    hoy: HOY, feriados: F, fechaEntrega: ENTREGA, finProyectado: FINPROY, holguraProyecto: 10,
  }
  return proyectarHitos({ ...base, ...over })
}
const by = (r: ReturnType<typeof proyectarHitos>, c: string) => r.hitos.find((h) => h.codigo === c)!

describe('proyeccion — journey desde el Gantt', () => {
  it('ancla=fin toma EF como planeada; pendiente en fecha (LF lejos) = verde', () => {
    const r = run({
      hitos: [hito('E-06', { gantt_clave: 'shop_drawings', gantt_ancla: 'fin' })],
      pasos: new Map([['shop_drawings', paso('2026-09-15', '2026-10-01', '2026-09-29', '2026-10-15')]]),
    })
    const h = by(r, 'E-06')
    expect(h.fecha_planeada).toBe('2026-10-01')   // EF
    expect(h.estado).toBe('pendiente')
    expect(h.semaforo).toBe('verde')
  })

  it('ancla=inicio toma ES como planeada y LS como límite', () => {
    const r = run({
      hitos: [hito('E-09', { gantt_clave: 'material_proc', gantt_ancla: 'inicio' })],
      pasos: new Map([['material_proc', paso('2026-10-16', '2026-10-22', '2026-10-20', '2026-10-28')]]),
    })
    expect(by(r, 'E-09').fecha_planeada).toBe('2026-10-16')  // ES
  })

  it('hito que mapea a un paso que el proyecto NO tiene → no_aplica/gris', () => {
    const r = run({
      hitos: [hito('I-04', { gantt_clave: 'installation', gantt_ancla: 'inicio' })],
      pasos: new Map(),   // sin installation (proyecto sin instalación)
    })
    const h = by(r, 'I-04')
    expect(h.estado).toBe('no_aplica')
    expect(h.semaforo).toBe('gris')
    expect(h.fecha_planeada).toBeNull()
  })

  it('I-07 (ancla): planeada = entrega, proyectada = fin_proyectado', () => {
    const r = run({ hitos: [hito('I-07', { es_ancla: true, gantt_clave: null })] })
    const h = by(r, 'I-07')
    expect(h.fecha_planeada).toBe(ENTREGA)
    expect(h.fecha_proyectada).toBe(FINPROY)
    expect(h.estado).toBe('pendiente')   // entrega en el futuro
  })

  it('X-03 (sin paso, pago final): sin fecha planeada, no cuenta para el semáforo', () => {
    const r = run({ hitos: [hito('X-03', { gantt_clave: null, rol_responsable: 'finance' })] })
    const h = by(r, 'X-03')
    expect(h.fecha_planeada).toBeNull()
    expect(h.estado).toBe('pendiente')
    expect(h.semaforo).toBe('gris')
    expect(r.semaforoPlan).not.toBe('rojo')   // X-03 no ensucia el plan
  })

  it('límite en el pasado → vencido/rojo + atribución por rol', () => {
    const r = run({
      hitos: [hito('E-06', { gantt_clave: 'shop_drawings', gantt_ancla: 'fin', rol_responsable: 'engineering' })],
      pasos: new Map([['shop_drawings', paso('2026-07-01', '2026-07-20', '2026-07-25', '2026-08-01')]]),
    })
    const h = by(r, 'E-06')
    expect(h.estado).toBe('vencido')
    expect(h.semaforo).toBe('rojo')
    expect(h.atribucion_atraso).toBe('engineering')
  })

  it('límite cercano (<3 hábiles) → en_riesgo/amarillo', () => {
    const r = run({
      hitos: [hito('E-06', { gantt_clave: 'shop_drawings', gantt_ancla: 'fin' })],
      pasos: new Map([['shop_drawings', paso('2026-09-01', '2026-09-05', '2026-09-05', '2026-09-07')]]),
    })
    const h = by(r, 'E-06')   // LF 09-07, hoy 09-04 → ~1 hábil
    expect(h.estado).toBe('en_riesgo')
    expect(h.semaforo).toBe('amarillo')
  })

  it('cumplido tarde: C-03 atribuye al CLIENTE (no a estimating)', () => {
    const r = run({
      hitos: [hito('C-03', { gantt_clave: 'po_execution', gantt_ancla: 'fin', rol_responsable: 'estimating' })],
      pasos: new Map([['po_execution', paso('2026-08-01', '2026-08-01', '2026-08-01', '2026-08-01')]]),
      reales: new Map([['C-03', { fecha_real: '2026-09-04', evidencia: { source: 'portal' } }]]),
    })
    const h = by(r, 'C-03')
    expect(h.estado).toBe('cumplido')
    expect(h.semaforo).toBe('verde')
    expect(h.atribucion_atraso).toBe('cliente')   // C-03 siempre al cliente
  })

  it('hito condicional sin real → no_aplica/gris', () => {
    const r = run({
      hitos: [hito('X', { tipo: 'cond', gantt_clave: 'foo', gantt_ancla: 'fin' })],
      pasos: new Map([['foo', paso('2026-09-01', '2026-09-10', '2026-09-11', '2026-09-20')]]),
    })
    expect(by(r, 'X').estado).toBe('no_aplica')
  })

  it('predecesor sin cumplir → el hito queda no_aplica/gris (bloqueado)', () => {
    const r = run({
      hitos: [
        hito('A', { gantt_clave: 'pa', gantt_ancla: 'fin' }),
        hito('B', { gantt_clave: 'pb', gantt_ancla: 'fin' }),
      ],
      deps: [{ hito: 'B', dependeDe: 'A' }],   // B espera a A
      pasos: new Map([
        ['pa', paso('2026-09-10', '2026-09-20', '2026-09-21', '2026-09-30')],
        ['pb', paso('2026-10-01', '2026-10-10', '2026-10-11', '2026-10-20')],
      ]),
    })
    expect(by(r, 'B').estado).toBe('no_aplica')   // A no cumplido → B bloqueado
  })

  it('fecha real preservada → cumplido', () => {
    const r = run({
      hitos: [hito('M-07', { gantt_clave: 'material_proc', gantt_ancla: 'fin', fuente_dato: 'readiness' })],
      pasos: new Map([['material_proc', paso('2026-10-01', '2026-10-20', '2026-10-21', '2026-11-01')]]),
      reales: new Map([['M-07', { fecha_real: '2026-10-18', evidencia: { source: 'readiness' } }]]),
    })
    expect(by(r, 'M-07').estado).toBe('cumplido')
  })

  it('PUNTO FIJO: proyectar dos veces con la misma entrada da el mismo resultado', () => {
    const input: Partial<ProyeccionInput> = {
      hitos: [
        hito('C-03', { gantt_clave: 'po_execution', gantt_ancla: 'fin' }),
        hito('E-06', { gantt_clave: 'shop_drawings', gantt_ancla: 'fin' }),
        hito('I-07', { es_ancla: true, gantt_clave: null }),
        hito('X-03', { gantt_clave: null }),
      ],
      deps: [{ hito: 'E-06', dependeDe: 'C-03' }],
      pasos: new Map([
        ['po_execution', paso('2026-09-01', '2026-09-01', '2026-09-01', '2026-09-01')],
        ['shop_drawings', paso('2026-09-15', '2026-10-01', '2026-09-29', '2026-10-15')],
      ]),
      reales: new Map([['C-03', { fecha_real: '2026-09-01', evidencia: { source: 'portal' } }]]),
    }
    const a = run(input)
    const b = run(input)
    expect(a).toEqual(b)
  })
})
