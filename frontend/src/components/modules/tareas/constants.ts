import type { Tarea, TareaArea, TareaPriority, TareaEstado } from '@/types'

// Pigmentos de marca: oak/walnut/mahogany/forest. Una paleta tipo madera
// trabajada — coherente entre áreas y preparada para el Glass theme futuro.
export const AREA_META: Record<TareaArea, {
  label: string
  short: string
  color: string
  bg: string
}> = {
  procurement:    { label: 'Procurement',     short: 'PROC', color: '#4A5240', bg: '#EDEFEA' },
  despachos:      { label: 'Despachos',       short: 'DESP', color: '#5C4A3A', bg: '#F1ECE5' },
  recepcion:      { label: 'Recepción',       short: 'RCPN', color: '#8A3F1E', bg: '#F8ECE5' },
  administracion: { label: 'Administración',  short: 'ADMN', color: '#9B7200', bg: '#F8F1DC' },
  shop_manager:   { label: 'Shop Manager',    short: 'SHOP', color: '#2c3126', bg: '#E8EAE4' },
}

export const PRIORITY_META: Record<TareaPriority, {
  label: string
  color: string
  bg: string
  dot: string
}> = {
  high:   { label: 'Alta',   color: '#9F3818', bg: '#FBEEE7', dot: '#B5421E' },
  medium: { label: 'Media',  color: '#7d5c00', bg: '#FAF3DD', dot: '#dea832' },
  low:    { label: 'Baja',   color: '#6B6B6B', bg: '#F2F2EF', dot: '#A8A8A8' },
}

export const ESTADO_META: Record<TareaEstado, { label: string }> = {
  pendiente:   { label: 'Pendiente' },
  en_progreso: { label: 'En curso' },
  completada:  { label: 'Hecho' },
  descartada:  { label: 'Descartada' },
}

// Cycle hacia adelante en click. Click derecho retrocede (futuro).
export const ESTADO_NEXT: Record<TareaEstado, TareaEstado> = {
  pendiente:   'en_progreso',
  en_progreso: 'completada',
  completada:  'pendiente',
  descartada:  'pendiente',
}

// Cycle de prioridad para shortcut 'p'.
export const PRIORITY_NEXT: Record<TareaPriority, TareaPriority> = {
  low:    'medium',
  medium: 'high',
  high:   'low',
}

export interface TareaGroup {
  code: string | null    // null = sin proyecto
  tareas: Tarea[]
}

// Agrupa tareas por código de proyecto (XX-XXX detectado en subject).
// Sort: códigos numéricos desc, "Sin proyecto" al final.
const NO_PROJECT_KEY = '__none__'
export function groupByProject(tareas: Tarea[]): TareaGroup[] {
  const map = new Map<string, Tarea[]>()
  for (const t of tareas) {
    const code = extractProjectCode(t.subject)
    const key = code ?? NO_PROJECT_KEY
    const arr = map.get(key) ?? []
    arr.push(t)
    map.set(key, arr)
  }
  const groups: TareaGroup[] = []
  const codes = Array.from(map.keys()).filter((k) => k !== NO_PROJECT_KEY).sort().reverse()
  for (const code of codes) {
    groups.push({ code, tareas: map.get(code)! })
  }
  if (map.has(NO_PROJECT_KEY)) {
    groups.push({ code: null, tareas: map.get(NO_PROJECT_KEY)! })
  }
  return groups
}

// Extrae el código de proyecto del subject (formato XX-XXX).
// Devuelve null si no encuentra (la tarea va al grupo "Sin proyecto").
const PROJECT_CODE_RE = /\b(\d{2}-\d{3})\b/
export function extractProjectCode(subject: string | null | undefined): string | null {
  if (!subject) return null
  const m = subject.match(PROJECT_CODE_RE)
  return m ? m[1] : null
}

// Acorta "sergio@centralmillwork.com" → "@sergio"
export function shortSender(email: string | null | undefined): string {
  if (!email) return 'desconocido'
  const local = email.split('@')[0]
  return `@${local}`
}

// Mapea source_ref de tareas de sistema a un label humano.
// Format esperado: 'rule-key:entity_id' — ej 'eta-today:1234'
export function ruleLabel(sourceRef: string | null | undefined): string {
  if (!sourceRef) return 'Sistema'
  const prefix = sourceRef.split(':')[0]
  const labels: Record<string, string> = {
    'quote-stale':   'Cotización estancada',
    'eta-today':     'ETA hoy',
    'eta-overdue':   'ETA vencida',
    'partial-stale': 'Parcial sin movimiento',
  }
  return labels[prefix] ?? prefix
}

// "hace 2h" / "hace 3d" / "ahora" — sin libs externas, mínimo.
export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'ahora'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)}d`
  const date = new Date(iso)
  return date.toLocaleDateString('es', { day: 'numeric', month: 'short' })
}
