// Barrel del módulo Muestras (estructura modules/<feature>/).
// Sigue el blueprint del workflow estratégico 2026-06-07: cada módulo
// expone su sub-router por default + exports nombrados para domain/helpers
// que otros módulos puedan necesitar.
export { default as muestrasModuleRouter } from './routes'
export {
  getMuestraOCsStatus,
  cerrarProcurementYCrearShopManager,
  onOCRecibidaParaMuestras,
} from './domain/ocsStatus'
export type { MuestraOCsStatus } from './domain/ocsStatus'
