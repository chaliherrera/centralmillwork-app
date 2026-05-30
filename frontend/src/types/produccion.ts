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
  numero_item: string
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
  created_by: string | null              // UUID
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
  usuario_id: string | null              // UUID (usuarios.id es UUID en prod)
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
  usuario_id: string | null              // UUID — vínculo opcional al login del sistema
  tiene_pin: boolean
  pin_actualizado_at: string | null
  estaciones: PersonalEstacionAsignacion[]
}

// ─── Estaciones ──────────────────────────────────────────────────────────────

/** Item activo de un operario (segmento de time_proyectos abierto AHORA). */
export interface EstacionPersonalItemActivo {
  orden_id: number
  numero_orden: string
  numero_item: string
  hora_inicio: string       // ISO — para el timer en vivo
  proyecto_codigo: string | null
  /** Si el operario tiene pausa abierta, info de la pausa. Si está null, está
   *  trabajando activamente. Si tiene valor, el mapa muestra "⏸ En pausa"
   *  en vez del cronómetro corriendo. */
  pausa_activa: { motivo: string | null; hora_inicio: string } | null
}

export interface EstacionPersonalRef {
  personal_id: number
  nombre_completo: string
  iniciales: string
  es_estacion_principal: boolean
  /** Carga individual: órdenes asignadas a este operario, en esta estación,
   *  en estado Pendiente / En Proceso / Pausada. */
  ordenes_activas: number
  ordenes_alta_prioridad: number
  /** Item que el operario está trabajando AHORA en esta estación (si hay un
   *  segmento de time_proyectos abierto). Null si está idle o en otra estación. */
  item_activo: EstacionPersonalItemActivo | null
}

/** Orden destacada de una estación (la "running" o la primera de cola).
 *  Usada por el Blueprint Map. Null si la estación está sin órdenes. */
