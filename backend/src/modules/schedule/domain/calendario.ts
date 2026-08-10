// ─────────────────────────────────────────────────────────────────────────────
// Domain — Calendario laboral (días hábiles)
// ─────────────────────────────────────────────────────────────────────────────
// Días hábiles = lunes a viernes MENOS los feriados cargados en la tabla
// schedule_feriados (decisión 2026-08-10: lun-vie).
//
// Todo se maneja como strings 'YYYY-MM-DD' y aritmética en UTC para evitar
// corrimientos por zona horaria / horario de verano. El motor de schedule
// (motor.ts) usa estos helpers para restar/sumar duraciones.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg'
import pool from '../../../db/pool'

type QueryRunner = PoolClient | typeof pool

/** Fecha en formato 'YYYY-MM-DD'. */
export type ISODate = string

const DAY_MS = 86_400_000

function toUTC(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10)
}

/** Día de la semana en UTC: 0 = domingo … 6 = sábado. */
function weekday(date: ISODate): number {
  return toUTC(date).getUTCDay()
}

/** true si `date` es lunes-viernes y no está en el set de feriados. */
export function isBusinessDay(date: ISODate, feriados: Set<ISODate>): boolean {
  const wd = weekday(date)
  return wd >= 1 && wd <= 5 && !feriados.has(date)
}

/**
 * Resta `n` días hábiles a `date` (n ≥ 0). Devuelve la fecha resultante.
 * subBusinessDays('2026-10-15', 3) = 3 días hábiles antes del 15/oct.
 * Con n = 0 devuelve la misma fecha sin snapear.
 */
export function subBusinessDays(date: ISODate, n: number, feriados: Set<ISODate>): ISODate {
  let d = toUTC(date)
  let left = Math.max(0, Math.floor(n))
  while (left > 0) {
    d = new Date(d.getTime() - DAY_MS)
    if (isBusinessDay(fromUTC(d), feriados)) left--
  }
  return fromUTC(d)
}

/**
 * Suma `n` días hábiles a `date` (n ≥ 0). Devuelve la fecha resultante.
 * Con n = 0 devuelve la misma fecha sin snapear.
 */
export function addBusinessDays(date: ISODate, n: number, feriados: Set<ISODate>): ISODate {
  let d = toUTC(date)
  let left = Math.max(0, Math.floor(n))
  while (left > 0) {
    d = new Date(d.getTime() + DAY_MS)
    if (isBusinessDay(fromUTC(d), feriados)) left--
  }
  return fromUTC(d)
}

/**
 * Cuenta días hábiles entre dos fechas (from → to), excluyendo `from` e
 * incluyendo `to`. Positivo si to > from, negativo si to < from. Es la base
 * del cálculo de holgura (planeada vs proyectada).
 */
export function businessDaysBetween(from: ISODate, to: ISODate, feriados: Set<ISODate>): number {
  if (from === to) return 0
  const forward = to > from
  const [a, b] = forward ? [from, to] : [to, from]
  let d = toUTC(a)
  const end = toUTC(b)
  let count = 0
  while (d.getTime() < end.getTime()) {
    d = new Date(d.getTime() + DAY_MS)
    if (isBusinessDay(fromUTC(d), feriados)) count++
  }
  return forward ? count : -count
}

/** Carga el set de feriados desde la DB. */
export async function loadFeriados(runner: QueryRunner = pool): Promise<Set<ISODate>> {
  const { rows } = await runner.query<{ fecha: string }>(
    `SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha FROM schedule_feriados`
  )
  return new Set(rows.map((r) => r.fecha))
}
