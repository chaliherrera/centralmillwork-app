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
  crearTarea: (t: TareaInput) =>
    api.post<ApiResponse<{ id: number }>>('/ingenieria/tareas', t).then((r) => r.data),
  actualizarTarea: (id: number, t: Partial<TareaInput>) =>
    api.patch<ApiResponse<{ ok: boolean }>>(`/ingenieria/tareas/${id}`, t).then((r) => r.data),
  borrarTarea: (id: number) =>
    api.delete<ApiResponse<{ ok: boolean }>>(`/ingenieria/tareas/${id}`).then((r) => r.data),
}