export interface EstacionOrdenRunning {
  numero_orden: string
  proyecto_nombre: string | null
  proyecto_codigo: string | null
  fecha_entrega: string | null
  prioridad: Prioridad
  state: 'running' | 'queued'
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
  /** Orden destacada de la estación (running o primera de cola). Null si vacía. */
  orden_running: EstacionOrdenRunning | null
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

// ─── Eventos de producción (para notificaciones del SHOP_MANAGER) ───────────

export interface EventoProduccion {
  id: number
  timestamp: string
  accion: 'mover' | 'completar' | string
  estacion_origen: string | null
  estacion_destino: string
  dispositivo: string | null
  motivo: string | null
  orden_id: number
  numero_orden: string
  numero_item: string
  prioridad: Prioridad
  orden_status: StatusOrden
  proyecto_codigo: string | null
  kiosk_personal_nombre: string | null
  kiosk_personal_iniciales: string | null
  usuario_nombre: string | null
}

export interface EventosRecientesResp {
  desde: string
  ahora: string
  eventos: EventoProduccion[]
}

// ─── Documentos adjuntos por estación ───────────────────────────────────────

export interface OrdenDocumento {
  id: number
  orden_id: number
  estacion: string | null              // null = documento general de la orden
  nombre: string
  descripcion: string | null
  filename: string
  mime_type: string | null
  size_bytes: number | null
  url: string | null
  uploaded_by: string | null           // UUID del usuario que subió
  uploaded_by_nombre?: string | null
  created_at: string
}

// ─── Reportes de horas ────────────────────────────────────────────────────────

export interface PersonalActivoReporte {
  personal_id: number
  nombre_completo: string
  iniciales: string
  tipo_personal: string | null
  registro_id: number
  hora_entrada: string
  dispositivo_clockin: string | null
  proyecto_segmento_id: number | null
  proyecto_id: number | null
  proyecto_codigo: string | null
  proyecto_nombre: string | null
  estacion: string | null
  orden_produccion_id: number | null
  proyecto_desde: string | null
  pausa_id: number | null
  pausa_desde: string | null
  pausa_motivo: string | null
}

export interface ReportePersonalRegistro {
  id: number
  fecha: string
  hora_entrada: string
  hora_salida: string | null
  total_horas: number | null
  horas_brutas: number | null
  dispositivo: string | null
  /** Trabajo en items asignados (orden_produccion_id != null) */
  horas_items: number
  /** Otro trabajo libre (orden_produccion_id = null) */
  horas_otro_trabajo: number
  /** items + otro_trabajo (compat con UI vieja) */
  horas_proyectos: number
  horas_pausas: number
  /** Tiempo sin asignar = brutas − items − otro − pausas */
  horas_sin_asignar: number
  proyectos: {
    proyecto_id: number
    proyecto_codigo: string
    proyecto_nombre: string
    estacion: string
    horas: number | null
  }[]
}

export interface ReportePersonalResp {
  personal_id: number
  periodo: { desde: string; hasta: string }
  registros: ReportePersonalRegistro[]
}

export interface ReporteProyectoAsignacion {
  personal_id: number
  nombre_completo: string
  iniciales: string
  estacion: string
  horas: number | null
  segmentos: number
  desde: string
  hasta: string
}

export interface ReporteProyectoResp {
  proyecto_id: number
  periodo: { desde: string; hasta: string }
  asignaciones: ReporteProyectoAsignacion[]
}

export interface ReporteDiarioPersona {
  personal_id: number
  nombre_completo: string
  iniciales: string
  registro_id: number | null
  hora_entrada: string | null
  hora_salida: string | null
  total_horas: number | null
  status: 'activo' | 'finalizado' | 'pausado' | null
  horas_pausas: number
  proyectos_count: number
}

export interface ReporteDiarioResp {
  fecha: string
  personal: ReporteDiarioPersona[]
}

// ─── Reporte semanal: grid Operarios × Días con proyectos por celda ─────────

export interface ReporteSemanalEstacion {
  estacion: string
  horas: number
}

export interface ReporteSemanalProyecto {
  proyecto_id: number | null
  proyecto_codigo: string | null
  proyecto_nombre: string | null
  total_horas: number
  estaciones: ReporteSemanalEstacion[]
}

export interface ReporteSemanalDia {
  total_horas: number       // items + otro trabajo (suma de segmentos)
  horas_brutas: number      // de time_registros (incluye pausas/sin asignar)
  proyectos: ReporteSemanalProyecto[]
}

export interface ReporteSemanalPersonal {
  personal_id: number
  nombre_completo: string
  iniciales: string
  total_horas_items: number
  /** Mapa fecha → celda. Si el operario no clockeó ese día, el valor es null. */
  dias: Record<string, ReporteSemanalDia | null>
}

export interface ReporteSemanalResp {
  periodo: { desde: string; hasta: string }
  /** Días en orden cronológico (incluye días sin actividad para mantener columnas estables). */
  dias: string[]
  personal: ReporteSemanalPersonal[]
}

// ─── Evolución de orden (solo SHOP_MANAGER/ADMIN) ───────────────────────────

export type EvolucionProcesoEstado = 'pendiente' | 'en_curso' | 'pausado' | 'completado'

export interface EvolucionProceso {
  id: number
  estacion: string
  secuencia: number
  requerido: boolean
  completado: boolean
  estado: EvolucionProcesoEstado
  fecha_inicio: string | null
  fecha_fin: string | null
  tiempo_real_minutos: number
  /** Estimado específico para esta estación. Si null, el frontend distribuye
   *  `orden.tiempo_estimado_horas` equitativamente entre los procesos requeridos. */
  tiempo_estimado_minutos: number | null
  operador_actual_id: number | null
  operador_actual_nombre: string | null
  operador_actual_iniciales: string | null
}

export type EvolucionEventoTipo =
  | 'creada' | 'asignada' | 'iniciado_item' | 'pausa' | 'movida' | 'completada'

export interface EvolucionEvento {
  tipo: EvolucionEventoTipo
  timestamp: string
  /** ID de personal_taller si el evento lo disparó un operario desde el kiosko */
  actor_personal_id: number | null
  /** Nombre de usuario del sistema si el evento lo disparó alguien con login */
  actor_usuario: string | null
  /** Iniciales del actor (para avatar visual) */
  actor_iniciales: string | null
  detalle: {
    estacion_origen?: string | null
    estacion_destino?: string | null
    motivo?: string | null
    duracion_min?: number | null
    hora_fin?: string | null
    prioridad?: Prioridad
    personal_destino?: string | null
  }
}

export interface OrdenEvolucionOrden {
  id: number
  numero_orden: string
  numero_item: string
  cantidad: number
  unidad: string
  prioridad: Prioridad
  status: StatusOrden
  estacion_actual: string | null
  tiempo_estimado_horas: number | null
  fecha_entrega: string | null
  fecha_inicio: string | null
  fecha_completada: string | null
  created_at: string
  created_by: string | null
  proyecto_codigo: string | null
  proyecto_nombre: string | null
  creado_por_nombre: string | null
}

export interface OrdenEvolucionResp {
  orden: OrdenEvolucionOrden
  procesos: EvolucionProceso[]
  eventos: EvolucionEvento[]
}

// ─── Items disponibles cross-project (vista del SHOP_MANAGER) ───────────────
export type EstadoItemDisponible = 'LISTO' | 'PARCIAL' | 'ORDENADO' | 'PENDIENTE'

export interface ItemDisponible {
  proyecto_id:     number
  proyecto_codigo: string
  proyecto_nombre: string
  item:            string
  total:           number
  recibidos:       number
  ordenados:       number
  pendientes:      number
  en_stock:        number
  disponibles:     number   // recibidos + en_stock
  estado:          EstadoItemDisponible
  op_existente:    { id: number; numero: string; status: StatusOrden } | null
}

export interface ItemsDisponiblesResp {
  items: ItemDisponible[]
  resumen: {
    total:         number
    listos:        number
    parciales:     number
    ordenados:     number
    pendientes:    number
    con_op_activa: number
  }
}
