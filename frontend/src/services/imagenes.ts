import api from './api'
import type { ApiResponse } from '@/types'

export interface OcImagen {
  id: number
  orden_compra_id: number
  tipo: string
  filename: string
  original_name: string
  created_at: string
}

export const UPLOADS_BASE = 'http://localhost:4000/uploads'

export const imagenesService = {
  getByOrden: (ordenId: number) =>
    api.get<ApiResponse<OcImagen[]>>(`/ordenes-compra/${ordenId}/imagenes`).then((r) => r.data),

  upload: (ordenId: number, file: File) => {
    const form = new FormData()
    form.append('imagen', file)
    return api.post<ApiResponse<OcImagen>>(
      `/ordenes-compra/${ordenId}/imagenes`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ).then((r) => r.data)
  },

  delete: (imagenId: number) =>
    api.delete(`/imagenes/${imagenId}`).then((r) => r.data),
}
