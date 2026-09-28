import { useState } from 'react'
import toast from 'react-hot-toast'
import { Lock, Loader2, Check, CalendarRange, Eye, RotateCcw } from 'lucide-react'
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

  // Regenerar = correr de nuevo el generador (reservar) sobre el mismo proyecto:
  // borra el plan SUGERIDO actual y lo reconstruye con los datos vigentes del
  // proyecto (ítems, montos, stone, instalación, fecha) y la carga actual de
  // ingenieros. Descarta las ediciones que el PM haya hecho sobre el sugerido.
  const regenerar = async (p: ReservaProyecto) => {
    if (!window.confirm(
      `¿Regenerar el plan de ${p.proyecto_codigo} desde cero?\n\n` +
      `Se descartan las ediciones actuales del plan sugerido y se reconstruye ` +
      `con los datos del proyecto (ítems, montos, stone, instalación, fecha) y ` +
      `la carga de ingenieros vigente.`
    )) return
    setBusy(p.proyecto_id)
    try {
      await ingenieriaService.reservar(p.proyecto_id)
      toast.success('Plan regenerado')
      await refetch()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'No se pudo regenerar el plan')
    } finally { setBusy(null) }
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
          return (
            <div key={p.proyecto_id} className="p-4">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="font-mono text-[12px] font-bold text-forest-700">{p.proyecto_codigo}</span>
                <span className="text-sm text-stone-700 font-medium">{p.proyecto_nombre}</span>
                {p.fecha_objetivo && <span className="text-xs text-stone-400 inline-flex items-center gap-1"><CalendarRange size={12} /> entrega {fmt(p.fecha_objetivo)}</span>}
                <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">sugerido</span>
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
                <button onClick={() => regenerar(p)} disabled={busy === p.proyecto_id}
                  title="Descarta el plan sugerido actual y lo reconstruye con los datos del proyecto y la carga de ingenieros vigente"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50 disabled:opacity-50 text-sm font-semibold px-3 py-2">
                  {busy === p.proyecto_id ? <Loader2 className="animate-spin" size={15} /> : <RotateCcw size={15} />} Regenerar
                </button>
                <button onClick={() => aceptar(p)} disabled={busy === p.proyecto_id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-semibold px-3.5 py-2">
                  {busy === p.proyecto_id ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} Aceptar plan
                </button>
                <span className="text-[11px] text-stone-400">Revisá y podá el plan antes de aceptar — o regeneralo desde cero.</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
