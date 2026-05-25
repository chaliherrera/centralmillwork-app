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
      `-- ─── CTEs para evitar subconsultas correlacionadas dentro de json_agg(DISTINCT …)
       -- que pueden producir resultados incorrectos en PostgreSQL.
       WITH
       -- Pausas activas (hora_fin IS NULL) por personal — para indicar "en pausa" en el mapa
       pausas_activas AS (
         SELECT DISTINCT ON (personal_id)
           personal_id,
           jsonb_build_object('motivo', motivo, 'hora_inicio', hora_inicio) AS data
         FROM time_pausas
         WHERE hora_fin IS NULL
         ORDER BY personal_id, hora_inicio DESC
       ),
       -- 1. Segmento activo (hora_fin IS NULL) por (personal_id, estacion) — para timer en vivo
       --    Si el operario tiene pausa abierta, incluimos pausa_activa para que el mapa
       --    muestre "⏸ En pausa" en vez del timer corriendo.
       item_activos AS (
         SELECT DISTINCT ON (tp.personal_id, tp.estacion)
           tp.personal_id,
           tp.estacion,
           jsonb_build_object(
             'orden_id',        op.id,
             'numero_orden',    op.numero_orden,
             'item_nombre',     op.item_nombre,
             'hora_inicio',     tp.hora_inicio,
             'proyecto_codigo', pr.codigo,
             'pausa_activa',    pa.data
           ) AS data
         FROM time_proyectos tp
         JOIN  ordenes_produccion op ON op.id = tp.orden_produccion_id
         LEFT JOIN proyectos      pr ON pr.id = op.proyecto_id
         LEFT JOIN pausas_activas pa ON pa.personal_id = tp.personal_id
         WHERE tp.hora_fin IS NULL
         ORDER BY tp.personal_id, tp.estacion, tp.hora_inicio DESC
       ),
       -- 2. Carga (órdenes activas + alta prioridad) por (personal_id, estacion)
       carga AS (
         SELECT
           personal_asignado_id                                                     AS personal_id,
           estacion_actual                                                           AS estacion,
           COUNT(*) FILTER (WHERE status IN ('Pendiente','En Proceso','Pausada'))   AS ordenes_activas,
           COUNT(*) FILTER (WHERE prioridad = 'Alta'
                              AND status NOT IN ('Completada','Cancelada'))          AS ordenes_alta_prioridad
         FROM ordenes_produccion
         WHERE personal_asignado_id IS NOT NULL
         GROUP BY personal_asignado_id, estacion_actual
       ),
       -- 3. Orden "running" por estación (la primera con segmento abierto en esa estación)
       --    Usado por el Blueprint Map para mostrar el item en curso por estación
       --    Si no hay segmento abierto, fallback al primer Pendiente/En Proceso por prioridad+fecha_entrega.
       orden_running AS (
         SELECT DISTINCT ON (estacion_actual)
           o.estacion_actual                                          AS estacion,
           o.numero_orden,
           o.prioridad,
           o.fecha_entrega,
           p.nombre                                                   AS proyecto_nombre,
           p.codigo                                                   AS proyecto_codigo,
           CASE
             WHEN EXISTS (SELECT 1 FROM time_proyectos tp
                          WHERE tp.orden_produccion_id = o.id
                            AND tp.hora_fin IS NULL)            THEN 'running'
             ELSE 'queued'
           END                                                        AS state
         FROM ordenes_produccion o
         LEFT JOIN proyectos p ON p.id = o.proyecto_id
         WHERE o.estacion_actual IS NOT NULL
           AND o.status IN ('Pendiente','En Proceso','Pausada')
         ORDER BY
           o.estacion_actual,
           -- Items con segmento abierto primero
           CASE WHEN EXISTS (SELECT 1 FROM time_proyectos tp
                             WHERE tp.orden_produccion_id = o.id
                               AND tp.hora_fin IS NULL) THEN 0 ELSE 1 END,
           CASE o.prioridad WHEN 'Alta' THEN 0 WHEN 'Media' THEN 1 ELSE 2 END,
           o.fecha_entrega ASC NULLS LAST,
           o.created_at ASC
       )
       SELECT
         ec.nombre,
         ec.tipo,
         ec.posicion_x,
         ec.posicion_y,
         ec.capacidad_max,
         ec.activa,
         -- DISTINCT necesario: el LEFT JOIN personal_estaciones duplica cada orden
         -- por cada operario asignado a la estación. Sin DISTINCT, Final con 2 operarios
         -- contaría cada orden el doble.
         COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('Pendiente','En Proceso'))               AS ordenes_activas,
         COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'Pausada')                                 AS ordenes_pausadas,
         COUNT(DISTINCT o.id) FILTER (WHERE o.prioridad = 'Alta'
                                       AND o.status NOT IN ('Completada','Cancelada'))            AS ordenes_alta_prioridad,
         -- Orden "running" para el Blueprint Map (puede ser null si la estación está vacía)
         CASE WHEN orun.numero_orden IS NOT NULL THEN
           jsonb_build_object(
             'numero_orden',    orun.numero_orden,
             'proyecto_nombre', orun.proyecto_nombre,
             'proyecto_codigo', orun.proyecto_codigo,
             'fecha_entrega',   orun.fecha_entrega,
             'prioridad',       orun.prioridad,
             'state',           orun.state
           )
         END                                                                                      AS orden_running,
         COALESCE(
           json_agg(DISTINCT jsonb_build_object(
             'personal_id',            pt.id,
             'nombre_completo',        pt.nombre_completo,
             'iniciales',              pt.iniciales,
             'es_estacion_principal',  pe.es_estacion_principal,
             'ordenes_activas',        COALESCE(c.ordenes_activas,        0),
             'ordenes_alta_prioridad', COALESCE(c.ordenes_alta_prioridad, 0),
             'item_activo',            ia.data          -- NULL si el operario está idle
           )) FILTER (WHERE pt.id IS NOT NULL),
           '[]'::json
         ) AS personal
       FROM estaciones_config ec
       LEFT JOIN ordenes_produccion o   ON o.estacion_actual = ec.nombre
       LEFT JOIN personal_estaciones pe ON pe.estacion = ec.nombre AND pe.activo = true
       LEFT JOIN personal_taller    pt  ON pt.id = pe.personal_id  AND pt.activo = true
       LEFT JOIN carga              c   ON c.personal_id = pt.id AND c.estacion  = ec.nombre
       LEFT JOIN item_activos       ia  ON ia.personal_id = pt.id AND ia.estacion = ec.nombre
       LEFT JOIN orden_running      orun ON orun.estacion = ec.nombre
       GROUP BY ec.id, orun.numero_orden, orun.proyecto_nombre, orun.proyecto_codigo,
                orun.fecha_entrega, orun.prioridad, orun.state
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
