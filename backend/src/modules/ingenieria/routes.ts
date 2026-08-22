import { Router } from 'express'
import { requireRole } from '../../middleware/auth'
import {
  resumenHandler, tareasHandler, cargaHandler,
  crearTareaHandler, actualizarTareaHandler, borrarTareaHandler,
} from './controllers/ingenieria.controller'

const router = Router()

const READ = requireRole('ADMIN', 'PROJECT_MANAGEMENT', 'ENGINEERING', 'VIEWER')
const WRITE = requireRole('ADMIN', 'PROJECT_MANAGEMENT', 'ENGINEERING')

router.get('/resumen', READ, resumenHandler)
router.get('/tareas', READ, tareasHandler)
router.get('/carga', READ, cargaHandler)
router.post('/tareas', WRITE, crearTareaHandler)
router.patch('/tareas/:id', WRITE, actualizarTareaHandler)
router.delete('/tareas/:id', WRITE, borrarTareaHandler)

export default router
