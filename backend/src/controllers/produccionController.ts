import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import { parsePagination, paginatedResponse } from '../utils/pagination'

const ORDEN_BASE_SECUENCIA = [
  'cnc', 'edge_banding', 'assembly', 'lamina', 'pintura', 'final', 'packing', 'shipping',
]

const STATUS_VALIDOS = ['Pendiente', 'En Proceso', 'Pausada', 'Completada', 'Cancelada'] as const
type Status = typeof STATUS_VALIDOS[number]

const ALLOWED_SORTS = ['created_at', 'fecha_entrega', 'prioridad', 'numero_orden', 'status'] as const

function ordenarSecuencia(estaciones: string[]): string[] {
  // Ordena las estaciones recibidas según la secuencia canónica del taller.
  // Cualquier estación no listada en ORDEN_BASE_SECUENCIA va al final, en el orden recibido.
  const knownOrdered = ORDEN_BASE_SECUENCIA.filter((s) => estaciones.includes(s))
  const unknown = estaciones.filter((s) => !ORDEN_BASE_SECUENCIA.includes(s))
  return [...knownOrdered, ...unknown]
}

/**
 * GET /api/produccion/ordenes
 * Lista órdenes con filtros + paginación.
 * Query: ?status=Pendiente&estacion=cnc&proyecto_id=1&prioridad=Alta&search=...&page=1&limit=20
 */
