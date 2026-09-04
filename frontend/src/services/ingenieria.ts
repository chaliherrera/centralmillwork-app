import api from './api'
import type { ApiResponse } from '@/types'

export interface IngProyecto {
  proyecto_ext: string
  n_tareas: number
  fecha_inicio: string | null
  fecha_fin: string | null
  status_ext: string | null
}
export interface IngTarea {
  id: number
  proyecto_ext: string | null
  fase: string | null
  tipo_clave: string | null
  hito_codigo: string | null
  nombre: string
  asignado_nombre: string | null
  allocation_pct: number
  dur_dias: number
  fecha_inicio: string | null
  fecha_fin: string | null
  fecha_compromiso: string | null   // "comprometida + cumplida": cuándo se hará
  fecha_fin_real: string | null     // cuándo se cumplió
  estado: string
  status_ext: string | null
  comentario: string | null
  reprogramacion_pedida: boolean    // el ingeniero pidió reprogramación al PM (#2)
  reprogramacion_motivo: string | null
  decision: string | null           // respuesta del cliente en la revisión (#7)
  decision_comentarios: string | null
  envio_metodo: string | null       // cómo se envió al cliente (#5): correo|portal|ambos
}
export interface Reprogramacion {
  id: number
  proyecto_ext: string | null
  nombre: string
  tipo_clave: string | null
  asignado_nombre: string | null
  motivo: string | null
  fecha_inicio: string | null
}
export interface DepositoBloqueando {
  proyecto_ext: string
  nombre: string | null
  dias_pendiente: number | null
}
export interface MuestrasProyecto {
  proyecto_ext: string
  total: number
  aprobadas: number
  rechazadas: number
  pendientes: number
  todas_aprobadas: boolean
}
export interface ComprasProyecto {
  proyecto_ext: string
  n_materiales: number
  con_precio: number
  en_oc: number
  recibidos: number
  fecha_mto: string | null
}
export interface IngCargaIngeniero {
  nombre: string
  cargas: number[]
  n_tareas: number[]
  pico: number
  promedio: number
}
export interface IngCarga {
  semanas: string[]
  ingenieros: IngCargaIngeniero[]
  tope: number
}
export interface IngTareaCelda {
  nombre: string
  proyecto_ext: string | null
  tipo_clave: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  allocation_pct: number
}
// Mapa de calor de etapas del portafolio
export interface IngEtapaCarga { clave: string; nombre: string; orden: number; hito: string | null; counts: number[]; overlay?: number[] }
export interface IngCargaEtapas { semanas: string[]; etapas: IngEtapaCarga[]; sugerencia?: string }
export interface IngProyectoEtapa { proyecto_ext: string | null; nombre: string; asignado_nombre: string | null; fecha_inicio: string | null; fecha_fin: string | null }
// Deal en curso (handoff Estimados → Cliente → PM)
export type DealEstado = 'borrador' | 'esperando_pm' | 'plan_propuesto' | 'esperando_cliente' | 'aprobado'
export interface IngDealEnCurso { proyecto_id: number; codigo: string; nombre: string; cliente: string | null; estado: string; deal_estado: DealEstado; fecha_objetivo: string | null; n_tareas: number; portal_token: string | null }
export interface ReservaTarea { id: number; nombre: string; asignado_nombre: string | null; fecha_inicio: string | null; fecha_fin: string | null; tipo_clave: string | null }
export interface ReservaProyecto { proyecto_id: number; proyecto_codigo: string; proyecto_nombre: string; proyecto_ext: string | null; fecha_objetivo: string | null; tareas: ReservaTarea[] }

