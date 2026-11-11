import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  ChevronDown, ChevronRight, Hammer, Package, Pencil, Plus, StickyNote,
  ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react'
import { proyectosService } from '@/services/proyectos'
import type { ItemReadiness, ItemReadinessMaterial, InformeNota } from '@/services/proyectos'
import { useAuth } from '@/context/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// "Materiales por ítem" — vista híbrida Ítems × Por lote dentro del proyecto.
// Por cada material: estado, fecha de llegada / lead time, nota del sistema (app)
// y nota del INFORME (editable solo por ADMIN, guardada aparte de la app).
// ─────────────────────────────────────────────────────────────────────────────

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtFecha(d?: string | null): string | null {
  if (!d) return null
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number)
  if (!y || !m || !dd) return null
  return `${String(dd).padStart(2, '0')} ${MESES[m - 1]} ${y}`
}
function diasHastaHoy(d: string): number {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const t = new Date(String(d).slice(0, 10) + 'T00:00:00')
  return Math.round((t.getTime() - hoy.getTime()) / 86_400_000)
}
function diasTxt(n: number): string {
  if (n === 0) return 'hoy'
  if (n === 1) return 'mañana'
  if (n === -1) return 'ayer'
  return n > 0 ? `en ${n} días` : `hace ${Math.abs(n)} días`
}

type LtTipo = 'recibido' | 'en_camino' | 'vencida' | 'por_ordenar' | 'stock' | 'propio'
const LT_RANK: Record<LtTipo, number> = { vencida: 0, por_ordenar: 1, en_camino: 2, stock: 3, recibido: 4, propio: 5 }

interface Lt { tipo: LtTipo; texto: string }
function leadTime(m: ItemReadinessMaterial): Lt {
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
const LT_CLASS: Record<LtTipo, string> = {
  recibido: 'text-emerald-600', en_camino: 'text-blue-600', vencida: 'text-red-600 font-semibold',
  por_ordenar: 'text-amber-600', stock: 'text-slate-500', propio: 'text-violet-600',
}

function estadoBadge(m: ItemReadinessMaterial): { label: string; cls: string } {
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

const ITEM_ESTADO: Record<string, { label: string; cls: string; border: string }> = {
  LISTO:       { label: 'Listo',       cls: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-200' },
  PARCIAL:     { label: 'Parcial',     cls: 'bg-yellow-100 text-yellow-700',   border: 'border-yellow-200' },
  EN_TRANSITO: { label: 'En tránsito', cls: 'bg-blue-100 text-blue-700',       border: 'border-blue-200' },
  ORDENADO:    { label: 'Ordenado',    cls: 'bg-purple-100 text-purple-700',   border: 'border-purple-200' },
  PENDIENTE:   { label: 'Pendiente',   cls: 'bg-red-100 text-red-700',         border: 'border-red-200' },
}

const noteKey = (item: string | null, material_id: number | null) => `${item ?? ''}|${material_id ?? ''}`

// ─── Editor de nota del informe (inline) ─────────────────────────────────────
function NotaInforme({ proyectoId, item, material_id, texto, isAdmin, variant }: {
  proyectoId: number; item: string | null; material_id: number | null
  texto: string; isAdmin: boolean; variant: 'material' | 'item' | 'proyecto'
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(texto)
  useEffect(() => { setVal(texto) }, [texto])

  const mut = useMutation({
    mutationFn: (t: string) => proyectosService.putInformeNota(proyectoId, { item, material_id, texto: t }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proyecto-detalle', proyectoId, 'informe-notas'] }),
  })
  const save = () => { setEditing(false); if (val.trim() !== texto) mut.mutate(val.trim()) }

  const hasNote = !!texto
  const boxCls = variant === 'material'
    ? 'bg-cyan-50 border-l-2 border-cyan-400 text-cyan-900'
    : 'bg-cyan-50 border border-cyan-200 text-cyan-900'

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus value={val} onChange={(e) => setVal(e.target.value)} maxLength={500}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(texto); setEditing(false) } }}
          onBlur={save}
          placeholder="Nota (solo informe)…"
          className="flex-1 min-w-0 text-xs px-2 py-1 rounded border border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
        />
      </div>
    )
  }
  if (!hasNote) {
    if (!isAdmin) return null
    return (
      <button onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-cyan-600 border border-dashed border-gray-200 hover:border-cyan-300 rounded px-1.5 py-0.5">
        <Plus size={11} /> nota
      </button>
    )
  }
  return (
    <div className={clsx('flex items-start gap-1.5 text-xs rounded px-2 py-1', boxCls)}>
      <StickyNote size={12} className="mt-0.5 flex-shrink-0 opacity-60" />
      <span className="flex-1">{texto}</span>
      {isAdmin && (
        <button onClick={() => setEditing(true)} className="flex-shrink-0 text-cyan-500 hover:text-cyan-700" title="Editar nota">
          <Pencil size={11} />
        </button>
      )}
    </div>
  )
}

