import { Router } from 'express'
import { requireRole } from '../../middleware/auth'
import { getPlan, generarPlanHandler, recalcularHandler, crearPortalTokenHandler, listPortalTokensHandler, registrarHitoHandler } from './controllers/schedulePlan.controller'
import { uploadSubmittal, uploadSubmittalHandler, listSubmittalsHandler, uploadArchivo, uploadArchivoHitoHandler, listArchivosHitoHandler } from './controllers/submittals.controller'

const router = Router()

const SCHEDULE_READ = requireRole(
  'ADMIN', 'PROJECT_MANAGEMENT', 'PROCUREMENT', 'PRODUCTION',
  'SHOP_MANAGER', 'ENGINEERING', 'CONTABILIDAD', 'VIEWER'
)
const SCHEDULE_WRITE = requireRole('ADMIN', 'PROJECT_MANAGEMENT')
// Registrar un hito = el área dueña. Más amplio que WRITE (el ownership fino se
// formaliza más adelante; por ahora cualquier rol interno con escritura puede).
const SCHEDULE_REGISTRAR = requireRole(
  'ADMIN', 'PROJECT_MANAGEMENT', 'ENGINEERING', 'PROCUREMENT', 'PRODUCTION', 'SHOP_MANAGER', 'CONTABILIDAD'
)

router.get ('/proyecto/:id',            SCHEDULE_READ,  getPlan)
router.post('/proyecto/:id/generar',    SCHEDULE_WRITE, generarPlanHandler)
router.post('/proyecto/:id/recalcular', SCHEDULE_WRITE, recalcularHandler)
router.post('/proyecto/:id/portal-token',  SCHEDULE_WRITE, crearPortalTokenHandler)
router.get ('/proyecto/:id/portal-tokens', SCHEDULE_READ,  listPortalTokensHandler)
router.post('/proyecto/:id/hito/:codigo/registrar', SCHEDULE_REGISTRAR, registrarHitoHandler)

const SCHEDULE_ENGINEERING = requireRole('ADMIN', 'PROJECT_MANAGEMENT', 'ENGINEERING')
router.get ('/proyecto/:id/submittals', SCHEDULE_READ, listSubmittalsHandler)
router.post('/proyecto/:id/submittals', SCHEDULE_ENGINEERING, uploadSubmittal.single('planos'), uploadSubmittalHandler)
router.get ('/proyecto/:id/hito/:codigo/archivos', SCHEDULE_READ, listArchivosHitoHandler)
router.post('/proyecto/:id/hito/:codigo/archivo', SCHEDULE_REGISTRAR, uploadArchivo.single('archivo'), uploadArchivoHitoHandler)

export default router
