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
}
