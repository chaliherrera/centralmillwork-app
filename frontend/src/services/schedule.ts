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
  desde_gantt?: boolean   // la fecha viene de la tarea del Gantt (ruta de ingeniería)
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

export interface TrabajoHito {
  codigo: string
  nombre: string
  rol_responsable: string | null
  fecha_planeada: string | null
  estado: string
  semaforo: Semaforo
  holgura_dias: number | null
  atribucion_atraso: string | null
}
export interface TrabajoProyecto {
  proyecto_id: number
  proyecto_codigo: string
  proyecto_nombre: string
  fecha_objetivo: string | null
  hitos: TrabajoHito[]
}

export interface RankingIng { nombre: string; hace_cnc: boolean; disponible_desde: string; n_pendientes: number; fin_proyectado: string; entra: boolean }
export interface FactibilidadResult {
  fecha_pedida: string
  factible: boolean
  fecha_real_mas_temprana: string
  dias_slip: number
  ingeniero_propuesto: string | null
  disponible_desde: string
  ventana_ing: { inicio: string; fin: string } | null
  ranking: RankingIng[]
  motivo: 'ok' | 'cadena' | 'capacidad' | 'sin_ingenieros'
  provisional: true
}

export interface ProyectoOverview {
  proyecto_id: number
  codigo: string
  nombre: string
  fecha_objetivo: string | null
  fecha_objetivo_original: string | null
  semaforo: Semaforo
  holgura_dias: number | null
  total: number
  cumplidos: number
  atrasados: number
  prox_codigo: string | null
  prox_nombre: string | null
  prox_fase: string | null
  prox_rol: string | null
  prox_fecha: string | null
  prox_semaforo: Semaforo | null
}

export const scheduleService = {
  // Índice de la cartera: todos los proyectos con schedule y su estado (nav "Schedule").
  getProyectosOverview: () =>
    api.get<ApiResponse<ProyectoOverview[]>>(`/schedule/proyectos`).then((r) => r.data),

  getPlan: (proyectoId: number) =>
    api.get<ApiResponse<ScheduleData>>(`/schedule/proyecto/${proyectoId}`).then((r) => r.data),

  // Chequeo de factibilidad (read-only): ¿se puede entregar para tal fecha? + ingeniero disponible.
  // proyecto_id escala las duraciones por ítem (mismo criterio que el generador).
  getFactibilidad: (fecha_pedida: string, proyecto_id?: number) =>
    api.post<ApiResponse<FactibilidadResult>>(`/schedule/factibilidad`, { fecha_pedida, proyecto_id }).then((r) => r.data),

  // Escritorio por área: la frontera del equipo a través de todos los proyectos.
  getMiTrabajo: (area: string) =>
    api.get<ApiResponse<TrabajoProyecto[]>>(`/schedule/mi-trabajo`, { params: { area } }).then((r) => r.data),

  generar: (proyectoId: number, fecha_objetivo: string) =>
    api
      .post<ApiResponse<{ plan_id: number }>>(`/schedule/proyecto/${proyectoId}/generar`, { fecha_objetivo })
      .then((r) => r.data),

  // Intake de Estimación: fecha de entrega + contrato firmado (PDF) + fechas de
  // envío/firma → arranca el proyecto y cierra C-03. Día cero = fecha de firma.
  intake: (proyectoId: number, fecha_objetivo: string, contrato?: File | null,
           fechas?: { fecha_firma?: string; fecha_envio?: string }) => {
    const fd = new FormData()
    fd.append('fecha_objetivo', fecha_objetivo)
    if (contrato) fd.append('contrato', contrato)
    if (fechas?.fecha_firma) fd.append('fecha_firma', fechas.fecha_firma)
    if (fechas?.fecha_envio) fd.append('fecha_envio', fechas.fecha_envio)
    return api
      .post<ApiResponse<{ ok: boolean; planNuevo: boolean }>>(`/schedule/proyecto/${proyectoId}/intake`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  recalcular: (proyectoId: number) =>
    api
      .post<ApiResponse<{ semaforo: string; holguraDias: number | null }>>(`/schedule/proyecto/${proyectoId}/recalcular`)
      .then((r) => r.data),

  // Mueve la fecha de entrega comprometida (decisión registrada).
  cambiarFechaObjetivo: (proyectoId: number, fecha_objetivo: string) =>
    api
      .post<ApiResponse<{ ok: boolean; anterior: string }>>(`/schedule/proyecto/${proyectoId}/fecha-objetivo`, { fecha_objetivo })
      .then((r) => r.data),

  crearPortalToken: (proyectoId: number, contacto_nombre?: string) =>
    api
      .post<ApiResponse<{ token: string }>>(`/schedule/proyecto/${proyectoId}/portal-token`, { contacto_nombre })
      .then((r) => r.data),

  registrarHito: (proyectoId: number, codigo: string, fecha: string | null, nota?: string, importe?: number) =>
    api
      .post<ApiResponse<{ ok: boolean }>>(`/schedule/proyecto/${proyectoId}/hito/${codigo}/registrar`, { fecha, nota, importe })
      .then((r) => r.data),

  // Lista los submittals (planos enviados) del proyecto, con URL firmada — para
  // que el equipo interno pueda ver lo que se le mandó al cliente.
  getSubmittals: (proyectoId: number) =>
    api
      .get<ApiResponse<{ id: number; version_label: string; original_name: string | null; estado: string; url: string | null }[]>>(
        `/schedule/proyecto/${proyectoId}/submittals`)
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

  uploadArchivoHito: (proyectoId: number, codigo: string, file: File, nota?: string) => {
    const fd = new FormData()
    fd.append('archivo', file)
    if (nota) fd.append('nota', nota)
    return api
      .post<ApiResponse<{ id: number }>>(`/schedule/proyecto/${proyectoId}/hito/${codigo}/archivo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },
}
