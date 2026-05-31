// Tipos del módulo de Muestras (samples).
// Spec acordado 2026-05-30, ver memory: project_muestras_spec_2026_05_30.md

export type MuestraEstado =
  | 'SOLICITADA'
  | 'EN_FABRICACION'
  | 'EN_QC'
  | 'ENVIADA'
  | 'APROBADA'
  | 'RECHAZADA'
  | 'ARCHIVADA'

export type MuestraTipo = 'PUERTA' | 'ACABADO' | 'HARDWARE' | 'CABINET' | 'OTRO'
export type MuestraPrioridad = 'ALTA' | 'MEDIA' | 'BAJA'

export interface Muestra {
  id: number
  codigo: string
  proyecto_id: number
  descripcion: string
  tipo: MuestraTipo
  prioridad: MuestraPrioridad
  owner_id: string | null
  estado: MuestraEstado
  version_actual: number
  fecha_solicitud: string
  fecha_compromiso: string | null
  fecha_aprobacion_cliente: string | null
  notas: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// Enriched con info del proyecto y owner para listado / kanban
export interface MuestraConDetalle extends Muestra {
  proyecto_codigo: string | null
  proyecto_nombre: string | null
  owner_nombre: string | null
  owner_email: string | null
  ocs_count: number
  ocs_pendientes: number
  dias_desde_creacion: number
}

export interface MuestrasListResp {
  items: MuestraConDetalle[]
  resumen: Record<MuestraEstado, number>
}

export interface MuestrasKpis {
  activas: number
  en_fabricacion: number
  en_qc: number
  enviadas: number
  enviadas_sin_respuesta_5d: number
  vencidas: number
  aprobadas_total: number
}

export interface MuestraVersion {
  id: number
  muestra_id: number
  version_numero: number
  especificaciones: string | null
  razon_de_revision: string | null
  comentarios_cliente: string | null
  op_id: number | null
  op_numero: string | null
  op_status: string | null
  created_at: string
}

export interface MuestraEvento {
  id: number
  muestra_id: number
  version_numero: number
  tipo: string
  detalle: string | null
  usuario_id: string | null
  usuario_nombre: string | null
  usuario_email: string | null
  timestamp: string
}

export interface MuestraEnvio {
  id: number
  muestra_id: number
  version_numero: number
  fecha_envio: string
  destinatario: string
  direccion: string | null
  tracking_carrier: string | null
  tracking_number: string | null
  fecha_recepcion_confirmada: string | null
  notas: string | null
  created_by: string | null
  created_at: string
}

export interface MuestraOC {
  id: number
  numero: string
  estado: string
  fecha_emision: string | null
  fecha_entrega_estimada: string | null
  fecha_entrega_real: string | null
  total: string
  origen: string
  vendor_nombre: string | null
}

export interface MuestraDetalle {
  muestra: Muestra
  proyecto: { codigo: string; nombre: string; cliente: string; estado: string } | null
  owner: { id: string; nombre: string; email: string; rol: string } | null
  versiones: MuestraVersion[]
  ocs: MuestraOC[]
  envios: MuestraEnvio[]
  eventos: MuestraEvento[]
}

// Inputs para crear/editar
export interface CreateMuestraInput {
  codigo: string
  proyecto_id: number
  descripcion: string
  tipo?: MuestraTipo
  prioridad?: MuestraPrioridad
  owner_id?: string | null
  fecha_compromiso?: string | null
  notas?: string | null
  especificaciones?: string | null
}

export interface TransicionInput {
  nuevo_estado: MuestraEstado
  comentario?: string
  razon_revision?: string  // solo para RECHAZADA
}

export interface RegistrarEnvioInput {
  destinatario: string
  direccion?: string
  tracking_carrier?: string
  tracking_number?: string
  notas?: string
}
