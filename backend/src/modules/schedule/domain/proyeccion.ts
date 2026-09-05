// ─────────────────────────────────────────────────────────────────────────────
// Domain — Proyección del journey desde el Gantt (PURA, sin DB)
// ─────────────────────────────────────────────────────────────────────────────
// Reemplaza al motor teórico (motor.ts). Cada hito toma su fecha del PASO del
// Gantt al que mapea (gantt_clave + gantt_ancla): fecha_planeada = fecha temprana
// (ES/EF), y el "límite" para vencido/holgura = fecha tardía (LS/LF) del CPM. Lo
// que NO es fecha (estado, semáforo, holgura, atribución, inferencia hacia atrás)
// se conserva de la lógica vieja, pero calculado sobre las fechas reales del Gantt.
// Una sola fuente de verdad: el Gantt.
// ─────────────────────────────────────────────────────────────────────────────

import { businessDaysBetween, addBusinessDays, type ISODate } from './calendario'

const HOLGURA_VERDE = 3 // días hábiles

// No se infieren por "cierre hacia atrás": aprobaciones del cliente y pagos exigen
// prueba propia (mismo criterio que recompute.ts). C-04 down payment, X-03 pago.
const NO_INFERIR = new Set<string>(['E-05', 'E-07', 'I-07', 'C-04', 'X-03'])

/** La inferencia es un cálculo, no un hecho: no se toma como base al releer. */
export function esInferida(evidencia: unknown): boolean {
  return !!evidencia && typeof evidencia === 'object' && (evidencia as { source?: string }).source === 'inferido'
}

/** Rol responsable → área, para atribución de atrasos. */
export function areaFromRol(rol: string | null): string {
  const r = (rol ?? '').toLowerCase()
  if (r.includes('estimat')) return 'estimating'
  if (r.includes('engineer')) return 'engineering'
  if (r.includes('procurement')) return 'procurement'
  if (r.includes('production') || r.includes('shop')) return 'production'
  if (r.includes('logistics') || r.includes('logíst') || r.includes('logist')) return 'logistics'
  if (r.includes('field')) return 'field'
  if (r.includes('cfo') || r.includes('financial') || r.includes('office')) return 'finance'
  if (r.includes('pm')) return 'pm'
  return r || 'sin_asignar'
}

/** C-03 (contrato firmado = día cero): mientras el cliente no firme, el atraso es SUYO
 *  (decisión de Chali, para documentar demora del cliente). El resto va por rol. */
function atribucionDe(codigo: string, rol: string | null): string {
  if (codigo === 'C-03') return 'cliente'
  return areaFromRol(rol)
}

export interface HitoPlantilla {
  codigo: string
  tipo: string                       // normal | gate | cont | cond
  gantt_clave: string | null         // paso del Gantt del que toma la fecha (null = no mapea)
  gantt_ancla: 'inicio' | 'fin' | null
  gantt_lag_dias: number
  rol_responsable: string | null
  fuente_dato: string
  es_ancla: boolean                  // I-07: la entrega
}
/** Fechas del paso del Gantt (ya con variantes de piedra plegadas al paso base). */
export interface PasoFechas { es: ISODate; ef: ISODate; ls: ISODate; lf: ISODate }
export interface RealHito { fecha_real: ISODate | null; evidencia: unknown }

export interface HitoProyectado {
  codigo: string
  fecha_planeada: ISODate | null
  fecha_real: ISODate | null
  fecha_proyectada: ISODate | null
  estado: string                     // cumplido | pendiente | en_riesgo | vencido | no_aplica
  semaforo: string                   // verde | amarillo | rojo | gris
  holgura_dias: number | null
  atribucion_atraso: string | null
  evidencia_ref: unknown
}
export interface ProyeccionResult {
  hitos: HitoProyectado[]
  semaforoPlan: string
  holguraPlan: number | null
}

export interface ProyeccionInput {
  hitos: HitoPlantilla[]
  deps: Array<{ hito: string; dependeDe: string }>   // hito ← dependeDe
  pasos: Map<string, PasoFechas>                     // gantt_clave → fechas del CPM
  reales: Map<string, RealHito>                      // codigo → fecha real capturada/preservada
  hoy: ISODate
  feriados: Set<ISODate>
  fechaEntrega: ISODate                              // ancla de I-07
  finProyectado: ISODate | null                      // proyectada de I-07
  holguraProyecto: number                            // del CPM (semáforo/holgura del plan)
}

/** Fecha planeada (temprana) y límite (tardía) de un hito según su paso del Gantt. */
function fechasDeHito(h: HitoPlantilla, pasos: Map<string, PasoFechas>, feriados: Set<ISODate>,
  fechaEntrega: ISODate): { planeada: ISODate | null; limite: ISODate | null; sinPaso: boolean } {
  // I-07 = entrega (no viene de un paso): planeada = límite = fecha de entrega.
  if (h.es_ancla) return { planeada: fechaEntrega, limite: fechaEntrega, sinPaso: false }
  // Sin mapeo (X-03 pago final): sin fecha planeada.
  if (!h.gantt_clave) return { planeada: null, limite: null, sinPaso: false }
  const p = pasos.get(h.gantt_clave)
  // Mapea a un paso que este proyecto NO tiene (sin instalación, sin piedra): no aplica.
  if (!p) return { planeada: null, limite: null, sinPaso: true }
  const early = h.gantt_ancla === 'inicio' ? p.es : p.ef
  const late = h.gantt_ancla === 'inicio' ? p.ls : p.lf
  const lag = h.gantt_lag_dias || 0
  return {
    planeada: lag ? addBusinessDays(early, lag, feriados) : early,
    limite: lag ? addBusinessDays(late, lag, feriados) : late,
    sinPaso: false,
  }
}

