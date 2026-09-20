import { api } from './api'

// ─────────────────────────────────────────────────────────────────────────────
// Servicio Install — el Field Specialist releva la instalación desde el móvil.
// Endpoints en backend/src/modules/schedule (mismo backend de producción).
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

// ── Metadata de la cola offline ──────────────────────────────────────────────
// client_id = idempotency key (un reenvío no duplica). client_ts = hora real de la
// acción en obra. Se mandan siempre; cuando exista la outbox, se generan al encolar.
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
function withClientMeta(fd: FormData, clientId?: string, clientTs?: string): FormData {
  fd.append('client_id', clientId ?? uuidv4())
  fd.append('client_ts', clientTs ?? new Date().toISOString())
  return fd
}

/** Arma el multipart de una foto local (file://) para subir. */
function fotoPart(uri: string, field: string): FormData {
  const fd = new FormData()
  const filename = uri.split('/').pop() || `foto_${Date.now()}.jpg`
  const ext = (/\.(\w+)$/.exec(filename)?.[1] || 'jpg').toLowerCase()
  fd.append(field, { uri, name: filename, type: ext === 'png' ? 'image/png' : 'image/jpeg' } as any)
  return fd
}

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 }

export const scheduleService = {
  // Lista de proyectos en ventana de instalación (entrega pendiente).
  getInstallQueue: () =>
    api.get('/schedule/install-queue').then((r) => r.data.data as InstallProyecto[]),

  // Todos los hitos de un proyecto (para el detalle).
  getPlan: (proyectoId: number) =>
    api.get(`/schedule/proyecto/${proyectoId}`).then((r) => r.data.data),

  // Items a instalar del proyecto (derivados de las OPs).
  getItems: (proyectoId: number) =>
    api.get(`/schedule/proyecto/${proyectoId}/items`).then((r) => r.data.data as InstallItem[]),

  // Planos por ítem del proyecto (se ven en obra).
  getPlanos: (proyectoId: number, numeroItem: string) =>
    api.get(`/proyectos/${proyectoId}/items/${encodeURIComponent(numeroItem)}/planos`).then((r) => r.data.data as PlanoItem[]),

  // Marcar un item como instalado (foto y nota opcionales).
  marcarItem: (proyectoId: number, opId: number, uri?: string, nota?: string) => {
    const fd = uri ? fotoPart(uri, 'foto') : new FormData()
    if (nota) fd.append('nota', nota)
    withClientMeta(fd)
    return api.post(`/schedule/proyecto/${proyectoId}/items/${opId}/instalar`, fd, MULTIPART).then((r) => r.data)
  },

  // Deshacer la instalación de un item.
  desmarcarItem: (proyectoId: number, opId: number) =>
    api.post(`/schedule/proyecto/${proyectoId}/items/${opId}/desmarcar`).then((r) => r.data),

  // Punch list del proyecto.
  getPunch: (proyectoId: number) =>
    api.get(`/schedule/proyecto/${proyectoId}/punch`).then((r) => r.data.data as PunchItem[]),

  // Check-in (I-04) y avance (I-05): endpoint de obra (permiso FIELD). GPS opcional.
  registrarConFoto: (
    proyectoId: number, codigo: 'I-04' | 'I-05', uri: string,
    opts?: { nota?: string; gps?: { lat: number; lng: number } }
  ) => {
    const fd = fotoPart(uri, 'archivo')
    if (opts?.nota) fd.append('nota', opts.nota)
    if (opts?.gps) { fd.append('lat', String(opts.gps.lat)); fd.append('lng', String(opts.gps.lng)) }
    withClientMeta(fd)
    return api.post(`/schedule/proyecto/${proyectoId}/hito/${codigo}/archivo-field`, fd, MULTIPART).then((r) => r.data)
  },

  // Crear un ítem de punch list (foto opcional del problema).
  crearPunch: (proyectoId: number, descripcion: string, area?: string, uri?: string) => {
    const fd = uri ? fotoPart(uri, 'foto') : new FormData()
    fd.append('descripcion', descripcion)
    if (area) fd.append('area', area)
    withClientMeta(fd)
    return api.post(`/schedule/proyecto/${proyectoId}/punch`, fd, MULTIPART).then((r) => r.data)
  },

  // Resolver un ítem (foto y nota opcionales). Al cerrarse todos, I-06 se completa.
  resolverPunch: (itemId: number, uri?: string, nota?: string) => {
    const fd = uri ? fotoPart(uri, 'foto') : new FormData()
    if (nota) fd.append('nota', nota)
    withClientMeta(fd)
    return api.post(`/schedule/punch/${itemId}/resolver`, fd, MULTIPART).then((r) => r.data)
  },

  // Sign-off del cliente en obra (completa I-07 = entrega). firma = PNG local.
  signoff: (proyectoId: number, cliente?: string, uri?: string) => {
    const fd = uri ? fotoPart(uri, 'firma') : new FormData()
    if (cliente) fd.append('cliente', cliente)
    withClientMeta(fd)
    return api.post(`/schedule/proyecto/${proyectoId}/signoff`, fd, MULTIPART).then((r) => r.data)
  },

  // Reporte de daño/faltante en obra → tarea al PM del proyecto.
  reporteObra: (proyectoId: number, descripcion: string, uri?: string) => {
    const fd = uri ? fotoPart(uri, 'foto') : new FormData()
    fd.append('descripcion', descripcion)
    withClientMeta(fd)
    return api.post(`/schedule/proyecto/${proyectoId}/reporte-obra`, fd, MULTIPART).then((r) => r.data)
  },
}
