import { kioskApi } from './kioskApi'
import type {
  KioskLoginResponse, KioskMe, KioskProyectoDisponible,
  KioskOrdenEnCola, KioskDia, KioskRegistroActivo, KioskProyectoActivo, KioskPausaActiva,
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

  // Operario completa proceso de una orden
  completarProcesoOrden: (ordenId: number, notas?: string) =>
    kioskApi.post<{ data: { siguiente_estacion: string | null; status: string }; message: string }>(
      `/ordenes/${ordenId}/completar-proceso`, { notas }
    ).then((r) => r.data),
}
