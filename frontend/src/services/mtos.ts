import api from './api'

export type EstadoCotizMto = 'PENDIENTE' | 'COTIZADO' | 'ORDENADO' | 'RECIBIDO'

export interface VendorAgg {
  vendor: string
  counts: Record<EstadoCotizMto, number>
  total: number
}

export interface MtoActivo {
  batch_key: string
  import_batch_id: string | null
  fecha_importacion: string | null
  origen: string
  proyecto: { id: number; codigo: string; nombre: string }
  total_materiales: number
  counts: Record<EstadoCotizMto, number>
  vendors: VendorAgg[]
  porcentaje_recibido: number
}

export const mtosService = {
  async getActivos(): Promise<MtoActivo[]> {
    const { data } = await api.get<{ data: MtoActivo[] }>('/mtos/activos')
    return data.data
  },
}
