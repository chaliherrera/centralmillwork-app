import { UserRole } from '../types'
import type { IconName } from '../ui/Icon'

// ─────────────────────────────────────────────────────────────────────────────
// Mapa rol → módulos del móvil, agrupados por ÁREA (departamento). El Home muestra
// las ÁREAS que el rol puede usar; al entrar a un área se ven sus módulos.
// Así se van sumando áreas (Producción, PM, Estimados…) sin saturar el inicio.
// La SEGURIDAD real vive en el backend (requireRole); esto solo decide qué se OFRECE.
//
// `offline`: cómo se comporta el módulo sin señal (candado/estado):
//   full → consultar/escribir sin señal, sincroniza solo · draft → borrador y envía
//   al reconectar · online → requiere señal (compras: plata + numeración correlativa)
// ─────────────────────────────────────────────────────────────────────────────

export type OfflineMode = 'full' | 'draft' | 'online'
export type AreaKey = 'compras' | 'instalaciones'

export type RouteName =
  | 'Recepciones' | 'Buscar' | 'Instalacion'
  | 'MaterialesMto' | 'ControlMto' | 'OrdenesCompra' | 'Proyectos'

export interface Modulo {
  id: RouteName
  route: RouteName
  area: AreaKey
  label: string
  descripcion: string
  icon: IconName
  roles: UserRole[]
  offline: OfflineMode
}

export interface Area {
  key: AreaKey
  label: string
  descripcion: string
  icon: IconName
}

// Áreas en orden de aparición en el Home.
export const AREAS: Area[] = [
  { key: 'compras', label: 'Compras', descripcion: 'Recepciones, OCs, materiales, proyectos y búsqueda', icon: 'truck' },
  { key: 'instalaciones', label: 'Instalaciones', descripcion: 'Check-in, ítems, punch list y entrega en obra', icon: 'hammer' },
]

// Orden = orden dentro del área.
export const MODULOS: Modulo[] = [
  { id: 'Recepciones', route: 'Recepciones', area: 'compras', label: 'Recepciones', descripcion: 'Recibir OCs en sitio', icon: 'download', offline: 'draft', roles: ['ADMIN', 'PROCUREMENT', 'SHOP_MANAGER', 'PRODUCTION', 'LOGISTICA'] },
  { id: 'OrdenesCompra', route: 'OrdenesCompra', area: 'compras', label: 'Órdenes de Compra', descripcion: 'Consultar y procesar OCs', icon: 'doc', offline: 'online', roles: ['ADMIN', 'PROCUREMENT'] },
  { id: 'MaterialesMto', route: 'MaterialesMto', area: 'compras', label: 'Materiales MTO', descripcion: 'Estado de materiales', icon: 'project', offline: 'full', roles: ['ADMIN', 'PROCUREMENT', 'SHOP_MANAGER'] },
  { id: 'ControlMto', route: 'ControlMto', area: 'compras', label: 'Control MTO', descripcion: 'Readiness por proyecto', icon: 'check', offline: 'full', roles: ['ADMIN', 'PROCUREMENT', 'SHOP_MANAGER', 'PRODUCTION', 'PROJECT_MANAGEMENT'] },
  { id: 'Proyectos', route: 'Proyectos', area: 'compras', label: 'Proyectos', descripcion: 'Estado de cada proyecto', icon: 'pin', offline: 'full', roles: ['ADMIN', 'PROJECT_MANAGEMENT', 'ENGINEERING', 'VIEWER'] },
  { id: 'Buscar', route: 'Buscar', area: 'compras', label: 'Buscar', descripcion: 'Material / OC por proyecto', icon: 'search', offline: 'full', roles: ['ADMIN', 'PROCUREMENT', 'SHOP_MANAGER', 'PRODUCTION', 'ENGINEERING', 'PROJECT_MANAGEMENT', 'FIELD', 'LOGISTICA', 'VIEWER'] },
  { id: 'Instalacion', route: 'Instalacion', area: 'instalaciones', label: 'Instalación', descripcion: 'Check-in, ítems, punch, firma', icon: 'hammer', offline: 'full', roles: ['ADMIN', 'PROJECT_MANAGEMENT', 'FIELD'] },
]

/** Módulos visibles para un rol dentro de un área, en orden. */
export function modulosDeArea(area: AreaKey, rol: UserRole | undefined): Modulo[] {
  if (!rol) return []
  return MODULOS.filter((m) => m.area === area && m.roles.includes(rol))
}

/** Áreas con al menos un módulo visible para el rol, con sus módulos. */
export function areasParaRol(rol: UserRole | undefined): { area: Area; modulos: Modulo[] }[] {
  if (!rol) return []
  return AREAS
    .map((area) => ({ area, modulos: modulosDeArea(area.key, rol) }))
    .filter((a) => a.modulos.length > 0)
}
