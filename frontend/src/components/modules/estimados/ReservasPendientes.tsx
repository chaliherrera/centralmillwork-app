import { useState } from 'react'
import toast from 'react-hot-toast'
import { Lock, Loader2, Check, CalendarRange, Eye } from 'lucide-react'
import { ingenieriaService, type ReservaProyecto } from '@/services/ingenieria'
import { usePollNovedades } from '@/hooks/usePollNovedades'

// ─────────────────────────────────────────────────────────────────────────────
// Bandeja del PM — planes de ingeniería SUGERIDOS por Estimados, pendientes de
// aceptación. El PM revisa/poda el plan (botón "Revisar plan" → abre el Plan por
// proyecto) y al "Aceptar plan" el plan sugerido se endurece (pasa a firme).
// ─────────────────────────────────────────────────────────────────────────────

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmt = (iso: string | null) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MES[d.getMonth()]}` }

export default function ReservasPendientes({ onRevisar }: { onRevisar?: (proyectoExt: string) => void }) {
  const [busy, setBusy] = useState<number | null>(null)
  const { items: reservas, loading, refetch } = usePollNovedades<ReservaProyecto>(
    () => ingenieriaService.reservasPendientes().then((r) => r.data ?? []),
    (p) => p.proyecto_id,
    { onNuevo: (n) => toast(`${n} plan${n === 1 ? '' : 'es'} nuevo${n === 1 ? '' : 's'} por aceptar`, { icon: '📋' }) },
  )

  const aceptar = async (p: ReservaProyecto) => {
    setBusy(p.proyecto_id)
    try { await ingenieriaService.confirmarReserva(p.proyecto_id); await refetch() }
    catch { /* toast */ } finally { setBusy(null) }
  }

  if (loading) return null
  if (!reservas.length) return null

  return (
    <div className="rounded-2xl border border-forest-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 bg-forest-50/40">
        <Lock size={16} className="text-forest-600" />
        <h2 className="font-bold text-stone-800">Planes sugeridos por aceptar</h2>
        <span className="text-xs text-stone-400">Estimados te propuso el plan — revisalo, ajustá y aceptá</span>
      </div>
      <div className="divide-y divide-stone-100">
        {reservas.map((p) => {
          const engs = [...new Set(p.tareas.map((t) => t.asignado_nombre).filter(Boolean))]
          // Fecha PROPUESTA por el PM = fin de la última tarea (fin factible del plan). La
          // SOLICITADA (fecha_objetivo) queda como referencia de lo que pidió el cliente.
          const fechaPropuesta = p.tareas.reduce((mx, t) => (t.fecha_fin && t.fecha_fin > mx ? t.fecha_fin : mx), '')
          return (
            <div key={p.proyecto_id} className="p-4">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="font-mono text-[12px] font-bold text-forest-700">{p.proyecto_codigo}</span>
                <span className="text-sm text-stone-700 font-medium">{p.proyecto_nombre}</span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">sugerido</span>
              </div>
              {/* Dos fechas: la comprometida por Estimados (referencia) y la realista del plan
                  (propuesta por el PM, marcada) — la que tiene posibilidades de cumplirse. */}
              <div className="flex items-center gap-3 mb-1.5 flex-wrap text-xs">
                {p.fecha_objetivo && (
                  <span className="inline-flex items-center gap-1 text-stone-400">
                    <CalendarRange size={12} /> Solicitada: <span className="text-stone-500 font-medium">{fmt(p.fecha_objetivo)}</span>
                  </span>
                )}
                {fechaPropuesta && (
                  <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-emerald-800 bg-emerald-100">
                    Propuesta: {fmt(fechaPropuesta)}
                  </span>
                )}
              </div>
              <div className="text-sm text-stone-500">
                <b className="text-stone-700">{p.tareas.length}</b> tarea{p.tareas.length === 1 ? '' : 's'} en el plan · ingenieros propuestos: <span className="text-stone-700">{engs.length ? engs.join(', ') : 'sin asignar'}</span>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {onRevisar && p.proyecto_ext && (
                  <button onClick={() => onRevisar(p.proyecto_ext!)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 text-sm font-semibold px-3 py-2">
                    <Eye size={15} /> Revisar plan
                  </button>
                )}
                <button onClick={() => aceptar(p)} disabled={busy === p.proyecto_id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-semibold px-3.5 py-2">
                  {busy === p.proyecto_id ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} Aceptar plan
                </button>
                <span className="text-[11px] text-stone-400">Revisá y podá el plan antes de aceptar.</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
