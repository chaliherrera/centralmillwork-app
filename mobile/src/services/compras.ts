import { api } from './api'

// Compras (procesar desde el móvil) — ONLINE-ONLY. Cotizar y generar OC tocan plata
// y numeración correlativa compartida: NO pasan por la outbox (análisis Fable).

export interface VendorCotizado {
  vendor: string
  fecha_importacion: string | null
  materiales_count: number
  total: string | number
}

export interface OCGenerada {
  numero: string
  vendor: string
  total: number
  materiales_count: number
}

export type OrigenNoMTO = 'DIRECTA' | 'URGENTE' | 'OPERATIVA'

export interface CompraItem {
  descripcion: string
  unidad: string
  qty: number
  unit_price: number
}

export interface NuevaCompraPayload {
  proyecto_id: number | null
  vendor: string
  origen: OrigenNoMTO
  categoria?: string | null
  notas?: string | null
  fecha_entrega_estimada?: string | null
  items: CompraItem[]
  freight?: number
}

export interface CompraCreada {
  id: number
  numero: string
  total: number
  freight: number
  materiales_count: number
  origen: OrigenNoMTO
}

export const comprasService = {
  // Compra SIN MTO (DIRECTA / URGENTE / OPERATIVA). ONLINE-only.
  crearOCNoMTO: (payload: NuevaCompraPayload) =>
    api.post('/ordenes-compra/no-mto', payload).then((r) => r.data.data as CompraCreada),

  // Vendors de un proyecto con material COTIZADO listo para emitir OC.
  getVendorsCotizados: (proyectoId: number) =>
    api.get('/ordenes-compra/vendors-cotizados', { params: { proyecto_id: proyectoId } })
      .then((r) => r.data.data as VendorCotizado[]),

  // Emitir OC(s) para los vendors elegidos. Devuelve las OCs creadas (con número).
  generarOCs: (proyectoId: number, vendors: Array<{ vendor: string; fecha_entrega_estimada: string | null }>) =>
    api.post('/ordenes-compra/generar', { proyecto_id: proyectoId, vendors })
      .then((r) => r.data.data as OCGenerada[]),
}
