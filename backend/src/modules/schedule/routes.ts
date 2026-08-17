import { Router } from 'express'
import { requireRole } from '../../middleware/auth'
import { getPlan, generarPlanHandler, recalcularHandler, crearPortalTokenHandler, listPortalTokensHandler, registrarHitoHandler } from './controllers/schedulePlan.controller'
import { uploadSubmittal, uploadSubmittalHandler, listSubmittalsHandler, uploadArchivo, uploadArchivoHitoHandler, listArchivosHitoHandler } from './controllers/submittals.controller'
import { uploadFoto, installQueueHandler, listItemsHandler, marcarItemHandler, desmarcarItemHandler, listPunchHandler, crearPunchHandler, resolverPunchHandler, signoffHandler } from './controllers/field.controller'

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

// Field / Install — punch list + sign-off en obra (desde el móvil).
// El check-in (I-04) y el avance (I-05) reusan el endpoint de archivo de arriba.
const SCHEDULE_FIELD = requireRole('ADMIN', 'PROJECT_MANAGEMENT', 'PRODUCTION', 'SHOP_MANAGER')
router.get ('/install-queue',             SCHEDULE_READ,  installQueueHandler)
router.get ('/proyecto/:id/items',        SCHEDULE_READ,  listItemsHandler)
router.post('/proyecto/:id/items/:opId/instalar',  SCHEDULE_FIELD, uploadFoto.single('foto'), marcarItemHandler)
router.post('/proyecto/:id/items/:opId/desmarcar', SCHEDULE_FIELD, desmarcarItemHandler)
router.get ('/proyecto/:id/punch',        SCHEDULE_READ,  listPunchHandler)
router.post('/proyecto/:id/punch',        SCHEDULE_FIELD, uploadFoto.single('foto'), crearPunchHandler)
router.post('/punch/:itemId/resolver',    SCHEDULE_FIELD, uploadFoto.single('foto'), resolverPunchHandler)
router.post('/proyecto/:id/signoff',      SCHEDULE_FIELD, uploadFoto.single('firma'), signoffHandler)

export default router
