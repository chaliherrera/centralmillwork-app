import api from './api'
import type { SolicitudCotizacion, ApiResponse, PaginationParams } from '@/types'

export interface EnviarResult {
  vendor: string
  folio: string
  preview_url: string | null
  materiales_count: number
}

export const cotizacionesService = {
  getVendorEmails: (proyecto_id: number) =>
    api.get<{ data: Array<{ vendor: string; email: string | null }> }>(
      '/cotizaciones/vendor-emails', { params: { proyecto_id } }
    ).then((r) => r.data),

  enviar: (data: { proyecto_id: number; vendors: Array<{ vendor: string; email_to: string }> }) =>
    api.post<{ data: EnviarResult[]; message: string }>('/cotizaciones/enviar', data, { timeout: 120_000 }).then((r) => r.data),

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
