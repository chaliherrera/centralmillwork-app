import api from './api'
import type { SolicitudCotizacion, ApiResponse, PaginationParams } from '@/types'

export interface MarcarEnviadaResult {
  vendor: string
  folio: string
  materiales_count: number
}

export const cotizacionesService = {
  // Marca una o varias cotizaciones como enviadas (sin enviar email — el PDF
  // se genera en el frontend y el usuario lo manda manualmente por su cliente
  // de email). Inserta un registro en solicitudes_cotizacion con estado='enviada'.
  marcarEnviadas: (data: { proyecto_id: number; vendors: Array<{ vendor: string }> }) =>
    api.post<{ data: MarcarEnviadaResult[]; message: string }>(
      '/cotizaciones/enviar', data
    ).then((r) => r.data),

  getAll: (params?: PaginationParams & { estado?: string; proyecto_id?: number }) =>
    api.get<ApiResponse<SolicitudCotizacion[]>>('/cotizaciones', { params }).then((r) => r.data),

  getById: (id: number) =>
    api.get<ApiResponse<SolicitudCotizacion>>(`/cotizaciones/${id}`).then((r) => r.data),

  create: (data: { proyecto_id: number; proveedor_id: number; fecha_solicitud?: string; notas?: string }) =>
    api.post<ApiResponse<SolicitudCotizacion>>('/cotizaciones', data).then((r) => r.data),

  update: (id: number, data: Partial<SolicitudCotizacion>) =>
    api.put<ApiResponse<SolicitudCotizacion>>(`/cotizaciones/${id}`, data).then((r) => r.data),

  aprobar: (id: number) =>
    api.patch<ApiResponse<SolicitudCotizacion>>(`/cotizaciones/${id}/aprobar`, {}).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/cotizaciones/${id}`).then((r) => r.data),
}
