import api from './api'
import type { OrdenCompra, ApiResponse, PaginationParams } from '@/types'

export interface OcKpis {
  total: string
  monto_ordenado: string
  monto_en_taller: string
  pendientes_recepcion: string
  con_retraso: string
}

export interface VendorCotizado {
  vendor: string
  fecha_importacion: string | null
  materiales_count: number
  total: string
}

export interface GenerarOCResult {
  numero: string
  vendor: string
  total: number
  materiales_count: number
}

export interface OrdenCompraPayload {
  proyecto_id: number
  proveedor_id: number
  estado?: string
  fecha_emision?: string
  fecha_entrega_estimada?: string
  fecha_mto?: string
  categoria?: string
  notas?: string
  items?: {
    material_id?: number
    descripcion: string
    unidad: string
    cantidad: number
    precio_unitario: number
  }[]
}

export const ordenesCompraService = {
  getAll: (params?: PaginationParams & {
    estado?: string
    proyecto_id?: number
    proveedor_id?: number
    vendor?: string
    categoria?: string
    estado_display?: string
    fecha_mto?: string
    fecha_mto_desde?: string
    fecha_mto_hasta?: string
  }) =>
    api.get<ApiResponse<OrdenCompra[]>>('/ordenes-compra', { params }).then((r) => r.data),

  getKpis: (params?: { proyecto_id?: number }) =>
    api.get<ApiResponse<OcKpis>>('/ordenes-compra/kpis', { params }).then((r) => r.data),

  getImportDates: (params?: { proyecto_id?: number }) =>
    api.get<ApiResponse<string[]>>('/ordenes-compra/import-dates', { params }).then((r) => r.data),

  getById: (id: number) =>
    api.get<ApiResponse<OrdenCompra>>(`/ordenes-compra/${id}`).then((r) => r.data),

  getMaterialesLote: (id: number) =>
    api.get<ApiResponse<import('@/types').Material[]>>(`/ordenes-compra/${id}/materiales-lote`).then((r) => r.data),

  create: (data: OrdenCompraPayload) =>
    api.post<ApiResponse<OrdenCompra>>('/ordenes-compra', data).then((r) => r.data),

  update: (id: number, data: OrdenCompraPayload) =>
    api.put<ApiResponse<OrdenCompra>>(`/ordenes-compra/${id}`, data).then((r) => r.data),

  updateEstado: (id: number, estado: string) =>
    api.patch<ApiResponse<OrdenCompra>>(`/ordenes-compra/${id}/estado`, { estado }).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/ordenes-compra/${id}`).then((r) => r.data),

  getVendorsCotizados: (proyecto_id: number) =>
    api.get<{ data: VendorCotizado[] }>('/ordenes-compra/vendors-cotizados', { params: { proyecto_id } })
      .then((r) => r.data),

  generar: (data: { proyecto_id: number; vendors: Array<{ vendor: string; fecha_entrega_estimada: string | null }> }) =>
    api.post<{ data: GenerarOCResult[]; message: string }>('/ordenes-compra/generar', data)
      .then((r) => r.data),
}