export async function getOrdenes(req: Request, res: Response, next: NextFunction) {
  try {
    const opts = parsePagination(req, 'created_at', ALLOWED_SORTS)
    const conds: string[] = []
    const vals: unknown[] = []

    if (req.query.status)      { conds.push(`o.status = $${vals.length + 1}`);          vals.push(String(req.query.status)) }
    if (req.query.estacion)    { conds.push(`o.estacion_actual = $${vals.length + 1}`); vals.push(String(req.query.estacion)) }
    if (req.query.proyecto_id) { conds.push(`o.proyecto_id = $${vals.length + 1}`);     vals.push(parseInt(String(req.query.proyecto_id))) }
    if (req.query.prioridad)   { conds.push(`o.prioridad = $${vals.length + 1}`);       vals.push(String(req.query.prioridad)) }
    if (req.query.personal_id) { conds.push(`o.personal_asignado_id = $${vals.length + 1}`); vals.push(parseInt(String(req.query.personal_id))) }
    if (opts.search) {
      conds.push(`(o.numero_orden ILIKE $${vals.length + 1} OR o.item_nombre ILIKE $${vals.length + 1})`)
      vals.push(`%${opts.search}%`)
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT o.*,
                p.codigo  AS proyecto_codigo,
                p.nombre  AS proyecto_nombre,
                pt.nombre_completo AS personal_asignado_nombre,
                pt.iniciales       AS personal_asignado_iniciales
         FROM ordenes_produccion o
         LEFT JOIN proyectos       p  ON p.id  = o.proyecto_id
         LEFT JOIN personal_taller pt ON pt.id = o.personal_asignado_id
         ${where}
         ORDER BY o.${opts.sort} ${opts.order}
         LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
        [...vals, opts.limit, opts.offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM ordenes_produccion o ${where}`,
        vals
      ),
    ])

    res.json(paginatedResponse(rows.rows, parseInt(countRow.rows[0].count), opts))
  } catch (err) { next(err) }
}

/**
 * GET /api/produccion/ordenes/:id
 * Detalle completo: orden + procesos + historial + asignaciones.
 */
export async function getOrden(req: Request, res: Response, next: NextFunction) {
  try {
    const [ordenQ, procesosQ, historialQ] = await Promise.all([
      pool.query(
        `SELECT o.*,
                p.codigo  AS proyecto_codigo,
                p.nombre  AS proyecto_nombre,
                pt.nombre_completo AS personal_asignado_nombre,
                pt.iniciales       AS personal_asignado_iniciales
         FROM ordenes_produccion o
         LEFT JOIN proyectos       p  ON p.id  = o.proyecto_id
         LEFT JOIN personal_taller pt ON pt.id = o.personal_asignado_id
         WHERE o.id = $1`,
        [req.params.id]
      ),
      pool.query(
        `SELECT op.*, pt.nombre_completo AS operador_nombre, pt.iniciales AS operador_iniciales
         FROM orden_procesos op
         LEFT JOIN personal_taller pt ON pt.id = op.operador_id
         WHERE op.orden_id = $1
         ORDER BY op.secuencia`,
        [req.params.id]
      ),
      pool.query(
        `SELECT h.*,
                pdest.nombre_completo AS personal_destino_nombre,
                porig.nombre_completo AS personal_origen_nombre,
                u.nombre              AS usuario_nombre,
                kp.nombre_completo    AS kiosk_personal_nombre
         FROM orden_historial h
         LEFT JOIN personal_taller pdest ON pdest.id = h.personal_destino_id
         LEFT JOIN personal_taller porig ON porig.id = h.personal_origen_id
         LEFT JOIN personal_taller kp    ON kp.id    = h.kiosk_personal_id
         LEFT JOIN usuarios        u     ON u.id     = h.usuario_id
         WHERE h.orden_id = $1
         ORDER BY h.timestamp DESC`,
        [req.params.id]
      ),
    ])

    if (!ordenQ.rows[0]) return next(createError('Orden no encontrada', 404))

    res.json({
      data: {
        ...ordenQ.rows[0],
        procesos: procesosQ.rows,
        historial: historialQ.rows,
      },
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/produccion/ordenes
 * Crea una orden + sus procesos en transacción.
 * Body: {
 *   numero_orden, proyecto_id, item_nombre, cantidad, unidad?, especificaciones?,
 *   material_requerido?, prioridad?, fecha_entrega?, tiempo_estimado_horas?, notas?,
 *   procesos: [string],     // estaciones requeridas, ej: ['cnc','edge_banding','assembly','pintura','final']
 *   asignaciones?: { [estacion]: personal_id }   // operador asignado por estación
 * }
 */
export async function createOrden(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const {
      numero_orden, proyecto_id, item_nombre, cantidad, unidad,
      especificaciones, material_requerido, prioridad, fecha_entrega,
      tiempo_estimado_horas, notas, procesos = [], asignaciones = {},
    } = req.body

    if (!numero_orden || !item_nombre || !cantidad) {
      return next(createError('numero_orden, item_nombre y cantidad son requeridos', 400))
    }
    if (!Array.isArray(procesos) || procesos.length === 0) {
      return next(createError('Debe especificar al menos un proceso/estación', 400))
    }

    const procesosOrdenados = ordenarSecuencia(procesos)
    const primeraEstacion = procesosOrdenados[0]

    await client.query('BEGIN')

    const { rows: [orden] } = await client.query(
      `INSERT INTO ordenes_produccion
         (numero_orden, proyecto_id, item_nombre, cantidad, unidad,
          especificaciones, material_requerido, prioridad, fecha_entrega,
          tiempo_estimado_horas, notas, status, estacion_actual, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Pendiente',$12,$13)
       RETURNING *`,
      [numero_orden, proyecto_id || null, item_nombre, cantidad, unidad || 'Piezas',
       especificaciones || null, material_requerido || null, prioridad || 'Media', fecha_entrega || null,
       tiempo_estimado_horas || null, notas || null, primeraEstacion, req.user?.id || null]
    )

    // Crear un proceso por cada estación del flujo, con su operador asignado si vino
    for (let i = 0; i < procesosOrdenados.length; i++) {
      const estacion = procesosOrdenados[i]
      const operadorId = asignaciones?.[estacion] ?? null
      await client.query(
        `INSERT INTO orden_procesos (orden_id, estacion, secuencia, requerido, operador_id)
         VALUES ($1,$2,$3,true,$4)`,
        [orden.id, estacion, i + 1, operadorId]
      )
    }

    // Si la primera estación tiene operador asignado, ponerlo como personal_asignado_id de la orden
    const operadorPrimera = asignaciones?.[primeraEstacion] ?? null
    if (operadorPrimera) {
      await client.query(
        `UPDATE ordenes_produccion SET personal_asignado_id = $1 WHERE id = $2`,
        [operadorPrimera, orden.id]
      )
    }

    // Historial: registrar la creación
    await client.query(
      `INSERT INTO orden_historial (orden_id, estacion_destino, accion, usuario_id, motivo)
       VALUES ($1,$2,'crear',$3,$4)`,
      [orden.id, primeraEstacion, req.user?.id || null, 'Orden creada']
    )

    await client.query('COMMIT')

    // Releer con joins para responder con la forma "rica"
    const { rows: [full] } = await pool.query(
      `SELECT o.*,
              p.codigo AS proyecto_codigo, p.nombre AS proyecto_nombre,
              pt.nombre_completo AS personal_asignado_nombre,
              pt.iniciales       AS personal_asignado_iniciales
       FROM ordenes_produccion o
       LEFT JOIN proyectos       p  ON p.id  = o.proyecto_id
       LEFT JOIN personal_taller pt ON pt.id = o.personal_asignado_id
       WHERE o.id = $1`,
      [orden.id]
    )

    res.status(201).json({ data: full, message: 'Orden de producción creada' })
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return next(createError('Ya existe una orden con ese número', 409))
    next(err)
  } finally {
    client.release()
  }
}

/**
 * PUT /api/produccion/ordenes/:id
 * Actualización parcial de campos generales (no toca status ni estacion_actual).
 */
export async function updateOrden(req: Request, res: Response, next: NextFunction) {
  try {
    const allowed = ['item_nombre', 'cantidad', 'unidad', 'especificaciones', 'material_requerido',
                     'prioridad', 'fecha_entrega', 'tiempo_estimado_horas', 'notas']
    const fields: string[] = []
    const vals: unknown[] = [req.params.id]
    let i = 2

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${i++}`)
        vals.push(req.body[key])
      }
    }

    if (!fields.length) return next(createError('Sin campos para actualizar', 400))

    const { rows } = await pool.query(
      `UPDATE ordenes_produccion SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      vals
    )
    if (!rows[0]) return next(createError('Orden no encontrada', 404))
    res.json({ data: rows[0], message: 'Orden actualizada' })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/produccion/ordenes/:id/asignar
 * Asigna un operador a una estación del flujo.
 * Body: { estacion: 'cnc', personal_id: 1 }
 * Si la estación es la actual de la orden, también actualiza personal_asignado_id de la orden.
 */
export async function asignarOperador(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const { estacion, personal_id } = req.body
    if (!estacion) return next(createError('estacion requerida', 400))

    await client.query('BEGIN')

    const { rows: [orden] } = await client.query(
      `SELECT id, estacion_actual, personal_asignado_id FROM ordenes_produccion WHERE id = $1`,
      [req.params.id]
    )
    if (!orden) {
      await client.query('ROLLBACK')
      return next(createError('Orden no encontrada', 404))
    }

    const { rowCount } = await client.query(
      `UPDATE orden_procesos SET operador_id = $1
       WHERE orden_id = $2 AND estacion = $3`,
      [personal_id || null, req.params.id, estacion]
    )
    if (!rowCount) {
      await client.query('ROLLBACK')
      return next(createError('La orden no tiene ese proceso/estación', 400))
    }

    if (orden.estacion_actual === estacion) {
      await client.query(
        `UPDATE ordenes_produccion SET personal_asignado_id = $1, updated_at = NOW() WHERE id = $2`,
        [personal_id || null, req.params.id]
      )
    }

    await client.query(
      `INSERT INTO orden_historial (orden_id, estacion_destino, personal_origen_id, personal_destino_id, accion, usuario_id, motivo)
       VALUES ($1,$2,$3,$4,'asignar',$5,$6)`,
      [req.params.id, estacion, orden.personal_asignado_id || null, personal_id || null,
       req.user?.id || null, `Asignación a ${estacion}`]
    )

    await client.query('COMMIT')
    res.json({ message: 'Operador asignado' })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}

/**
 * Helper compartido — avanza la orden a la siguiente estación del flujo.
 * Si no hay siguiente, marca la orden como Completada.
 *
 * Usado por:
 *   PATCH /api/produccion/ordenes/:id/avanzar           (sistema, SHOP_MANAGER)
 *   POST  /api/kiosk/ordenes/:id/completar-proceso      (kiosko, operario)
 */
export async function avanzarOrdenInterno(opts: {
  ordenId: number
  reqUserId?: string | null
  reqKioskPersonalId?: number | null
  dispositivo?: string | null
  notas?: string | null
}) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [orden] } = await client.query(
      `SELECT id, estacion_actual, status FROM ordenes_produccion WHERE id = $1 FOR UPDATE`,
      [opts.ordenId]
    )
    if (!orden) {
      await client.query('ROLLBACK')
      throw createError('Orden no encontrada', 404)
    }
    if (orden.status === 'Completada' || orden.status === 'Cancelada') {
      await client.query('ROLLBACK')
      throw createError(`La orden está ${orden.status} y no puede avanzar`, 400)
    }
    if (!orden.estacion_actual) {
      await client.query('ROLLBACK')
      throw createError('La orden no tiene estación actual', 400)
    }

    // 1) Marcar el proceso actual como completado
    const { rows: [procesoActual] } = await client.query(
      `UPDATE orden_procesos
       SET completado = true,
           fecha_fin  = NOW(),
           tiempo_real_minutos = CASE
             WHEN fecha_inicio IS NOT NULL
             THEN ROUND(EXTRACT(EPOCH FROM (NOW() - fecha_inicio)) / 60)::INT
             ELSE tiempo_real_minutos
           END,
           notas = COALESCE($3, notas)
       WHERE orden_id = $1 AND estacion = $2
       RETURNING *`,
      [opts.ordenId, orden.estacion_actual, opts.notas ?? null]
    )

    // 2) Buscar la siguiente estación pendiente en secuencia
    const { rows: [siguiente] } = await client.query(
      `SELECT estacion, operador_id FROM orden_procesos
       WHERE orden_id = $1 AND completado = false
       ORDER BY secuencia ASC LIMIT 1`,
      [opts.ordenId]
    )

    let estacionDestino: string | null = null
    let nuevoStatus: Status

    if (siguiente) {
      estacionDestino = siguiente.estacion
      nuevoStatus = 'En Proceso'
      await client.query(
        `UPDATE ordenes_produccion
         SET estacion_actual = $1,
             personal_asignado_id = $2,
             status = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [estacionDestino, siguiente.operador_id || null, nuevoStatus, opts.ordenId]
      )
      // Si la siguiente estación nunca fue iniciada, registrar fecha_inicio
      await client.query(
        `UPDATE orden_procesos SET fecha_inicio = NOW()
         WHERE orden_id = $1 AND estacion = $2 AND fecha_inicio IS NULL`,
        [opts.ordenId, estacionDestino]
      )
    } else {
      // No hay más procesos → orden completada
      nuevoStatus = 'Completada'
      await client.query(
        `UPDATE ordenes_produccion
         SET status = 'Completada',
             fecha_completada = NOW(),
             estacion_actual = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [opts.ordenId]
      )
    }

    // 3) Historial
    await client.query(
      `INSERT INTO orden_historial
         (orden_id, estacion_origen, estacion_destino, accion,
          personal_origen_id, usuario_id, kiosk_personal_id, dispositivo, motivo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [opts.ordenId, orden.estacion_actual, estacionDestino, siguiente ? 'mover' : 'completar',
       procesoActual?.operador_id || null,
       opts.reqUserId || null, opts.reqKioskPersonalId || null,
       opts.dispositivo || null, opts.notas || null]
    )

    await client.query('COMMIT')

    return { siguiente_estacion: estacionDestino, status: nuevoStatus }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * PATCH /api/produccion/ordenes/:id/avanzar
 * Override del SHOP_MANAGER para avanzar una orden a la siguiente estación.
 */
export async function avanzarOrden(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await avanzarOrdenInterno({
      ordenId: parseInt(String(req.params.id)),
      reqUserId: req.user?.id ?? null,
      notas: req.body?.notas ?? null,
    })
    res.json({ data: result, message: result.siguiente_estacion ? 'Orden movida' : 'Orden completada' })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/produccion/ordenes/:id/pausar
 * Body: { motivo?: string }
 */
export async function pausarOrden(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query(
      `UPDATE ordenes_produccion SET status = 'Pausada', updated_at = NOW()
       WHERE id = $1 AND status IN ('Pendiente','En Proceso') RETURNING *`,
      [req.params.id]
    )
    if (!rows[0]) return next(createError('Orden no encontrada o no pausable', 404))

    await pool.query(
      `INSERT INTO orden_historial (orden_id, estacion_destino, accion, usuario_id, motivo)
       VALUES ($1,$2,'pausar',$3,$4)`,
      [req.params.id, rows[0].estacion_actual, req.user?.id || null, req.body?.motivo || null]
    )

    res.json({ data: rows[0], message: 'Orden pausada' })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/produccion/ordenes/:id/reanudar
 */
export async function reanudarOrden(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query(
      `UPDATE ordenes_produccion SET status = 'En Proceso', updated_at = NOW()
       WHERE id = $1 AND status = 'Pausada' RETURNING *`,
      [req.params.id]
    )
    if (!rows[0]) return next(createError('Orden no encontrada o no estaba pausada', 404))
    await pool.query(
      `INSERT INTO orden_historial (orden_id, estacion_destino, accion, usuario_id)
       VALUES ($1,$2,'reanudar',$3)`,
      [req.params.id, rows[0].estacion_actual, req.user?.id || null]
    )
    res.json({ data: rows[0], message: 'Orden reanudada' })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/produccion/ordenes/:id
 * Cancela la orden (no la borra físicamente para preservar historial).
 */
export async function cancelarOrden(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query(
      `UPDATE ordenes_produccion SET status = 'Cancelada', updated_at = NOW()
       WHERE id = $1 AND status NOT IN ('Completada','Cancelada') RETURNING *`,
      [req.params.id]
    )
    if (!rows[0]) return next(createError('Orden no encontrada o no cancelable', 404))

    await pool.query(
      `INSERT INTO orden_historial (orden_id, estacion_destino, accion, usuario_id, motivo)
       VALUES ($1,$2,'cancelar',$3,$4)`,
      [req.params.id, rows[0].estacion_actual || 'cancelada', req.user?.id || null, req.body?.motivo || null]
    )

    res.json({ message: 'Orden cancelada' })
  } catch (err) { next(err) }
}

/**
 * GET /api/produccion/ordenes-kpis — métricas para el dashboard de producción.
 */
export async function getOrdenesKpis(_req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('Pendiente','En Proceso','Pausada'))            AS activas,
         COUNT(*) FILTER (WHERE status = 'Completada' AND fecha_completada::date = CURRENT_DATE) AS completadas_hoy,
         COUNT(*) FILTER (WHERE status = 'Pausada')                                        AS pausadas,
         COUNT(*) FILTER (WHERE prioridad = 'Alta' AND status NOT IN ('Completada','Cancelada')) AS alta_prioridad,
         COUNT(*) FILTER (WHERE fecha_entrega < CURRENT_DATE AND status NOT IN ('Completada','Cancelada')) AS vencidas
       FROM ordenes_produccion`
    )
    res.json({ data: rows[0] })
  } catch (err) { next(err) }
}
