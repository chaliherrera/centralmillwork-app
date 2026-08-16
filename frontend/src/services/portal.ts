import api from './api'
import type { ApiResponse } from '@/types'

export type Decision = 'aprobado' | 'aprobado_con_comentarios' | 'rechazado'

export interface PortalMomento {
  codigo: string; label: string; tipo: 'accion' | 'estado'; estado: 'done' | 'now' | 'future'
}
export interface PortalVista {
  proyecto: { nombre: string; cliente: string; fecha_objetivo: string | null; semaforo: string }
  contacto: string | null
  momentos: PortalMomento[]
  pendientes: Array<{ codigo: string; titulo: string; fecha_planeada: string | null; documento_url?: string | null }>
}

export const portalService = {
  getVista: (token: string) =>
    api.get<ApiResponse<PortalVista>>(`/portal/${token}`).then((r) => r.data),

  aprobar: (token: string, codigo: string, decision: Decision, comentario?: string) =>
    api.post<ApiResponse<{ ok: boolean }>>(`/portal/${token}/aprobar`, { codigo, decision, comentario })
      .then((r) => r.data),
}
