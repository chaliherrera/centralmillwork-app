import { kioskApi } from './kioskApi'
import type {
  KioskLoginResponse, KioskMe, KioskProyectoDisponible,
  KioskOrdenEnCola, KioskDia, KioskRegistroActivo, KioskProyectoActivo, KioskPausaActiva,
  KioskDocumento, KioskEstacionConfig, KioskAvanceFoto,
} from '@/types/kiosk'

export const kioskService = {
  // Auth
  login: (pin: string, dispositivo?: string) =>
    kioskApi.post<KioskLoginResponse>('/login', { pin, dispositivo }).then((r) => r.data),

  me: () =>
    kioskApi.get<KioskMe>('/me').then((r) => r.data),

  proyectosDisponibles: () =>
    kioskApi.get<{ data: KioskProyectoDisponible[] }>('/proyectos-disponibles').then((r) => r.data.data),

  miCola: () =>
    kioskApi.get<{ data: KioskOrdenEnCola[] }>('/mi-cola').then((r) => r.data.data),

  // Time tracking — clock
  clockIn: () =>
    kioskApi.post<{ data: KioskRegistroActivo; message: string }>('/time-tracking/clock-in')
      .then((r) => r.data),

  clockOut: () =>
    kioskApi.post<{ data: KioskRegistroActivo; message: string }>('/time-tracking/clock-out')
      .then((r) => r.data),

  // Time tracking — proyecto
  iniciarProyecto: (body: {
    proyecto_id: number
    estacion: string
    orden_produccion_id?: number | null
    descripcion?: string
  }) =>
    kioskApi.post<{ data: KioskProyectoActivo; message: string }>('/time-tracking/proyecto/iniciar', body)
      .then((r) => r.data),

  finalizarProyecto: () =>
    kioskApi.post<{ data: KioskProyectoActivo; message: string }>('/time-tracking/proyecto/finalizar')
      .then((r) => r.data),

  // Time tracking — pausa
  iniciarPausa: (motivo?: string) =>
    kioskApi.post<{ data: KioskPausaActiva; message: string }>('/time-tracking/pausa/iniciar', { motivo })
      .then((r) => r.data),

  finalizarPausa: () =>
    kioskApi.post<{ data: KioskPausaActiva; message: string }>('/time-tracking/pausa/finalizar')
      .then((r) => r.data),

  // Resumen del día del operario logueado
  dia: () =>
    kioskApi.get<{ data: KioskDia }>('/time-tracking/dia').then((r) => r.data.data),

  // Operario inicia/continúa el item asignado: abre time_proyectos linkeado.
  // El backend setea fecha_inicio si era el primer arranque, o sólo abre
  // segmento si era continuación. La respuesta incluye `era_primer_inicio`.
  iniciarItemOrden: (ordenId: number) =>
    kioskApi.post<{ data: { era_primer_inicio: boolean }; message: string }>(
      `/ordenes/${ordenId}/iniciar-item`
    ).then((r) => r.data),

  // Operario completa proceso de una orden
  completarProcesoOrden: (ordenId: number, notas?: string) =>
    kioskApi.post<{ data: { siguiente_estacion: string | null; status: string }; message: string }>(
      `/ordenes/${ordenId}/completar-proceso`, { notas }
    ).then((r) => r.data),

  // Documentos visibles para el operario (filtrados a su estación + generales)
  documentosOrden: (ordenId: number) =>
    kioskApi.get<{ data: KioskDocumento[] }>(`/ordenes/${ordenId}/documentos`)
      .then((r) => r.data.data),

  // Config de estaciones — qué estaciones requieren foto antes de completar.
  // Cacheable en el cliente (cambia rara vez).
  estacionesConfig: () =>
    kioskApi.get<{ data: KioskEstacionConfig[] }>('/estaciones-config')
      .then((r) => r.data.data),

  // Fotos de avance previas de una orden (read-only desde el kiosko).
  avanceFotosOrden: (ordenId: number) =>
    kioskApi.get<{ data: KioskAvanceFoto[] }>(`/ordenes/${ordenId}/avance-fotos`)
      .then((r) => r.data.data),

  // Sube una foto de avance. La cámara nativa del iPad la entrega como File.
  uploadAvanceFoto: (ordenId: number, archivo: File, comentario?: string) => {
    const form = new FormData()
    form.append('archivo', archivo)
    if (comentario) form.append('comentario', comentario)
    return kioskApi.post<{ data: KioskAvanceFoto; message: string }>(
      `/ordenes/${ordenId}/avance-foto`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ).then((r) => r.data)
  },
}
