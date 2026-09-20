import { UserRole } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Mapa rol → módulos del móvil. Fuente única para armar el Home por rol.
// Espeja el patrón de la web (frontend/src/components/layout/Sidebar.tsx: NAV_ITEMS
// con `roles`). La SEGURIDAD real vive en el backend (requireRole); esto solo decide
// qué se le OFRECE a cada rol en la pantalla de inicio.
//
// `offline` describe cómo se comporta el módulo sin señal (para mostrar candado/estado):
//   full   → consultar y/o escribir sin señal, sincroniza solo (obra)
//   draft  → se guarda como borrador y se envía al reconectar (recepciones)
//   online → requiere señal (compras: tocan plata y numeración correlativa)
// ─────────────────────────────────────────────────────────────────────────────

export type OfflineMode = 'full' | 'draft' | 'online'

// Nombres de las pantallas registradas en el navigator (src/navigation).
export type RouteName =
  | 'Recepciones'
  | 'Buscar'
  | 'Instalacion'
  | 'MaterialesMto'
  | 'ControlMto'
  | 'OrdenesCompra'
  | 'Proyectos'

export interface Modulo {
  id: RouteName
  route: RouteName
  label: string
  descripcion: string
  icon: string          // emoji
  roles: UserRole[]
  offline: OfflineMode
}

// Orden = orden de aparición en el Home.
export const MODULOS: Modulo[] = [
  {
    id: 'Recepciones', route: 'Recepciones',
    label: 'Recepciones', descripcion: 'Recibir OCs en sitio',
    icon: '📥', offline: 'draft',
    roles: ['ADMIN', 'PROCUREMENT', 'SHOP_MANAGER', 'PRODUCTION', 'LOGISTICA'],
  },
  {
    id: 'OrdenesCompra', route: 'OrdenesCompra',
    label: 'Órdenes de Compra', descripcion: 'Consultar y procesar OCs',
    icon: '🧾', offline: 'online',
    roles: ['ADMIN', 'PROCUREMENT'],
  },
  {
    id: 'MaterialesMto', route: 'MaterialesMto',
    label: 'Materiales MTO', descripcion: 'Estado de materiales',
    icon: '📦', offline: 'full',
    roles: ['ADMIN', 'PROCUREMENT', 'SHOP_MANAGER'],
  },
  {
    id: 'ControlMto', route: 'ControlMto',
    label: 'Control MTO', descripcion: 'Readiness por proyecto',
    icon: '📊', offline: 'full',
    roles: ['ADMIN', 'PROCUREMENT', 'SHOP_MANAGER', 'PRODUCTION', 'PROJECT_MANAGEMENT'],
  },
  {
    id: 'Proyectos', route: 'Proyectos',
    label: 'Proyectos', descripcion: 'Estado de cada proyecto',
    icon: '🏗️', offline: 'full',
    roles: ['ADMIN', 'PROJECT_MANAGEMENT', 'ENGINEERING', 'VIEWER'],
  },
  {
    id: 'Instalacion', route: 'Instalacion',
    label: 'Instalación', descripcion: 'Check-in, ítems, punch, firma',
    icon: '🔧', offline: 'full',
    roles: ['ADMIN', 'PROJECT_MANAGEMENT', 'FIELD'],
  },
  {
    id: 'Buscar', route: 'Buscar',
    label: 'Buscar', descripcion: 'Material / OC por proyecto',
    icon: '🔍', offline: 'full',
    roles: ['ADMIN', 'PROCUREMENT', 'SHOP_MANAGER', 'PRODUCTION', 'ENGINEERING', 'PROJECT_MANAGEMENT', 'FIELD', 'LOGISTICA', 'VIEWER'],
  },
]

/** Módulos visibles para un rol, en orden de Home. */
export function modulosParaRol(rol: UserRole | undefined): Modulo[] {
  if (!rol) return []
  return MODULOS.filter((m) => m.roles.includes(rol))
}
