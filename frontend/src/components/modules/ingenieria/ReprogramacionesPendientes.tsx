import { useEffect, useState } from 'react'
import { CalendarClock, Loader2 } from 'lucide-react'
import { ingenieriaService, type Reprogramacion } from '@/services/ingenieria'

// Bandeja del PM: pedidos de reprogramación del ingeniero (#2). El ingeniero no mueve
// fechas — avisa; acá el PM los ve sin tener que entrar a cada proyecto, y abre el plan.
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmt = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MES[d.getMonth()]}` }

export default function ReprogramacionesPendientes({ onRevisar }: { onRevisar: (ext: string) => void }) {
  const [items, setItems] = useState<Reprogramacion[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    ingenieriaService.reprogramaciones().then((r) => setItems(r.data ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-4 text-center text-stone-300"><Loader2 className="animate-spin inline" size={18} /></div>
  if (!items.length) return null   // sin pedidos = no ocupa espacio

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-100 flex-wrap">
        <CalendarClock size={17} className="text-amber-600 shrink-0" />
        <h2 className="font-bold text-amber-900">{items.length} tarea{items.length === 1 ? '' : 's'} pide{items.length === 1 ? '' : 'n'} reprogramación</h2>
        <span className="text-xs text-amber-700">el ingeniero no puede cumplir la fecha — abrí el plan y reprogramá</span>
      </div>
      <div className="divide-y divide-amber-100">
        {items.map((t) => (
          <button key={t.id} onClick={() => t.proyecto_ext && onRevisar(t.proyecto_ext)}
            className="w-full text-left px-4 py-2.5 hover:bg-amber-100/40 flex items-center gap-3 transition">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-stone-800 truncate">{t.nombre} <span className="text-[11px] font-mono text-amber-700">· {t.proyecto_ext}</span></div>
              <div className="text-[11px] text-stone-500">
                {t.asignado_nombre || 'sin responsable'}{t.fecha_inicio ? ` · plan ${fmt(t.fecha_inicio)}` : ''}
                {t.motivo ? <span className="italic"> · “{t.motivo}”</span> : ''}
              </div>
            </div>
            <span className="text-[11px] text-amber-700 font-semibold whitespace-nowrap">Abrir plan →</span>
          </button>
        ))}
      </div>
    </div>
  )
}
