import { useEffect, useState } from 'react'
import { Loader2, Send, Check, Rocket, CalendarRange, UserCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { ingenieriaService, type IngDealEnCurso } from '@/services/ingenieria'

// ─────────────────────────────────────────────────────────────────────────────
// Handoff Estimados → Cliente → PM. Un mismo tracker, dos vistas:
//   mode='estimados' → deals que esperan acción de Estimados:
//        plan_propuesto  → "Enviar schedule al cliente"
//        esperando_cliente → "Registrar que el cliente aprobó"
//   mode='pm' → deals aprobados por el cliente, listos para que el PM ACTIVE.
// El PM es quien activa: no pierde control y todo su plan se enciende de una.
// ─────────────────────────────────────────────────────────────────────────────

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmt = (iso: string | null) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MES[d.getMonth()]}` }

const CHIP: Record<string, { label: string; cls: string }> = {
  plan_propuesto:    { label: 'PM aceptó el plan',  cls: 'text-forest-700 bg-forest-100' },
  esperando_cliente: { label: 'con el cliente',      cls: 'text-amber-700 bg-amber-100' },
  aprobado:          { label: 'cliente aprobó',      cls: 'text-blue-700 bg-blue-100' },
}

export default function DealsEnCurso({ mode }: { mode: 'estimados' | 'pm' }) {
  const [deals, setDeals] = useState<IngDealEnCurso[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const cargar = () => ingenieriaService.dealsEnCurso()
    .then((r) => setDeals(r.data ?? []))
    .catch(() => {}).finally(() => setLoading(false))
  useEffect(() => { cargar() }, [])

  const visibles = deals.filter((d) =>
    mode === 'estimados' ? (d.deal_estado === 'plan_propuesto' || d.deal_estado === 'esperando_cliente')
                         : d.deal_estado === 'aprobado')

  const accion = async (d: IngDealEnCurso, fn: () => Promise<unknown>, ok: string) => {
    setBusy(d.proyecto_id)
    try { await fn(); toast.success(ok); await cargar() }
    catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo completar') }
    finally { setBusy(null) }
  }

  if (loading || !visibles.length) return null

  const esPM = mode === 'pm'
  return (
    <div className={`rounded-2xl border ${esPM ? 'border-blue-200' : 'border-forest-200'} bg-white overflow-hidden`}>
      <div className={`flex items-center gap-2 px-4 py-3 border-b border-stone-100 ${esPM ? 'bg-blue-50/40' : 'bg-forest-50/40'}`}>
        {esPM ? <Rocket size={16} className="text-blue-600" /> : <UserCheck size={16} className="text-forest-600" />}
        <h2 className="font-bold text-stone-800">{esPM ? 'Aprobados por el cliente · listos para activar' : 'Handoff con el cliente'}</h2>
        <span className="text-xs text-stone-400">{esPM ? 'Al activar, el proyecto arranca y todo el plan queda en marcha' : 'Mandá el schedule y registrá la respuesta del cliente'}</span>
      </div>
      <div className="divide-y divide-stone-100">
        {visibles.map((d) => {
          const chip = CHIP[d.deal_estado]
          const isBusy = busy === d.proyecto_id
          return (
            <div key={d.proyecto_id} className="p-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-mono text-[12px] font-bold text-forest-700">{d.codigo}</span>
                <span className="text-sm text-stone-700 font-medium">{d.nombre}</span>
                {d.cliente && <span className="text-xs text-stone-400">· {d.cliente}</span>}
                {chip && <span className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 ${chip.cls}`}>{chip.label}</span>}
              </div>
              <div className="text-sm text-stone-500 flex items-center gap-3 flex-wrap">
                {d.fecha_objetivo && <span className="inline-flex items-center gap-1"><CalendarRange size={12} /> entrega {fmt(d.fecha_objetivo)}</span>}
                <span><b className="text-stone-700">{d.n_tareas}</b> tarea{d.n_tareas === 1 ? '' : 's'} en el plan</span>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {mode === 'estimados' && d.deal_estado === 'plan_propuesto' && (
                  <button onClick={() => accion(d, () => ingenieriaService.enviarCliente(d.proyecto_id), 'Schedule enviado al cliente')} disabled={isBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-semibold px-3.5 py-2">
                    {isBusy ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />} Enviar schedule al cliente
                  </button>
                )}
                {mode === 'estimados' && d.deal_estado === 'esperando_cliente' && (
                  <button onClick={() => accion(d, () => ingenieriaService.clienteAprobo(d.proyecto_id), 'Aprobación registrada — el PM lo verá para activar')} disabled={isBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-semibold px-3.5 py-2">
                    {isBusy ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} El cliente aprobó
                  </button>
                )}
                {mode === 'pm' && d.deal_estado === 'aprobado' && (
                  <button onClick={() => accion(d, () => ingenieriaService.activarProyecto(d.proyecto_id), `${d.codigo} activado — el plan quedó en marcha`)} disabled={isBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-3.5 py-2">
                    {isBusy ? <Loader2 className="animate-spin" size={15} /> : <Rocket size={15} />} Activar proyecto
                  </button>
                )}
                <span className="text-[11px] text-stone-400">
                  {d.deal_estado === 'plan_propuesto' && 'El PM aceptó — mandale el schedule al cliente para su OK.'}
                  {d.deal_estado === 'esperando_cliente' && 'Esperando el OK del cliente. Registralo cuando responda.'}
                  {d.deal_estado === 'aprobado' && (esPM ? 'El cliente ya aprobó. Activá para poner el plan en marcha.' : 'Esperando que el PM active el proyecto.')}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
