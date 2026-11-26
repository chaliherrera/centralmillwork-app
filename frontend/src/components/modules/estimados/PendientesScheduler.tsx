import { useEffect, useState } from 'react'
import { Loader2, CalendarClock, Hammer } from 'lucide-react'
import toast from 'react-hot-toast'
import { ingenieriaService, type PendienteScheduler } from '@/services/ingenieria'
import { scheduleService } from '@/services/schedule'

// ─────────────────────────────────────────────────────────────────────────────
// Bandeja del Scheduler (Fase 2). Los take-offs que Estimados le mandó, esperando
// que arme el plan:
//   esperando_scheduler → "Armar plan" (genera el schedule hacia atrás desde la
//        fecha solicitada + reserva Ingeniería) → pasa a "en armado".
//   esperando_pm        → el plan ya está armado (sugerencia): abrilo, ajustalo en
//        el Gantt y devolvételo a Estimados desde la bandeja de abajo.
// Reusa la maquinaria del deal (generar + reservar); no inventa endpoints nuevos.
// ─────────────────────────────────────────────────────────────────────────────

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmt = (iso: string | null) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}` }

export default function PendientesScheduler({ onArmar }: { onArmar?: (codigo: string) => void }) {
  const [rows, setRows] = useState<PendienteScheduler[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)

  const cargar = () => ingenieriaService.pendientesScheduler()
    .then((r) => setRows(r.data ?? [])).catch(() => {}).finally(() => setLoading(false))
  useEffect(() => { cargar() }, [])

  // Solo los nuevos (esperando_scheduler). Los "en armado" (esperando_pm) ya los
  // maneja ReservasPendientes abajo, con la acción de confirmar/devolver a Estimados.
  const nuevos = rows.filter((r) => r.deal_estado === 'esperando_scheduler')

  async function armar(r: PendienteScheduler) {
    if (!r.fecha_solicitada) { toast.error('Este take-off no tiene fecha solicitada. Pedile a Estimados que la cargue.'); return }
    setBusy(r.proyecto_id)
    try {
      await scheduleService.generar(r.proyecto_id, r.fecha_solicitada)   // schedule hacia atrás desde la fecha
      await ingenieriaService.reservar(r.proyecto_id)                    // plan de ingeniería (sugerencia) + reserva
      toast.success(`Plan armado para ${r.codigo}. Revisalo y devolvéselo a Estimados.`)
      await cargar()
      onArmar?.(r.codigo)
    } catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo armar el plan') }
    finally { setBusy(null) }
  }

  if (loading || nuevos.length === 0) return null   // sin pendientes nuevos → no ocupa espacio en la bandeja

  return (
    <section className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
        <CalendarClock size={17} className="text-forest-600" />
        <h3 className="font-bold text-stone-800">Take-offs esperando que armes el plan</h3>
        <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-forest-100 text-forest-700">{nuevos.length}</span>
      </div>
      <div className="divide-y divide-stone-100">
        {nuevos.map((r) => (
          <div key={r.proyecto_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-[220px] flex-1">
              <div className="text-sm font-semibold text-stone-900"><span className="font-mono text-[12px] text-forest-700">{r.codigo}</span> · {r.nombre}</div>
              <div className="text-xs text-stone-500">{r.cliente || 'sin cliente'}{r.items_qty != null ? ` · ${r.items_qty} ítems` : ''}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wide text-stone-400 font-semibold">Fecha pedida</div>
              <div className="text-sm font-bold text-stone-900">{fmt(r.fecha_solicitada)}</div>
            </div>
            <button onClick={() => armar(r)} disabled={busy === r.proyecto_id}
              className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2">
              {busy === r.proyecto_id ? <Loader2 className="animate-spin" size={16} /> : <Hammer size={15} />} Armar plan
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
