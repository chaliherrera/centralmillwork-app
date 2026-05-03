import { api } from './api'

export interface MaterialLote {
  id: number
  codigo?: string
  descripcion?: string
  vendor?: string
  qty?: number
  unidad?: string
}

export interface MaterialRecepcion {
  id_material?: number
  cm_code?: string
  descripcion?: string
  recibido: boolean
  nota?: string
}

export interface CrearRecepcionPayload {
  orden_compra_id: number
  tipo: 'total' | 'parcial'
  fecha_recepcion?: string
  recibio?: string
  notas?: string
  materiales: MaterialRecepcion[]
}

export interface RecepcionMaterialHist {
  id: number
  id_material: number | null
  cm_code: string | null
  descripcion: string | null
  recibido: boolean
  nota: string | null
}

export interface RecepcionHistorial {
  id: number
  folio: string
  orden_compra_id: number
  estado: 'completa' | 'con_diferencias' | 'pendiente'
  fecha_recepcion: string | null
  recibio: string | null
  notas: string | null
  created_at: string
  updated_at: string
  materiales: RecepcionMaterialHist[]
}

export const recepcionesService = {
  // Trae los materiales del lote de una OC
  async getMaterialesLote(ocId: number): Promise<MaterialLote[]> {
    const { data } = await api.get(`/ordenes-compra/${ocId}/materiales-lote`)
    return data.data || []
  },

  // Crea una recepción completa (total o parcial)
  async crear(payload: CrearRecepcionPayload) {
    const { data } = await api.post('/recepciones/completa', payload)
    return data
  },

  // Trae el historial de recepciones previas de una OC (excluye templates 'pendiente')
  async getHistorial(ocId: number): Promise<RecepcionHistorial[]> {
    const { data } = await api.get('/recepciones/historial', { params: { orden_compra_id: ocId } })
    return data.data || []
  },
}
