import api from './api'
import type { ApiResponse } from '@/types'
import type { ItemReadiness, InformeNota } from './proyectos'

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
  token: string | null
  compartir_activo: boolean
  created_at: string
  updated_at: string
}

// Respuesta del endpoint PÚBLICO (sin login; sin precios).
export interface InformePublicoProyecto {
  proyecto_id: number
  codigo: string
  nombre: string
  items: ItemReadiness[]
  notas: InformeNota[]
}
export interface InformePublico {
  nombre: string
  proyectos: InformePublicoProyecto[]
}

export const informesService = {
  getAll: () => api.get<ApiResponse<Informe[]>>('/informes').then((r) => r.data),
  getById: (id: number) => api.get<ApiResponse<Informe>>(`/informes/${id}`).then((r) => r.data),
  create: (body: { nombre: string; seleccion: SeleccionProyecto[] }) =>
    api.post<ApiResponse<Informe>>('/informes', body).then((r) => r.data),
  update: (id: number, body: { nombre?: string; seleccion?: SeleccionProyecto[] }) =>
    api.put<ApiResponse<Informe>>(`/informes/${id}`, body).then((r) => r.data),
  remove: (id: number) => api.delete(`/informes/${id}`).then((r) => r.data),

  // Compartir: enciende/apaga el link público; genera token (o lo regenera).
  setCompartir: (id: number, body: { activo: boolean; regenerar?: boolean }) =>
    api.put<{ data: { token: string | null; compartir_activo: boolean } }>(`/informes/${id}/compartir`, body).then((r) => r.data),

  // Público (sin login).
  publico: (token: string) =>
    api.get<ApiResponse<InformePublico>>(`/public/informe/${token}`).then((r) => r.data),
}
