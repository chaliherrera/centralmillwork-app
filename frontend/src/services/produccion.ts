import api from './api'
import type {
  OrdenProduccion, OrdenDetallada, OrdenesKpis,
  PersonalTaller, EstacionConStatus, EstacionDetalle, EstacionDistancia,
  RutaCalculada, Prioridad,
} from '@/types/produccion'

interface OrdenesFilters {
  status?: string
  estacion?: string
  proyecto_id?: number
  prioridad?: Prioridad
  personal_id?: number
  search?: string
  page?: number
  limit?: number
}

interface CrearOrdenInput {
  numero_orden: string
  proyecto_id: number | null
  item_nombre: string
  cantidad: number
  unidad?: string
  especificaciones?: string
  material_requerido?: unknown
  prioridad?: Prioridad
  fecha_entrega?: string | null
  tiempo_estimado_horas?: number | null
  notas?: string
  procesos: string[]                            // ej: ['cnc','edge_banding','assembly']
  asignaciones?: Record<string, number | null>  // estacion → personal_id
}

interface CrearPersonalInput {
  nombre: string
  apellido?: string
  iniciales: string
  tipo_personal?: PersonalTaller['tipo_personal']
  usuario_id?: number | null
  estaciones?: { estacion: string; es_estacion_principal?: boolean; capacidad_max?: number }[]
}

export const produccionService = {
  // ─── Órdenes ──────────────────────────────────────────────────────────────
  ordenes: (params?: OrdenesFilters) =>
    api.get<{ data: OrdenProduccion[]; total: number; page: number; limit: number }>(
      '/produccion/ordenes', { params }
    ).then((r) => r.data),

  ordenesKpis: () =>
    api.get<{ data: OrdenesKpis }>('/produccion/ordenes-kpis').then((r) => r.data.data),

  orden: (id: number) =>
    api.get<{ data: OrdenDetallada }>(`/produccion/ordenes/${id}`).then((r) => r.data.data),

  crearOrden: (body: CrearOrdenInput) =>
    api.post<{ data: OrdenProduccion; message: string }>('/produccion/ordenes', body).then((r) => r.data),

  actualizarOrden: (id: number, body: Partial<OrdenProduccion>) =>
    api.put<{ data: OrdenProduccion; message: string }>(`/produccion/ordenes/${id}`, body).then((r) => r.data),

  asignarOperador: (id: number, body: { estacion: string; personal_id: number | null }) =>
    api.patch<{ message: string }>(`/produccion/ordenes/${id}/asignar`, body).then((r) => r.data),

  avanzarOrden: (id: number, notas?: string) =>
    api.patch<{ data: { siguiente_estacion: string | null; status: string }; message: string }>(
      `/produccion/ordenes/${id}/avanzar`, { notas }
    ).then((r) => r.data),

  pausarOrden: (id: number, motivo?: string) =>
    api.patch<{ message: string }>(`/produccion/ordenes/${id}/pausar`, { motivo }).then((r) => r.data),

  reanudarOrden: (id: number) =>
    api.patch<{ message: string }>(`/produccion/ordenes/${id}/reanudar`).then((r) => r.data),

  cancelarOrden: (id: number, motivo?: string) =>
    api.delete<{ message: string }>(`/produccion/ordenes/${id}`, { data: { motivo } }).then((r) => r.data),

  // ─── Personal del taller ─────────────────────────────────────────────────
  personal: (filters?: { activo?: boolean; estacion?: string; tipo?: string }) =>
    api.get<{ data: PersonalTaller[] }>('/produccion/personal', { params: filters }).then((r) => r.data.data),

  personalById: (id: number) =>
    api.get<{ data: PersonalTaller }>(`/produccion/personal/${id}`).then((r) => r.data.data),

  crearPersonal: (body: CrearPersonalInput) =>
    api.post<{ data: PersonalTaller; message: string }>('/produccion/personal', body).then((r) => r.data),

  actualizarPersonal: (id: number, body: Partial<PersonalTaller>) =>
    api.put<{ data: PersonalTaller; message: string }>(`/produccion/personal/${id}`, body).then((r) => r.data),

  setEstaciones: (id: number, estaciones: PersonalTaller['estaciones']) =>
    api.put<{ message: string }>(`/produccion/personal/${id}/estaciones`, { estaciones }).then((r) => r.data),

  setPin: (id: number, pin: string) =>
    api.post<{ message: string }>(`/produccion/personal/${id}/pin`, { pin }).then((r) => r.data),

  clearPin: (id: number) =>
    api.delete<{ message: string }>(`/produccion/personal/${id}/pin`).then((r) => r.data),

  // ─── Estaciones ───────────────────────────────────────────────────────────
  estaciones: () =>
    api.get<{ data: EstacionConStatus[] }>('/produccion/estaciones').then((r) => r.data.data),

  estacion: (nombre: string) =>
    api.get<{ data: EstacionDetalle }>(`/produccion/estaciones/${nombre}`).then((r) => r.data.data),

  distancias: () =>
    api.get<{ data: EstacionDistancia[] }>('/produccion/distancias').then((r) => r.data.data),

  // ─── Ruta preview ────────────────────────────────────────────────────────
  rutaPreview: (procesos: string[], asignaciones: Record<string, number | null> = {}) =>
    api.post<{ data: RutaCalculada }>('/produccion/ruta-preview', { procesos, asignaciones })
      .then((r) => r.data.data),
}
