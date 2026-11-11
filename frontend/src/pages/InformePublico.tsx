import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronDown, ChevronRight, Lock, FileText, StickyNote } from 'lucide-react'
import { informesService } from '@/services/informes'
import type { InformePublicoProyecto } from '@/services/informes'
import type { ItemReadiness, ItemReadinessMaterial } from '@/services/proyectos'
import {
  fmtFecha, leadTime, LT_RANK, LT_CLASS, estadoBadge, ITEM_ESTADO, noteKey, type Lt,
} from '@/components/proyecto/materialesPorItemHelpers'

// Página PÚBLICA (sin login) del informe compartido por token. Solo lectura.

export default function InformePublico() {
  const { token = '' } = useParams()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['informe-publico', token],
    queryFn: () => informesService.publico(token),
    retry: false,
  })

  if (isLoading) return <Centro>Cargando informe…</Centro>
  if (isError || !data?.data) return (
    <Centro>
      <Lock size={28} className="mx-auto text-gray-300 mb-3" />
      <p className="font-medium text-gray-600">Este informe no está disponible.</p>
      <p className="text-sm text-gray-400 mt-1">El link puede estar desactivado o ser incorrecto.</p>
    </Centro>
  )

  const inf = data.data
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-forest-700 text-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText size={20} className="text-gold-300 flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{inf.nombre}</h1>
              <p className="text-[11px] text-white/70">Central Millwork · informe de materiales</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] bg-white/15 rounded-full px-2.5 py-1 flex-shrink-0">
            <Lock size={11} /> Solo lectura
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {inf.proyectos.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-10">Este informe no tiene proyectos.</p>
        )}
        {inf.proyectos.map((p) => <ProyectoBloque key={p.proyecto_id} p={p} />)}
        <p className="text-center text-[11px] text-gray-400 pt-4">
          Informe en vivo · los montos no se incluyen.
        </p>
      </main>
    </div>
  )
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-10 text-center max-w-sm">
        {children}
      </div>
    </div>
  )
}

function ProyectoBloque({ p }: { p: InformePublicoProyecto }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const notas = new Map(p.notas.map((n) => [noteKey(n.item, n.material_id), n.texto]))

  const items = p.items.map((it) => {
    const mats = it.materiales.map((m) => ({ ...m, lt: leadTime(m) }))
    mats.sort((a, b) => (LT_RANK[a.lt.tipo] - LT_RANK[b.lt.tipo]) || a.codigo.localeCompare(b.codigo))
    return { ...it, mats }
  })
  const listos = items.filter((it) => it.estado === 'LISTO').length
  const toggle = (item: string) => setExpanded((prev) => {
    const next = new Set(prev); next.has(item) ? next.delete(item) : next.add(item); return next
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <span className="font-mono text-xs font-semibold bg-gray-800 text-white px-2 py-0.5 rounded">{p.codigo}</span>
        <span className="font-semibold text-sm text-gray-800">{p.nombre}</span>
        <span className="text-xs text-gray-400">{items.length} ítems · {listos} listos</span>
      </div>
      <div className="space-y-2">
        {items.map((it) => (
          <ItemCard key={it.item} it={it} notas={notas} expanded={expanded.has(it.item)} onToggle={() => toggle(it.item)} />
        ))}
      </div>
    </div>
  )
}

function ItemCard({ it, notas, expanded, onToggle }: {
  it: ItemReadiness & { mats: (ItemReadinessMaterial & { lt: Lt })[] }
  notas: Map<string, string>; expanded: boolean; onToggle: () => void
}) {
  const meta = ITEM_ESTADO[it.estado] ?? ITEM_ESTADO.PENDIENTE
  const notaItem = notas.get(noteKey(it.item, null))
  return (
    <div className={clsx('rounded-xl border overflow-hidden', meta.border, expanded && 'shadow-md')}>
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50/60 text-left">
        <span className="flex-shrink-0 text-gray-400">{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <span className="flex-shrink-0 font-mono text-xs font-semibold text-gray-500 min-w-[48px]">Ítem {it.item}</span>
        <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', meta.cls)}>{meta.label}</span>
        <span className="text-xs text-gray-400 ml-auto">{it.disponibles}/{it.total}</span>
      </button>
      {expanded && (
        <div className="border-t border-gray-100">
          {notaItem && <div className="px-4 pt-3"><NotaBox texto={notaItem} /></div>}
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
                {it.mats.map((m) => {
                  const badge = estadoBadge(m)
                  const notaInf = notas.get(noteKey(it.item, m.id))
                  return (
                    <tr key={m.id} className="border-b border-gray-100 last:border-0 align-top">
                      <td className="py-2.5 pl-4 pr-3">
                        <div className="font-mono text-xs font-semibold text-gray-800">{m.codigo}</div>
                        <div className="text-sm text-gray-700">{m.descripcion}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{m.vendor || '—'}{m.qty != null && <> · {m.qty} u</>}</div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', badge.cls)}>{badge.label}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className={clsx('text-xs', LT_CLASS[m.lt.tipo])}>{m.lt.texto}</div>
                        {m.oc_numero && (
                          <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                            {m.oc_numero}{m.oc_fecha_emision && <> · ordenada {fmtFecha(m.oc_fecha_emision)}</>}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 min-w-[160px]">
                        {m.nota && <div className="text-xs rounded px-2 py-1 bg-amber-50 border-l-2 border-amber-400 text-amber-900 mb-1.5">{m.nota}</div>}
                        {notaInf && <NotaBox texto={notaInf} />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function NotaBox({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-1.5 text-xs rounded px-2 py-1 bg-cyan-50 border-l-2 border-cyan-400 text-cyan-900">
      <StickyNote size={12} className="mt-0.5 flex-shrink-0 opacity-60" />
      <span className="flex-1">{texto}</span>
    </div>
  )
}