// ─── Fila de material ────────────────────────────────────────────────────────
function MaterialRow({ proyectoId, item, m, notaInforme, isAdmin }: {
  proyectoId: number; item: string; m: ItemReadinessMaterial & { lt: Lt }
  notaInforme: string; isAdmin: boolean
}) {
  const badge = estadoBadge(m)
  return (
    <tr className="border-b border-gray-100 last:border-0 align-top">
      <td className="py-2.5 pl-4 pr-3">
        <div className="font-mono text-xs font-semibold text-gray-800">{m.codigo}</div>
        <div className="text-sm text-gray-700">{m.descripcion}</div>
        <div className="text-[11px] text-gray-400 mt-0.5">
          {m.vendor || '—'}{m.qty != null && <> · {m.qty} u</>}
        </div>
      </td>
      <td className="py-2.5 px-3 whitespace-nowrap">
        <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', badge.cls)}>
          {badge.label}
        </span>
      </td>
      <td className="py-2.5 px-3">
        <div className={clsx('text-xs', LT_CLASS[m.lt.tipo])}>{m.lt.texto}</div>
        {m.oc_numero && (
          <div className="text-[11px] text-gray-400 font-mono mt-0.5">
            {m.oc_numero}{m.oc_fecha_emision && <> · ordenada {fmtFecha(m.oc_fecha_emision)}</>}
          </div>
        )}
      </td>
      <td className="py-2.5 px-4 min-w-[180px]">
        {m.nota && (
          <div className="flex items-start gap-1.5 text-xs rounded px-2 py-1 bg-amber-50 border-l-2 border-amber-400 text-amber-900 mb-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wide bg-white/70 rounded px-1 py-px flex-shrink-0 mt-px">sistema</span>
            <span className="flex-1">{m.nota}</span>
          </div>
        )}
        <NotaInforme proyectoId={proyectoId} item={item} material_id={m.id} texto={notaInforme} isAdmin={isAdmin} variant="material" />
      </td>
    </tr>
  )
}

