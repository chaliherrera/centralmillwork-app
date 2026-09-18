import { useState } from 'react'
import toast from 'react-hot-toast'
import { Bell, Loader2, X } from 'lucide-react'
import { tareasService } from '@/services/tareas'
import type { Tarea } from '@/types'
import { usePollNovedades } from '@/hooks/usePollNovedades'

// Avisos del sistema en el escritorio del PM: deal cancelado/pausado (2.1), reajuste de
// fecha (2.2), etc. Antes solo caían en el módulo Tareas; acá le llegan a su escritorio.
// Se refresca solo (30s) y avisa cuando entra algo nuevo. Cada aviso se descarta (→ completada).
export default function AvisosPM() {
  const [busy, setBusy] = useState<number | null>(null)
  const { items, loading, refetch } = usePollNovedades<Tarea>(
    () => tareasService.avisosSistema().then((r) => r.data ?? []),
    (t) => t.id,
    { onNuevo: (n) => toast(`${n} aviso${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'}`, { icon: '🔔' }) },
  )

  const descartar = async (t: Tarea) => {
    setBusy(t.id)
    try { await tareasService.update(t.id, { estado: 'completada' }); await refetch() }
    catch { toast.error('No se pudo descartar') } finally { setBusy(null) }
  }

  if (loading || !items.length) return null   // sin avisos = no ocupa espacio

  return (
    <div className="rounded-2xl border border-gold-500/40 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 bg-[#F3ECD8]/50">
        <Bell size={16} className="text-gold-500" />
        <h2 className="font-bold text-stone-800">{items.length} aviso{items.length === 1 ? '' : 's'}</h2>
        <span className="text-xs text-stone-400">novedades del sistema para vos</span>
      </div>
      <div className="divide-y divide-stone-100">
        {items.map((t) => (
          <div key={t.id} className="p-4 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-stone-800">{t.title}</div>
              {t.description && <div className="text-[12.5px] text-stone-500 whitespace-pre-line mt-0.5">{t.description}</div>}
            </div>
            <button onClick={() => descartar(t)} disabled={busy === t.id}
              className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-stone-800 border border-stone-300 rounded-lg px-2.5 py-1.5">
              {busy === t.id ? <Loader2 className="animate-spin" size={13} /> : <X size={13} />} Descartar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