// Plan de un proyecto con holgura/riesgo (CPM sobre fecha fija)
export interface IngTareaPlan extends IngTarea {
  early_start: string | null
  early_finish: string | null
  late_finish: string | null
  holgura_dias: number | null
  critico: boolean
}
export interface IngArista { tarea_id: number; depende_de_id: number; tipo: string; lag_dias: number; ignorada_at?: string | null }
export interface EstadoDeposito {
  confirmado_finanzas: boolean
  fecha_confirmacion: string | null
  override_pm: boolean
  override_por: string | null
  override_at: string | null
  abierto: boolean
  fecha_resolucion: string | null
  dias_atribuibles_cliente: number | null
}
export interface EstadoMuestras {
  hay: boolean
  total: number
  aprobadas: number
  rechazadas: number
  pendientes: number
  todas_aprobadas: boolean
  fecha_solicitud: string | null
  fecha_aprobacion: string | null
}
export interface EstadoCompras {
  hay: boolean
  fecha_mto: string | null
  n_materiales: number
  solicitudes: number
  fecha_solicitud: string | null
  con_precio: number
  en_oc: number
  recibidos: number
  en_stock: number
  fecha_primera_oc: string | null
  fecha_ultima_recepcion: string | null
  pct_disponible: number
}
export interface EstadoInstalacion {
  hay: boolean
  total: number
  instalados: number
  pct: number
  fecha_ultima: string | null
  punch_total: number
  punch_abiertos: number
  completa: boolean
}
// Detalle ítem×ítem + punch para el panel del PM (#15) — leído del módulo de campo.
export interface InstalacionItem {
  op_id: number; numero_orden: string; numero_item: string; cantidad: number; unidad: string | null
  op_status: string; instalado: boolean; foto_url: string | null; nota: string | null; instalado_at: string | null
}
export interface InstalacionPunch {
  id: number; descripcion: string; area: string | null; estado: string
  foto_problema_url: string | null; foto_resuelto_url: string | null; created_at: string
}
export interface InstalacionDetalle { items: InstalacionItem[]; punch: InstalacionPunch[] }
// Escritorio por rol: tu próxima tarea desbloqueada, cross-project.
export interface EscritorioTarea {
  id: number; proyecto_ext: string | null; nombre: string; tipo_clave: string | null
  rol: string | null; asignado_nombre: string | null; fecha_inicio: string | null
  fecha_fin: string | null; dur_dias: number; estado: string
  reprogramacion_pedida: boolean; reprogramacion_motivo: string | null
}
export interface EscritorioResp { tareas: EscritorioTarea[]; bloqueadas: number }
export interface Ingeniero { nombre: string; activo: boolean; hace_cnc: boolean; usuario_id: string | null; tareas_activas: number }
export interface IngPlan {
  proyecto_ext: string
  fecha_inicio: string | null
  fecha_entrega: string | null
  status_ext: string | null
  n_items: number | null
  presupuesto: number | null
  fin_proyectado: string | null
  holgura_proyecto: number
  en_riesgo: boolean
  deposito: EstadoDeposito
  muestras: EstadoMuestras
  compras: EstadoCompras
  instalacion: EstadoInstalacion
  tareas: IngTareaPlan[]
  aristas: IngArista[]
}

export interface TareaInput {
  proyecto_ext?: string | null
  nombre: string
  asignado_nombre?: string | null
  allocation_pct?: number
  dur_dias?: number
  fecha_inicio?: string | null
  fecha_fin?: string | null
  estado?: string
  comentario?: string | null
}

