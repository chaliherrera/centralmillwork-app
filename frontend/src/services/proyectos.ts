import api from './api'
import type { Proyecto, ApiResponse, PaginationParams } from '@/types'

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
}
