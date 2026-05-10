import pool from '../db/pool'

export interface Distancia {
  metros: number
  segundos: number | null
  es_estimado: boolean
}

/**
 * Devuelve la distancia entre dos estaciones consultando `estaciones_distancias`.
 * La tabla es direccional (A→B puede diferir de B→A) pero en la práctica
 * cargamos sólo el sentido "forward" del flujo. Si no hay forward, probamos reverse.
 *
 * Si no hay ningún registro, devuelve 0 — no rompemos el flujo.
 */
export async function obtenerDistancia(
  origen: string,
  destino: string,
): Promise<Distancia> {
  const { rows } = await pool.query(
    `SELECT distancia_metros, tiempo_estimado_seg, es_estimado
     FROM estaciones_distancias
     WHERE (estacion_origen = $1 AND estacion_destino = $2)
        OR (estacion_origen = $2 AND estacion_destino = $1)
     ORDER BY (estacion_origen = $1) DESC
     LIMIT 1`,
    [origen, destino]
  )
  if (!rows[0]) return { metros: 0, segundos: null, es_estimado: true }
  return {
    metros:      Number(rows[0].distancia_metros),
    segundos:    rows[0].tiempo_estimado_seg,
    es_estimado: rows[0].es_estimado,
  }
}
