import api from './api'
import type { ApiResponse } from '@/types'

export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'gris'

export interface ScheduleHito {
  codigo: string
  fase: string
  nombre: string
  tipo: string
  es_gate: boolean
  es_ancla: boolean
  parent_codigo: string | null
  rol_responsable: string | null
  fuente_dato: string
  orden: number
  fecha_planeada: string | null
  fecha_baseline: string | null
  fecha_real: string | null
  fecha_proyectada: string | null
  estado: string
  semaforo: Semaforo
  holgura_dias: number | null
  atribucion_atraso: string | null
}

export interface SchedulePlan {
  id: number
  fecha_objetivo: string
  fecha_objetivo_original: string
  semaforo: Semaforo
  holgura_dias: number | null
  updated_at: string
}

export interface ScheduleData {
  plan: SchedulePlan | null
  hitos: ScheduleHito[]
}

export const scheduleService = {
  getPlan: (proyectoId: number) =>
    api.get<ApiResponse<ScheduleData>>(`/schedule/proyecto/${proyectoId}`).then((r) => r.data),

  generar: (proyectoId: number, fecha_objetivo: string) =>
    api
      .post<ApiResponse<{ plan_id: number }>>(`/schedule/proyecto/${proyectoId}/generar`, { fecha_objetivo })
      .then((r) => r.data),

  recalcular: (proyectoId: number) =>
    api
      .post<ApiResponse<{ semaforo: string; holguraDias: number | null }>>(`/schedule/proyecto/${proyectoId}/recalcular`)
      .then((r) => r.data),

  crearPortalToken: (proyectoId: number, contacto_nombre?: string) =>
    api
      .post<ApiResponse<{ token: string }>>(`/schedule/proyecto/${proyectoId}/portal-token`, { contacto_nombre })
      .then((r) => r.data),

  registrarHito: (proyectoId: number, codigo: string, fecha: string | null, nota?: string, importe?: number) =>
    api
      .post<ApiResponse<{ ok: boolean }>>(`/schedule/proyecto/${proyectoId}/hito/${codigo}/registrar`, { fecha, nota, importe })
      .then((r) => r.data),

  uploadSubmittal: (proyectoId: number, file: File) => {
    const fd = new FormData()
    fd.append('planos', file)
    return api
      .post<ApiResponse<{ version_label: string }>>(`/schedule/proyecto/${proyectoId}/submittals`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  uploadArchivoHito: (proyectoId: number, codigo: string, file: File) => {
    const fd = new FormData()
    fd.append('archivo', file)
    return api
      .post<ApiResponse<{ id: number }>>(`/schedule/proyecto/${proyectoId}/hito/${codigo}/archivo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },
}
