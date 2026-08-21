import api from './api'

export type OrderByPrecios =
  | 'fecha_desc'
  | 'fecha_asc'
  | 'precio_desc'
  | 'precio_asc'
  | 'vendor_asc'
  | 'descripcion_asc'

export interface PrecioRow {
  item_id: number
  descripcion: string
  unidad: string | null
  cantidad: string | number | null
  precio_unitario: string | number
  subtotal: string | number | null
  oc_id: number
  oc_numero: string
  fecha_emision: string | null
  oc_estado: string
  proveedor_id: number
  vendor: string
  proyecto_id: number | null
  proyecto_codigo: string | null
  proyecto_nombre: string | null
  categoria: string | null
  material_codigo: string | null
}

export interface ResumenPrecios {
  total: number
  precio_promedio: number | null
  precio_min: number | null
  precio_max: number | null
  subtotal_total: number | null
}

export interface BuscarPreciosResponse {
  data: PrecioRow[]
  total: number
  resumen: ResumenPrecios
  page: number
  limit: number
}

export interface FiltrosPreciosResponse {
  vendors: string[]
  categorias: string[]
}

export interface BuscarPreciosParams {
  search?: string
  vendor?: string
  categoria?: string
  precio_min?: number | ''
  precio_max?: number | ''
  fecha_desde?: string
  fecha_hasta?: string
  orderBy?: OrderByPrecios
  page?: number
  limit?: number
}

export interface EvolucionPuntoPrecio {
  fecha: string
  precio: number
  cantidad: number | null
  unidad: string | null
  vendor: string
  oc_numero: string
  oc_id: number
  proyecto_codigo: string | null
  proyecto_id: number | null
  descripcion: string
}

export interface EvolucionPrecioResponse {
  puntos: EvolucionPuntoPrecio[]
  vendors: string[]
  total: number
}

export const preciosService = {
  async getFiltros(): Promise<FiltrosPreciosResponse> {
    const { data } = await api.get<FiltrosPreciosResponse>('/precios/filtros')
    return data
  },

  async buscar(params: BuscarPreciosParams): Promise<BuscarPreciosResponse> {
    const clean: Record<string, string | number> = {}
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== null) clean[k] = v as string | number
    })
    const { data } = await api.get<BuscarPreciosResponse>('/precios/buscar', { params: clean })
    return data
  },

  async getEvolucion(descripcion: string, vendor?: string): Promise<EvolucionPrecioResponse> {
    const params: Record<string, string> = { descripcion }
    if (vendor) params.vendor = vendor
    const { data } = await api.get<EvolucionPrecioResponse>('/precios/evolucion', { params })
    return data
  },
}
