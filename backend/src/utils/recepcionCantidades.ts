// Capa DERIVADA de recepción por cantidades.
//
// Reglas duras del plan:
//   * NO toca estado_cotiz (eso lo sigue manejando utils/materialesEstado.ts leyendo
//     solo ordenes_compra.estado) ni el estado logístico de la OC.
//   * Nada de esto se GUARDA: son funciones puras. Toda lectura de BD vive en los
//     controladores; acá solo entra y sale aritmética.
//   * La granularidad por cantidad convive con el booleano histórico `recibido`
//     mediante el "puente booleano", para que todos los consumidores actuales
//     (dashboard, Kanban, línea de tiempo, Por lote, receivedIds web/móvil) sigan
//     correctos sin tocarse.

export type EstadoRecepcionItem = 'PENDIENTE' | 'PARCIAL' | 'RECIBIDO'

// Redondeo a 3 decimales (la columna es numeric(12,3)). Evita que 0.1+0.2 > 0.3 dé
// "exceso" falso o que un épsilon impida cerrar una OC.
const r3 = (x: number) => Math.round(x * 1000) / 1000

/**
 * El "puente booleano": una entrega deja el material COMPLETO cuando lo acumulado
 * (entregas previas + esta entrega) alcanza o supera lo ordenado.
 *
 * Conserva el significado histórico de recepcion_materiales.recibido:
 * "con esta recepción, el material quedó completo".
 *
 * Solo tiene sentido llamarlo cuando conocemos la cantidad ordenada; si no la
 * conocemos, el controlador cae al booleano explícito que mandó el cliente (legado).
 */
export function puenteRecibido(
  acumuladoPrevio: number,
  cantidadEstaEntrega: number,
  cantidadOrdenada: number
): boolean {
  return r3(acumuladoPrevio + cantidadEstaEntrega) >= r3(cantidadOrdenada)
}

/**
 * Valida que una entrega no haga que lo acumulado supere lo ordenado.
 * Devuelve el acumulado resultante para poder componer el mensaje de error.
 */
export function validarAcumulado(
  acumuladoPrevio: number,
  cantidadEstaEntrega: number,
  cantidadOrdenada: number
): { ok: boolean; acumulado: number } {
  const acumulado = r3(acumuladoPrevio + cantidadEstaEntrega)
  return { ok: acumulado <= r3(cantidadOrdenada), acumulado }
}

/**
 * Estado derivado de un ítem a partir de cantidades (capa de LECTURA, usada desde F3).
 *
 * Legado (cantidadOrdenada == null): no hay cantidades registradas, así que respetamos
 * el booleano histórico. `sin_cantidad = true` deja marcar en la UI que es un dato viejo
 * sin granularidad, no un "recibido completo" medido.
 */
export function estadoItemPorCantidad(
  cantidadOrdenada: number | null,
  acumuladoRecibido: number,
  recibidoLegado: boolean
): { estado: EstadoRecepcionItem; sin_cantidad: boolean } {
  if (cantidadOrdenada == null) {
    return { estado: recibidoLegado ? 'RECIBIDO' : 'PENDIENTE', sin_cantidad: true }
  }
  if (acumuladoRecibido <= 0) return { estado: 'PENDIENTE', sin_cantidad: false }
  if (acumuladoRecibido >= cantidadOrdenada) return { estado: 'RECIBIDO', sin_cantidad: false }
  return { estado: 'PARCIAL', sin_cantidad: false }
}

/**
 * Convierte un valor entrante (del body) a número de cantidad válido, o null si no vino.
 * Acepta number o string numérico; rechaza NaN y negativos devolviendo null
 * (el caller decide si eso es error o "sin cantidad").
 */
export function parseCantidad(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const n = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(n) || n < 0) return null
  return r3(n)
}
