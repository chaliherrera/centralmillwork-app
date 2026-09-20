import { api } from './api'

export interface Proyecto {
  id: number
  codigo: string
  nombre: string
  cliente: string | null
  estado: string | null
  fecha_objetivo: string | null
  total_ocs?: string | number | null
}

// Un ítem del readiness (Control MTO) de un proyecto.
export interface ReadinessMaterial {
  id: number
  codigo: string | null
  descripcion: string | null
  vendor: string | null
  qty: number | string | null
  unit_price: string | null
  estado_cotiz: string
  oc_id: number | null
  oc_numero: string | null
  oc_fecha_entrega: string | null
}

export interface ReadinessItem {
  item: string
  total: number
  recibidos: number
  ordenados: number
  pendientes: number
  en_stock: number
  disponibles: number
  estado: 'LISTO' | 'PARCIAL' | 'ORDENADO' | 'PENDIENTE'
  materiales: ReadinessMaterial[]
}

export interface ReadinessResumen {
  total_items: number
  listos: number
  parciales: number
  ordenados: number
  pendientes: number
}

export const proyectosService = {
  async getProyectos(search?: string): Promise<Proyecto[]> {
    const { data } = await api.get('/proyectos', { params: { limit: 100, ...(search ? { search } : {}) } })
    return data.data
  },

  async getById(id: number): Promise<Proyecto> {
    const { data } = await api.get(`/proyectos/${id}`)
    return data.data
  },

  async getItemsReadiness(id: number): Promise<{ items: ReadinessItem[]; resumen: ReadinessResumen }> {
    const { data } = await api.get(`/proyectos/${id}/items-readiness`)
    return data.data
  },
}
