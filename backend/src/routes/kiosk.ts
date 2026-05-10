import { Router } from 'express'
import { authenticateKiosk } from '../middleware/kioskAuth'
import { kioskLoginLimiter } from '../middleware/rateLimit'
import { kioskLogin, kioskMe } from '../controllers/kioskAuthController'
import {
  clockIn, clockOut,
  iniciarProyecto, finalizarProyecto,
  iniciarPausa, finalizarPausa,
  diaActual, proyectosDisponibles,
} from '../controllers/timeTrackingController'
import { avanzarOrdenInterno } from '../controllers/produccionController'
import pool from '../db/pool'
import { createError } from '../middleware/errorHandler'

const router = Router()

// ─── Públicas ─────────────────────────────────────────────────────────────────
// POST /api/kiosk/login — PIN → JWT de kiosko (con rate limit anti-brute-force)
router.post('/login', kioskLoginLimiter, kioskLogin)

// ─── A partir de acá: requiere JWT de kiosko ─────────────────────────────────
router.use(authenticateKiosk)

router.get('/me',                         kioskMe)
router.get('/proyectos-disponibles',      proyectosDisponibles)

// Clock-in / clock-out
router.post('/time-tracking/clock-in',         clockIn)
router.post('/time-tracking/clock-out',        clockOut)

// Asignación de tiempo a proyectos
router.post('/time-tracking/proyecto/iniciar',    iniciarProyecto)
router.post('/time-tracking/proyecto/finalizar',  finalizarProyecto)

// Pausas
router.post('/time-tracking/pausa/iniciar',       iniciarPausa)
router.post('/time-tracking/pausa/finalizar',     finalizarPausa)

// Resumen del día del operario logueado
router.get('/time-tracking/dia',          diaActual)

// ─── Acción del operario sobre una orden de producción ───────────────────────
// El operario marca "terminé mi proceso" desde la tablet → la orden avanza.
router.post('/ordenes/:id/completar-proceso', async (req, res, next) => {
  try {
    const ordenId = parseInt(req.params.id)
    if (Number.isNaN(ordenId)) return next(createError('id inválido', 400))

    // Validar que el operario está asignado a la estación actual de la orden
    // (defensa básica — el SHOP_MANAGER tiene su propio endpoint sin esta restricción)
    const personalId = req.kioskUser!.personal_id
    const { rows: [orden] } = await pool.query(
      `SELECT estacion_actual FROM ordenes_produccion WHERE id = $1`,
      [ordenId]
    )
    if (!orden) return next(createError('Orden no encontrada', 404))

    const { rows: [proceso] } = await pool.query(
      `SELECT operador_id FROM orden_procesos
       WHERE orden_id = $1 AND estacion = $2`,
      [ordenId, orden.estacion_actual]
    )
    if (proceso?.operador_id && proceso.operador_id !== personalId) {
      return next(createError('No estás asignado al proceso actual de esta orden', 403))
    }

    const result = await avanzarOrdenInterno({
      ordenId,
      reqKioskPersonalId: personalId,
      dispositivo: req.kioskUser!.dispositivo ?? null,
      notas: req.body?.notas ?? null,
    })
    res.json({ data: result, message: result.siguiente_estacion ? 'Proceso completado, orden avanzó' : 'Orden completada' })
  } catch (err) { next(err) }
})

// ─── Cola de trabajo del operario logueado ───────────────────────────────────
// GET /api/kiosk/mi-cola — órdenes asignadas a este operario en cualquier estación
router.get('/mi-cola', async (req, res, next) => {
  try {
    const personalId = req.kioskUser!.personal_id
    const { rows } = await pool.query(
      `SELECT
         o.id, o.numero_orden, o.item_nombre, o.cantidad, o.unidad,
         o.prioridad, o.fecha_entrega, o.estacion_actual, o.status,
         p.codigo AS proyecto_codigo, p.nombre AS proyecto_nombre,
         op.estacion       AS mi_estacion,
         op.completado     AS mi_proceso_completado,
         op.fecha_inicio   AS mi_proceso_inicio,
         (op.estacion = o.estacion_actual) AS es_estacion_activa
       FROM orden_procesos op
       JOIN ordenes_produccion o ON o.id = op.orden_id
       LEFT JOIN proyectos p ON p.id = o.proyecto_id
       WHERE op.operador_id = $1
         AND o.status IN ('Pendiente','En Proceso','Pausada')
         AND op.completado = false
       ORDER BY
         (op.estacion = o.estacion_actual) DESC,
         CASE o.prioridad WHEN 'Alta' THEN 0 WHEN 'Media' THEN 1 ELSE 2 END,
         o.fecha_entrega ASC NULLS LAST`,
      [personalId]
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
})

export default router
