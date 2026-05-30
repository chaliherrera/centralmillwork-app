import { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import type { KioskJwtPayload } from '../middleware/kioskAuth'
import { logger } from '../utils/logger'

/**
 * POST /api/kiosk/login
 *
 * El operario tipea su PIN de 4 dígitos en la tablet.
 * Body: { pin: "1234", dispositivo?: "tablet-cnc-01" }
 *
 * Como el PIN está hasheado con bcrypt (sal random por hash), no se puede
 * indexar para lookup directo. Iteramos sobre el personal activo y comparamos
 * con bcrypt.compare. Con ~13 personas esto cuesta < 1.5s por intento — OK
 * para un kiosko con poco tráfico. Si en el futuro escala a >50 personas
 * conviene migrar a un esquema con HMAC determinístico para el lookup.
 */
export async function kioskLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const { pin, dispositivo } = req.body
    const pinStr = String(pin ?? '').trim()

    if (!/^\d{4}$/.test(pinStr)) {
      return next(createError('PIN inválido — debe ser de 4 dígitos', 400))
    }

    const { rows } = await pool.query(
      `SELECT id, nombre_completo, iniciales, pin_hash
       FROM personal_taller
       WHERE activo = true AND pin_hash IS NOT NULL`
    )

    let matched: { id: number; nombre_completo: string; iniciales: string } | null = null
    for (const row of rows) {
      // bcrypt.compare es el bottleneck. Iteramos en serie para no hacer
      // 13 hashes en paralelo (CPU-bound, no gana nada con concurrencia).
      // Importante: NO hacemos early-return en el primer match para mitigar
      // timing attacks que distinguen "encontró" vs "no encontró".
      // (El attacker igual ve el resultado por el status code, pero al menos
      // el tiempo de respuesta es constante.)
      const ok = await bcrypt.compare(pinStr, row.pin_hash)
      if (ok && !matched) matched = { id: row.id, nombre_completo: row.nombre_completo, iniciales: row.iniciales }
    }

    if (!matched) {
      logger.warn('kiosk login failed', { requestId: req.id, ip: req.ip, dispositivo: dispositivo ?? '?' })
      return next(createError('PIN incorrecto', 401))
    }

    const payload: KioskJwtPayload = {
      kind: 'kiosk',
      personal_id: matched.id,
      nombre_completo: matched.nombre_completo,
      iniciales: matched.iniciales,
      dispositivo: dispositivo ? String(dispositivo).slice(0, 50) : undefined,
    }

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_KIOSK_EXPIRES_IN ?? '12h') as jwt.SignOptions['expiresIn'] }
    )

    logger.info('kiosk login ok', {
      requestId: req.id,
      personal_id: matched.id,
      iniciales: matched.iniciales,
      dispositivo: payload.dispositivo,
    })

    res.json({
      token,
      personal: {
        id: matched.id,
        nombre_completo: matched.nombre_completo,
        iniciales: matched.iniciales,
      },
      dispositivo: payload.dispositivo,
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/kiosk/me — devuelve la sesión actual + status (clocked-in?, proyecto activo?)
 * Útil para que la tablet sepa al refrescar si el operario sigue logueado y en qué estado.
 */
export async function kioskMe(req: Request, res: Response, next: NextFunction) {
  try {
    const personal_id = req.kioskUser!.personal_id

    const [personalQ, registroQ, proyectoQ, pausaQ] = await Promise.all([
      pool.query(
        `SELECT id, nombre_completo, iniciales, tipo_personal
         FROM personal_taller WHERE id = $1`,
        [personal_id]
      ),
      pool.query(
        `SELECT id, fecha, hora_entrada, status, dispositivo
         FROM time_registros
         WHERE personal_id = $1 AND status = 'activo' LIMIT 1`,
        [personal_id]
      ),
      pool.query(
        `SELECT tp.id, tp.proyecto_id, p.codigo AS proyecto_codigo, p.nombre AS proyecto_nombre,
                tp.estacion, tp.orden_produccion_id, tp.hora_inicio
         FROM time_proyectos tp
         JOIN proyectos p ON p.id = tp.proyecto_id
         WHERE tp.personal_id = $1 AND tp.hora_fin IS NULL LIMIT 1`,
        [personal_id]
      ),
      pool.query(
        `SELECT id, hora_inicio, motivo
         FROM time_pausas
         WHERE personal_id = $1 AND hora_fin IS NULL LIMIT 1`,
        [personal_id]
      ),
    ])

    if (!personalQ.rows[0]) return next(createError('Personal no encontrado', 404))

    res.json({
      personal: personalQ.rows[0],
      dispositivo: req.kioskUser!.dispositivo,
      registro_activo: registroQ.rows[0] ?? null,
      proyecto_activo: proyectoQ.rows[0] ?? null,
      pausa_activa:    pausaQ.rows[0] ?? null,
    })
  } catch (err) { next(err) }
}
