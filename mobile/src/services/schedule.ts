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
  hitos: InstallHito[]
}

export interface PunchItem {
  id: number
  descripcion: string
  area: string | null
  estado: string // 'abierto' | 'resuelto'
  foto_problema_url: string | null
  foto_resuelto_url: string | null
  created_at: string
}

/** Arma el multipart de una foto local (file://) para subir. */
function fotoPart(uri: string, field: string): FormData {
  const fd = new FormData()
  const filename = uri.split('/').pop() || `foto_${Date.now()}.jpg`
  const ext = (/\.(\w+)$/.exec(filename)?.[1] || 'jpg').toLowerCase()
  fd.append(field, { uri, name: filename, type: ext === 'png' ? 'image/png' : 'image/jpeg' } as any)
  return fd
}

export const scheduleService = {
  // Lista de proyectos en ventana de instalación (entrega pendiente).
  getInstallQueue: () =>
    api.get('/schedule/install-queue').then((r) => r.data.data as InstallProyecto[]),

  // Todos los hitos de un proyecto (para el detalle).
  getPlan: (proyectoId: number) =>
    api.get(`/schedule/proyecto/${proyectoId}`).then((r) => r.data.data),

  // Punch list del proyecto.
  getPunch: (proyectoId: number) =>
    api.get(`/schedule/proyecto/${proyectoId}/punch`).then((r) => r.data.data as PunchItem[]),

  // Check-in (I-04) y avance (I-05): reusan el endpoint de archivo/foto del hito.
  registrarConFoto: (proyectoId: number, codigo: 'I-04' | 'I-05', uri: string, nota?: string) => {
    const fd = fotoPart(uri, 'archivo')
    if (nota) fd.append('nota', nota)
    return api
      .post(`/schedule/proyecto/${proyectoId}/hito/${codigo}/archivo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      })
      .then((r) => r.data)
  },

  // Crear un ítem de punch list (foto opcional del problema).
  crearPunch: (proyectoId: number, descripcion: string, area?: string, uri?: string) => {
    const fd = uri ? fotoPart(uri, 'foto') : new FormData()
    fd.append('descripcion', descripcion)
    if (area) fd.append('area', area)
    return api
      .post(`/schedule/proyecto/${proyectoId}/punch`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      })
      .then((r) => r.data)
  },

  // Resolver un ítem (foto opcional de resuelto). Al cerrarse todos, I-06 se completa.
  resolverPunch: (itemId: number, uri?: string) => {
    const fd = uri ? fotoPart(uri, 'foto') : new FormData()
    return api
      .post(`/schedule/punch/${itemId}/resolver`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      })
      .then((r) => r.data)
  },

  // Sign-off del cliente en obra (completa I-07 = entrega).
  signoff: (proyectoId: number, cliente?: string, uri?: string) => {
    const fd = uri ? fotoPart(uri, 'firma') : new FormData()
    if (cliente) fd.append('cliente', cliente)
    return api
      .post(`/schedule/proyecto/${proyectoId}/signoff`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      })
      .then((r) => r.data)
  },
}
