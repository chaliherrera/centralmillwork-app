import api from './api'
import type { ApiResponse } from '@/types'

export interface SeleccionProyecto {
  proyecto_id: number
  items: string[]          // [] = todos los ítems de ese proyecto
}

export interface Informe {
  id: number
  nombre: string
  seleccion: SeleccionProyecto[]
  created_by: string | null
  creado_por_nombre: string | null
  created_at: string
  updated_at: string
}

export const informesService = {
  getAll: () => api.get<ApiResponse<Informe[]>>('/informes').then((r) => r.data),
  getById: (id: number) => api.get<ApiResponse<Informe>>(`/informes/${id}`).then((r) => r.data),
  create: (body: { nombre: string; seleccion: SeleccionProyecto[] }) =>
    api.post<ApiResponse<Informe>>('/informes', body).then((r) => r.data),
  update: (id: number, body: { nombre?: string; seleccion?: SeleccionProyecto[] }) =>
    api.put<ApiResponse<Informe>>(`/informes/${id}`, body).then((r) => r.data),
  remove: (id: number) => api.delete(`/informes/${id}`).then((r) => r.data),
}
