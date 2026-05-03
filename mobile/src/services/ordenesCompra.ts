import { api } from './api'

export interface OrdenCompra {
  id: number
  numero: string
  estado: string
  estado_display: 'ORDENADO' | 'EN_TRANSITO' | 'EN_EL_TALLER' | 'CANCELADA'
  fecha_emision: string
  fecha_entrega_estimada: string | null
  total: string
  notas: string | null
  proyecto?: { id: number; codigo: string; nombre: string }
  proveedor?: { id: number; nombre: string }
}

export const ordenesCompraService = {
  // Trae OCs pendientes de recepción (ORDENADO + EN_TRANSITO)
  async getPendientesRecepcion(): Promise<OrdenCompra[]> {
    const [ordenado, transito] = await Promise.all([
      api.get('/ordenes-compra', { params: { estado_display: 'ORDENADO', limit: 100 } }),
      api.get('/ordenes-compra', { params: { estado_display: 'EN_TRANSITO', limit: 100 } }),
    ])
    return [...ordenado.data.data, ...transito.data.data]
  },

  async getById(id: number): Promise<OrdenCompra> {
    const { data } = await api.get(`/ordenes-compra/${id}`)
    return data.data
  },
}
