import type { ItemReadinessMaterial } from '@/services/proyectos'

// Helpers PUROS compartidos entre la pestaña del proyecto y el informe público.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function fmtFecha(d?: string | null): string | null {
  if (!d) return null
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number)
  if (!y || !m || !dd) return null
  return `${String(dd).padStart(2, '0')} ${MESES[m - 1]} ${y}`
}
export function diasHastaHoy(d: string): number {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const t = new Date(String(d).slice(0, 10) + 'T00:00:00')
  return Math.round((t.getTime() - hoy.getTime()) / 86_400_000)
}
export function diasTxt(n: number): string {
  if (n === 0) return 'hoy'
  if (n === 1) return 'mañana'
  if (n === -1) return 'ayer'
  return n > 0 ? `en ${n} días` : `hace ${Math.abs(n)} días`
}

export type LtTipo = 'recibido' | 'en_camino' | 'vencida' | 'por_ordenar' | 'stock' | 'propio'
export const LT_RANK: Record<LtTipo, number> = { vencida: 0, por_ordenar: 1, en_camino: 2, stock: 3, recibido: 4, propio: 5 }

export interface Lt { tipo: LtTipo; texto: string }
export function leadTime(m: ItemReadinessMaterial): Lt {
  if (m.cotizar === 'NO') return { tipo: 'propio', texto: 'Lo fabricamos nosotros' }
  switch (m.estado_cotiz) {
    case 'EN_STOCK': return { tipo: 'stock', texto: 'En stock' }
    case 'RECIBIDO': {
      const f = fmtFecha(m.llegada_real)
      return { tipo: 'recibido', texto: f ? `Llegó ${f}` : 'Recibido' }
    }
    case 'ORDENADO': {
      const eta = m.oc_fecha_entrega
      if (!eta) return { tipo: 'en_camino', texto: 'En camino · sin ETA' }
      const d = diasHastaHoy(eta)
      if (d < 0) return { tipo: 'vencida', texto: `ETA vencida ${fmtFecha(eta)} · ${diasTxt(d)}` }
      return { tipo: 'en_camino', texto: `Llega ~${fmtFecha(eta)} · ${diasTxt(d)}` }
    }
    case 'COTIZADO': return { tipo: 'por_ordenar', texto: 'Cotizado · falta emitir OC' }
    default: return { tipo: 'por_ordenar', texto: 'Falta cotizar / ordenar' }
  }
}
export const LT_CLASS: Record<LtTipo, string> = {
  recibido: 'text-emerald-600', en_camino: 'text-blue-600', vencida: 'text-red-600 font-semibold',
  por_ordenar: 'text-amber-600', stock: 'text-slate-500', propio: 'text-violet-600',
}

export function estadoBadge(m: ItemReadinessMaterial): { label: string; cls: string } {
  if (m.cotizar === 'NO') return { label: 'Propio', cls: 'bg-violet-100 text-violet-700' }
  switch (m.estado_cotiz) {
    case 'RECIBIDO': return { label: 'Recibido', cls: 'bg-emerald-100 text-emerald-700' }
    case 'EN_STOCK': return { label: 'En stock', cls: 'bg-slate-100 text-slate-600' }
    case 'ORDENADO':
      return (m.cantidad_recibida != null && Number(m.cantidad_recibida) > 0)
        ? { label: 'En tránsito', cls: 'bg-blue-100 text-blue-700' }
        : { label: 'Ordenado', cls: 'bg-purple-100 text-purple-700' }
    case 'COTIZADO': return { label: 'Cotizado', cls: 'bg-amber-100 text-amber-700' }
    default: return { label: 'Pendiente', cls: 'bg-red-100 text-red-700' }
  }
}

export const ITEM_ESTADO: Record<string, { label: string; cls: string; border: string }> = {
  LISTO:       { label: 'Listo',       cls: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-200' },
  PARCIAL:     { label: 'Parcial',     cls: 'bg-yellow-100 text-yellow-700',   border: 'border-yellow-200' },
  EN_TRANSITO: { label: 'En tránsito', cls: 'bg-blue-100 text-blue-700',       border: 'border-blue-200' },
  ORDENADO:    { label: 'Ordenado',    cls: 'bg-purple-100 text-purple-700',   border: 'border-purple-200' },
  PENDIENTE:   { label: 'Pendiente',   cls: 'bg-red-100 text-red-700',         border: 'border-red-200' },
}

export const noteKey = (item: string | null, material_id: number | null) => `${item ?? ''}|${material_id ?? ''}`