export const ingenieriaService = {
  getResumen: () =>
    api.get<ApiResponse<{ resumen: { tareas: number; proyectos: number; ingenieros: number; con_tipo: number }; proyectos: IngProyecto[] }>>(
      '/ingenieria/resumen').then((r) => r.data),
  getTareas: (proyecto?: string) =>
    api.get<ApiResponse<IngTarea[]>>('/ingenieria/tareas', { params: proyecto ? { proyecto } : {} }).then((r) => r.data),
  getCarga: () =>
    api.get<ApiResponse<IngCarga>>('/ingenieria/carga').then((r) => r.data),
  getCargaDetalle: (ingeniero: string, semana: string) =>
    api.get<ApiResponse<IngTareaCelda[]>>('/ingenieria/carga/detalle', { params: { ingeniero, semana } }).then((r) => r.data),
  getCargaEtapas: (sugerencia?: string) =>
    api.get<ApiResponse<IngCargaEtapas>>('/ingenieria/carga-etapas', { params: sugerencia ? { sugerencia } : undefined }).then((r) => r.data),
  getEtapaDetalle: (etapa: string, semana: string) =>
    api.get<ApiResponse<IngProyectoEtapa[]>>('/ingenieria/carga-etapas/detalle', { params: { etapa, semana } }).then((r) => r.data),
  getPlan: (proyecto: string) =>
    api.get<ApiResponse<IngPlan>>('/ingenieria/plan', { params: { proyecto } }).then((r) => r.data),
  // Gate del depósito: el PM lo abre/cierra a mano (la confirmación de Finanzas se lee sola)
  overrideDeposito: (proyectoExt: string, abrir: boolean) =>
    api.post<ApiResponse<EstadoDeposito>>(`/ingenieria/proyecto/${encodeURIComponent(proyectoExt)}/deposito`, { abrir }).then((r) => r.data),
  crearTarea: (t: TareaInput) =>
    api.post<ApiResponse<{ id: number }>>('/ingenieria/tareas', t).then((r) => r.data),

  // ── Reserva de capacidad ──
  reservar: (proyectoId: number) =>
    api.post<ApiResponse<{ creadas: number }>>(`/ingenieria/proyecto/${proyectoId}/reservar`).then((r) => r.data),
  liberarReserva: (proyectoId: number) =>
    api.delete<ApiResponse<{ liberadas: number }>>(`/ingenieria/proyecto/${proyectoId}/reserva`).then((r) => r.data),
  reservasPendientes: () =>
    api.get<ApiResponse<ReservaProyecto[]>>('/ingenieria/reservas-pendientes').then((r) => r.data),
  confirmarReserva: (proyectoId: number, asignaciones?: { id: number; asignado_nombre: string }[]) =>
    api.post<ApiResponse<{ confirmadas: number }>>(`/ingenieria/reserva/${proyectoId}/confirmar`, { asignaciones }).then((r) => r.data),

  // ── Handoff Estimados → Cliente → PM ──
  dealsEnCurso: () =>
    api.get<ApiResponse<IngDealEnCurso[]>>('/ingenieria/deals').then((r) => r.data),
  enviarCliente: (proyectoId: number) =>
    api.post<ApiResponse<{ ok: boolean }>>(`/ingenieria/proyecto/${proyectoId}/enviar-cliente`).then((r) => r.data),
  clienteAprobo: (proyectoId: number) =>
    api.post<ApiResponse<{ ok: boolean }>>(`/ingenieria/proyecto/${proyectoId}/cliente-aprobo`).then((r) => r.data),
  activarProyecto: (proyectoId: number) =>
    api.post<ApiResponse<{ ok: boolean }>>(`/ingenieria/proyecto/${proyectoId}/activar`).then((r) => r.data),
  actualizarTarea: (id: number, t: Partial<TareaInput>) =>
    api.patch<ApiResponse<{ ok: boolean }>>(`/ingenieria/tareas/${id}`, t).then((r) => r.data),
  // Ingeniería reporta avance de su tarea (solo estado/comentario)
  avanceTarea: (id: number, data: { estado?: string; comentario?: string | null; fecha_compromiso?: string | null; fecha_fin_real?: string | null; reprogramacion_pedida?: boolean; reprogramacion_motivo?: string | null; decision?: string | null; decision_comentarios?: string | null; envio_metodo?: string | null }) =>
    api.patch<ApiResponse<{ ok: boolean }>>(`/ingenieria/tareas/${id}/avance`, data).then((r) => r.data),
  reprogramaciones: () =>
    api.get<ApiResponse<Reprogramacion[]>>('/ingenieria/reprogramaciones').then((r) => r.data),
  depositosBloqueando: () =>
    api.get<ApiResponse<DepositoBloqueando[]>>('/ingenieria/depositos-bloqueando').then((r) => r.data),
  muestrasEstado: () =>
    api.get<ApiResponse<MuestrasProyecto[]>>('/ingenieria/muestras-estado').then((r) => r.data),
  comprasEstado: () =>
    api.get<ApiResponse<ComprasProyecto[]>>('/ingenieria/compras-estado').then((r) => r.data),
  instalacionDetalle: (proyectoExt: string) =>
    api.get<ApiResponse<InstalacionDetalle>>(`/ingenieria/proyecto/${encodeURIComponent(proyectoExt)}/instalacion-detalle`).then((r) => r.data),
  escritorio: (params?: { rol?: string; asignado?: string }) =>
    api.get<ApiResponse<EscritorioResp>>('/ingenieria/escritorio', { params }).then((r) => r.data),
  // Gestión de ingenieros (el PM administra el recurso: activo / hace_cnc).
  getIngenieros: () =>
    api.get<ApiResponse<Ingeniero[]>>('/ingenieria/ingenieros').then((r) => r.data),
  updateIngeniero: (nombre: string, campos: { activo?: boolean; hace_cnc?: boolean }) =>
    api.patch<ApiResponse<{ ok: boolean }>>('/ingenieria/ingenieros', { nombre, ...campos }).then((r) => r.data),
  borrarTarea: (id: number) =>
    api.delete<ApiResponse<{ ok: boolean; reconectadas: number }>>(`/ingenieria/tareas/${id}`).then((r) => r.data),

  // Dependencias (predecesores)
  agregarDep: (tareaId: number, depende_de_id: number, lag_dias = 0) =>
    api.post<ApiResponse<{ ok: boolean }>>(`/ingenieria/tareas/${tareaId}/dep`, { depende_de_id, lag_dias }).then((r) => r.data),
  borrarDep: (tareaId: number, dependeDeId: number) =>
    api.delete<ApiResponse<{ ok: boolean }>>(`/ingenieria/tareas/${tareaId}/dep/${dependeDeId}`).then((r) => r.data),
}
