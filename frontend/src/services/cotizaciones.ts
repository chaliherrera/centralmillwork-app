import api from './api'

export interface MarcarEnviadaResult {
  vendor: string
  folio: string
  materiales_count: number
}

export const cotizacionesService = {
  // Marca una o varias cotizaciones como enviadas (sin enviar email — el PDF
  // se genera en el frontend y el usuario lo manda manualmente por su cliente
  // de email). Inserta un registro en solicitudes_cotizacion con estado='enviada'.
  // material_ids opcional: si viene, el backend restringe la cotización SOLO
  // a esos materiales (no a TODOS los PENDIENTES del proyecto+vendor). Esto
  // permite cerrarse a un lote o subset específico — sin esto los materiales
  // huérfanos viejos PENDIENTES se mezclaban en el registro.
  marcarEnviadas: (data: {
    proyecto_id: number
    vendors: Array<{ vendor: string; material_ids?: number[] }>
  }) =>
    api.post<{ data: MarcarEnviadaResult[]; message: string }>(
      '/cotizaciones/enviar', data
    ).then((r) => r.data),
}
