import { api } from './api'

export interface Material {
  id: number
  proyecto_id: number | null
  codigo: string | null
  descripcion: string | null
  vendor: string | null
  item: string | null
  qty: number | string | null
  unidad: string | null
  unit_price: string | null
  estado_cotiz: string        // PENDIENTE | COTIZADO | ORDENADO | RECIBIDO | EN_STOCK
  cotizar: string | null      // 'NO' = no se compra
  origen: string | null       // MTO | DIRECTA | URGENTE | OPERATIVA
  proyecto?: { id: number; nombre: string; codigo: string } | null
  oc_id?: number | null
  oc_numero?: string | null
}

export interface MaterialFiltro {
  proyecto_id?: number
  estado_cotiz?: string
  search?: string
  limit?: number
}

export const materialesService = {
  async getMateriales(filtro: MaterialFiltro = {}): Promise<Material[]> {
    const { data } = await api.get('/materiales', { params: { limit: 100, ...filtro } })
    return data.data
  },
}
