import api from './api'
import type { Proyecto, ApiResponse, PaginationParams } from '@/types'

// ─── Tipos del endpoint /items-readiness (portado desde main) ───────────────
export type EstadoItemReadiness = 'LISTO' | 'PARCIAL' | 'ORDENADO' | 'PENDIENTE'

export interface ItemReadinessMaterial {
  id: number
  codigo: string
  descripcion: string
  vendor: string | null
  qty: string
  unit_price: string
  estado_cotiz: 'PENDIENTE' | 'COTIZADO' | 'ORDENADO' | 'RECIBIDO' | 'EN_STOCK'
  oc_id: number | null
  oc_numero: string | null
}

export interface ItemReadiness {
  item: string
  total: number
  recibidos: number
  ordenados: number
  pendientes: number
  en_stock: number
  disponibles: number  // recibidos + en_stock
  estado: EstadoItemReadiness
  materiales: ItemReadinessMaterial[]
}

export interface ProyectoItemsReadiness {
  items: ItemReadiness[]
  resumen: {
    total_items: number
    listos: number
    parciales: number
    ordenados: number
    pendientes: number
  }
}

export const proyectosService = {
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<Proyecto[]>>('/proyectos', { params }).then((r) => r.data),

  getById: (id: number) =>
    api.get<ApiResponse<Proyecto>>(`/proyectos/${id}`).then((r) => r.data),

  create: (data: Omit<Proyecto, 'id' | 'created_at' | 'updated_at'>) =>
    api.post<ApiResponse<Proyecto>>('/proyectos', data).then((r) => r.data),

  update: (id: number, data: Partial<Proyecto>) =>
    api.put<ApiResponse<Proyecto>>(`/proyectos/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/proyectos/${id}`).then((r) => r.data),

  getItemsReadiness: (id: number) =>
    api.get<ApiResponse<ProyectoItemsReadiness>>(`/proyectos/${id}/items-readiness`).then((r) => r.data),
}
