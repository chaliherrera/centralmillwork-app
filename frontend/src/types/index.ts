// ─── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole = 'ADMIN' | 'PROCUREMENT' | 'PRODUCTION' | 'PROJECT_MANAGEMENT' | 'RECEPTION'

export interface User {
  id: string
  nombre: string
  email: string
  rol: UserRole
  activo: boolean
  created_at: string
  updated_at: string
}

// ─── Enums ────────────────────────────────────────────────────────────────────

export type EstadoProyecto = 'cotizacion' | 'activo' | 'en_pausa' | 'completado' | 'cancelado'
export type EstadoOrden    = 'borrador' | 'enviada' | 'confirmada' | 'parcial' | 'recibida' | 'cancelada' | 'en_transito'
export type EstadoCotizacion = 'pendiente' | 'enviada' | 'recibida' | 'aprobada' | 'rechazada'
export type EstadoRecepcion  = 'pendiente' | 'completa' | 'con_diferencias'

// ─── Entidades ────────────────────────────────────────────────────────────────

export interface Proveedor {
  id: number
  nombre: string
  contacto: string
  email: string
  telefono: string
  rfc: string
  direccion: string
  activo: boolean
  created_at: string
  updated_at: string
}

export interface Proyecto {
  id: number
  codigo: string
  nombre: string
  cliente: string
  descripcion: string
  estado: EstadoProyecto
  fecha_inicio: string
  fecha_fin_estimada: string
  fecha_fin_real: string | null
  presupuesto: number
  responsable: string
  total_ocs?: number
  created_at: string
  updated_at: string
}

export type EstadoCotizMto = 'COTIZADO' | 'PENDIENTE' | 'EN_STOCK'

export interface Material {
  id: number
  proyecto_id: number | null
  proyecto?: { id: number; nombre: string; codigo: string }
  item: string
  codigo: string
  vendor_code: string
  vendor: string
  descripcion: string
  color: string
  categoria: string
  unidad: string
  size: string
  qty: number
  unit_price: number
  total_price: number
  estado_cotiz: EstadoCotizMto
  mill_made: 'SI' | 'NO'
  cotizar?: 'SI' | 'NO' | 'EN_STOCK'
  manufacturer?: string
  notas?: string | null
  fecha_importacion?: string | null
  created_at: string
  updated_at: string
}

export type EstadoDisplayOC = 'ORDENADO' | 'EN_EL_TALLER' | 'EN_TRANSITO' | 'CANCELADA'

export interface OrdenCompra {
  id: number
  numero: string
  proyecto_id: number
  proyecto?: Proyecto
  proveedor_id: number
  proveedor?: Proveedor
  estado: EstadoOrden
  fecha_emision: string
  fecha_entrega_estimada: string
  fecha_entrega_real: string | null
  fecha_mto?: string | null
  categoria?: string
  subtotal: number
  iva: number
  total: number
  notas: string
  created_at: string
  updated_at: string
  items?: ItemOrdenCompra[]
  // computed by backend
  estado_display?: EstadoDisplayOC
  flag_vencida?: boolean
  flag_retraso?: boolean
  flag_2dias?: boolean
}

export interface ItemOrdenCompra {
  id: number
  orden_compra_id: number
  material_id: number
  material?: Material
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export interface Recepcion {
  id: number
  folio: string
  orden_compra_id: number
  orden_compra?: OrdenCompra
  estado: EstadoRecepcion
  fecha_recepcion: string
  recibio: string
  notas: string
  created_at: string
  updated_at: string
  items?: ItemRecepcion[]
}

export interface ItemRecepcion {
  id: number
  recepcion_id: number
  item_orden_id: number
  cantidad_ordenada: number
  cantidad_recibida: number
  diferencia: number
  observaciones: string
}

export interface SolicitudCotizacion {
  id: number
  folio: string
  proyecto_id: number
  proyecto?: Proyecto
  proveedor_id: number
  proveedor?: Proveedor
  estado: EstadoCotizacion
  fecha_solicitud: string
  fecha_respuesta: string | null
  monto_cotizado: number | null
  notas: string
  created_at: string
  updated_at: string
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  message?: string
  total?: number
  page?: number
  limit?: number
}

export interface ApiError {
  message: string
  errors?: Record<string, string[]>
}

export interface PaginationParams {
  page?: number
  limit?: number
  search?: string
  sort?: string
  order?: 'asc' | 'desc'
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardStats {
  proyectos_activos: number
  ordenes_pendientes: number
  recepciones_hoy: number
  cotizaciones_abiertas: number
  gasto_mes_actual: number
  gasto_mes_anterior: number
}

export interface DashboardFullStats {
  kpis: {
    proyectos_activos: number
    monto_total_ocs:   number
    monto_recibido:    number
    ocs_completadas:   number
    ocs_en_proceso:    number
    ocs_retrasadas:    number
    cumplimiento_pct:  number
  }
  dona_proyectos:      { estado: string; total: number }[]
  barras_economico:    { estado: string; ordenado: number; recibido: number }[]
  top_proyectos:       { id: number; codigo: string; nombre: string; estado: string; monto_total: number }[]
  proyectos_recientes: {
    id: number; codigo: string; nombre: string; estado: string
    cant_ocs: number; monto_ordenado: number; monto_recibido: number
    pendiente: number; updated_at: string
  }[]
  top_vendors:         { proveedor: string; cant_ocs: number; monto: number }[]
  top_categorias:      { categoria: string; cant_ocs: number; monto: number }[]
  ocs_por_mes:         { mes: string; total: number }[]
  recepciones_por_mes: { mes: string; total: number }[]
}

export interface DashboardKpis {
  total_materiales: number
  valor_total: number
  pendientes: number
  cotizados: number
  en_stock: number
  proyectos_activos: number
  oc_mes_actual: number
  oc_activas: number
}

export interface DashboardCharts {
  por_estado:     { estado: string; total: number; valor: number }[]
  gasto_por_mes:  { mes: string; total: number }[]
  top_vendors:    { vendor: string; total_items: number; valor: number }[]
  top_categorias: { categoria: string; total: number; valor: number }[]
  mat_por_mes:    { mes: string; total: number }[]
}

export interface DashboardResumenRow {
  estado: string
  cotizar: string
  total: number
  valor: number
  qty_total: number
  pct: number
}

export interface DashboardProyecto {
  id: number
  codigo: string
  nombre: string
  estado: string
  fecha_inicio: string
  total_materiales: number
  valor_total: number
  pendientes: number
  cotizados: number
  en_stock: number
}
