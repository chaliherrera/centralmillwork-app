import { Router } from 'express'
import { requireRole } from '../../middleware/auth'
import {
  resumenHandler, tareasHandler, cargaHandler, cargaDetalleHandler,
  cargaEtapasHandler, etapaDetalleHandler, planHandler,
  crearTareaHandler, actualizarTareaHandler, avanceTareaHandler, borrarTareaHandler,
  agregarDepHandler, borrarDepHandler,
  reservarHandler, reservasPendientesHandler, confirmarReservaHandler, liberarReservaHandler,
} from './controllers/ingenieria.controller'

const router = Router()

// Los RECURSOS de ingeniería los maneja el PM (aprendizaje de Chali):
//  · READ  = ver el plan/carga (incluye ENGINEERING y VIEWER).
//  · PM    = GESTIÓN de recursos = estructura del plan (crear/borrar/asignar/mover/deps).
//  · EXEC  = REPORTAR AVANCE de la propia tarea (estado/comentario) — lo hace Ingeniería.
const READ = requireRole('ADMIN', 'PROJECT_MANAGEMENT', 'ENGINEERING', 'VIEWER')
const PM = requireRole('ADMIN', 'PROJECT_MANAGEMENT')
const EXEC = requireRole('ADMIN', 'PROJECT_MANAGEMENT', 'ENGINEERING')

router.get('/resumen', READ, resumenHandler)
router.get('/tareas', READ, tareasHandler)
router.get('/carga', READ, cargaHandler)
router.get('/carga/detalle', READ, cargaDetalleHandler)
router.get('/carga-etapas', READ, cargaEtapasHandler)
router.get('/carga-etapas/detalle', READ, etapaDetalleHandler)
router.get('/plan', READ, planHandler)
// Estructura del plan = PM (gestión de recursos)
router.post('/tareas', PM, crearTareaHandler)
router.patch('/tareas/:id', PM, actualizarTareaHandler)
router.delete('/tareas/:id', PM, borrarTareaHandler)
router.post('/tareas/:id/dep', PM, agregarDepHandler)
router.delete('/tareas/:id/dep/:depId', PM, borrarDepHandler)
// Ejecución = reportar avance de la tarea (Ingeniería) — solo estado/comentario
router.patch('/tareas/:id/avance', EXEC, avanceTareaHandler)

// Reserva de capacidad (la dispara Estimados/PM)
router.post('/proyecto/:id/reservar', PM, reservarHandler)
router.delete('/proyecto/:id/reserva', PM, liberarReservaHandler)
router.get('/reservas-pendientes', READ, reservasPendientesHandler)
router.post('/reserva/:proyectoId/confirmar', PM, confirmarReservaHandler)

export default router
