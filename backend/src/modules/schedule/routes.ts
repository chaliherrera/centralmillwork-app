import { Router } from 'express'
import { requireRole } from '../../middleware/auth'
import { getPlan, generarPlanHandler, recalcularHandler, crearPortalTokenHandler, listPortalTokensHandler } from './controllers/schedulePlan.controller'

const router = Router()

const SCHEDULE_READ = requireRole(
  'ADMIN', 'PROJECT_MANAGEMENT', 'PROCUREMENT', 'PRODUCTION',
  'SHOP_MANAGER', 'ENGINEERING', 'CONTABILIDAD', 'VIEWER'
)
const SCHEDULE_WRITE = requireRole('ADMIN', 'PROJECT_MANAGEMENT')

router.get ('/proyecto/:id',            SCHEDULE_READ,  getPlan)
router.post('/proyecto/:id/generar',    SCHEDULE_WRITE, generarPlanHandler)
router.post('/proyecto/:id/recalcular', SCHEDULE_WRITE, recalcularHandler)
router.post('/proyecto/:id/portal-token',  SCHEDULE_WRITE, crearPortalTokenHandler)
router.get ('/proyecto/:id/portal-tokens', SCHEDULE_READ,  listPortalTokensHandler)

export default router
