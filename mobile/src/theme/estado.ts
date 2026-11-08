// ─────────────────────────────────────────────────────────────────────────────
// Estado → (color del vocabulario fijo + palabra). Fuente única que reemplaza
// COLOR / BADGE / ESTADO_BADGE / EST_COLOR / STATE_COLORS duplicados por pantalla.
// Vocabulario fijo (SISTEMA_DE_DISENO.md §4):
//   verde = completado/resuelto · dorado = pendiente/en curso ·
//   coral = bloqueado/dañado/vencido · gris = inactivo/cancelado/archivado
// Defensivo: un estado desconocido NUNCA rompe — cae en dorado + Título.
// ─────────────────────────────────────────────────────────────────────────────
import { color } from './tokens'

export interface EstadoInfo { color: string; label: string }

/** Normaliza: MAYÚSCULAS, sin acentos, espacios/guiones → '_'. */
function norm(raw: string): string {
  return raw
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca acentos
    .trim().toUpperCase().replace(/[\s-]+/g, '_')
}

// Mapa por estado normalizado. label = palabra exacta a mostrar.
const MAP: Record<string, EstadoInfo> = {
  // verde — terminal / completado
  LISTO: { color: color.green, label: 'Listo' },
  RECIBIDO: { color: color.green, label: 'Recibido' },
  EN_STOCK: { color: color.green, label: 'En stock' },
  COMPLETADO: { color: color.green, label: 'Completado' },
  RESUELTO: { color: color.green, label: 'Resuelto' },
  ENTREGADO: { color: color.green, label: 'Entregado' },
  EN_EL_TALLER: { color: color.green, label: 'En el taller' },
  FIRMADA: { color: color.green, label: 'Firmada' },
  // dorado — pendiente / en curso
  PENDIENTE: { color: color.gold, label: 'Pendiente' },
  EN_CURSO: { color: color.gold, label: 'En curso' },
  COTIZADO: { color: color.gold, label: 'Cotizado' },
  ORDENADO: { color: color.gold, label: 'Ordenado' },
  EN_TRANSITO: { color: color.gold, label: 'En tránsito' },
  PARCIAL: { color: color.gold, label: 'Parcial' },
  ABIERTO: { color: color.gold, label: 'Abierto' },
  ACTIVO: { color: color.gold, label: 'Activo' },
  INGENIERIA: { color: color.gold, label: 'Ingeniería' },
  PRODUCCION: { color: color.gold, label: 'Producción' },
  // coral — bloqueado / daño / vencido
  BLOQUEADO: { color: color.coral, label: 'Bloqueado' },
  DANADO: { color: color.coral, label: 'Dañado' },
  DANO: { color: color.coral, label: 'Dañado' },
  FALTANTE: { color: color.coral, label: 'Faltante' },
  VENCIDO: { color: color.coral, label: 'Vencido' },
  // gris — inactivo / cerrado
  INACTIVO: { color: color.grey, label: 'Inactivo' },
  CANCELADA: { color: color.grey, label: 'Cancelada' },
  CANCELADO: { color: color.grey, label: 'Cancelado' },
  ARCHIVADO: { color: color.grey, label: 'Archivado' },
}

/** Título con la primera en mayúscula (fallback legible para estados no mapeados). */
function titleCase(raw: string): string {
  const s = raw.replace(/_/g, ' ').toLowerCase().trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function estadoInfo(raw?: string | null): EstadoInfo {
  if (!raw) return { color: color.grey, label: '—' }
  return MAP[norm(raw)] ?? { color: color.gold, label: titleCase(raw) }
}
