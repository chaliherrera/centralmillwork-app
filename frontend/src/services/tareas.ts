import api from './api'
import type { Tarea, TareasStats, TareasFilters, ApiResponse } from '@/types'

export const tareasService = {
  getAll: (filters?: TareasFilters) => {
    const params: Record<string, string> = {}
    if (filters?.area) params.area = filters.area
    if (filters?.priority) params.priority = filters.priority
    if (filters?.estado?.length) params.estado = filters.estado.join(',')
    if (filters?.search) params.search = filters.search
    if (filters?.project_code) params.project_code = filters.project_code
    return api.get<ApiResponse<Tarea[]>>('/tareas', { params }).then((r) => r.data)
  },

  getById: (id: number) =>
    api.get<ApiResponse<Tarea>>(`/tareas/${id}`).then((r) => r.data),

  update: (id: number, data: Partial<Pick<Tarea, 'area' | 'title' | 'description' | 'priority' | 'estado' | 'asignado_a'>>) =>
    api.patch<ApiResponse<Tarea>>(`/tareas/${id}`, data).then((r) => r.data),

  getStats: () =>
    api.get<ApiResponse<TareasStats>>('/tareas/stats').then((r) => r.data),
}
