// Barrel del módulo Estimados (motor de costeo). Estructura modules/<feature>/.
//
// Reemplaza el Excel de estimados: el catálogo deja de viajar dentro de cada
// proyecto y el estimado pasa a ser data. El motor es una función pura —
// `calcularEstimado`— así que se puede probar sin base.
export { default as estimadosModuleRouter } from './routes'
export {
  calcularEstimado,
  diasInstalacionSugeridos,
  type ResultadoEstimado,
  type RecetaCosteo,
  type ComponenteCosteo,
  type ParametrosEstimado,
} from './domain/costeo'
export { calcularEstimadoDesdeDB, congelarEstimado } from './domain/repo'
export { getPropuesta, tamanosSugeridos, etiquetasRenglones } from './domain/estimados'
export { evaluarCantidad, parsearCantidad, ExpresionInvalida } from './domain/cantidad'
