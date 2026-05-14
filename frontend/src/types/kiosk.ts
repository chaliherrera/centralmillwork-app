// Tipos del módulo de kiosko (producción).
// Mantener sincronizado con backend/src/{controllers,routes}/kiosk*.ts

export type TipoPersonal = 'carpintero' | 'operador' | 'inspector' | 'logistica'

export interface KioskPersonal {
  id: number
  nombre_completo: string
  iniciales: string
  tipo_personal?: TipoPersonal
}

export interface KioskLoginResponse {
  token: string
  personal: KioskPersonal
  dispositivo?: string | null
}

export interface KioskRegistroActivo {
  id: number
  fecha: string            // YYYY-MM-DD
  hora_entrada: string     // ISO
  status: 'activo' | 'finalizado' | 'pausado'
  dispositivo: string | null
}

export interface KioskProyectoActivo {
  id: number               // time_proyectos.id
  proyecto_id: number
  proyecto_codigo: string
  proyecto_nombre: string
  estacion: string
  orden_produccion_id: number | null
  hora_inicio: string
}

export interface KioskPausaActiva {
  id: number
  hora_inicio: string
  motivo: string | null
}

export interface KioskMe {
  personal: KioskPersonal
  dispositivo?: string | null
  registro_activo: KioskRegistroActivo | null
  proyecto_activo: KioskProyectoActivo | null
  pausa_activa: KioskPausaActiva | null
}

export interface KioskProyectoDisponible {
  id: number
  codigo: string
  nombre: string
  estado: string
}

export interface KioskOrdenEnCola {
  id: number
  numero_orden: string
  item_nombre: string
  cantidad: number
  unidad: string
  prioridad: 'Alta' | 'Media' | 'Baja'
  fecha_entrega: string | null
  estacion_actual: string
  status: string
  proyecto_codigo: string | null
  proyecto_nombre: string | null
  mi_estacion: string
  mi_proceso_completado: boolean
  mi_proceso_inicio: string | null
  es_estacion_activa: boolean
  /** Documentos disponibles para esta orden + estación del operario (incluye los generales). */
  docs_count: number
}

export interface KioskDocumento {
  id: number
  orden_id: number
  estacion: string | null
  nombre: string
  descripcion: string | null
  mime_type: string | null
  size_bytes: number | null
  url: string | null
  created_at: string
}

export interface KioskDiaSegmento {
  id: number
  proyecto_id: number
  estacion: string
  orden_produccion_id: number | null
  hora_inicio: string
  hora_fin: string | null
  total_horas: number | null
  proyecto_codigo: string
  proyecto_nombre: string
  descripcion_trabajo: string | null
  completado: boolean
}

export interface KioskDiaPausa {
  id: number
  hora_inicio: string
  hora_fin: string | null
  motivo: string | null
  duracion_minutos: number | null
}

export interface KioskDia {
  registro: KioskRegistroActivo | null
  proyectos: KioskDiaSegmento[]
  pausas: KioskDiaPausa[]
}
