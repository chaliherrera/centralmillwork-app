import type { TareaArea, TareaPriority, TareaEstado } from '@/types'

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
