import pool from '../db/pool'
import { obtenerDistancia } from './distanciaCalculador'

const ORDEN_BASE_SECUENCIA = [
  'cnc', 'edge_banding', 'assembly', 'lamina', 'pintura', 'final', 'packing', 'shipping',
] as const

export interface RutaPaso {
  paso: number
  estacion: string
  personal_id: number | null
  personal_nombre: string | null
  distancia_desde_anterior: number
  segundos_traslado: number
}

export interface RutaCalculada {
  ruta: RutaPaso[]
  distancia_total_metros: number
  tiempo_traslados_segundos: number
}

/**
 * Calcula la ruta de una orden a partir de las estaciones requeridas y un mapa
 * opcional de asignaciones (estacion → personal_id).
 *
 * La "optimización" actual es trivial: ordenar por la secuencia canónica del
 * taller y sumar distancias de la matriz. El nombre "optimizador" es generoso
 * para una posible expansión futura (DP / TSP si los flujos no son lineales).
 */
export async function calcularRuta(
  estaciones: string[],
  asignaciones: Record<string, number | null | undefined> = {}
): Promise<RutaCalculada> {
  // Ordenar las estaciones recibidas según la secuencia canónica
  const known = ORDEN_BASE_SECUENCIA.filter((s) => estaciones.includes(s))
  const unknown = estaciones.filter((s) => !ORDEN_BASE_SECUENCIA.includes(s as any))
  const secuencia = [...known, ...unknown]

  // Resolver nombres de personal en una sola query
  const personalIds = Object.values(asignaciones).filter((v): v is number => typeof v === 'number')
  const personalMap = new Map<number, string>()
  if (personalIds.length) {
    const { rows } = await pool.query(
      `SELECT id, nombre_completo FROM personal_taller WHERE id = ANY($1::int[])`,
      [personalIds]
    )
    for (const r of rows) personalMap.set(r.id, r.nombre_completo)
  }

  const ruta: RutaPaso[] = []
  let totalMetros = 0
  let totalSegundos = 0

  for (let i = 0; i < secuencia.length; i++) {
    const estacion = secuencia[i]
    const personalId = asignaciones[estacion] ?? null
    const personalNombre = personalId != null ? (personalMap.get(personalId) ?? null) : null

    let distancia = 0
    let segundos = 0
    if (i > 0) {
      const d = await obtenerDistancia(secuencia[i - 1], estacion)
      distancia = d.metros
      segundos  = d.segundos ?? 0
      totalMetros   += distancia
      totalSegundos += segundos
    }

    ruta.push({
      paso: i + 1,
      estacion,
      personal_id: personalId,
      personal_nombre: personalNombre,
      distancia_desde_anterior: distancia,
      segundos_traslado: segundos,
    })
  }

  return {
    ruta,
    distancia_total_metros: Number(totalMetros.toFixed(2)),
    tiempo_traslados_segundos: totalSegundos,
  }
}
