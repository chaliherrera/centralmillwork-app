import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'
import { parsePagination, paginatedResponse } from '../utils/pagination'

const ORDEN_BASE_SECUENCIA = [
  'cnc', 'edge_banding', 'assembly', 'lamina', 'pintura', 'final', 'registro', 'shipping',
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
      conds.push(`(o.numero_orden ILIKE $${vals.length + 1} OR o.numero_item ILIKE $${vals.length + 1})`)
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
 *   numero_orden, proyecto_id, numero_item, cantidad, unidad?, especificaciones?,
 *   material_requerido?, prioridad?, fecha_entrega?, tiempo_estimado_horas?, notas?,
 *   procesos: [string],     // estaciones requeridas, ej: ['cnc','edge_banding','assembly','pintura','final']
 *   asignaciones?: { [estacion]: personal_id }   // operador asignado por estación
 * }
 */
export async function createOrden(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const {
      numero_orden, proyecto_id, numero_item, cantidad, unidad,
      especificaciones, material_requerido, prioridad, fecha_entrega,
      tiempo_estimado_horas, notas, procesos = [], asignaciones = {},
    } = req.body

    if (!numero_orden || !numero_item || !cantidad) {
      return next(createError('numero_orden, numero_item y cantidad son requeridos', 400))
    }
    if (!Array.isArray(procesos) || procesos.length === 0) {
      return next(createError('Debe especificar al menos un proceso/estación', 400))
    }

    const procesosOrdenados = ordenarSecuencia(procesos)
    const primeraEstacion = procesosOrdenados[0]

    await client.query('BEGIN')

    const { rows: [orden] } = await client.query(
      `INSERT INTO ordenes_produccion
         (numero_orden, proyecto_id, numero_item, cantidad, unidad,
          especificaciones, material_requerido, prioridad, fecha_entrega,
          tiempo_estimado_horas, notas, status, estacion_actual, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Pendiente',$12,$13)
       RETURNING *`,
      [numero_orden, proyecto_id || null, numero_item, cantidad, unidad || 'Piezas',
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
    const allowed = ['numero_item', 'cantidad', 'unidad', 'especificaciones', 'material_requerido',
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

    // 1) Cerrar cualquier segmento de time_proyectos abierto para el operario
    //    responsable de este proceso en esta orden+estación. Esto cubre el caso
    //    "operario click 'Item completado' mientras tiene el timer corriendo".
    //    Si el llamador es SHOP_MANAGER (no hay kiosk_personal_id), igual cerramos
    //    el segmento del operador asignado al proceso — la jornada de horas
    //    queda consistente sin importar quién dispare el avance.
    const { rows: [opActual] } = await client.query(
      `SELECT operador_id FROM orden_procesos
       WHERE orden_id = $1 AND estacion = $2`,
      [opts.ordenId, orden.estacion_actual]
    )
    const operadorIdResp = opActual?.operador_id ?? null
    if (operadorIdResp) {
      await client.query(
        `UPDATE time_proyectos SET hora_fin = NOW(), completado = true
         WHERE personal_id = $1
           AND orden_produccion_id = $2
           AND estacion = $3
           AND hora_fin IS NULL`,
        [operadorIdResp, opts.ordenId, orden.estacion_actual]
      )
    }

    // 2) Marcar el proceso completado y recalcular tiempo_real_minutos como
    //    SUM de todos los segmentos cerrados del operador en esta orden+estación.
    //    Esto da el tiempo REAL trabajado (multi-día friendly): si Victor empezó
    //    martes 4pm y terminó jueves 10am, NOT (NOW - fecha_inicio) = 42h sino
    //    SUM(segmentos) = ~16h reales.
    const { rows: [procesoActual] } = await client.query(
      `UPDATE orden_procesos
       SET completado = true,
           fecha_fin  = NOW(),
           tiempo_real_minutos = COALESCE((
             SELECT ROUND(SUM(EXTRACT(EPOCH FROM (hora_fin - hora_inicio)) / 60))::INT
             FROM time_proyectos
             WHERE orden_produccion_id = $1
               AND estacion = $2
               AND hora_fin IS NOT NULL
               AND ($4::int IS NULL OR personal_id = $4)
           ), tiempo_real_minutos),
           notas = COALESCE($3, notas)
       WHERE orden_id = $1 AND estacion = $2
       RETURNING *`,
      [opts.ordenId, orden.estacion_actual, opts.notas ?? null, operadorIdResp]
    )

    // 3) Buscar la siguiente estación pendiente en secuencia
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
      // Nota: NO auto-seteamos `fecha_inicio` de la siguiente estación.
      // Ahora el operario tiene que hacer click en "Iniciar item" para
      // arrancarla. El status 'En Proceso' refleja que la orden avanzó,
      // pero el proceso siguiente queda 'no_iniciado' hasta que alguien
      // lo arranque explícitamente.
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
    // Cuando es el último proceso, `estacionDestino` es null porque no hay
    // siguiente — pero la columna `orden_historial.estacion_destino` es NOT NULL.
    // Usamos el sentinel 'completada' para que la auditoría refleje el destino real
    // ("final → completada") y la DB no se queje. La orden en sí queda con
    // `estacion_actual = NULL`, esto es solo para el row del historial.
    const destinoHistorial = estacionDestino ?? 'completada'
    await client.query(
      `INSERT INTO orden_historial
         (orden_id, estacion_origen, estacion_destino, accion,
          personal_origen_id, usuario_id, kiosk_personal_id, dispositivo, motivo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [opts.ordenId, orden.estacion_actual, destinoHistorial, siguiente ? 'mover' : 'completar',
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
 * POST /api/kiosk/ordenes/:id/iniciar-item
 *
 * Click "Iniciar item" / "Continuar item" desde el kiosko.
 *
 * Comportamiento:
 *  1. Valida que el operario está asignado a la estación actual de la orden
 *  2. Cierra cualquier OTRO segmento de time_proyectos abierto del operario
 *     (sólo puede tener 1 a la vez — viola el índice único parcial si no)
 *  3. Si la orden tiene status 'Pendiente', la pasa a 'En Proceso'
 *  4. Si orden_procesos.fecha_inicio es NULL → la setea a NOW() (primer inicio)
 *     Si ya tenía valor → NO la toca (preserva el primer arranque histórico)
 *  5. Abre un nuevo segmento de time_proyectos con orden_produccion_id, estacion,
 *     personal_id, hora_inicio = NOW()
 *  6. Registra evento en orden_historial (accion='iniciar')
 *
 * Reutilizable como concepto:
 *  - Primer inicio (fecha_inicio era NULL)  → "Iniciar item"
 *  - Continuación (fecha_inicio existía)    → "Continuar item"
 * El frontend decide la etiqueta del botón en base a fecha_inicio + minutos_previos.
 */
export async function iniciarItemKiosk(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const ordenId    = parseInt(String(req.params.id))
    if (Number.isNaN(ordenId)) return next(createError('id inválido', 400))
    const personalId = req.kioskUser!.personal_id
    const dispositivo = req.kioskUser!.dispositivo ?? null

    await client.query('BEGIN')

    // 1) Validar orden + estación + asignación del operario
    const { rows: [orden] } = await client.query(
      `SELECT id, estacion_actual, status FROM ordenes_produccion WHERE id = $1 FOR UPDATE`,
      [ordenId]
    )
    if (!orden) {
      await client.query('ROLLBACK')
      return next(createError('Orden no encontrada', 404))
    }
    if (orden.status === 'Completada' || orden.status === 'Cancelada') {
      await client.query('ROLLBACK')
      return next(createError(`La orden está ${orden.status} y no se puede iniciar`, 400))
    }
    if (!orden.estacion_actual) {
      await client.query('ROLLBACK')
      return next(createError('La orden no tiene estación actual', 400))
    }

    const { rows: [proceso] } = await client.query(
      `SELECT id, fecha_inicio, completado, operador_id
       FROM orden_procesos
       WHERE orden_id = $1 AND estacion = $2`,
      [ordenId, orden.estacion_actual]
    )
    if (!proceso) {
      await client.query('ROLLBACK')
      return next(createError('La orden no tiene proceso en la estación actual', 400))
    }
    if (proceso.completado) {
      await client.query('ROLLBACK')
      return next(createError('Este item ya está completado', 400))
    }
    if (proceso.operador_id && proceso.operador_id !== personalId) {
      await client.query('ROLLBACK')
      return next(createError('No estás asignado a este item', 403))
    }

    // 2) Verificar que tenga clock-in activo (es requisito de time_proyectos)
    const { rows: [registro] } = await client.query(
      `SELECT id FROM time_registros WHERE personal_id = $1 AND status = 'activo' LIMIT 1`,
      [personalId]
    )
    if (!registro) {
      await client.query('ROLLBACK')
      return next(createError('Hacé clock-in antes de iniciar un item', 400))
    }

    // 3) Cerrar cualquier OTRO segmento abierto del operario
    //    (sólo uno puede estar activo a la vez por el índice único parcial)
    await client.query(
      `UPDATE time_proyectos SET hora_fin = NOW(), completado = false
       WHERE personal_id = $1 AND hora_fin IS NULL`,
      [personalId]
    )

    // 4) Si el proceso nunca fue iniciado, setear fecha_inicio
    const eraPrimerInicio = !proceso.fecha_inicio
    if (eraPrimerInicio) {
      await client.query(
        `UPDATE orden_procesos SET fecha_inicio = NOW() WHERE id = $1`,
        [proceso.id]
      )
    }

    // 5) Pasar orden a 'En Proceso' si era 'Pendiente' o 'Pausada'
    if (orden.status === 'Pendiente' || orden.status === 'Pausada') {
      await client.query(
        `UPDATE ordenes_produccion SET status = 'En Proceso', updated_at = NOW(), fecha_inicio = COALESCE(fecha_inicio, NOW()) WHERE id = $1`,
        [ordenId]
      )
    }

    // 6) Abrir segmento nuevo en time_proyectos
    //    proyecto_id de la orden (puede ser null)
    const { rows: [ordenProy] } = await client.query(
      `SELECT proyecto_id FROM ordenes_produccion WHERE id = $1`,
      [ordenId]
    )
    if (!ordenProy?.proyecto_id) {
      await client.query('ROLLBACK')
      return next(createError('La orden no tiene proyecto asociado — no se puede iniciar el item desde el kiosko', 400))
    }
    const { rows: [segmento] } = await client.query(
      `INSERT INTO time_proyectos
         (registro_id, personal_id, proyecto_id, estacion, orden_produccion_id, hora_inicio, dispositivo)
       VALUES ($1,$2,$3,$4,$5, NOW(), $6)
       RETURNING *`,
      [registro.id, personalId, ordenProy.proyecto_id, orden.estacion_actual, ordenId, dispositivo]
    )

    // 7) Historial
    await client.query(
      `INSERT INTO orden_historial
         (orden_id, estacion_origen, estacion_destino, accion, kiosk_personal_id, dispositivo, motivo)
       VALUES ($1, $2, $2, $3, $4, $5, $6)`,
      [ordenId, orden.estacion_actual, eraPrimerInicio ? 'iniciar' : 'continuar',
       personalId, dispositivo, null]
    )

    await client.query('COMMIT')

    res.status(201).json({
      data: { segmento, era_primer_inicio: eraPrimerInicio },
      message: eraPrimerInicio ? 'Item iniciado' : 'Item retomado',
    })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
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
 * GET /api/produccion/eventos-recientes?desde=<ISO timestamp>
 * Devuelve eventos del taller desde el timestamp dado, enriquecidos con
 * info útil para mostrar en notificaciones (número de orden, item, persona
 * que lo hizo, etc.).
 *
 * Filtramos a los eventos accionables para el SHOP_MANAGER:
 *   - `mover` y `completar` cuando el actor fue un operario del kiosko
 *     (kiosk_personal_id IS NOT NULL) — son los más relevantes
 *
 * Si no se manda `desde`, devuelve las últimas 24h (útil al cargar el panel
 * por primera vez para mostrar histórico reciente).
 */
export async function getEventosRecientes(req: Request, res: Response, next: NextFunction) {
  try {
    const desde = req.query.desde
      ? new Date(String(req.query.desde))
      : new Date(Date.now() - 24 * 3600 * 1000)

    if (isNaN(desde.getTime())) return next(createError('desde inválido', 400))

    const { rows } = await pool.query(
      `SELECT
         h.id,
         h.timestamp,
         h.accion,
         h.estacion_origen,
         h.estacion_destino,
         h.dispositivo,
         h.motivo,
         o.id            AS orden_id,
         o.numero_orden,
         o.numero_item,
         o.prioridad,
         o.status        AS orden_status,
         p.codigo        AS proyecto_codigo,
         pk.nombre_completo  AS kiosk_personal_nombre,
         pk.iniciales        AS kiosk_personal_iniciales,
         u.nombre        AS usuario_nombre
       FROM orden_historial h
       JOIN ordenes_produccion o ON o.id = h.orden_id
       LEFT JOIN proyectos       p  ON p.id  = o.proyecto_id
       LEFT JOIN personal_taller pk ON pk.id = h.kiosk_personal_id
       LEFT JOIN usuarios        u  ON u.id  = h.usuario_id
       WHERE h.timestamp > $1
         AND h.accion IN ('mover','completar')
         AND h.kiosk_personal_id IS NOT NULL
       ORDER BY h.timestamp DESC
       LIMIT 50`,
      [desde.toISOString()]
    )

    res.json({
      desde: desde.toISOString(),
      ahora: new Date().toISOString(),
      eventos: rows,
    })
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

/**
 * GET /api/produccion/ordenes/:id/evolucion
 *
 * Vista de evolución de la orden — combina:
 *   1. Estado de cada proceso (estación) con tiempo real vs estimado
 *   2. Timeline cronológica de eventos (creación, asignaciones, inicios, pausas, completas)
 *   3. Segmentos de trabajo con quién y cuándo
 *
 * Auth: solo SHOP_MANAGER y ADMIN (filtrado en la ruta).
 */
export async function getOrdenEvolucion(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(String(req.params.id))
    if (!Number.isFinite(id)) return next(createError('id inválido', 400))

    // 1) Orden base
    const { rows: [orden] } = await pool.query(
      `SELECT
         o.id, o.numero_orden, o.numero_item, o.cantidad, o.unidad,
         o.prioridad, o.status, o.estacion_actual,
         o.tiempo_estimado_horas, o.fecha_entrega,
         o.fecha_inicio, o.fecha_completada,
         o.created_at, o.created_by,
         p.codigo AS proyecto_codigo, p.nombre AS proyecto_nombre,
         u.nombre AS creado_por_nombre
       FROM ordenes_produccion o
       LEFT JOIN proyectos  p ON p.id = o.proyecto_id
       LEFT JOIN usuarios   u ON u.id = o.created_by
       WHERE o.id = $1`,
      [id]
    )
    if (!orden) return next(createError('Orden no encontrada', 404))

    // 2) Procesos con tiempo real (sum de segmentos) + tiempo estimado por estación
    //    Si tiempo_estimado_minutos NO está seteado por estación, se distribuye
    //    tiempo_estimado_horas equitativamente en el frontend.
    const { rows: procesos } = await pool.query(
      `SELECT
         op.id, op.estacion, op.secuencia, op.requerido, op.completado,
         op.fecha_inicio, op.fecha_fin,
         op.tiempo_estimado_minutos,
         -- tiempo real: prioridad a SUM de time_proyectos (multi-día friendly).
         -- Si no hay segmentos cerrados, usa el valor cacheado en orden_procesos.
         COALESCE(
           (SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(tp.hora_fin, NOW()) - tp.hora_inicio)) / 60)
            FROM time_proyectos tp
            WHERE tp.orden_produccion_id = op.orden_id
              AND tp.estacion = op.estacion),
           op.tiempo_real_minutos,
           0
         )::int AS tiempo_real_minutos,
         -- Operador actual del proceso (puede ser distinto al original si lo reasignaron)
         pt.id           AS operador_actual_id,
         pt.nombre_completo AS operador_actual_nombre,
         pt.iniciales       AS operador_actual_iniciales,
         -- Estado derivado para el frontend
         CASE
           WHEN op.completado                       THEN 'completado'
           WHEN op.fecha_inicio IS NOT NULL
             AND EXISTS (SELECT 1 FROM time_proyectos tp
                         WHERE tp.orden_produccion_id = op.orden_id
                           AND tp.estacion = op.estacion
                           AND tp.hora_fin IS NULL)  THEN 'en_curso'
           WHEN op.fecha_inicio IS NOT NULL         THEN 'pausado'
           ELSE 'pendiente'
         END AS estado
       FROM orden_procesos op
       LEFT JOIN personal_taller pt ON pt.id = op.operador_id
       WHERE op.orden_id = $1
       ORDER BY op.secuencia ASC`,
      [id]
    )

    // 3) Eventos del timeline — unión de varias fuentes
    //    a) Creación (de la orden)
    //    b) Eventos de orden_historial (asignar, mover, completar, iniciar-item)
    //    c) Pausas tomadas durante el trabajo de esta orden
    //
    //    Nota: una pausa la disparamos solo si AT-LEAST-ONE segmento de time_proyectos
    //    de esta orden está abierto cuando arranca la pausa. Esto evita listar pausas
    //    que no tienen que ver con esta orden puntual.

    const { rows: eventos } = await pool.query(
      `WITH eventos_union AS (
         -- A) Creación
         SELECT
           'creada'::text AS tipo,
           o.created_at   AS timestamp,
           NULL::int      AS actor_personal_id,
           u.nombre       AS actor_usuario,
           NULL::text     AS actor_iniciales,
           jsonb_build_object('prioridad', o.prioridad) AS detalle
         FROM ordenes_produccion o
         LEFT JOIN usuarios u ON u.id = o.created_by
         WHERE o.id = $1

         UNION ALL

         -- B) Eventos de historial — quien hace la acción es kiosk_personal (operario)
         --    o usuario_id (sistema), en ese orden de precedencia.
         SELECT
           CASE oh.accion
             WHEN 'asignar'      THEN 'asignada'
             WHEN 'iniciar-item' THEN 'iniciado_item'
             WHEN 'mover'        THEN 'movida'
             WHEN 'completar'    THEN
               CASE WHEN oh.estacion_destino = 'completada' THEN 'completada' ELSE 'movida' END
             ELSE oh.accion
           END                                                       AS tipo,
           oh.timestamp                                              AS timestamp,
           COALESCE(oh.kiosk_personal_id, oh.personal_destino_id)    AS actor_personal_id,
           u.nombre                                                  AS actor_usuario,
           COALESCE(ptk.iniciales, ptd.iniciales)                    AS actor_iniciales,
           jsonb_build_object(
             'estacion_origen',  oh.estacion_origen,
             'estacion_destino', NULLIF(oh.estacion_destino, 'completada'),
             'motivo',           oh.motivo,
             'personal_destino', ptd.nombre_completo
           )                                                         AS detalle
         FROM orden_historial oh
         LEFT JOIN usuarios          u   ON u.id   = oh.usuario_id
         LEFT JOIN personal_taller   ptk ON ptk.id = oh.kiosk_personal_id
         LEFT JOIN personal_taller   ptd ON ptd.id = oh.personal_destino_id
         WHERE oh.orden_id = $1

         UNION ALL

         -- C) Pausas — solo las que ocurrieron mientras AL MENOS UN segmento de
         --    esta orden estaba abierto (la pausa es del operario, no de la orden,
         --    pero la mostramos en el timeline para entender por qué hubo tiempo muerto).
         SELECT
           'pausa'::text AS tipo,
           pa.hora_inicio AS timestamp,
           pa.personal_id AS actor_personal_id,
           NULL::text     AS actor_usuario,
           pt.iniciales   AS actor_iniciales,
           jsonb_build_object(
             'motivo',         pa.motivo,
             'duracion_min',   pa.duracion_minutos,
             'hora_fin',       pa.hora_fin
           )              AS detalle
         FROM time_pausas pa
         JOIN personal_taller pt ON pt.id = pa.personal_id
         WHERE EXISTS (
           SELECT 1 FROM time_proyectos tp
           WHERE tp.orden_produccion_id = $1
             AND tp.personal_id = pa.personal_id
             AND tp.hora_inicio <= pa.hora_inicio
             AND (tp.hora_fin IS NULL OR tp.hora_fin >= pa.hora_inicio)
         )
       )
       SELECT * FROM eventos_union
       ORDER BY timestamp ASC`,
      [id]
    )

    res.json({
      data: {
        orden,
        procesos,
        eventos,
      },
    })
  } catch (err) { next(err) }
}
