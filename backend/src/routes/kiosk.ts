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
import { avanzarOrdenInterno, iniciarItemKiosk } from '../controllers/produccionController'
import { getDocumentosKiosk } from '../controllers/documentosController'
import {
  uploadAvanceFoto, uploadAvanceFotoKiosk, listAvanceFotosKiosk,
  tieneAvanceFotoSiRequerida,
} from '../controllers/avancesFotosController'
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
// El operario hace click "Iniciar item" / "Continuar item" en su Asignación.
// Abre un segmento de time_proyectos linkeado a la orden + estación + persona.
router.post('/ordenes/:id/iniciar-item', iniciarItemKiosk)

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

    // Fix #4: priorizar el proceso DE ESTE OPERARIO en esta estación.
    // Si no es de él pero está libre (operador_id IS NULL), igual lo aceptamos.
    // Si está asignado a OTRO operario, 403.
    //
    // El ORDER BY garantiza que cuando hay múltiples filas para la misma
    // (orden, estacion) preferimos: 1) la del propio operario, 2) las
    // libres (NULL), 3) cualquier otra (que después rechazaremos).
    const { rows: [proceso] } = await pool.query(
      `SELECT id, operador_id FROM orden_procesos
       WHERE orden_id = $1 AND estacion = $2
       ORDER BY
         CASE WHEN operador_id = $3 THEN 0
              WHEN operador_id IS NULL THEN 1
              ELSE 2 END,
         id
       LIMIT 1`,
      [ordenId, orden.estacion_actual, personalId]
    )
    if (proceso?.operador_id && proceso.operador_id !== personalId) {
      return next(createError('No estás asignado al proceso actual de esta orden', 403))
    }

    // Validar foto de avance (defensa en profundidad — el frontend ya intercala
    // el modal antes de llamar a este endpoint, pero por las dudas validamos).
    // Nota: avanzarOrdenInterno también valida (Fix #10) — el check acá es
    // redundante a propósito para devolver el 422 con la razon específica
    // antes de tomar el lock de la orden.
    const check = await tieneAvanceFotoSiRequerida(
      ordenId,
      orden.estacion_actual,
      proceso?.id ?? null
    )
    if (!check.ok) {
      return next(createError(check.razon || 'Foto de avance requerida', 422))
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

// ─── Fotos de avance del kiosko ──────────────────────────────────────────────
// POST: el operario sube una foto antes de completar el proceso (o en cualquier
// momento mientras trabaja). Si la estación tiene foto_obligatoria=true, el
// frontend abre este modal automáticamente al click "Completar proceso".
router.post('/ordenes/:id/avance-foto',
  uploadAvanceFoto.single('archivo'),
  uploadAvanceFotoKiosk
)
router.get('/ordenes/:id/avance-fotos', listAvanceFotosKiosk)

// Endpoint utilitario para que el frontend kiosko sepa si una estación
// requiere foto antes de abrir el flujo "completar proceso".
router.get('/estaciones-config', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT nombre, foto_obligatoria, fotos_minimas FROM estaciones_config WHERE activa = true`
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
})

// ─── Cola de trabajo del operario logueado ───────────────────────────────────
// GET /api/kiosk/mi-cola — órdenes asignadas a este operario en cualquier estación
// ─── Documentos de la orden (filtrados a la estación del operario) ──────────
router.get('/ordenes/:id/documentos', getDocumentosKiosk)

router.get('/mi-cola', async (req, res, next) => {
  try {
    const personalId = req.kioskUser!.personal_id
    const { rows } = await pool.query(
      `SELECT
         o.id, o.numero_orden, o.numero_item, o.cantidad, o.unidad,
         o.prioridad, o.fecha_entrega, o.estacion_actual, o.status,
         p.codigo AS proyecto_codigo, p.nombre AS proyecto_nombre,
         op.estacion       AS mi_estacion,
         op.completado     AS mi_proceso_completado,
         op.fecha_inicio   AS mi_proceso_inicio,
         (op.estacion = o.estacion_actual) AS es_estacion_activa,
         -- Estado del proceso desde el punto de vista del operario:
         --   'no_iniciado' = nunca se hizo "Iniciar item" (fecha_inicio NULL)
         --   'en_curso'    = hay un segmento abierto de time_proyectos AHORA
         --   'pausado'     = se inició antes pero no hay segmento abierto
         -- (ej: se cerró por clock-out o por cambio a otro item)
         CASE
           WHEN op.fecha_inicio IS NULL THEN 'no_iniciado'
           WHEN EXISTS (
             SELECT 1 FROM time_proyectos tp
             WHERE tp.personal_id = $1
               AND tp.orden_produccion_id = o.id
               AND tp.estacion = op.estacion
               AND tp.hora_fin IS NULL
           ) THEN 'en_curso'
           ELSE 'pausado'
         END AS proceso_estado,
         -- Minutos ya trabajados en este proceso (sum de segmentos cerrados).
         -- Permite mostrar "Continuar · 2h ayer" en el frontend.
         COALESCE((
           SELECT ROUND(SUM(EXTRACT(EPOCH FROM (tp.hora_fin - tp.hora_inicio)) / 60))::int
           FROM time_proyectos tp
           WHERE tp.personal_id = $1
             AND tp.orden_produccion_id = o.id
             AND tp.estacion = op.estacion
             AND tp.hora_fin IS NOT NULL
         ), 0) AS minutos_previos,
         -- Docs disponibles para esta orden+estación del operario, sumando
         -- los docs generales de la orden (estacion IS NULL). Si > 0, el
         -- frontend muestra el botón "Ver planos".
         (SELECT COUNT(*) FROM orden_documentos d
          WHERE d.orden_id = o.id
            AND (d.estacion = op.estacion OR d.estacion IS NULL)
         )::int AS docs_count
       FROM orden_procesos op
       JOIN ordenes_produccion o ON o.id = op.orden_id
       LEFT JOIN proyectos p ON p.id = o.proyecto_id
       WHERE op.operador_id = $1
         AND o.status IN ('Pendiente','En Proceso','Pausada')
         AND op.completado = false
       ORDER BY
         -- 1. Lo que estoy haciendo AHORA (segmento abierto)
         CASE WHEN EXISTS (
           SELECT 1 FROM time_proyectos tp
           WHERE tp.personal_id = $1
             AND tp.orden_produccion_id = o.id
             AND tp.estacion = op.estacion
             AND tp.hora_fin IS NULL
         ) THEN 0 ELSE 1 END,
         -- 2. Lo que dejé pausado (fecha_inicio NOT NULL, sin segmento abierto)
         CASE WHEN op.fecha_inicio IS NOT NULL THEN 0 ELSE 1 END,
         -- 3. Mi turno actual en la orden
         (op.estacion = o.estacion_actual) DESC,
         -- 4. Por prioridad
         CASE o.prioridad WHEN 'Alta' THEN 0 WHEN 'Media' THEN 1 ELSE 2 END,
         -- 5. Por fecha de entrega
         o.fecha_entrega ASC NULLS LAST`,
      [personalId]
    )
    res.json({ data: rows })
  } catch (err) { next(err) }
})

export default router
