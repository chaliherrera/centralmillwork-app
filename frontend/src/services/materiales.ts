import api from './api'
import type { Material, ApiResponse, PaginationParams } from '@/types'

export interface MtoKpis {
  total: string
  cotizados: string
  pendientes: string
  total_usd: string
  cotizado_usd: string
  vendors: string
  mill_made_count: string
  proyectos_activos: string
}

export interface MaterialOcInfo {
  oc_id: number | null
  oc_numero: string | null
  oc_status: 'ORDENADO' | 'EN EL TALLER' | null
  fecha: string | null
  oc_notas: string | null
  material_notas: string | null
  vendor: string | null
}

export interface MaterialPayload {
  proyecto_id: number | null
  item?: string
  codigo?: string
  vendor_code?: string
  vendor?: string
  descripcion: string
  color?: string
  categoria?: string
  unidad: string
  size?: string
  qty: number
  unit_price: number
  total_price: number
  estado_cotiz: 'COTIZADO' | 'PENDIENTE' | 'EN_STOCK'
  mill_made?: 'SI' | 'NO'
  cotizar?: 'SI' | 'NO' | 'EN_STOCK'
  manufacturer?: string
  notas?: string | null
  fecha_importacion?: string | null
}

export const materialesService = {
  getAll: (params?: PaginationParams & { proyecto_id?: number; vendor?: string; estado_cotiz?: string; cotizar?: 'SI' | 'NO' | 'EN_STOCK'; categoria?: string; fecha_importacion?: string }) =>
    api.get<ApiResponse<Material[]>>('/materiales', { params }).then((r) => r.data),

  getImportDates: (proyecto_id: number) =>
    api.get<ApiResponse<string[]>>('/materiales/import-dates', { params: { proyecto_id } }).then((r) => r.data),

  getKpis: (proyecto_id: number) =>
    api.get<ApiResponse<MtoKpis>>('/materiales/kpis', { params: { proyecto_id } }).then((r) => r.data),

  getById: (id: number) =>
    api.get<ApiResponse<Material>>(`/materiales/${id}`).then((r) => r.data),

  getOcInfo: (id: number) =>
    api.get<ApiResponse<MaterialOcInfo>>(`/materiales/${id}/oc-info`).then((r) => r.data),

  create: (data: MaterialPayload) =>
    api.post<ApiResponse<Material>>('/materiales', data).then((r) => r.data),

  update: (id: number, data: Partial<MaterialPayload>) =>
    api.put<ApiResponse<Material>>(`/materiales/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/materiales/${id}`).then((r) => r.data),

  getPreciosFreight: (proyecto_id: number, vendor: string) =>
    api.get<ApiResponse<{ freight: number }>>('/materiales/freight', { params: { proyecto_id, vendor } }).then((r) => r.data),

  updatePreciosLote: (data: {
    proyecto_id: number
    vendor: string
    freight: number
    items: { id: number; unit_price: number }[]
  }) => api.patch<ApiResponse<null>>('/materiales/precios-lote', data).then((r) => r.data),

  importar: (proyectoId: number, modo: 'agregar' | 'reemplazar', archivo: File) => {
    const form = new FormData()
    form.append('proyecto_id', String(proyectoId))
    form.append('modo', modo)
    form.append('archivo', archivo)
    return api.post<ApiResponse<{ importados: number; omitidos: number; fecha_importacion: string }>>(
      '/materiales/importar', form, { headers: { 'Content-Type': 'multipart/form-data' } }
    ).then((r) => r.data)
  },
}
