import { Request, Response, NextFunction } from 'express'
import * as XLSX from 'xlsx'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'

// ╔═══════════════════════════════════════════════════════════════════════════
// ║ ENDPOINTS DEL KIOSKO (usan req.kioskUser, no req.user)
// ║ El operario interactúa desde la tablet con su JWT de kiosko.
// ╚═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/kiosk/time-tracking/clock-in
 * Crea un registro de jornada nuevo. Falla si ya hay uno activo (índice único parcial).
 */
export async function clockIn(req: Request, res: Response, next: NextFunction) {
  try {
    const personal_id = req.kioskUser!.personal_id
    const dispositivo = req.kioskUser!.dispositivo ?? null

    const { rows } = await pool.query(
      `INSERT INTO time_registros (personal_id, fecha, hora_entrada, status, dispositivo)
       VALUES ($1, CURRENT_DATE, NOW(), 'activo', $2)
       RETURNING *`,
      [personal_id, dispositivo]
    )
    res.status(201).json({ data: rows[0], message: 'Clock-in registrado' })
  } catch (err: any) {
    if (err.code === '23505') {
      return next(createError('Ya tenés un clock-in activo. Hacé clock-out primero.', 409))
    }
    next(err)
  }
}

/**
 * POST /api/kiosk/time-tracking/clock-out
 * Cierra el registro de jornada activo del operario. Antes:
 *   - Cierra cualquier proyecto activo
 *   - Cierra cualquier pausa activa
 */
