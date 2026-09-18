import { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Bell, Loader2, X } from 'lucide-react'
import { tareasService } from '@/services/tareas'
import type { Tarea } from '@/types'
import { usePollNovedades } from '@/hooks/usePollNovedades'

// Avisos del sistema en el escritorio del PM: deal cancelado/pausado (2.1), reajuste de
// fecha (2.2), etc. Panel COMPACTO al costado: solo los últimos 3, para que el PM los lea
// y descarte en vez de acumularlos. Se refresca solo (30s) y avisa cuando entra algo nuevo.
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

  const visibles = items.slice(0, 3)
  const resto = items.length - visibles.length

  return (
    <div className="rounded-2xl border border-gold-500/40 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-stone-100 bg-[#F3ECD8]/50">
        <Bell size={15} className="text-gold-500" />
        <h2 className="font-bold text-stone-800 text-sm">Avisos</h2>
        <span className="ml-auto text-[11px] font-semibold text-gold-500 bg-[#F3ECD8] rounded-full px-2 py-0.5">{items.length}</span>
      </div>
      <div className="divide-y divide-stone-100">
        {visibles.map((t) => (
          <div key={t.id} className="px-3.5 py-2.5">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-stone-800 leading-snug">{t.title}</div>
                {t.description && <div className="text-[11.5px] text-stone-500 whitespace-pre-line mt-0.5 line-clamp-3">{t.description}</div>}
              </div>
              <button onClick={() => descartar(t)} disabled={busy === t.id} title="Descartar"
                className="shrink-0 text-stone-400 hover:text-stone-700 rounded-md p-1 hover:bg-stone-100">
                {busy === t.id ? <Loader2 className="animate-spin" size={14} /> : <X size={14} />}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="px-3.5 py-2 border-t border-stone-100 bg-stone-50/60 flex items-center justify-between">
        <span className="text-[11px] text-stone-400">{resto > 0 ? `+${resto} más` : 'Descartá los que ya viste'}</span>
        <Link to="/tareas" className="text-[11px] font-semibold text-forest-600 hover:text-forest-800">Ver todos →</Link>
      </div>
    </div>
  )
}
