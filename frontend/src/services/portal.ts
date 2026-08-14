import api from './api'
import type { ApiResponse } from '@/types'

export type Decision = 'aprobado' | 'aprobado_con_comentarios' | 'rechazado'

export interface PortalHito {
  codigo: string; nombre: string; estado: string; semaforo: string
  fecha_real: string | null; es_ancla: boolean
}
export interface PortalVista {
  proyecto: { nombre: string; cliente: string; fecha_objetivo: string | null; semaforo: string }
  contacto: string | null
  pendientes: Array<{ codigo: string; titulo: string; fecha_planeada: string | null }>
  fases: Array<{ fase: string; hitos: PortalHito[] }>
}

export const portalService = {
  getVista: (token: string) =>
    api.get<ApiResponse<PortalVista>>(`/portal/${token}`).then((r) => r.data),

  aprobar: (token: string, codigo: string, decision: Decision, comentario?: string) =>
    api.post<ApiResponse<{ ok: boolean }>>(`/portal/${token}/aprobar`, { codigo, decision, comentario })
      .then((r) => r.data),
}
