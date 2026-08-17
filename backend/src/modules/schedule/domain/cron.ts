// ─────────────────────────────────────────────────────────────────────────────
// Domain — Reloj del schedule (envejecimiento del semáforo)
// ─────────────────────────────────────────────────────────────────────────────
// El semáforo/holgura se calculan contra "hoy" al momento de recalcular. Sin un
// reloj, un proyecto sin actividad nunca pasaría a amarillo/rojo aunque venza.
// Este job recorre los planes con entrega pendiente y los recalcula.
//
// Corre en TODAS las réplicas, pero un pg_advisory_lock garantiza que solo una
// hace el trabajo por tick (misma idea que initRateLimitStore). Best-effort:
// si algo falla, loguea y no tumba el proceso.
// ─────────────────────────────────────────────────────────────────────────────

import pool from '../../../db/pool'
import { logger } from '../../../utils/logger'
import { recomputeScheduleSafe } from './recompute'

// Clave arbitraria y ÚNICA para el advisory lock de este cron (distinta de la
// del rate limit). Session-level: se sostiene hasta el unlock.
const CRON_LOCK_KEY = 918273646

/** Recalcula todos los planes con entrega (I-07) pendiente. Best-effort + lock. */
export async function recomputeAllActivePlans(): Promise<void> {
  const client = await pool.connect()
  try {
    const { rows: lk } = await client.query<{ got: boolean }>('SELECT pg_try_advisory_lock($1) AS got', [CRON_LOCK_KEY])
    if (!lk[0]?.got) return // otra réplica está corriendo el tick
    try {
      const { rows } = await client.query<{ proyecto_id: number }>(
        `SELECT DISTINCT sp.proyecto_id
           FROM schedule_planes sp
           JOIN schedule_hitos sh ON sh.plan_id = sp.id AND sh.codigo = 'I-07'
          WHERE sp.scope = 'proyecto' AND sh.fecha_real IS NULL`)
      let ok = 0
      for (const r of rows) {
        await recomputeScheduleSafe(r.proyecto_id, 'cron') // conexión + tx propias
        ok++
      }
      if (rows.length) logger.info('schedule cron: recompute done', { planes: rows.length, ok })
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [CRON_LOCK_KEY]).catch(() => {})
    }
  } catch (err) {
    logger.error('schedule cron error', { err })
  } finally {
    client.release()
  }
}

let timer: NodeJS.Timeout | null = null

/** Arranca el reloj del schedule. Idempotente. Cada `everyHours` recalcula los
 *  planes activos para envejecer el semáforo. Primera corrida ~30s tras el boot. */
export function startScheduleCron(everyHours = 6): void {
  if (timer) return
  const ms = everyHours * 60 * 60 * 1000
  timer = setInterval(() => { void recomputeAllActivePlans() }, ms)
  timer.unref?.()
  const kick = setTimeout(() => { void recomputeAllActivePlans() }, 30_000)
  kick.unref?.()
  logger.info('schedule cron ENABLED', { everyHours })
}
