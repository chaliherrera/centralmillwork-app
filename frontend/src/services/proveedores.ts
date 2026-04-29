import api from './api'
import type { Proveedor, ApiResponse, PaginationParams } from '@/types'

export const proveedoresService = {
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<Proveedor[]>>('/proveedores', { params }).then((r) => r.data),

  getById: (id: number) =>
    api.get<ApiResponse<Proveedor>>(`/proveedores/${id}`).then((r) => r.data),

  create: (data: Omit<Proveedor, 'id' | 'activo' | 'created_at' | 'updated_at'>) =>
    api.post<ApiResponse<Proveedor>>('/proveedores', data).then((r) => r.data),

  update: (id: number, data: Partial<Proveedor>) =>
    api.put<ApiResponse<Proveedor>>(`/proveedores/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/proveedores/${id}`).then((r) => r.data),
}
