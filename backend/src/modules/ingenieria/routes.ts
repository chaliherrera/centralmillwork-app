import { Router } from 'express'
import { requireRole } from '../../middleware/auth'
import {
  resumenHandler, tareasHandler, cargaHandler, planHandler,
  crearTareaHandler, actualizarTareaHandler, borrarTareaHandler,
  reservarHandler, reservasPendientesHandler, confirmarReservaHandler, liberarReservaHandler,
} from './controllers/ingenieria.controller'

const router = Router()

const READ = requireRole('ADMIN', 'PROJECT_MANAGEMENT', 'ENGINEERING', 'VIEWER')
const WRITE = requireRole('ADMIN', 'PROJECT_MANAGEMENT', 'ENGINEERING')
// Confirmar la reserva = decisión del PM (asigna el ingeniero).
const PM = requireRole('ADMIN', 'PROJECT_MANAGEMENT')

router.get('/resumen', READ, resumenHandler)
router.get('/tareas', READ, tareasHandler)
router.get('/carga', READ, cargaHandler)
router.get('/plan', READ, planHandler)
router.post('/tareas', WRITE, crearTareaHandler)
router.patch('/tareas/:id', WRITE, actualizarTareaHandler)
router.delete('/tareas/:id', WRITE, borrarTareaHandler)

// Reserva de capacidad
router.post('/proyecto/:id/reservar', WRITE, reservarHandler)
router.delete('/proyecto/:id/reserva', WRITE, liberarReservaHandler)
router.get('/reservas-pendientes', READ, reservasPendientesHandler)
router.post('/reserva/:proyectoId/confirmar', PM, confirmarReservaHandler)

export default router
