// ─────────────────────────────────────────────────────────────────────────────
// Domain — Chequeo de factibilidad (vive en la ESPINA, es READ-ONLY / dry-run)
// ─────────────────────────────────────────────────────────────────────────────
// Responde: "¿podemos entregar para la fecha X?" — y si no, "¿cuál es la fecha
// real más temprana y por qué?". NO persiste nada (corre ANTES de que exista el
// plan, así nunca toca fecha_objetivo ni el semáforo).
//
// Lógica: (1) corre el motor puro `calcularPlaneadas` en seco desde la fecha
// pedida → ventanas ideales por hito. (2) Toma el cuello de botella de Ingeniería
// (el CNC, hoy = un único recurso) y busca su primer hueco libre para ese bloque.
// Si no entra en la ventana ideal, el corrimiento del cuello = el corrimiento de
// la entrega → fecha real más temprana.
//
// PROVISIONAL: usa las duraciones default de la plantilla (fijas). Cuando llegue
// el modelo por tamaño (histórico + creador), solo cambia el input de duraciones.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'
import { calcularPlaneadas, HitoDef, DepDef } from './motor'
import { loadFeriados, subBusinessDays, addBusinessDays, businessDaysBetween, ISODate } from './calendario'

type QueryRunner = PoolClient | typeof pool

export interface Ventana { codigo: string; nombre: string; fase: string; fecha: string | null }
export interface FactibilidadResult {
  fecha_pedida: string
  factible: boolean
  fecha_real_mas_temprana: string
  dias_slip: number
  cuello: { recurso: string; tarea: string; ocupado_hasta: string; libre_para_bloque: string } | null
  fecha_inicio_requerida: string | null
  ventanas: Ventana[]
  provisional: true
}

interface Intervalo { start: ISODate; end: ISODate }

/** Primer hueco libre de `dur` días hábiles en `busy`, a partir de `desde`. */
function primerHueco(busy: Intervalo[], dur: number, desde: ISODate, feriados: Set<ISODate>): ISODate {
  let cand = desde
  for (let iter = 0; iter < 500; iter++) {
    const winEnd = addBusinessDays(cand, dur, feriados)
    // intervalos que se solapan con [cand, winEnd]
    const solapan = busy.filter((b) => b.start <= winEnd && b.end >= cand)
    if (solapan.length === 0) return cand
    let latest = solapan[0].end
    for (const b of solapan) if (b.end > latest) latest = b.end
    cand = addBusinessDays(latest, 1, feriados) // arrancar el día hábil siguiente
  }
  return cand
}

// hitos que resumimos como "ventanas" del proyecto (para la pantalla)
const VENTANA_HITOS = ['E-06', 'E-11', 'P-06', 'QC-02', 'I-07']

