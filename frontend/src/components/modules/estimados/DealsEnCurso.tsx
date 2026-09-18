import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Loader2, Send, Check, Rocket, CalendarRange, UserCheck, Eye, Link2, Copy, CalendarClock, X, Pause, Ban, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { ingenieriaService, type IngDealEnCurso } from '@/services/ingenieria'
import { usePollNovedades } from '@/hooks/usePollNovedades'
import type { PortalGanttTarea } from '@/services/portal'
import CronogramaCliente, { ganttDesdePlan } from '@/components/schedule/CronogramaCliente'

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
// Fecha + hora de la aprobación (instante UTC del backend → hora local del que mira).
const fmtDateTime = (iso: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`
}

const CHIP: Record<string, { label: string; cls: string }> = {
  esperando_pm:      { label: 'con el PM',           cls: 'text-stone-600 bg-stone-100' },
  plan_propuesto:    { label: 'PM aceptó el plan',  cls: 'text-forest-700 bg-forest-100' },
  esperando_cliente: { label: 'con el cliente',      cls: 'text-amber-700 bg-amber-100' },
  aprobado:          { label: 'cliente aprobó',      cls: 'text-blue-700 bg-blue-100' },
}

export default function DealsEnCurso({ mode, emptyHint }: { mode: 'estimados' | 'pm'; emptyHint?: string }) {
  const [busy, setBusy] = useState<number | null>(null)
  const [cronoBusy, setCronoBusy] = useState<number | null>(null)
  const [crono, setCrono] = useState<{ nombre: string; fecha: string | null; gantt: PortalGanttTarea[] } | null>(null)
  // Confirmación de baja del deal (pausar/cancelar) — acción destructiva, se confirma.
  const [cerrar, setCerrar] = useState<{ d: IngDealEnCurso; accion: 'pausar' | 'cancelar' } | null>(null)

  async function abrirCrono(d: IngDealEnCurso) {
    setCronoBusy(d.proyecto_id)
    try {
      const plan = (await ingenieriaService.getPlan(d.codigo)).data
      setCrono({ nombre: d.nombre || d.codigo, fecha: plan?.fecha_entrega ?? d.fecha_objetivo, gantt: ganttDesdePlan(plan?.tareas ?? []) })
    } catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo cargar el cronograma') }
    finally { setCronoBusy(null) }
  }

  // Estimados también ve el deal 'aprobado' (como confirmación con fecha/hora) hasta que
  // el PM activa; antes desaparecía apenas el cliente aprobaba y Estimados quedaba sin cierre.
  const esVisible = (d: IngDealEnCurso) =>
    mode === 'estimados' ? (d.deal_estado === 'esperando_pm' || d.deal_estado === 'plan_propuesto' || d.deal_estado === 'esperando_cliente' || d.deal_estado === 'aprobado')
                         : d.deal_estado === 'aprobado'
  // P9: se refresca solo y avisa cuando entra un deal nuevo a esta bandeja.
  const { items: visibles, loading, refetch } = usePollNovedades<IngDealEnCurso>(
    () => ingenieriaService.dealsEnCurso().then((r) => (r.data ?? []).filter(esVisible)),
    (d) => d.proyecto_id,
    { onNuevo: (n) => toast(mode === 'pm' ? `${n} deal${n === 1 ? '' : 's'} listo${n === 1 ? '' : 's'} para activar` : `${n} deal${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'} en tu bandeja`, { icon: '🤝' }) },
  )

  const qc = useQueryClient()
  const accion = async (d: IngDealEnCurso, fn: () => Promise<unknown>, ok: string) => {
    setBusy(d.proyecto_id)
    try {
      await fn(); toast.success(ok); await refetch()
      // Aprobar/activar cambia lo que "te toca": refrescá el escritorio y su badge ya.
      qc.invalidateQueries({ queryKey: ['escritorio'] })
      qc.invalidateQueries({ queryKey: ['escritorio-resumen'] })
    }
    catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo completar') }
    finally { setBusy(null) }
  }

  const accionCerrar = (d: IngDealEnCurso, ac: 'pausar' | 'cancelar') =>
    accion(d, () => ingenieriaService.cerrarDeal(d.proyecto_id, ac),
      ac === 'pausar'
        ? `${d.codigo} pausado — se liberó la Ingeniería y se avisó al PM`
        : `${d.codigo} cancelado — se liberó la Ingeniería y se avisó al PM`)

  if (loading) return null
  if (!visibles.length) return emptyHint
    ? <div className="rounded-2xl border border-dashed border-stone-200 bg-white/50 px-4 py-10 text-center text-sm text-stone-400">{emptyHint}</div>
    : null

  const esPM = mode === 'pm'
  return (
    <>
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
          const portalLink = d.portal_token ? `${window.location.origin}/portal/${d.portal_token}` : null
          return (
            <div key={d.proyecto_id} className="p-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-mono text-[12px] font-bold text-forest-700">{d.codigo}</span>
                <span className="text-sm text-stone-700 font-medium">{d.nombre}</span>
                {d.cliente && <span className="text-xs text-stone-400">· {d.cliente}</span>}
                {chip && <span className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 ${chip.cls}`}>{chip.label}</span>}
              </div>
              <div className="text-sm text-stone-500 flex items-center gap-3 flex-wrap">
                {d.fecha_objetivo && <span className="inline-flex items-center gap-1"><CalendarRange size={12} /> fecha solicitada por el cliente {fmt(d.fecha_objetivo)}</span>}
                <span><b className="text-stone-700">{d.n_tareas}</b> tarea{d.n_tareas === 1 ? '' : 's'} en el plan</span>
              </div>
              {/* Vista 2: sólo se avisa cuando el plan del PM cae MÁS TARDE que la fecha que
                  pidió el cliente (el PM ajustó el Gantt y la entrega se corrió). Si cumple, no
                  se muestra nada: la fecha solicitada ya la conoce Estimados. */}
              {mode === 'estimados' && d.fecha_realista && d.fecha_objetivo && d.fecha_realista > d.fecha_objetivo && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
                  <span>El PM confirmó entrega para el <b>{fmt(d.fecha_realista)}</b> — más tarde que la fecha que pidió el cliente (<b>{fmt(d.fecha_objetivo)}</b>). <b>Renegociá la fecha</b> con el cliente antes de mandarle el schedule.</span>
                </div>
              )}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {/* Ver el plan que se manda al cliente (revisar antes de enviar / activar). */}
                <Link to={`/schedule/${d.proyecto_id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-semibold px-3 py-2">
                  <Eye size={15} /> Ver el plan
                </Link>
                <button onClick={() => abrirCrono(d)} disabled={cronoBusy === d.proyecto_id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-semibold px-3 py-2">
                  {cronoBusy === d.proyecto_id ? <Loader2 className="animate-spin" size={15} /> : <CalendarClock size={15} />} Cronograma
                </button>
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
                {/* 2.1: sólo Estimados puede dar de baja el deal (tiene el contacto con el cliente).
                    Pausar (reactivable) o cancelar; en ambos se libera toda la Ingeniería + aviso al PM. */}
                {mode === 'estimados' && (
                  <div className="inline-flex items-center gap-2 ml-auto">
                    <button onClick={() => setCerrar({ d, accion: 'pausar' })} disabled={isBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 text-sm font-semibold px-3 py-2">
                      <Pause size={15} /> Pausar
                    </button>
                    <button onClick={() => setCerrar({ d, accion: 'cancelar' })} disabled={isBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50 text-sm font-semibold px-3 py-2">
                      <Ban size={15} /> Cancelar deal
                    </button>
                  </div>
                )}
                <span className="text-[11px] text-stone-400">
                  {d.deal_estado === 'esperando_pm' && 'Con el PM — está revisando/aceptando el plan.'}
                  {d.deal_estado === 'plan_propuesto' && 'El PM aceptó — mandale el schedule al cliente para su OK.'}
                  {d.deal_estado === 'esperando_cliente' && !d.cliente_rechazo && 'Esperando el OK del cliente. Registralo cuando responda.'}
                  {d.deal_estado === 'aprobado' && esPM && 'El cliente ya aprobó. Activá para poner el plan en marcha.'}
                </span>
              </div>
              {/* 2.6: el cliente rechazó el plan desde el portal → Estimados lo ve para renegociar. */}
              {mode === 'estimados' && d.deal_estado === 'esperando_cliente' && d.cliente_rechazo && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">
                  <X size={15} className="mt-0.5 shrink-0 text-rose-600" />
                  <span>El cliente <b>pidió cambios en el plan</b> desde el portal. Revisá el schedule, ajustalo y reenvialo.</span>
                </div>
              )}
              {/* Estimados: confirmación de que el cliente aprobó (con fecha y hora). Queda
                  visible hasta que el PM activa, así Estimados tiene el cierre del handoff. */}
              {mode === 'estimados' && d.deal_estado === 'aprobado' && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800">
                  <UserCheck size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <b>El cliente aprobó el schedule</b>{fmtDateTime(d.deal_aprobado_at) && <> el <b>{fmtDateTime(d.deal_aprobado_at)}</b></>}.
                    <span className="text-emerald-700"> Esperando que el PM active el proyecto.</span>
                  </span>
                </div>
              )}
              {/* Link del portal del cliente: se puede copiar y abrir directo. */}
              {portalLink && (
                <div className="mt-2 flex items-center gap-2 flex-wrap rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                  <Link2 size={13} className="text-forest-600 shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-wide text-stone-500 shrink-0">Portal del cliente</span>
                  <input readOnly value={portalLink} onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-[160px] text-[11px] text-stone-600 bg-white border border-stone-200 rounded px-2 py-1" />
                  <button onClick={() => { navigator.clipboard?.writeText(portalLink); toast.success('Link copiado') }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-stone-600 hover:text-stone-900 border border-stone-300 rounded-lg px-2.5 py-1.5">
                    <Copy size={13} /> Copiar
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>

    {/* Cronograma del cliente (la propuesta): descargable para adjuntar a un email. */}
    {crono && (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setCrono(null)}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[88vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock size={18} className="text-forest-600" />
            <h3 className="font-bold text-stone-800 text-sm truncate">Cronograma del cliente · {crono.nombre}</h3>
            <button onClick={() => setCrono(null)} className="ml-auto text-stone-400 hover:text-stone-700"><X size={18} /></button>
          </div>
          <p className="text-[11px] text-stone-400 mb-3">Es lo que ve el cliente en el portal. Descargalo para adjuntarlo a un email.</p>
          <CronogramaCliente nombre={crono.nombre} fechaObjetivo={crono.fecha} gantt={crono.gantt} />
        </div>
      </div>
    )}

    {/* Confirmación de baja del deal (2.1) — acción destructiva: se libera Ingeniería. */}
    {cerrar && (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setCerrar(null)}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start gap-3 mb-3">
            <div className={`shrink-0 rounded-full p-2 ${cerrar.accion === 'pausar' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
              {cerrar.accion === 'pausar' ? <Pause size={18} /> : <Ban size={18} />}
            </div>
            <div>
              <h3 className="font-bold text-stone-800">
                {cerrar.accion === 'pausar' ? 'Pausar el deal' : 'Cancelar el deal'}
                <span className="font-mono text-[12px] text-forest-700 ml-2">{cerrar.d.codigo}</span>
              </h3>
              <p className="text-[12px] text-stone-500 mt-0.5">{cerrar.d.nombre}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-[12.5px] text-stone-700 mb-4">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
            <span>
              Se <b>libera toda la reserva de Ingeniería</b> (el ingeniero recupera esa capacidad) y se
              dan de baja los links del portal del cliente. El PM recibe el aviso en su escritorio.
              {cerrar.accion === 'pausar'
                ? ' El proyecto queda en pausa y se puede reactivar más adelante.'
                : ' El proyecto queda cancelado.'}
            </span>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setCerrar(null)}
              className="rounded-lg border border-stone-300 hover:bg-stone-50 text-stone-700 text-sm font-semibold px-3.5 py-2">
              No, volver
            </button>
            <button
              onClick={() => { const { d, accion } = cerrar; setCerrar(null); accionCerrar(d, accion) }}
              className={`inline-flex items-center gap-1.5 rounded-lg text-white text-sm font-semibold px-3.5 py-2 ${cerrar.accion === 'pausar' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
              {cerrar.accion === 'pausar' ? <><Pause size={15} /> Sí, pausar</> : <><Ban size={15} /> Sí, cancelar</>}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
