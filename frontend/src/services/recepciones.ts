import api from './api'
import type { Recepcion, ApiResponse, PaginationParams } from '@/types'

export interface RecepcionMaterial {
  id: number
  id_material: number | null
  cm_code: string | null
  descripcion: string | null
  recibido: boolean
  nota: string | null
  // Recepción por cantidades (NULL = fila legada, se lee por `recibido`)
  cantidad_recibida?: number | string | null
  cantidad_ordenada?: number | string | null
}

export interface RecepcionConMateriales extends Recepcion {
  materiales: RecepcionMaterial[]
}

export interface RecepcionPayload {
  orden_compra_id: number
  fecha_recepcion: string
  recibio: string
  notas?: string
  items: {
    item_orden_id: number
    cantidad_ordenada: number
    cantidad_recibida: number
    observaciones?: string
  }[]
}

export interface RecepcionCompletaPayload {
  orden_compra_id: number
  fecha_recepcion: string
  tipo: 'total' | 'parcial'
  recibio?: string
  notas?: string
  materiales: {
    id_material?: number
    cm_code?: string
    descripcion?: string
    recibido: boolean
    nota?: string
    // Recepción por cantidades (opcional; si no viene, el backend se comporta como siempre)
    cantidad_recibida?: number
    cantidad_ordenada?: number
  }[]
}

export interface RecepcionCompletaResponse {
  data: Recepcion
  message?: string
  advertencias?: string[]
}

export const recepcionesService = {
  getAll: (params?: PaginationParams & { estado?: string }) =>
    api.get<ApiResponse<Recepcion[]>>('/recepciones', { params }).then((r) => r.data),

  getById: (id: number) =>
    api.get<ApiResponse<Recepcion>>(`/recepciones/${id}`).then((r) => r.data),

  create: (data: RecepcionPayload) =>
    api.post<ApiResponse<Recepcion>>('/recepciones', data).then((r) => r.data),

  createCompleta: (data: RecepcionCompletaPayload) =>
    api.post<RecepcionCompletaResponse>('/recepciones/completa', data).then((r) => r.data),

  update: (id: number, data: Partial<Pick<Recepcion, 'estado' | 'fecha_recepcion' | 'recibio' | 'notas'>>) =>
    api.put<ApiResponse<Recepcion>>(`/recepciones/${id}`, data).then((r) => r.data),

  getHistorial: (orden_compra_id: number) =>
    api.get<{ data: RecepcionConMateriales[] }>('/recepciones/historial', { params: { orden_compra_id } })
      .then((r) => r.data),

  inicializar: (orden_compra_id: number) =>
    api.post<{ data: { folio: string; count: number } | null; created: boolean }>(
      '/recepciones/inicializar', { orden_compra_id }
    ).then((r) => r.data),
}
