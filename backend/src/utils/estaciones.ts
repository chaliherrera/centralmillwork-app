// Orden canónico de las estaciones del taller (fuente ÚNICA).
// Lo usan el optimizador de ruta (rutaOptimizador) y el armado de la OP
// (produccionController). Antes estaba duplicado verbatim en ambos → agregar o
// reordenar una estación en uno y no en el otro los desincronizaba sin error.
export const ORDEN_BASE_SECUENCIA: readonly string[] = [
  'cnc', 'edge_banding', 'assembly', 'lamina', 'pintura', 'final', 'registro', 'shipping',
]
