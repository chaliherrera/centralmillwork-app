import { Router } from 'express'
import { getInformePublico } from '../controllers/informesController'

// Router PÚBLICO (sin autenticación) para el informe compartido por token.
// Se monta ANTES del middleware authenticate (como el portal del cliente).
const router = Router()

router.get('/informe/:token', getInformePublico)

export default router
