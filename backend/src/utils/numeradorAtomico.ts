// ─────────────────────────────────────────────────────────────────────────────
// Numerador atómico — Audit Fix A2
// ─────────────────────────────────────────────────────────────────────────────
// Reemplaza el patrón race-condition:
//   SELECT numero FROM X ORDER BY id DESC LIMIT 1
//   seq = parseInt(numero.split('-')[2]) + 1
//   INSERT numero = `OC-2026-${seq}`
//
// Por sequence Postgres (atómico server-side):
//   const numero = await nextOcNumero(client)  → "OC-2026-0094"
//
// Las sequences se crean en migración 035_numero_sequences.sql con valores
// iniciales = MAX actual + 1 para no colisionar con datos existentes.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../db/pool'

type QueryRunner = PoolClient | typeof pool

/**
 * Toma el siguiente valor de la sequence y arma el folio con el formato esperado.
 * Atómico: dos llamadas concurrentes nunca devuelven el mismo número.
 *
 * IMPORTANT: si la usás DENTRO de una transacción, pasá el `client` ligado al
 * BEGIN — la sequence avanza igual aunque la transacción haga ROLLBACK (eso es
 * by design en Postgres, evita locks). Es decir: si rollbacks, se quema un
 * número de la secuencia. Aceptable: los IDs no son contables-contiguos pero
 * sí únicos.
 */
async function nextFolio(
  runner: QueryRunner,
  prefix: string,
  sequenceName: string
): Promise<string> {
  const { rows: [{ seq }] } = await runner.query<{ seq: string }>(
    `SELECT nextval($1) AS seq`,
    [sequenceName]
  )
  // pg devuelve bigint como string para evitar pérdida de precisión.
  const seqNum = parseInt(seq, 10)
  return `${prefix}-${new Date().getFullYear()}-${String(seqNum).padStart(4, '0')}`
}

/** Próximo número para ordenes_compra. Formato: OC-YYYY-NNNN. */
export function nextOcNumero(runner: QueryRunner = pool): Promise<string> {
  return nextFolio(runner, 'OC', 'oc_numero_seq')
}

/** Próximo folio para recepciones. Formato: REC-YYYY-NNNN. */
export function nextRecepcionFolio(runner: QueryRunner = pool): Promise<string> {
  return nextFolio(runner, 'REC', 'recepcion_folio_seq')
}

/** Próximo folio para solicitudes_cotizacion. Formato: COT-YYYY-NNNN. */
export function nextCotizacionFolio(runner: QueryRunner = pool): Promise<string> {
  return nextFolio(runner, 'COT', 'cotizacion_folio_seq')
}
