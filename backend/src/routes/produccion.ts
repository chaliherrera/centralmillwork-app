import { Router, Request, Response, NextFunction } from 'express'
import { requireRole } from '../middleware/auth'
import {
  getOrdenes, getOrden, getOrdenesKpis, getEventosRecientes,
  createOrden, updateOrden,
  asignarOperador, avanzarOrden, pausarOrden, reanudarOrden, cancelarOrden,
} from '../controllers/produccionController'
import {
  getPersonalTaller, getPersonalTallerById, createPersonalTaller, updatePersonalTaller,
  setPersonalPin, clearPersonalPin, setPersonalEstaciones,
} from '../controllers/personalTallerController'
import {
  getEstaciones, getEstacion, getDistancias, upsertDistancias,
} from '../controllers/estacionesController'
import {
  createInspeccion, getInspecciones, uploadDefectoFoto, getQcStats, uploadQcFoto,
} from '../controllers/qcController'
import {
  getDocumentos, createDocumento, deleteDocumento, uploadDocumento,
} from '../controllers/documentosController'
import {
  getPersonalActivo, reportePersonal, reportePorProyecto, reporteDiario,
  exportarHoras,
} from '../controllers/timeTrackingController'
import { calcularRuta } from '../utils/rutaOptimizador'
import { createError } from '../middleware/errorHandler'

const router = Router()

// Roles autorizados para escribir en producción.
// ADMIN = vos. SHOP_MANAGER = supervisor del taller (rol nuevo en migración 015).
const PROD_WRITE = requireRole('ADMIN', 'SHOP_MANAGER')

// ─── Órdenes de producción ────────────────────────────────────────────────────
router.get('/ordenes',                   getOrdenes)
router.get('/ordenes-kpis',              getOrdenesKpis)
router.get('/eventos-recientes',         getEventosRecientes)
router.get('/ordenes/:id',               getOrden)
router.post('/ordenes',                  PROD_WRITE, createOrden)
router.put('/ordenes/:id',               PROD_WRITE, updateOrden)
router.patch('/ordenes/:id/asignar',     PROD_WRITE, asignarOperador)
router.patch('/ordenes/:id/avanzar',     PROD_WRITE, avanzarOrden)
router.patch('/ordenes/:id/pausar',      PROD_WRITE, pausarOrden)
router.patch('/ordenes/:id/reanudar',    PROD_WRITE, reanudarOrden)
router.delete('/ordenes/:id',            PROD_WRITE, cancelarOrden)

// ─── Personal del taller (gestión + PINs) ─────────────────────────────────────
router.get('/personal',                  getPersonalTaller)
router.get('/personal/:id',              getPersonalTallerById)
router.post('/personal',                 PROD_WRITE, createPersonalTaller)
router.put('/personal/:id',              PROD_WRITE, updatePersonalTaller)
router.put('/personal/:id/estaciones',   PROD_WRITE, setPersonalEstaciones)
router.post('/personal/:id/pin',         PROD_WRITE, setPersonalPin)
router.delete('/personal/:id/pin',       PROD_WRITE, clearPersonalPin)

// ─── Estaciones del taller ────────────────────────────────────────────────────
router.get('/estaciones',                getEstaciones)
router.get('/estaciones/:nombre',        getEstacion)
router.get('/distancias',                getDistancias)
router.put('/distancias',                PROD_WRITE, upsertDistancias)

// ─── Ruta preview (cálculo on-demand para vista previa al crear orden) ────────
router.post('/ruta-preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { procesos, asignaciones } = req.body
    if (!Array.isArray(procesos) || !procesos.length) return next(createError('procesos requerido', 400))
    const ruta = await calcularRuta(procesos, asignaciones || {})
    res.json({ data: ruta })
  } catch (err) { next(err) }
})

// ─── Documentos adjuntos por estación (PDFs, hojas de corte, planos) ────────
router.get('/ordenes/:id/documentos',         getDocumentos)
router.post('/ordenes/:id/documentos',        PROD_WRITE, uploadDocumento.single('archivo'), createDocumento)
router.delete('/documentos/:docId',           PROD_WRITE, deleteDocumento)

// ─── Quality Control ──────────────────────────────────────────────────────────
router.get('/qc/inspecciones',                getInspecciones)
router.post('/qc/inspecciones',               PROD_WRITE, createInspeccion)
router.post('/qc/defectos/:id/foto',          PROD_WRITE, uploadQcFoto.single('foto'), uploadDefectoFoto)
router.get('/qc/stats',                       getQcStats)

// ─── Time Tracking — supervisión y reportes ──────────────────────────────────
router.get('/time-tracking/activos',          getPersonalActivo)
router.get('/time-tracking/personal/:id',     reportePersonal)
router.get('/time-tracking/proyecto/:id',     reportePorProyecto)
router.get('/time-tracking/diario',           reporteDiario)
router.get('/time-tracking/exportar',         exportarHoras)

export default router
