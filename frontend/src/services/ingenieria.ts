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
  estado: string
  status_ext: string | null
  comentario: string | null
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
export interface ReservaTarea { id: number; nombre: string; asignado_nombre: string | null; fecha_inicio: string | null; fecha_fin: string | null; tipo_clave: string | null }
export interface ReservaProyecto { proyecto_id: number; proyecto_codigo: string; proyecto_nombre: string; fecha_objetivo: string | null; tareas: ReservaTarea[] }

// Plan de un proyecto con holgura/riesgo (CPM sobre fecha fija)
export interface IngTareaPlan extends IngTarea {
  early_start: string | null
  early_finish: string | null
  late_finish: string | null
  holgura_dias: number | null
  critico: boolean
}
export interface IngArista { tarea_id: number; depende_de_id: number; tipo: string; lag_dias: number }
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
  getPlan: (proyecto: string) =>
    api.get<ApiResponse<IngPlan>>('/ingenieria/plan', { params: { proyecto } }).then((r) => r.data),
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
  actualizarTarea: (id: number, t: Partial<TareaInput>) =>
    api.patch<ApiResponse<{ ok: boolean }>>(`/ingenieria/tareas/${id}`, t).then((r) => r.data),
  borrarTarea: (id: number) =>
    api.delete<ApiResponse<{ ok: boolean }>>(`/ingenieria/tareas/${id}`).then((r) => r.data),
}
