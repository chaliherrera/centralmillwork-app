// ─────────────────────────────────────────────────────────────────────────────
// Sub-router del módulo Muestras — Fase 2 endpoints
// ─────────────────────────────────────────────────────────────────────────────
// Solo agrega los endpoints NUEVOS de la fase 2 al router de muestras.
// Los CRUD existentes siguen en routes/index.ts apuntando a muestrasController
// (legacy). Cuando se migre el resto a este módulo, este sub-router crece.
//
// Permisos:
//   - GET ocs-status: cualquiera con acceso a la muestra
//   - POST sin-compras: solo PROCUREMENT + ADMIN (es decisión de procurement)
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express'
import { requireRole } from '../../middleware/auth'
import { getOCsStatus, marcarSinCompras } from './controllers/muestrasOCs.controller'
import { getProcesosDefault, iniciarFabricacionHandler } from './controllers/muestrasFabricacion.controller'

const router = Router()

// Lectura: el mismo set de roles que ve detalle de muestra
const MUESTRAS_READ_F2 = requireRole('ADMIN', 'ENGINEERING', 'SHOP_MANAGER', 'PROCUREMENT')

// Escritura sobre OCs status: PROCUREMENT + ADMIN (es decisión de compras)
const MUESTRAS_OCS_WRITE = requireRole('ADMIN', 'PROCUREMENT')

// Iniciar fabricación: ADMIN + SHOP_MANAGER (decisión productiva). PROCUREMENT
// no fabrica.
const MUESTRAS_FABRICACION = requireRole('ADMIN', 'SHOP_MANAGER')

router.get ('/:id/ocs-status',           MUESTRAS_READ_F2,      getOCsStatus)
router.post('/:id/sin-compras',          MUESTRAS_OCS_WRITE,    marcarSinCompras)
router.get ('/:id/procesos-default',     MUESTRAS_READ_F2,      getProcesosDefault)
router.post('/:id/iniciar-fabricacion',  MUESTRAS_FABRICACION,  iniciarFabricacionHandler)

export default router
