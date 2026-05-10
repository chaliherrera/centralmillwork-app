// Tipos del módulo de Producción (sistema, no kiosko).
// Mantener sincronizado con backend/src/controllers/produccion*.ts.

import type { TipoPersonal } from './kiosk'

export type StatusOrden = 'Pendiente' | 'En Proceso' | 'Pausada' | 'Completada' | 'Cancelada'
export type Prioridad   = 'Alta' | 'Media' | 'Baja'

export interface OrdenProduccion {
  id: number
  numero_orden: string
  proyecto_id: number | null
  proyecto_codigo?: string | null
  proyecto_nombre?: string | null
  item_nombre: string
  cantidad: number
  unidad: string
  especificaciones: string | null
  material_requerido: unknown | null
  prioridad: Prioridad
  fecha_entrega: string | null
  tiempo_estimado_horas: number | null
  status: StatusOrden
  estacion_actual: string | null
  personal_asignado_id: number | null
  personal_asignado_nombre?: string | null
  personal_asignado_iniciales?: string | null
  ruta_calculada: unknown | null
  distancia_total_metros: number | null
  notas: string | null
  fecha_inicio: string | null
  fecha_completada: string | null
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface OrdenProceso {
  id: number
  orden_id: number
  estacion: string
  secuencia: number
  requerido: boolean
  completado: boolean
  fecha_inicio: string | null
  fecha_fin: string | null
  tiempo_real_minutos: number | null
  operador_id: number | null
  operador_nombre?: string | null
  operador_iniciales?: string | null
  notas: string | null
}

export interface OrdenHistorial {
  id: number
  orden_id: number
  estacion_origen: string | null
  estacion_destino: string
  personal_origen_id: number | null
  personal_destino_id: number | null
  personal_origen_nombre?: string | null
  personal_destino_nombre?: string | null
  accion: string
  motivo: string | null
  usuario_id: number | null
  usuario_nombre?: string | null
  kiosk_personal_id: number | null
  kiosk_personal_nombre?: string | null
  dispositivo: string | null
  timestamp: string
}

export interface OrdenDetallada extends OrdenProduccion {
  procesos: OrdenProceso[]
  historial: OrdenHistorial[]
}

export interface OrdenesKpis {
  activas: number
  completadas_hoy: number
  pausadas: number
  alta_prioridad: number
  vencidas: number
}

// ─── Personal del Taller ─────────────────────────────────────────────────────

export interface PersonalEstacionAsignacion {
  estacion: string
  es_estacion_principal: boolean
  capacidad_max: number
  activo: boolean
}

export interface PersonalTaller {
  id: number
  nombre: string
  apellido: string | null
  nombre_completo: string
  iniciales: string
  tipo_personal: TipoPersonal | null
  activo: boolean
  usuario_id: number | null
  tiene_pin: boolean
  pin_actualizado_at: string | null
  estaciones: PersonalEstacionAsignacion[]
}

// ─── Estaciones ──────────────────────────────────────────────────────────────

export interface EstacionPersonalRef {
  personal_id: number
  nombre_completo: string
  iniciales: string
  es_estacion_principal: boolean
}

export interface EstacionConStatus {
  nombre: string
  tipo: string | null
  posicion_x: number | null
  posicion_y: number | null
  capacidad_max: number | null
  activa: boolean
  ordenes_activas: number
  ordenes_pausadas: number
  ordenes_alta_prioridad: number
  personal: EstacionPersonalRef[]
}

export interface EstacionDetalle extends EstacionConStatus {
  ordenes: (OrdenProduccion & { proceso_iniciado: string | null })[]
  personal: (EstacionPersonalRef & { tipo_personal: TipoPersonal | null; capacidad_max: number })[]
}

export interface EstacionDistancia {
  id: number
  estacion_origen: string
  estacion_destino: string
  distancia_metros: number
  tiempo_estimado_seg: number | null
  es_estimado: boolean
}

// ─── Ruta calculada ──────────────────────────────────────────────────────────

export interface RutaPaso {
  paso: number
  estacion: string
  personal_id: number | null
  personal_nombre: string | null
  distancia_desde_anterior: number
  segundos_traslado: number
}

export interface RutaCalculada {
  ruta: RutaPaso[]
  distancia_total_metros: number
  tiempo_traslados_segundos: number
}