// ─── Fila de ítem (colapsable) ───────────────────────────────────────────────
interface EnrichedItem extends ItemReadiness {
  mats: (ItemReadinessMaterial & { lt: Lt })[]
  counts: Record<LtTipo, number>
}
function ItemCard({ proyectoId, it, expanded, onToggle, notas, isAdmin }: {
  proyectoId: number; it: EnrichedItem; expanded: boolean; onToggle: () => void
  notas: Map<string, string>; isAdmin: boolean
}) {
  const meta = ITEM_ESTADO[it.estado] ?? ITEM_ESTADO.PENDIENTE
  const pct = it.total > 0 ? Math.round((it.disponibles / it.total) * 100) : 100
  const resumen: string[] = []
  if (it.disponibles) resumen.push(`${it.disponibles} listos`)
  if (it.counts.en_camino) resumen.push(`${it.counts.en_camino} en camino`)
  if (it.counts.vencida) resumen.push(`${it.counts.vencida} vencidas`)
  if (it.counts.por_ordenar) resumen.push(`${it.counts.por_ordenar} por ordenar`)
  if (it.propios) resumen.push(`${it.propios} propios`)

  return (
    <div className={clsx('bg-white rounded-xl border overflow-hidden', meta.border, expanded && 'shadow-md')}>
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50/60 text-left">
        <span className="flex-shrink-0 text-gray-400">{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <span className="flex-shrink-0 font-mono text-xs font-semibold text-gray-500 min-w-[48px]">Ítem {it.item}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', meta.cls)}>{meta.label}</span>
            <span className="text-xs text-gray-400 truncate">{resumen.join(' · ') || '—'}</span>
          </div>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2 w-28">
          <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] font-mono text-gray-400 tabular-nums">{it.disponibles}/{it.total}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {/* Nota del informe a nivel ítem */}
          {(isAdmin || notas.get(noteKey(it.item, null))) && (
            <div className="px-4 pt-3">
              <NotaInforme proyectoId={proyectoId} item={it.item} material_id={null}
                texto={notas.get(noteKey(it.item, null)) ?? ''} isAdmin={isAdmin} variant="item" />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="py-2 pl-4 pr-3 font-semibold">Material</th>
                  <th className="py-2 px-3 font-semibold">Estado</th>
                  <th className="py-2 px-3 font-semibold">Llegada / Lead time</th>
                  <th className="py-2 px-4 font-semibold">Nota</th>
                </tr>
              </thead>
              <tbody>
                {it.mats.map((m) => (
                  <MaterialRow key={m.id} proyectoId={proyectoId} item={it.item} m={m} isAdmin={isAdmin}
                    notaInforme={notas.get(noteKey(it.item, m.id)) ?? ''} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Chip de filtro ──────────────────────────────────────────────────────────
function Chip({ label, count, active, onClick, color }: {
  label: string; count: number; active: boolean; onClick: () => void
  color: 'gray' | 'red' | 'blue' | 'amber' | 'emerald'
}) {
  const colors: Record<string, string> = {
    gray:    active ? 'bg-gray-800 text-white border-gray-800'        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
    red:     active ? 'bg-red-600 text-white border-red-600'          : 'bg-white text-gray-600 border-gray-200 hover:border-red-200',
    blue:    active ? 'bg-blue-600 text-white border-blue-600'        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-200',
    amber:   active ? 'bg-amber-500 text-white border-amber-500'      : 'bg-white text-gray-600 border-gray-200 hover:border-amber-200',
    emerald: active ? 'bg-emerald-600 text-white border-emerald-600'  : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-200',
  }
  return (
    <button onClick={onClick} className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium', colors[color])}>
      {label} <span className="text-[10px] opacity-60">({count})</span>
    </button>
  )
}

// ─── Tab principal ───────────────────────────────────────────────────────────
type FiltroLt = '' | 'vencida' | 'en_camino' | 'por_ordenar' | 'listo'

export default function MaterialesPorItemTab({ proyectoId, selectedItems, compact, titulo }: {
  proyectoId: number
  selectedItems?: string[]            // si viene (del armador): solo estos ítems
  compact?: boolean                   // header chico con título de proyecto (vista consolidada)
  titulo?: { codigo: string; nombre: string }
}) {
  const { user } = useAuth()
  const isAdmin = user?.rol === 'ADMIN'
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filtro, setFiltro] = useState<FiltroLt>('')

  const { data, isLoading } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'items-readiness'],
    queryFn: () => proyectosService.getItemsReadiness(proyectoId),
    staleTime: 15_000,
  })
  const { data: notasData } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'informe-notas'],
    queryFn: () => proyectosService.getInformeNotas(proyectoId),
    staleTime: 15_000,
  })

  const notas = useMemo(() => {
    const map = new Map<string, string>()
    for (const n of (notasData?.data ?? []) as InformeNota[]) map.set(noteKey(n.item, n.material_id), n.texto)
    return map
  }, [notasData])

  const enriched = useMemo<EnrichedItem[]>(() => {
    const items = data?.data?.items ?? []
    return items.map((it) => {
      const mats = it.materiales.map((m) => ({ ...m, lt: leadTime(m) }))
      mats.sort((a, b) => (LT_RANK[a.lt.tipo] - LT_RANK[b.lt.tipo]) || a.codigo.localeCompare(b.codigo))
      const counts: Record<LtTipo, number> = { vencida: 0, en_camino: 0, por_ordenar: 0, recibido: 0, stock: 0, propio: 0 }
      mats.forEach((m) => { counts[m.lt.tipo]++ })
      return { ...it, mats, counts }
    })
  }, [data])

  if (isLoading) return <div className="text-center text-gray-400 py-12">Cargando…</div>
  const resumen = data?.data?.resumen
  if (!data?.data || !resumen) return <div className="text-center text-gray-300 py-12">Sin datos</div>

  if (enriched.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
        <Hammer size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">Este proyecto no tiene ítems definidos en el MTO todavía.</p>
      </div>
    )
  }

  const sel = selectedItems && selectedItems.length ? new Set(selectedItems) : null
  const scoped = sel ? enriched.filter((it) => sel.has(it.item)) : enriched

  const totV = scoped.reduce((s, it) => s + it.counts.vencida, 0)
  const totC = scoped.reduce((s, it) => s + it.counts.en_camino, 0)
  const totP = scoped.reduce((s, it) => s + it.counts.por_ordenar, 0)
  const listos = scoped.filter((it) => it.estado === 'LISTO').length

  const shown = scoped.filter((it) => {
    if (filtro === '') return true
    if (filtro === 'listo') return it.estado === 'LISTO'
    return it.counts[filtro] > 0
  })

  const allExpanded = expanded.size >= shown.length && shown.every((it) => expanded.has(it.item))
  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(shown.map((it) => it.item)))
  const toggle = (item: string) => setExpanded((prev) => {
    const next = new Set(prev); next.has(item) ? next.delete(item) : next.add(item); return next
  })

  const notaProyecto = notas.get(noteKey(null, null)) ?? ''

  return (
    <div className="space-y-4">
      {/* Header — compacto (dentro del armador) o completo (pestaña del proyecto) */}
      {compact ? (
        <div className="flex items-center gap-3 flex-wrap pt-1">
          {titulo && <span className="font-mono text-xs font-semibold bg-gray-800 text-white px-2 py-0.5 rounded">{titulo.codigo}</span>}
          {titulo && <span className="font-semibold text-sm text-gray-800">{titulo.nombre}</span>}
          <span className="text-xs text-gray-400">{scoped.length} ítems · {listos} listos</span>
          {totV > 0 && <span className="text-xs text-red-600 font-medium">· {totV} vencidas</span>}
          <button onClick={toggleAll} className="ml-auto inline-flex items-center gap-1.5 text-xs text-forest-700 font-medium hover:text-forest-800">
            {allExpanded ? <><ChevronsDownUp size={14} /> Colapsar</> : <><ChevronsUpDown size={14} /> Expandir</>}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-forest-700 to-forest-600 text-white px-6 py-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Package size={16} className="text-gold-300" />
                  <h3 className="text-base font-bold">Materiales por ítem</h3>
                </div>
                <p className="text-xs text-white/70">
                  Estado, llegada y lead time de cada material — <span className="text-gold-300 font-semibold">{resumen.total_items} ítems</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/70 uppercase tracking-wide">Ítems listos</p>
                <p className="text-2xl font-bold text-emerald-300 tabular-nums">
                  {resumen.listos} <span className="text-base text-white/50 font-normal">/ {resumen.total_items}</span>
                </p>
              </div>
            </div>
          </div>
          <div className="px-6 py-3 border-t border-gray-100 flex flex-wrap gap-2 items-center">
            <span className="text-gray-500 font-medium text-xs mr-1">Filtrar:</span>
            <Chip label="Todos"       count={enriched.length} active={filtro === ''}            onClick={() => setFiltro('')}            color="gray" />
            <Chip label="Vencidas"    count={totV}            active={filtro === 'vencida'}     onClick={() => setFiltro('vencida')}     color="red" />
            <Chip label="En camino"   count={totC}            active={filtro === 'en_camino'}   onClick={() => setFiltro('en_camino')}   color="blue" />
            <Chip label="Por ordenar" count={totP}            active={filtro === 'por_ordenar'} onClick={() => setFiltro('por_ordenar')} color="amber" />
            <Chip label="Listos"      count={resumen.listos}  active={filtro === 'listo'}       onClick={() => setFiltro('listo')}       color="emerald" />
            <button onClick={toggleAll} className="ml-auto inline-flex items-center gap-1.5 text-xs text-forest-700 font-medium hover:text-forest-800">
              {allExpanded ? <><ChevronsDownUp size={14} /> Colapsar</> : <><ChevronsUpDown size={14} /> Expandir</>} todo
            </button>
          </div>
        </div>
      )}

      {/* Nota del proyecto (informe) */}
      {(isAdmin || notaProyecto) && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold text-gray-500">
            <StickyNote size={13} /> Nota del proyecto
          </div>
          <NotaInforme proyectoId={proyectoId} item={null} material_id={null} texto={notaProyecto} isAdmin={isAdmin} variant="proyecto" />
        </div>
      )}

      {/* Ítems */}
      <div className="space-y-2">
        {shown.map((it) => (
          <ItemCard key={it.item} proyectoId={proyectoId} it={it} notas={notas} isAdmin={isAdmin}
            expanded={expanded.has(it.item)} onToggle={() => toggle(it.item)} />
        ))}
        {shown.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 py-10 text-center">
            <p className="text-xs text-gray-400">Sin ítems con ese filtro</p>
          </div>
        )}
      </div>
    </div>
  )
}
