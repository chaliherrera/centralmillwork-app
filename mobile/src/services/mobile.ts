// Endpoints móvil-específicos — consume /api/mobile/*
// Feature "Buscar" (2026-07-12): consulta global proyecto → vendor con
// materiales + OCs + fotos de recepción en un solo request.

import { api } from './api'

export interface ProyectoLite {
  id: number
  codigo: string
  nombre: string
  cliente: string | null
}

export interface SearchMaterial {
  id: number
  codigo: string | null
  descripcion: string
  vendor: string | null
  qty: number
  unit_price: number
  item: string | null
  estado_cotiz: 'PENDIENTE' | 'COTIZADO' | 'ORDENADO' | 'RECIBIDO' | 'EN_STOCK' | string
  oc_numero: string | null
  oc_estado: string | null
  recepcion_folio: string | null
  recepcion_fecha: string | null
  fotos_urls: string[]
}

export interface SearchOC {
  id: number
  numero: string
  estado: string
  fecha_emision: string | null
  fecha_entrega_estimada: string | null
  total: number
  proveedor_nombre: string | null
  items_cubiertos: string | null
}

export interface SearchResult {
  proyecto: ProyectoLite & { estado: string } | null
  query: string
  materiales: SearchMaterial[]
  ocs: SearchOC[]
  counts: { materiales: number; ocs: number }
}

export const mobileService = {
  proyectos: async (): Promise<ProyectoLite[]> => {
    const r = await api.get<{ data: ProyectoLite[] }>('/mobile/proyectos')
    return r.data.data
  },

  search: async (opts: { proyecto_id?: number | null; q?: string; limit?: number }): Promise<SearchResult> => {
    const r = await api.get<{ data: SearchResult }>('/mobile/search', {
      params: {
        proyecto_id: opts.proyecto_id ?? undefined,
        q:           opts.q?.trim() || undefined,
        limit:       opts.limit ?? 20,
      },
    })
    return r.data.data
  },
}