/** Proyecta los hitos del journey a partir del Gantt. Pura y determinista. */
export function proyectarHitos(inp: ProyeccionInput): ProyeccionResult {
  const { hitos, deps, pasos, reales, hoy, feriados, fechaEntrega, finProyectado, holguraProyecto } = inp

  const tipoPorCodigo = new Map(hitos.map((h) => [h.codigo, h.tipo]))
  const fuentePorCodigo = new Map(hitos.map((h) => [h.codigo, h.fuente_dato]))
  const rolPorCodigo = new Map(hitos.map((h) => [h.codigo, h.rol_responsable]))

  // pred map + quién tiene dependientes (para "revisión suelta")
  const pred = new Map<string, string[]>()
  for (const h of hitos) pred.set(h.codigo, [])
  const tieneDependientes = new Set<string>()
  for (const d of deps) { pred.get(d.hito)?.push(d.dependeDe); tieneDependientes.add(d.dependeDe) }
  const esRevisionSuelta = (codigo: string) =>
    tipoPorCodigo.get(codigo) === 'cont' && !tieneDependientes.has(codigo)

  // Cumplidos = con fecha real (capturada o preservada no-inferida).
  const cumplidos = new Set<string>()
  for (const h of hitos) {
    const fr = reales.get(h.codigo)?.fecha_real ?? null
    if (fr) cumplidos.add(h.codigo)
  }

  // Cierre hacia atrás: desde cada cumplido, sus predecesores 'manual_futuro' (menos
  // NO_INFERIR) se dan por cumplidos por inferencia (rellena huecos administrativos).
  const inferidos = new Set<string>()
  {
    const stack = [...cumplidos]
    const visto = new Set<string>(cumplidos)
    while (stack.length) {
      const codigo = stack.pop()!
      for (const p of pred.get(codigo) ?? []) {
        if (visto.has(p)) continue
        visto.add(p); stack.push(p)
        if (!cumplidos.has(p) && !NO_INFERIR.has(p) && fuentePorCodigo.get(p) === 'manual_futuro') inferidos.add(p)
      }
    }
  }
  for (const c of inferidos) cumplidos.add(c)

  const rank: Record<string, number> = { gris: 0, verde: 1, amarillo: 2, rojo: 3 }
  let peor = 'gris'
  const out: HitoProyectado[] = []

  for (const h of hitos) {
    const { planeada, limite, sinPaso } = fechasDeHito(h, pasos, feriados, fechaEntrega)
    let fechaReal = reales.get(h.codigo)?.fecha_real ?? null
    let evidencia: unknown = reales.get(h.codigo)?.evidencia ?? null

    // Inferido (sin hecho real pero un paso posterior ya está cumplido).
    if (fechaReal === null && inferidos.has(h.codigo)) {
      fechaReal = planeada ?? hoy
      evidencia = { source: 'inferido', nota: 'implícito: un paso posterior ya está cumplido' }
    }

    let estado: string, semaforo: string
    let holgura: number | null = null
    let atribucion: string | null = null
    let proyectada = h.es_ancla ? (finProyectado ?? planeada) : planeada

    if (fechaReal) {
      estado = 'cumplido'; semaforo = 'verde'; proyectada = fechaReal
      if (limite) { holgura = businessDaysBetween(fechaReal, limite, feriados); if (holgura < 0) atribucion = atribucionDe(h.codigo, rolPorCodigo.get(h.codigo) ?? null) }
    } else if (sinPaso || tipoPorCodigo.get(h.codigo) === 'cond') {
      // El paso no existe en este proyecto, o hito condicional sin cumplir: neutro.
      estado = 'no_aplica'; semaforo = 'gris'
    } else if (esRevisionSuelta(h.codigo)) {
      estado = 'pendiente'; semaforo = 'verde'
    } else {
      const preds = pred.get(h.codigo) ?? []
      const listo = preds.every((p) => cumplidos.has(p) || tipoPorCodigo.get(p) === 'cond')
      if (!listo) { estado = 'no_aplica'; semaforo = 'gris' }
      else if (limite) {
        holgura = businessDaysBetween(hoy, limite, feriados)
        // El ancla (I-07) conserva su proyectada = fin_proyectado del CPM; el resto
        // proyecta a su fecha planeada (o a hoy si ya quedó en el pasado).
        if (!h.es_ancla) proyectada = planeada && planeada < hoy ? hoy : planeada
        if (holgura < 0) { estado = 'vencido'; semaforo = 'rojo'; atribucion = atribucionDe(h.codigo, rolPorCodigo.get(h.codigo) ?? null) }
        else if (holgura < HOLGURA_VERDE) { estado = 'en_riesgo'; semaforo = 'amarillo' }
        else { estado = 'pendiente'; semaforo = 'verde' }
      } else {
        // pendiente sin fecha (X-03 pago final): no cuenta para el semáforo.
        estado = 'pendiente'; semaforo = 'gris'
      }
    }

    if (estado !== 'cumplido' && semaforo !== 'gris' && !esRevisionSuelta(h.codigo)) {
      if (rank[semaforo] > rank[peor]) peor = semaforo
    }

    out.push({ codigo: h.codigo, fecha_planeada: planeada, fecha_real: fechaReal, fecha_proyectada: proyectada,
      estado, semaforo, holgura_dias: holgura, atribucion_atraso: atribucion, evidencia_ref: evidencia })
  }

  // Salud del plan = la del Gantt (binaria como el Gantt: <0 rojo, <3 amarillo, si no verde).
  const semaforoPlan = holguraProyecto < 0 ? 'rojo' : holguraProyecto < HOLGURA_VERDE ? 'amarillo' : 'verde'
  return { hitos: out, semaforoPlan, holguraPlan: Math.round(holguraProyecto) }
}