export async function clockOut(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const personal_id = req.kioskUser!.personal_id

    await client.query('BEGIN')

    const { rows: [registro] } = await client.query(
      `SELECT id FROM time_registros WHERE personal_id = $1 AND status = 'activo' FOR UPDATE`,
      [personal_id]
    )
    if (!registro) {
      await client.query('ROLLBACK')
      return next(createError('No hay clock-in activo. Hacé clock-in primero.', 400))
    }

    // Cerrar pausas abiertas
    await client.query(
      `UPDATE time_pausas SET hora_fin = NOW()
       WHERE registro_id = $1 AND hora_fin IS NULL`,
      [registro.id]
    )

    // Cerrar proyecto activo (si lo hay)
    await client.query(
      `UPDATE time_proyectos SET hora_fin = NOW(), completado = false
       WHERE registro_id = $1 AND hora_fin IS NULL`,
      [registro.id]
    )

    const { rows: [closed] } = await client.query(
      `UPDATE time_registros
       SET hora_salida = NOW(), status = 'finalizado', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [registro.id]
    )

    await client.query('COMMIT')
    res.json({ data: closed, message: 'Clock-out registrado' })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}

/**
 * POST /api/kiosk/time-tracking/proyecto/iniciar
 * Body: { proyecto_id, estacion, orden_produccion_id?, descripcion? }
 *
 * Cierra el segmento de proyecto anterior (si existe) y abre uno nuevo.
 * Requiere clock-in activo.
 */
export async function iniciarProyecto(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const personal_id = req.kioskUser!.personal_id
    const dispositivo = req.kioskUser!.dispositivo ?? null
    const { proyecto_id, estacion, orden_produccion_id, descripcion } = req.body

    if (!proyecto_id || !estacion) {
      return next(createError('proyecto_id y estacion son requeridos', 400))
    }

    await client.query('BEGIN')

    const { rows: [registro] } = await client.query(
      `SELECT id FROM time_registros WHERE personal_id = $1 AND status = 'activo' FOR UPDATE`,
      [personal_id]
    )
    if (!registro) {
      await client.query('ROLLBACK')
      return next(createError('Hacé clock-in antes de iniciar un proyecto', 400))
    }

    // Cerrar segmento de proyecto anterior si existía
    await client.query(
      `UPDATE time_proyectos SET hora_fin = NOW(), completado = true
       WHERE personal_id = $1 AND hora_fin IS NULL`,
      [personal_id]
    )

    const { rows: [nuevo] } = await client.query(
      `INSERT INTO time_proyectos
        (registro_id, personal_id, proyecto_id, estacion, orden_produccion_id,
         hora_inicio, descripcion_trabajo, dispositivo)
       VALUES ($1,$2,$3,$4,$5, NOW(),$6,$7)
       RETURNING *`,
      [registro.id, personal_id, parseInt(proyecto_id), estacion,
       orden_produccion_id || null, descripcion || null, dispositivo]
    )

    await client.query('COMMIT')
    res.status(201).json({ data: nuevo, message: 'Proyecto iniciado' })
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (err.code === '23503') return next(createError('proyecto_id u orden_produccion_id no existe', 400))
    next(err)
  } finally {
    client.release()
  }
}

/**
 * POST /api/kiosk/time-tracking/proyecto/finalizar
 * Cierra el segmento de proyecto activo del operario.
 */
export async function finalizarProyecto(req: Request, res: Response, next: NextFunction) {
  try {
    const personal_id = req.kioskUser!.personal_id

    const { rows } = await pool.query(
      `UPDATE time_proyectos
       SET hora_fin = NOW(), completado = true
       WHERE personal_id = $1 AND hora_fin IS NULL
       RETURNING *`,
      [personal_id]
    )
    if (!rows[0]) return next(createError('No hay proyecto activo', 400))
    res.json({ data: rows[0], message: 'Proyecto finalizado' })
  } catch (err) { next(err) }
}

/**
 * POST /api/kiosk/time-tracking/pausa/iniciar
 * Body: { motivo? }
 */
export async function iniciarPausa(req: Request, res: Response, next: NextFunction) {
  try {
    const personal_id = req.kioskUser!.personal_id
    const dispositivo = req.kioskUser!.dispositivo ?? null

    const { rows: [registro] } = await pool.query(
      `SELECT id FROM time_registros WHERE personal_id = $1 AND status = 'activo'`,
      [personal_id]
    )
    if (!registro) return next(createError('Hacé clock-in antes de tomar un break', 400))

    const { rows } = await pool.query(
      `INSERT INTO time_pausas (registro_id, personal_id, hora_inicio, motivo, dispositivo)
       VALUES ($1,$2, NOW(), $3, $4)
       RETURNING *`,
      [registro.id, personal_id, req.body?.motivo || null, dispositivo]
    )
    res.status(201).json({ data: rows[0], message: 'Pausa iniciada' })
  } catch (err: any) {
    if (err.code === '23505') return next(createError('Ya tenés una pausa activa', 409))
    next(err)
  }
}

/**
 * POST /api/kiosk/time-tracking/pausa/finalizar
 */
export async function finalizarPausa(req: Request, res: Response, next: NextFunction) {
  try {
    const personal_id = req.kioskUser!.personal_id
    const { rows } = await pool.query(
      `UPDATE time_pausas SET hora_fin = NOW()
       WHERE personal_id = $1 AND hora_fin IS NULL
       RETURNING *`,
      [personal_id]
    )
    if (!rows[0]) return next(createError('No hay pausa activa', 400))
    res.json({ data: rows[0], message: 'Pausa finalizada' })
  } catch (err) { next(err) }
}

/**
 * GET /api/kiosk/time-tracking/dia
 * Resumen del día del operario logueado: registro, proyectos del día, pausas, totales.
 */
export async function diaActual(req: Request, res: Response, next: NextFunction) {
  try {
    const personal_id = req.kioskUser!.personal_id

    const [registroQ, proyectosQ, pausasQ] = await Promise.all([
      pool.query(
        `SELECT * FROM time_registros
         WHERE personal_id = $1 AND fecha = CURRENT_DATE
         ORDER BY hora_entrada DESC LIMIT 1`,
        [personal_id]
      ),
      pool.query(
        `SELECT tp.*, p.codigo AS proyecto_codigo, p.nombre AS proyecto_nombre
         FROM time_proyectos tp
         JOIN proyectos p ON p.id = tp.proyecto_id
         WHERE tp.personal_id = $1 AND tp.hora_inicio::date = CURRENT_DATE
         ORDER BY tp.hora_inicio`,
        [personal_id]
      ),
      pool.query(
        `SELECT * FROM time_pausas
         WHERE personal_id = $1 AND hora_inicio::date = CURRENT_DATE
         ORDER BY hora_inicio`,
        [personal_id]
      ),
    ])

    res.json({
      data: {
        registro:  registroQ.rows[0]  ?? null,
        proyectos: proyectosQ.rows,
        pausas:    pausasQ.rows,
      },
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/kiosk/proyectos-disponibles
 * Lista de proyectos activos para que el operario elija.
 */
export async function proyectosDisponibles(_req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query(
      `SELECT id, codigo, nombre, estado FROM proyectos
       WHERE estado IN ('activo','cotizacion')
       ORDER BY codigo`
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
}

// ╔═══════════════════════════════════════════════════════════════════════════
// ║ ENDPOINTS DEL SISTEMA (usan req.user — SHOP_MANAGER / ADMIN)
// ║ Reportes de horas, supervisión del personal activo.
// ╚═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/produccion/time-tracking/activos
 * Quién está clocked-in ahora mismo, en qué proyecto/estación, desde cuándo.
 */
export async function getPersonalActivo(_req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query(
      `SELECT
         tr.personal_id,
         pt.nombre_completo,
         pt.iniciales,
         pt.tipo_personal,
         tr.id           AS registro_id,
         tr.hora_entrada,
         tr.dispositivo  AS dispositivo_clockin,
         tp.id           AS proyecto_segmento_id,
         tp.proyecto_id,
         p.codigo        AS proyecto_codigo,
         p.nombre        AS proyecto_nombre,
         tp.estacion,
         tp.orden_produccion_id,
         tp.hora_inicio  AS proyecto_desde,
         pa.id           AS pausa_id,
         pa.hora_inicio  AS pausa_desde,
         pa.motivo       AS pausa_motivo
       FROM time_registros  tr
       JOIN personal_taller pt ON pt.id = tr.personal_id
       LEFT JOIN time_proyectos tp ON tp.personal_id = tr.personal_id AND tp.hora_fin IS NULL
       LEFT JOIN proyectos       p  ON p.id  = tp.proyecto_id
       LEFT JOIN time_pausas    pa ON pa.personal_id = tr.personal_id AND pa.hora_fin IS NULL
       WHERE tr.status = 'activo'
       ORDER BY tr.hora_entrada`
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
}

/**
 * GET /api/produccion/time-tracking/personal/:id?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD
 * Reporte de horas trabajadas por persona en un rango.
 */
export async function reportePersonal(req: Request, res: Response, next: NextFunction) {
  try {
    const fechaDesde = String(req.query.fecha_desde ?? '1900-01-01')
    const fechaHasta = String(req.query.fecha_hasta ?? '2999-12-31')

    const { rows } = await pool.query(
      `SELECT
         tr.id,
         tr.fecha,
         tr.hora_entrada,
         tr.hora_salida,
         tr.total_horas,
         tr.dispositivo,
         COALESCE(SUM(EXTRACT(EPOCH FROM (
           COALESCE(tp.hora_fin, tr.hora_salida) - tp.hora_inicio
         )) / 3600) FILTER (WHERE tp.id IS NOT NULL), 0) AS horas_proyectos,
         COALESCE(SUM(EXTRACT(EPOCH FROM (
           COALESCE(pa.hora_fin, tr.hora_salida) - pa.hora_inicio
         )) / 3600) FILTER (WHERE pa.id IS NOT NULL), 0) AS horas_pausas,
         COALESCE(json_agg(DISTINCT jsonb_build_object(
           'proyecto_id',     tp.proyecto_id,
           'proyecto_codigo', p.codigo,
           'proyecto_nombre', p.nombre,
           'estacion',        tp.estacion,
           'horas',           tp.total_horas
         )) FILTER (WHERE tp.id IS NOT NULL), '[]'::json) AS proyectos
       FROM time_registros tr
       LEFT JOIN time_proyectos tp ON tp.registro_id = tr.id
       LEFT JOIN proyectos       p  ON p.id  = tp.proyecto_id
       LEFT JOIN time_pausas    pa ON pa.registro_id = tr.id
       WHERE tr.personal_id = $1
         AND tr.fecha BETWEEN $2 AND $3
       GROUP BY tr.id
       ORDER BY tr.fecha DESC`,
      [req.params.id, fechaDesde, fechaHasta]
    )

    res.json({
      personal_id: parseInt(String(req.params.id)),
      periodo: { desde: fechaDesde, hasta: fechaHasta },
      registros: rows,
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/produccion/time-tracking/proyecto/:id?fecha_desde=...&fecha_hasta=...
 * Horas totales que cada operario trabajó en un proyecto.
 */
export async function reportePorProyecto(req: Request, res: Response, next: NextFunction) {
  try {
    const fechaDesde = String(req.query.fecha_desde ?? '1900-01-01')
    const fechaHasta = String(req.query.fecha_hasta ?? '2999-12-31')

    const { rows } = await pool.query(
      `SELECT
         tp.personal_id,
         pt.nombre_completo,
         pt.iniciales,
         tp.estacion,
         SUM(tp.total_horas)         AS horas,
         COUNT(*)                    AS segmentos,
         MIN(tp.hora_inicio)         AS desde,
         MAX(COALESCE(tp.hora_fin, NOW())) AS hasta
       FROM time_proyectos tp
       JOIN personal_taller pt ON pt.id = tp.personal_id
       WHERE tp.proyecto_id = $1
         AND tp.hora_inicio::date BETWEEN $2 AND $3
       GROUP BY tp.personal_id, pt.nombre_completo, pt.iniciales, tp.estacion
       ORDER BY horas DESC NULLS LAST`,
      [req.params.id, fechaDesde, fechaHasta]
    )

    res.json({
      proyecto_id: parseInt(String(req.params.id)),
      periodo: { desde: fechaDesde, hasta: fechaHasta },
      asignaciones: rows,
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/produccion/time-tracking/diario?fecha=YYYY-MM-DD
 * Resumen del día para todo el personal: horas trabajadas, pausas, proyectos.
 */
export async function reporteDiario(req: Request, res: Response, next: NextFunction) {
  try {
    const fecha = String(req.query.fecha ?? new Date().toISOString().slice(0, 10))

    const { rows } = await pool.query(
      `SELECT
         pt.id           AS personal_id,
         pt.nombre_completo,
         pt.iniciales,
         tr.id           AS registro_id,
         tr.hora_entrada,
         tr.hora_salida,
         tr.total_horas,
         tr.status,
         COALESCE(SUM(pa.duracion_minutos) / 60, 0) AS horas_pausas,
         COUNT(DISTINCT tp.proyecto_id) AS proyectos_count
       FROM personal_taller pt
       LEFT JOIN time_registros tr ON tr.personal_id = pt.id AND tr.fecha = $1
       LEFT JOIN time_pausas    pa ON pa.registro_id = tr.id
       LEFT JOIN time_proyectos tp ON tp.registro_id = tr.id
       WHERE pt.activo = true
       GROUP BY pt.id, tr.id
       ORDER BY pt.nombre_completo`,
      [fecha]
    )

    res.json({ fecha, personal: rows })
  } catch (err) { next(err) }
}

/**
 * GET /api/produccion/time-tracking/exportar
 * Genera un xlsx con horas trabajadas por persona en el período dado.
 *
 * Query: ?tipo=personal|proyecto|diario&fecha_desde=&fecha_hasta=&personal_id=&proyecto_id=
 *
 * Devuelve el archivo directamente con Content-Disposition: attachment.
 */
export async function exportarHoras(req: Request, res: Response, next: NextFunction) {
  try {
    const tipo       = String(req.query.tipo ?? 'personal')
    const fechaDesde = String(req.query.fecha_desde ?? '1900-01-01')
    const fechaHasta = String(req.query.fecha_hasta ?? '2999-12-31')

    const wb = XLSX.utils.book_new()
    let nombreArchivo = `horas-${tipo}-${fechaDesde}_${fechaHasta}.xlsx`

    if (tipo === 'personal') {
      // Una hoja por persona (o filtrada por personal_id), filas = jornadas
      const personalId = req.query.personal_id ? parseInt(String(req.query.personal_id)) : null
      const personalQ = await pool.query(
        personalId
          ? `SELECT id, nombre_completo, iniciales FROM personal_taller WHERE id = $1`
          : `SELECT id, nombre_completo, iniciales FROM personal_taller WHERE activo = true ORDER BY nombre_completo`,
        personalId ? [personalId] : []
      )

      // Hoja resumen
      const resumen: any[] = []
      for (const p of personalQ.rows) {
        const { rows: jornadas } = await pool.query(
          `SELECT
             tr.fecha, tr.hora_entrada, tr.hora_salida, tr.total_horas,
             COALESCE(SUM(pa.duracion_minutos) / 60, 0) AS horas_pausas,
             COALESCE(SUM(pa.duracion_minutos) / 60, 0) AS pausas_total
           FROM time_registros tr
           LEFT JOIN time_pausas pa ON pa.registro_id = tr.id
           WHERE tr.personal_id = $1 AND tr.fecha BETWEEN $2 AND $3
           GROUP BY tr.id
           ORDER BY tr.fecha`,
          [p.id, fechaDesde, fechaHasta]
        )
        for (const j of jornadas) {
          resumen.push({
            'Persona': p.nombre_completo,
            'Iniciales': p.iniciales,
            'Fecha': j.fecha,
            'Entrada': j.hora_entrada ? new Date(j.hora_entrada).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '',
            'Salida':  j.hora_salida  ? new Date(j.hora_salida).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit'  }) : '',
            'Horas brutas': j.total_horas != null ? Number(j.total_horas).toFixed(2) : '',
            'Horas pausas': Number(j.horas_pausas).toFixed(2),
            'Horas netas':  j.total_horas != null
              ? (Number(j.total_horas) - Number(j.horas_pausas)).toFixed(2)
              : '',
          })
        }
      }
      const ws = XLSX.utils.json_to_sheet(resumen)
      XLSX.utils.book_append_sheet(wb, ws, 'Jornadas')

      // Hoja de totales por persona
      const totales: any[] = []
      for (const p of personalQ.rows) {
        const { rows: [tot] } = await pool.query(
          `SELECT
             COALESCE(SUM(tr.total_horas), 0) AS horas_brutas,
             COALESCE(SUM(pausas.total_pausas) / 60, 0) AS horas_pausas
           FROM time_registros tr
           LEFT JOIN LATERAL (
             SELECT SUM(duracion_minutos) AS total_pausas
             FROM time_pausas WHERE registro_id = tr.id
           ) pausas ON true
           WHERE tr.personal_id = $1 AND tr.fecha BETWEEN $2 AND $3`,
          [p.id, fechaDesde, fechaHasta]
        )
        totales.push({
          'Persona': p.nombre_completo,
          'Iniciales': p.iniciales,
          'Horas brutas': Number(tot.horas_brutas).toFixed(2),
          'Horas pausas': Number(tot.horas_pausas).toFixed(2),
          'Horas netas':  (Number(tot.horas_brutas) - Number(tot.horas_pausas)).toFixed(2),
        })
      }
      const wsTot = XLSX.utils.json_to_sheet(totales)
      XLSX.utils.book_append_sheet(wb, wsTot, 'Totales')

    } else if (tipo === 'proyecto') {
      // Horas por proyecto: filas = (persona, proyecto, estación, total)
      const proyectoId = req.query.proyecto_id ? parseInt(String(req.query.proyecto_id)) : null
      const conds: string[] = ['tp.hora_inicio::date BETWEEN $1 AND $2']
      const vals: unknown[] = [fechaDesde, fechaHasta]
      if (proyectoId) {
        conds.push(`tp.proyecto_id = $${vals.length + 1}`)
        vals.push(proyectoId)
      }
      const { rows } = await pool.query(
        `SELECT
           p.codigo, p.nombre AS proyecto_nombre,
           pt.nombre_completo, pt.iniciales,
           tp.estacion,
           SUM(tp.total_horas) AS horas,
           COUNT(*)            AS segmentos
         FROM time_proyectos tp
         JOIN proyectos       p  ON p.id  = tp.proyecto_id
         JOIN personal_taller pt ON pt.id = tp.personal_id
         WHERE ${conds.join(' AND ')}
         GROUP BY p.id, pt.id, tp.estacion
         ORDER BY p.codigo, pt.nombre_completo, tp.estacion`,
        vals
      )
      const data = rows.map((r) => ({
        'Proyecto': r.codigo,
        'Nombre proyecto': r.proyecto_nombre,
        'Persona': r.nombre_completo,
        'Iniciales': r.iniciales,
        'Estación': r.estacion,
        'Horas': Number(r.horas ?? 0).toFixed(2),
        'Segmentos': r.segmentos,
      }))
      const ws = XLSX.utils.json_to_sheet(data)
      XLSX.utils.book_append_sheet(wb, ws, 'Horas por proyecto')

    } else if (tipo === 'diario') {
      // Diario: filas = (persona, fecha, entrada, salida, horas)
      const { rows } = await pool.query(
        `SELECT
           pt.nombre_completo, pt.iniciales,
           tr.fecha, tr.hora_entrada, tr.hora_salida, tr.total_horas, tr.status,
           COALESCE(SUM(pa.duracion_minutos) / 60, 0) AS horas_pausas
         FROM time_registros tr
         JOIN personal_taller pt ON pt.id = tr.personal_id
         LEFT JOIN time_pausas pa ON pa.registro_id = tr.id
         WHERE tr.fecha BETWEEN $1 AND $2
         GROUP BY tr.id, pt.id
         ORDER BY tr.fecha DESC, pt.nombre_completo`,
        [fechaDesde, fechaHasta]
      )
      const data = rows.map((r) => ({
        'Fecha': r.fecha,
        'Persona': r.nombre_completo,
        'Iniciales': r.iniciales,
        'Entrada': r.hora_entrada ? new Date(r.hora_entrada).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '',
        'Salida':  r.hora_salida  ? new Date(r.hora_salida).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '',
        'Horas brutas': r.total_horas != null ? Number(r.total_horas).toFixed(2) : '',
        'Horas pausas': Number(r.horas_pausas).toFixed(2),
        'Horas netas':  r.total_horas != null
          ? (Number(r.total_horas) - Number(r.horas_pausas)).toFixed(2)
          : '',
        'Status': r.status,
      }))
      const ws = XLSX.utils.json_to_sheet(data)
      XLSX.utils.book_append_sheet(wb, ws, 'Diario')

    } else {
      return next(createError('tipo inválido. Usá personal | proyecto | diario', 400))
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`)
    res.send(buffer)
  } catch (err) { next(err) }
}
