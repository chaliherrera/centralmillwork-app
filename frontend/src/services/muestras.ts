import api from './api'
import type {
  Muestra, MuestrasListResp, MuestraDetalle, MuestrasKpis,
  CreateMuestraInput, TransicionInput, RegistrarEnvioInput,
  MuestraEstado,
} from '@/types/muestras'

interface ListFilters {
  estado?: MuestraEstado | MuestraEstado[]
  proyecto_id?: number
  owner_id?: string
  incluir_archivadas?: boolean
}

export const muestrasService = {
  list: (filters?: ListFilters) =>
    api.get<{ data: MuestrasListResp }>('/muestras', {
      params: {
        estado: Array.isArray(filters?.estado)
          ? filters?.estado.join(',')
          : filters?.estado,
        proyecto_id: filters?.proyecto_id,
        owner_id: filters?.owner_id,
        incluir_archivadas: filters?.incluir_archivadas ? 'true' : undefined,
      },
    }).then((r) => r.data.data),

  kpis: () =>
    api.get<{ data: MuestrasKpis }>('/muestras/kpis').then((r) => r.data.data),

  get: (id: number) =>
    api.get<{ data: MuestraDetalle }>(`/muestras/${id}`).then((r) => r.data.data),

  create: (body: CreateMuestraInput) =>
    api.post<{ data: Muestra; message: string }>('/muestras', body).then((r) => r.data),

  update: (id: number, body: Partial<Muestra>) =>
    api.patch<{ data: Muestra; message: string }>(`/muestras/${id}`, body).then((r) => r.data),

  transicion: (id: number, body: TransicionInput) =>
    api.post<{ data: Muestra; message: string }>(`/muestras/${id}/transicion`, body).then((r) => r.data),

  registrarEnvio: (id: number, body: RegistrarEnvioInput) =>
    api.post<{ message: string }>(`/muestras/${id}/envios`, body).then((r) => r.data),

  confirmarRecepcion: (id: number, envioId: number, fecha: string) =>
    api.patch<{ message: string }>(
      `/muestras/${id}/envios/${envioId}/recepcion`,
      { fecha_recepcion_confirmada: fecha }
    ).then((r) => r.data),

  /**
   * Sube un archivo (PDF de sample request, foto, DWG) a la muestra.
   * tipo: 'sample_request' | 'foto' | 'pdf' | 'dwg' | 'otro'
   * versionNumero: opcional, default es la version_actual de la muestra
   */
  uploadArchivo: (id: number, file: File, tipo: string, versionNumero?: number, nombre?: string) => {
    const form = new FormData()
    form.append('archivo', file)
    form.append('tipo', tipo)
    if (versionNumero) form.append('version_numero', String(versionNumero))
    if (nombre) form.append('nombre', nombre)
    return api.post<{ message: string }>(
      `/muestras/${id}/archivos`, form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ).then((r) => r.data)
  },

  deleteArchivo: (id: number, archivoId: number) =>
    api.delete<{ message: string }>(`/muestras/${id}/archivos/${archivoId}`).then((r) => r.data),

  // ─── Fase 2 — UI Procurement (endpoints del módulo modules/muestras/) ────
  ocsStatus: (id: number) =>
    api.get<{ data: MuestraOCsStatus }>(`/muestras/${id}/ocs-status`).then((r) => r.data.data),

  marcarSinCompras: (id: number, motivo?: string) =>
    api.post<{ data: MuestraOCsStatus; message: string }>(
      `/muestras/${id}/sin-compras`,
      { motivo }
    ).then((r) => r.data),

  // ─── Fase 3 — Iniciar fabricación con procesos pre-llenados ─────────────
  procesosDefault: (id: number) =>
    api.get<{ data: ProcesosDefaultResp }>(`/muestras/${id}/procesos-default`)
       .then((r) => r.data.data),

  iniciarFabricacion: (id: number, body: IniciarFabricacionInput) =>
    api.post<{ data: IniciarFabricacionResult; message: string }>(
      `/muestras/${id}/iniciar-fabricacion`, body
    ).then((r) => r.data),
}

export interface ProcesoDefault {
  secuencia: number
  estacion: string
  tiempo_estimado_minutos: number
}
export interface ProcesosDefaultResp {
  muestra_id: number
  codigo: string
  tipo: string
  procesos: ProcesoDefault[]
}
export interface ProcesoInput {
  estacion: string
  tiempo_estimado_minutos?: number | null
  operador_id?: number | null
}
export interface IniciarFabricacionInput {
  procesos: ProcesoInput[]
  notas?: string | null
}
export interface IniciarFabricacionResult {
  op_id: number
  op_numero: string
  procesos_creados: number
  muestra: {
    id: number
    estado: string
    version_actual: number
  }
}

/** Devuelto por GET /api/muestras/:id/ocs-status (Fase 2). */
export interface MuestraOCsStatus {
  total: number
  recibidas: number
  pendientes: Array<{ id: number; numero: string; estado: string }>
  puede_fabricar: boolean
  sin_compras_marcado: boolean
}
