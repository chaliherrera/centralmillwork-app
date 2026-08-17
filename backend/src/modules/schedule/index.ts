// Barrel del módulo Schedule (Life of a Deal). Estructura modules/<feature>/.
// Expone el sub-router por default + el helper de recálculo que otros módulos
// (recepciones, producción, OC) llaman dentro de su transacción para mantener
// el schedule al día ante cada hecho real.
export { default as scheduleModuleRouter } from './routes'
export { default as portalPublicRouter } from './portalRoutes'
export {
  recomputeScheduleForProyecto,
  recomputeScheduleSafe,
  recomputeScheduleForOCSafe,
  recomputeScheduleForOPSafe,
  generarPlan,
} from './domain/recompute'
export { startScheduleCron, recomputeAllActivePlans } from './domain/cron'
