import api from './api'
import type { Proyecto, ApiResponse, PaginationParams } from '@/types'

// ─── Tipos del endpoint /resumen ─────────────────────────────────────────────
export interface ProyectoResumen {
  proyecto: Proyecto
  kpis: {
    materiales: {
      total: number
      pendientes: number
      cotizados: number
      ordenados: number
      recibidos: number
      en_stock: number
      origen_mto: number
      origen_directa: number
      origen_urgente: number
      monto_total: string
      monto_comprado: string
      monto_recibido: string
    }
    ocs: {
      total: number
      recibidas: number
      activas: number
      canceladas: number
      directas: number
      urgentes: number
      monto_total: string
      freight_total: string
      vencidas: number
    }
    recepciones: {
      total: number
      completas: number
      con_diferencias: number
    }
    top_vendors: Array<{ vendor: string; ocs_count: number; monto: string }>
    gasto_mensual: Array<{ mes: string; monto: string }>
  }
}

// ─── Tipos del endpoint /actividad ───────────────────────────────────────────
export type ActividadEvento =
  | {
      tipo: 'mto_import'
      ts: string
      fecha: string | null
      origen: 'MTO' | 'DIRECTA' | 'URGENTE' | 'OPERATIVA'
      items_count: number
      cotizar_si: number
      en_stock: number
      vendor_principal: string | null
    }
  | {
      tipo: 'oc'
      ts: string
      id: number
      numero: string
      estado: string
      origen: 'MTO' | 'DIRECTA' | 'URGENTE' | 'OPERATIVA'
      fecha_emision: string
      fecha_entrega_estimada: string | null
      fecha_entrega_real: string | null
      total: string
      freight: string
      categoria: string | null
      notas: string | null
      vendor: string | null
      items_count: number
    }
  | {
      tipo: 'recepcion'
      ts: string
      id: number
      folio: string
      estado: 'completa' | 'con_diferencias' | 'pendiente'
      fecha_recepcion: string
      recibio: string | null
      notas: string | null
      oc_numero: string
      oc_id: number
      diffs_count: number
    }
  | {
      tipo: 'cotizacion'
      ts: string
      id: number
      folio: string
      estado: 'pendiente' | 'enviada' | 'recibida' | 'aprobada' | 'rechazada'
      fecha_solicitud: string | null
      fecha_respuesta: string | null
      monto_cotizado: string | null
      notas: string | null
      vendor: string | null
    }

export const proyectosService = {
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<Proyecto[]>>('/proyectos', { params }).then((r) => r.data),

  getById: (id: number) =>
    api.get<ApiResponse<Proyecto>>(`/proyectos/${id}`).then((r) => r.data),

  getResumen: (id: number) =>
    api.get<ApiResponse<ProyectoResumen>>(`/proyectos/${id}/resumen`).then((r) => r.data),

  getActividad: (id: number) =>
    api.get<ApiResponse<ActividadEvento[]>>(`/proyectos/${id}/actividad`).then((r) => r.data),

  create: (data: Omit<Proyecto, 'id' | 'created_at' | 'updated_at'>) =>
    api.post<ApiResponse<Proyecto>>('/proyectos', data).then((r) => r.data),

  update: (id: number, data: Partial<Proyecto>) =>
    api.put<ApiResponse<Proyecto>>(`/proyectos/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/proyectos/${id}`).then((r) => r.data),
}
