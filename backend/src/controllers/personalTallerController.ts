import { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import { logger } from '../utils/logger'

const VALID_TIPOS = ['carpintero', 'operador', 'inspector', 'logistica', 'ayudante', 'pintor']

/**
 * GET /api/produccion/personal
 * Lista todo el personal del taller con sus asignaciones a estaciones.
 * Filtros opcionales:
 *   ?activo=true|false
 *   ?estacion=cnc|edge_banding|...    (filtra a los asignados a esa estación)
 *   ?tipo=operador|carpintero|...
 */
export async function getPersonalTaller(req: Request, res: Response, next: NextFunction) {
  try {
    const conds: string[] = []
    const vals: unknown[] = []

    if (req.query.activo !== undefined) {
      conds.push(`pt.activo = $${vals.length + 1}`)
      vals.push(String(req.query.activo) === 'true')
    }
    if (req.query.tipo) {
      conds.push(`pt.tipo_personal = $${vals.length + 1}`)
      vals.push(String(req.query.tipo))
    }
    if (req.query.estacion) {
      conds.push(`EXISTS (SELECT 1 FROM personal_estaciones pe WHERE pe.personal_id = pt.id AND pe.estacion = $${vals.length + 1} AND pe.activo = true)`)
      vals.push(String(req.query.estacion))
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const { rows } = await pool.query(
      `SELECT pt.id, pt.nombre, pt.apellido, pt.nombre_completo, pt.iniciales,
              pt.tipo_personal, pt.activo, pt.usuario_id,
              pt.pin_hash IS NOT NULL AS tiene_pin,
              pt.pin_actualizado_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'estacion', pe.estacion,
                    'es_estacion_principal', pe.es_estacion_principal,
                    'capacidad_max', pe.capacidad_max,
                    'activo', pe.activo
                  ) ORDER BY pe.es_estacion_principal DESC, pe.estacion
                ) FILTER (WHERE pe.id IS NOT NULL),
                '[]'::json
              ) AS estaciones
       FROM personal_taller pt
       LEFT JOIN personal_estaciones pe ON pe.personal_id = pt.id
       ${where}
       GROUP BY pt.id
       ORDER BY pt.activo DESC, pt.nombre, pt.apellido`,
      vals
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
}

/**
 * GET /api/produccion/personal/:id
 */
export async function getPersonalTallerById(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query(
      `SELECT pt.id, pt.nombre, pt.apellido, pt.nombre_completo, pt.iniciales,
              pt.tipo_personal, pt.activo, pt.usuario_id,
              pt.pin_hash IS NOT NULL AS tiene_pin,
              pt.pin_actualizado_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'estacion', pe.estacion,
                    'es_estacion_principal', pe.es_estacion_principal,
                    'capacidad_max', pe.capacidad_max,
                    'activo', pe.activo
                  ) ORDER BY pe.es_estacion_principal DESC, pe.estacion
                ) FILTER (WHERE pe.id IS NOT NULL),
                '[]'::json
              ) AS estaciones
       FROM personal_taller pt
       LEFT JOIN personal_estaciones pe ON pe.personal_id = pt.id
       WHERE pt.id = $1
       GROUP BY pt.id`,
      [req.params.id]
    )
    if (!rows[0]) return next(createError('Personal no encontrado', 404))
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
}

/**
 * POST /api/produccion/personal
 * Crea un nuevo operario del taller.
 * Body: { nombre, apellido?, iniciales, tipo_personal, estaciones: [{estacion, es_estacion_principal?, capacidad_max?}] }
 */
export async function createPersonalTaller(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const { nombre, apellido, iniciales, tipo_personal, usuario_id, estaciones = [] } = req.body

    if (!nombre || !iniciales) return next(createError('Nombre e iniciales son requeridos', 400))
    if (tipo_personal && !VALID_TIPOS.includes(tipo_personal)) return next(createError('tipo_personal inválido', 400))

    await client.query('BEGIN')
    const { rows: [personal] } = await client.query(
      `INSERT INTO personal_taller (nombre, apellido, iniciales, tipo_personal, usuario_id)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, nombre, apellido, nombre_completo, iniciales, tipo_personal, activo, usuario_id`,
      [String(nombre).trim(), apellido?.trim() || null, String(iniciales).trim().toUpperCase(),
       tipo_personal || null, usuario_id || null]
    )

    if (Array.isArray(estaciones) && estaciones.length) {
      for (const est of estaciones) {
        if (!est.estacion) continue
        await client.query(
          `INSERT INTO personal_estaciones (personal_id, estacion, es_estacion_principal, capacidad_max)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (personal_id, estacion) DO NOTHING`,
          [personal.id, est.estacion, !!est.es_estacion_principal, est.capacidad_max ?? 3]
        )
      }
    }

    await client.query('COMMIT')
    res.status(201).json({ data: personal, message: 'Personal creado' })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}

/**
 * PUT /api/produccion/personal/:id
 * Actualización parcial. NO toca el PIN — para eso está /pin.
 */
export async function updatePersonalTaller(req: Request, res: Response, next: NextFunction) {
  try {
    const { nombre, apellido, iniciales, tipo_personal, activo, usuario_id } = req.body
    const fields: string[] = []
    const vals: unknown[] = [req.params.id]
    let i = 2

    if (nombre !== undefined)        { fields.push(`nombre=$${i++}`);          vals.push(String(nombre).trim()) }
    if (apellido !== undefined)      { fields.push(`apellido=$${i++}`);        vals.push(apellido === '' ? null : apellido?.trim() ?? null) }
    if (iniciales !== undefined)     { fields.push(`iniciales=$${i++}`);       vals.push(String(iniciales).trim().toUpperCase()) }
    if (tipo_personal !== undefined) {
      if (tipo_personal !== null && !VALID_TIPOS.includes(tipo_personal)) return next(createError('tipo_personal inválido', 400))
      fields.push(`tipo_personal=$${i++}`); vals.push(tipo_personal)
    }
    if (activo !== undefined)        { fields.push(`activo=$${i++}`);          vals.push(!!activo) }
    if (usuario_id !== undefined)    { fields.push(`usuario_id=$${i++}`);      vals.push(usuario_id || null) }

    if (!fields.length) return next(createError('Sin campos para actualizar', 400))

    const { rows } = await pool.query(
      `UPDATE personal_taller SET ${fields.join(', ')} WHERE id = $1
       RETURNING id, nombre, apellido, nombre_completo, iniciales, tipo_personal, activo`,
      vals
    )
    if (!rows[0]) return next(createError('Personal no encontrado', 404))
    res.json({ data: rows[0], message: 'Personal actualizado' })
  } catch (err) { next(err) }
}

/**
 * POST /api/produccion/personal/:id/pin
 * Asigna o regenera el PIN de un operario.
 * Body: { pin: "1234" }
 *
 * Reglas:
 * - PIN debe ser exactamente 4 dígitos numéricos
 * - PIN no puede colisionar con el PIN de otro operario activo (verificación O(n) con bcrypt.compare)
 */
export async function setPersonalPin(req: Request, res: Response, next: NextFunction) {
  try {
    const { pin } = req.body
    const pinStr = String(pin ?? '').trim()
    if (!/^\d{4}$/.test(pinStr)) return next(createError('PIN inválido — debe ser de 4 dígitos numéricos', 400))

    // Verificar que el operario existe y está activo
    const { rows: [personal] } = await pool.query(
      `SELECT id, activo FROM personal_taller WHERE id = $1`,
      [req.params.id]
    )
    if (!personal) return next(createError('Personal no encontrado', 404))

    // Verificar que no colisiona con PIN de otro operario activo
    const { rows: otros } = await pool.query(
      `SELECT id, pin_hash FROM personal_taller
       WHERE activo = true AND pin_hash IS NOT NULL AND id <> $1`,
      [req.params.id]
    )
    for (const o of otros) {
      const colision = await bcrypt.compare(pinStr, o.pin_hash)
      if (colision) return next(createError('Ese PIN ya está en uso por otro operario activo', 409))
    }

    const hash = await bcrypt.hash(pinStr, 10)
    await pool.query(
      `UPDATE personal_taller SET pin_hash = $1, pin_actualizado_at = NOW() WHERE id = $2`,
      [hash, req.params.id]
    )

    logger.info('kiosk PIN set', { requestId: req.id, personal_id: req.params.id, by_user: req.user?.id })
    res.json({ message: 'PIN actualizado' })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/produccion/personal/:id/pin — quita el PIN (operario no puede entrar al kiosko)
 */
export async function clearPersonalPin(req: Request, res: Response, next: NextFunction) {
  try {
    const { rowCount } = await pool.query(
      `UPDATE personal_taller SET pin_hash = NULL, pin_actualizado_at = NOW() WHERE id = $1`,
      [req.params.id]
    )
    if (!rowCount) return next(createError('Personal no encontrado', 404))
    logger.info('kiosk PIN cleared', { requestId: req.id, personal_id: req.params.id, by_user: req.user?.id })
    res.json({ message: 'PIN eliminado — el operario no puede entrar al kiosko hasta que se le asigne uno nuevo' })
  } catch (err) { next(err) }
}

/**
 * PUT /api/produccion/personal/:id/estaciones
 * Reemplaza el set completo de asignaciones a estaciones del operario.
 * Body: { estaciones: [{estacion, es_estacion_principal?, capacidad_max?, activo?}] }
 */
export async function setPersonalEstaciones(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const { estaciones } = req.body
    if (!Array.isArray(estaciones)) return next(createError('estaciones debe ser un array', 400))

    await client.query('BEGIN')
    const { rows: [personal] } = await client.query(
      `SELECT id FROM personal_taller WHERE id = $1`,
      [req.params.id]
    )
    if (!personal) {
      await client.query('ROLLBACK')
      return next(createError('Personal no encontrado', 404))
    }

    await client.query(`DELETE FROM personal_estaciones WHERE personal_id = $1`, [req.params.id])
    for (const est of estaciones) {
      if (!est.estacion) continue
      await client.query(
        `INSERT INTO personal_estaciones (personal_id, estacion, es_estacion_principal, capacidad_max, activo)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, est.estacion, !!est.es_estacion_principal, est.capacidad_max ?? 3, est.activo ?? true]
      )
    }

    await client.query('COMMIT')
    res.json({ message: 'Asignaciones actualizadas' })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}