export async function chequearFactibilidad(
  runner: QueryRunner,
  fechaPedida: string,
): Promise<FactibilidadResult> {
  // 1) plantilla activa
  const { rows: pl } = await runner.query<{ id: number }>(
    `SELECT id FROM schedule_plantillas WHERE activa = true ORDER BY id LIMIT 1`)
  if (!pl[0]) throw new Error('No hay plantilla activa')
  const plantillaId = pl[0].id

  const { rows: hitosRows } = await runner.query<{ codigo: string; nombre: string; fase: string; dur_dias_default: number; es_ancla: boolean }>(
    `SELECT codigo, nombre, fase, dur_dias_default, es_ancla FROM schedule_plantilla_hitos WHERE plantilla_id = $1`, [plantillaId])
  const { rows: depRows } = await runner.query<{ hito_codigo: string; depende_de_codigo: string }>(
    `SELECT hito_codigo, depende_de_codigo FROM schedule_plantilla_dependencias WHERE plantilla_id = $1`, [plantillaId])

  const hitos: HitoDef[] = hitosRows.map((h) => ({ codigo: h.codigo, dur: h.dur_dias_default, es_ancla: h.es_ancla }))
  const deps: DepDef[] = depRows.map((d) => ({ hito: d.hito_codigo, dependeDe: d.depende_de_codigo }))
  const feriados = await loadFeriados(runner)

  // 2) dry-run del motor desde la fecha pedida
  const { planeadas, fechaInicioRequerida } = calcularPlaneadas(hitos, deps, fechaPedida, feriados)

  // 3) cuello de botella: el CNC (E-11). Recurso = quién lo hace en Ingeniería.
  const { rows: cncTipo } = await runner.query<{ dur_dias_tipico: number | null }>(
    `SELECT dur_dias_tipico FROM ing_tarea_tipos WHERE clave = 'cnc' LIMIT 1`)
  const cncDur = Math.max(1, cncTipo[0]?.dur_dias_tipico ?? 5)
  const { rows: cncEng } = await runner.query<{ asignado_nombre: string }>(
    `SELECT DISTINCT t.asignado_nombre FROM ing_tareas t JOIN ing_tarea_tipos tt ON tt.id = t.tipo_id
      WHERE tt.clave = 'cnc' AND t.asignado_nombre IS NOT NULL`)

  const nombresHito = new Map(hitosRows.map((h) => [h.codigo, h.nombre]))
  const fasesHito = new Map(hitosRows.map((h) => [h.codigo, h.fase]))
  const ventanas: Ventana[] = VENTANA_HITOS
    .filter((c) => planeadas.has(c))
    .map((c) => ({ codigo: c, nombre: nombresHito.get(c) ?? c, fase: fasesHito.get(c) ?? '', fecha: planeadas.get(c) ?? null }))

  const cncDeadline = planeadas.get('E-11') ?? planeadas.get('E-10') ?? null

  // Sin cuello identificable (0 o >1 recursos de CNC, o sin fecha) → factible directo.
  if (cncEng.length !== 1 || !cncDeadline) {
    return {
      fecha_pedida: fechaPedida, factible: true, fecha_real_mas_temprana: fechaPedida, dias_slip: 0,
      cuello: null, fecha_inicio_requerida: fechaInicioRequerida, ventanas, provisional: true,
    }
  }

  const recurso = cncEng[0].asignado_nombre
  const { rows: tareas } = await runner.query<{ start: string; end: string }>(
    `SELECT to_char(fecha_inicio,'YYYY-MM-DD') AS start, to_char(fecha_fin,'YYYY-MM-DD') AS end
       FROM ing_tareas
      WHERE asignado_nombre = $1 AND fecha_inicio IS NOT NULL AND fecha_fin IS NOT NULL
        AND estado NOT IN ('hecha','na')
        AND origen <> 'sugerencia'
      ORDER BY fecha_inicio`, [recurso])
  const busy: Intervalo[] = tareas.map((t) => ({ start: t.start, end: t.end }))
  const ocupadoHasta = busy.length ? busy.reduce((mx, b) => (b.end > mx ? b.end : mx), busy[0].end) : fechaPedida

  // ventana ideal del CNC: [deadline - cncDur, deadline]
  const cncStartIdeal = subBusinessDays(cncDeadline, cncDur, feriados)
  // primer hueco del recurso a partir del inicio ideal
  const hueco = primerHueco(busy, cncDur, cncStartIdeal, feriados)
  const huecoEnd = addBusinessDays(hueco, cncDur, feriados)

  let factible = true, slip = 0, fechaReal = fechaPedida
  if (huecoEnd > cncDeadline) {
    factible = false
    slip = businessDaysBetween(cncDeadline, huecoEnd, feriados)
    fechaReal = addBusinessDays(fechaPedida, slip, feriados)
  }

  return {
    fecha_pedida: fechaPedida, factible, fecha_real_mas_temprana: fechaReal, dias_slip: slip,
    cuello: { recurso, tarea: 'CNC', ocupado_hasta: ocupadoHasta, libre_para_bloque: hueco },
    fecha_inicio_requerida: fechaInicioRequerida, ventanas, provisional: true,
  }
}
