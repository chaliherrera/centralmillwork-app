import { api } from './api'
import { submitAction, OutboxAction } from './outbox'

// ─────────────────────────────────────────────────────────────────────────────
// Servicio Install — el Field Specialist releva la instalación desde el móvil.
// Las LECTURAS van directo al backend. Las ESCRITURAS de obra pasan por la outbox
// (submitAction): se intentan directo y, si no hay señal, se encolan y sincronizan
// al reconectar. Devuelven { queued } para que la UI avise.
// ─────────────────────────────────────────────────────────────────────────────

export interface InstallHito {
  codigo: string
  nombre: string
  fecha_real: string | null
  fecha_planeada: string | null
}

export interface InstallProyecto {
  proyecto_id: number
  codigo: string
  nombre: string
  cliente: string | null
  fecha_objetivo: string | null
  punch_abiertos: number
  items_total: number
  items_instalados: number
  hitos: InstallHito[]
}

export interface InstallItem {
  op_id: number
  numero_orden: string
  numero_item: string
  cantidad: number
  unidad: string | null
  op_status: string
  instalado: boolean
  foto_url: string | null
  nota: string | null
  instalado_at: string | null
}

export interface PunchItem {
  id: number
  descripcion: string
  area: string | null
  estado: string // 'abierto' | 'resuelto'
  foto_problema_url: string | null
  foto_resuelto_url: string | null
  nota_resuelto: string | null
  created_at: string
}

export interface PlanoItem {
  id: number
  filename: string
  original_name: string | null
  url: string | null
  created_at: string
}

export type SubmitResult = { queued: boolean; data?: any }

// UUID v4 (client_id = idempotency key). Math.random alcanza para deduplicar reenvíos.
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Arma una acción de la outbox con su client_id/client_ts.
function buildAction(
  kind: string, proyectoId: number, endpoint: string,
  fields: Record<string, string>, fileField?: string, fileUri?: string
): OutboxAction {
  const id = uuidv4()
  return {
    id, kind, proyecto_id: proyectoId, endpoint,
    file_field: fileField ?? null, file_uri: fileUri ?? null,
    fields: { ...fields, client_id: id, client_ts: new Date().toISOString() },
    created_at: Date.now(),
  }
}

export const scheduleService = {
  // ── LECTURAS (directo) ──────────────────────────────────────────────────────
  getInstallQueue: () =>
    api.get('/schedule/install-queue').then((r) => r.data.data as InstallProyecto[]),
  getPlan: (proyectoId: number) =>
    api.get(`/schedule/proyecto/${proyectoId}`).then((r) => r.data.data),
  getItems: (proyectoId: number) =>
    api.get(`/schedule/proyecto/${proyectoId}/items`).then((r) => r.data.data as InstallItem[]),
  getPunch: (proyectoId: number) =>
    api.get(`/schedule/proyecto/${proyectoId}/punch`).then((r) => r.data.data as PunchItem[]),
  getPlanos: (proyectoId: number, numeroItem: string) =>
    api.get(`/proyectos/${proyectoId}/items/${encodeURIComponent(numeroItem)}/planos`).then((r) => r.data.data as PlanoItem[]),

  // ── ESCRITURAS DE OBRA (outbox: directo o cola si no hay señal) ─────────────

  // Marcar un item como instalado (foto y nota opcionales).
  marcarItem: (proyectoId: number, opId: number, uri?: string, nota?: string): Promise<SubmitResult> => {
    const fields: Record<string, string> = {}
    if (nota) fields.nota = nota
    return submitAction(buildAction('instalar', proyectoId,
      `/schedule/proyecto/${proyectoId}/items/${opId}/instalar`, fields, uri ? 'foto' : undefined, uri))
  },

  // Deshacer instalación (no lleva archivo; sin cola — es correctivo y online).
  desmarcarItem: (proyectoId: number, opId: number) =>
    api.post(`/schedule/proyecto/${proyectoId}/items/${opId}/desmarcar`).then((r) => r.data),

  // Check-in (I-04) y avance (I-05): endpoint de obra (permiso FIELD). GPS opcional.
  registrarConFoto: (
    proyectoId: number, codigo: 'I-04' | 'I-05', uri: string,
    opts?: { nota?: string; gps?: { lat: number; lng: number } }
  ): Promise<SubmitResult> => {
    const fields: Record<string, string> = {}
    if (opts?.nota) fields.nota = opts.nota
    if (opts?.gps) { fields.lat = String(opts.gps.lat); fields.lng = String(opts.gps.lng) }
    return submitAction(buildAction(codigo === 'I-04' ? 'checkin' : 'avance', proyectoId,
      `/schedule/proyecto/${proyectoId}/hito/${codigo}/archivo-field`, fields, 'archivo', uri))
  },

  // Crear un ítem de punch list (foto opcional del problema).
  crearPunch: (proyectoId: number, descripcion: string, area?: string, uri?: string): Promise<SubmitResult> => {
    const fields: Record<string, string> = { descripcion }
    if (area) fields.area = area
    return submitAction(buildAction('punch_crear', proyectoId,
      `/schedule/proyecto/${proyectoId}/punch`, fields, uri ? 'foto' : undefined, uri))
  },

  // Resolver un ítem (foto y nota opcionales). Al cerrarse todos, I-06 se completa.
  resolverPunch: (proyectoId: number, itemId: number, uri?: string, nota?: string): Promise<SubmitResult> => {
    const fields: Record<string, string> = {}
    if (nota) fields.nota = nota
    return submitAction(buildAction('punch_resolver', proyectoId,
      `/schedule/punch/${itemId}/resolver`, fields, uri ? 'foto' : undefined, uri))
  },

  // Sign-off del cliente en obra (completa I-07). firma = PNG local.
  signoff: (proyectoId: number, cliente?: string, uri?: string): Promise<SubmitResult> => {
    const fields: Record<string, string> = {}
    if (cliente) fields.cliente = cliente
    return submitAction(buildAction('signoff', proyectoId,
      `/schedule/proyecto/${proyectoId}/signoff`, fields, uri ? 'firma' : undefined, uri))
  },

  // Reporte de daño/faltante en obra → tarea al PM del proyecto.
  reporteObra: (proyectoId: number, descripcion: string, uri?: string): Promise<SubmitResult> => {
    const fields: Record<string, string> = { descripcion }
    return submitAction(buildAction('reporte', proyectoId,
      `/schedule/proyecto/${proyectoId}/reporte-obra`, fields, uri ? 'foto' : undefined, uri))
  },
}
