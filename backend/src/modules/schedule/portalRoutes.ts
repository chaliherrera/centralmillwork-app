// Router PÚBLICO del portal de cliente (sin JWT — autoriza el token de la URL).
// Se monta en index.ts ANTES del authenticate global, igual que kiosk/webhooks.
import { Router } from 'express'
import { portalVista, portalAprobar } from './controllers/portal.controller'

const router = Router()

router.get('/:token', portalVista)
router.post('/:token/aprobar', portalAprobar)

export default router
