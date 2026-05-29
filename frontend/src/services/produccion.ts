import api from './api'
import type {
  OrdenProduccion, OrdenDetallada, OrdenEvolucionResp, OrdenesKpis,
  PersonalTaller, EstacionConStatus, EstacionDetalle, EstacionDistancia,
  RutaCalculada, Prioridad, OrdenDocumento, EventosRecientesResp,
  PersonalActivoReporte, ReportePersonalResp, ReporteSemanalResp, ReporteProyectoResp, ReporteDiarioResp,
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
  numero_item: string
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

  eventosRecientes: (desde?: string) =>
    api.get<EventosRecientesResp>('/produccion/eventos-recientes', {
      params: desde ? { desde } : undefined,
    }).then((r) => r.data),

  orden: (id: number) =>
    api.get<{ data: OrdenDetallada }>(`/produccion/ordenes/${id}`).then((r) => r.data.data),

  /** Evolución completa de la orden — stepper + timeline. Solo ADMIN/SHOP_MANAGER. */
  ordenEvolucion: (id: number) =>
    api.get<{ data: OrdenEvolucionResp }>(`/produccion/ordenes/${id}/evolucion`).then((r) => r.data.data),

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

  // ─── Documentos adjuntos por orden/estación ──────────────────────────────
  /** Lista documentos de una orden. Filtro opcional `estacion`: pasar 'null' literal
   *  para traer solo los generales (sin estación). */
  documentos: (ordenId: number, estacion?: string | null) =>
    api.get<{ data: OrdenDocumento[] }>(`/produccion/ordenes/${ordenId}/documentos`, {
      params: estacion === undefined ? undefined : { estacion: estacion ?? 'null' },
    }).then((r) => r.data.data),

  subirDocumento: (ordenId: number, file: File, opts: {
    estacion?: string | null
    nombre?: string
    descripcion?: string
  } = {}) => {
    const form = new FormData()
    form.append('archivo', file)
    if (opts.estacion !== undefined && opts.estacion !== null) form.append('estacion', opts.estacion)
    if (opts.nombre)       form.append('nombre',       opts.nombre)
    if (opts.descripcion)  form.append('descripcion',  opts.descripcion)
    return api.post<{ data: OrdenDocumento; message: string }>(
      `/produccion/ordenes/${ordenId}/documentos`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ).then((r) => r.data)
  },

  borrarDocumento: (docId: number) =>
    api.delete<{ message: string }>(`/produccion/documentos/${docId}`).then((r) => r.data),

  // ─── Ruta preview ────────────────────────────────────────────────────────
  rutaPreview: (procesos: string[], asignaciones: Record<string, number | null> = {}) =>
    api.post<{ data: RutaCalculada }>('/produccion/ruta-preview', { procesos, asignaciones })
      .then((r) => r.data.data),

  // ─── Reportes de horas (sistema, para SHOP_MANAGER/ADMIN) ────────────────
  personalActivo: () =>
    api.get<{ data: PersonalActivoReporte[] }>('/produccion/time-tracking/activos').then((r) => r.data.data),

  reportePersonal: (personalId: number, fechaDesde: string, fechaHasta: string) =>
    api.get<ReportePersonalResp>(`/produccion/time-tracking/personal/${personalId}`, {
      params: { fecha_desde: fechaDesde, fecha_hasta: fechaHasta },
    }).then((r) => r.data),

  /** Grid Operarios × Días con proyectos por celda. Pensado para reporte semanal. */
  reporteSemanal: (desde: string, hasta: string) =>
    api.get<ReporteSemanalResp>(`/produccion/time-tracking/semanal`, {
      params: { desde, hasta },
    }).then((r) => r.data),

  reportePorProyecto: (proyectoId: number, fechaDesde: string, fechaHasta: string) =>
    api.get<ReporteProyectoResp>(`/produccion/time-tracking/proyecto/${proyectoId}`, {
      params: { fecha_desde: fechaDesde, fecha_hasta: fechaHasta },
    }).then((r) => r.data),

  reporteDiario: (fecha: string) =>
    api.get<ReporteDiarioResp>(`/produccion/time-tracking/diario`, {
      params: { fecha },
    }).then((r) => r.data),

  /** Devuelve un Blob xlsx para descargar. */
  exportarHoras: (params: {
    tipo: 'personal' | 'proyecto' | 'diario' | 'semanal'
    fecha_desde: string
    fecha_hasta: string
    personal_id?: number
    proyecto_id?: number
  }) =>
    api.get<Blob>(`/produccion/time-tracking/exportar`, {
      params,
      responseType: 'blob',
    }).then((r) => r.data),
}
