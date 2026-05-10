import { Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'

/**
 * GET /api/produccion/estaciones
 * Catálogo de estaciones + status actual: cuántas órdenes tiene cada una en su cola.
 * Usado por el Mapa del Taller en el dashboard de producción.
 */
export async function getEstaciones(_req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query(
      `SELECT
         ec.nombre,
         ec.tipo,
         ec.posicion_x,
         ec.posicion_y,
         ec.capacidad_max,
         ec.activa,
         COUNT(o.id) FILTER (WHERE o.status IN ('Pendiente','En Proceso')) AS ordenes_activas,
         COUNT(o.id) FILTER (WHERE o.status = 'Pausada')                    AS ordenes_pausadas,
         COUNT(o.id) FILTER (WHERE o.prioridad = 'Alta' AND o.status NOT IN ('Completada','Cancelada')) AS ordenes_alta_prioridad,
         COALESCE(
           json_agg(DISTINCT jsonb_build_object(
             'personal_id', pt.id,
             'nombre_completo', pt.nombre_completo,
             'iniciales', pt.iniciales,
             'es_estacion_principal', pe.es_estacion_principal,
             'ordenes_activas', (
               -- Carga individual del operario en ESTA estación.
               -- Cuenta órdenes cuya estación actual es ec.nombre y están asignadas
               -- al operario (Pendiente/En Proceso/Pausada).
               SELECT COUNT(*) FROM ordenes_produccion o2
               WHERE o2.estacion_actual = ec.nombre
                 AND o2.personal_asignado_id = pt.id
                 AND o2.status IN ('Pendiente','En Proceso','Pausada')
             ),
             'ordenes_alta_prioridad', (
               SELECT COUNT(*) FROM ordenes_produccion o3
               WHERE o3.estacion_actual = ec.nombre
                 AND o3.personal_asignado_id = pt.id
                 AND o3.prioridad = 'Alta'
                 AND o3.status NOT IN ('Completada','Cancelada')
             )
           )) FILTER (WHERE pt.id IS NOT NULL),
           '[]'::json
         ) AS personal
       FROM estaciones_config ec
       LEFT JOIN ordenes_produccion o   ON o.estacion_actual = ec.nombre
       LEFT JOIN personal_estaciones pe ON pe.estacion = ec.nombre AND pe.activo = true
       LEFT JOIN personal_taller    pt  ON pt.id = pe.personal_id  AND pt.activo = true
       GROUP BY ec.id
       ORDER BY ec.posicion_y NULLS LAST, ec.posicion_x, ec.nombre`
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
}

/**
 * GET /api/produccion/estaciones/:nombre
 * Detalle de una estación: personal + cola de órdenes.
 */
export async function getEstacion(req: Request, res: Response, next: NextFunction) {
  try {
    const { nombre } = req.params

    const [estQ, ordenesQ, personalQ] = await Promise.all([
      pool.query(`SELECT * FROM estaciones_config WHERE nombre = $1`, [nombre]),
      pool.query(
        `SELECT o.*,
                p.codigo  AS proyecto_codigo,
                p.nombre  AS proyecto_nombre,
                pt.nombre_completo AS personal_asignado_nombre,
                pt.iniciales       AS personal_asignado_iniciales,
                op.fecha_inicio    AS proceso_iniciado
         FROM ordenes_produccion o
         LEFT JOIN proyectos       p  ON p.id  = o.proyecto_id
         LEFT JOIN personal_taller pt ON pt.id = o.personal_asignado_id
         LEFT JOIN orden_procesos  op ON op.orden_id = o.id AND op.estacion = $1
         WHERE o.estacion_actual = $1 AND o.status NOT IN ('Completada','Cancelada')
         ORDER BY
           CASE o.prioridad WHEN 'Alta' THEN 0 WHEN 'Media' THEN 1 ELSE 2 END,
           o.fecha_entrega ASC NULLS LAST,
           o.created_at ASC`,
        [nombre]
      ),
      pool.query(
        `SELECT pt.id, pt.nombre_completo, pt.iniciales, pt.tipo_personal,
                pe.es_estacion_principal, pe.capacidad_max
         FROM personal_estaciones pe
         JOIN personal_taller pt ON pt.id = pe.personal_id
         WHERE pe.estacion = $1 AND pe.activo = true AND pt.activo = true
         ORDER BY pe.es_estacion_principal DESC, pt.nombre_completo`,
        [nombre]
      ),
    ])

    if (!estQ.rows[0]) return next(createError('Estación no encontrada', 404))

    res.json({
      data: {
        ...estQ.rows[0],
        ordenes:  ordenesQ.rows,
        personal: personalQ.rows,
      },
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/produccion/distancias — matriz completa de distancias.
 */
export async function getDistancias(_req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM estaciones_distancias ORDER BY estacion_origen, estacion_destino`
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
}

/**
 * PUT /api/produccion/distancias
 * Body: { entries: [{estacion_origen, estacion_destino, distancia_metros, tiempo_estimado_seg?, es_estimado?}] }
 * Upsert en lote — útil cuando se mide el taller y se quiere actualizar todo de una.
 */
export async function upsertDistancias(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect()
  try {
    const { entries } = req.body
    if (!Array.isArray(entries) || !entries.length) return next(createError('entries requerido', 400))

    await client.query('BEGIN')
    for (const e of entries) {
      if (!e.estacion_origen || !e.estacion_destino || e.distancia_metros == null) continue
      await client.query(
        `INSERT INTO estaciones_distancias
           (estacion_origen, estacion_destino, distancia_metros, tiempo_estimado_seg, es_estimado)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (estacion_origen, estacion_destino) DO UPDATE
           SET distancia_metros    = EXCLUDED.distancia_metros,
               tiempo_estimado_seg = EXCLUDED.tiempo_estimado_seg,
               es_estimado         = EXCLUDED.es_estimado`,
        [e.estacion_origen, e.estacion_destino, e.distancia_metros,
         e.tiempo_estimado_seg ?? null, e.es_estimado ?? false]
      )
    }
    await client.query('COMMIT')
    res.json({ message: 'Distancias actualizadas' })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}
