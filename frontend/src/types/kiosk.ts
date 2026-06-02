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

export type ProcesoEstado = 'no_iniciado' | 'en_curso' | 'pausado'

export interface KioskOrdenEnCola {
  id: number
  numero_orden: string
  numero_item: string
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
  /** Estado del proceso desde el punto de vista del operario:
   *   - 'no_iniciado': nunca se hizo click "Iniciar item" (fecha_inicio NULL)
   *   - 'en_curso':    hay un segmento de time_proyectos ABIERTO ahora
   *   - 'pausado':     se inició antes pero no hay segmento abierto (clock-out o cambio) */
  proceso_estado: ProcesoEstado
  /** Minutos ya trabajados en este proceso (suma de segmentos cerrados). */
  minutos_previos: number
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

export interface KioskEstacionConfig {
  nombre: string
  foto_obligatoria: boolean
}

export interface KioskAvanceFoto {
  id: number
  orden_id: number
  proceso_id: number | null
  estacion: string | null
  personal_id: number | null
  personal_nombre?: string | null
  personal_iniciales?: string | null
  filename: string
  original_name: string | null
  mime_type: string | null
  size_bytes: number | null
  url: string | null
  comentario: string | null
  visible_cliente: boolean
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

export interface KioskDiaTotales {
  /** Minutos totales de la jornada (entrada → ahora o salida) */
  minutos_jornada: number
  /** Trabajo en items asignados (orden_produccion_id != null) */
  minutos_items: number
  /** Otro trabajo libre (orden_produccion_id = null) */
  minutos_otro_trabajo: number
  /** Pausas formales */
  minutos_pausas: number
  /** Tiempo "muerto" capturado en silencio: jornada − items − otro − pausas */
  minutos_sin_asignar: number
}

export interface KioskDia {
  registro: KioskRegistroActivo | null
  proyectos: KioskDiaSegmento[]
  pausas: KioskDiaPausa[]
  totales: KioskDiaTotales
}
