import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  CalendarClock, Check, Clock, ChevronRight, ThumbsUp, MessageSquare, X,
  ShieldCheck, Lock, FileText, RefreshCw, ClipboardList, Minus,
} from 'lucide-react'
import { portalService, type PortalVista, type Decision } from '@/services/portal'

// The portal is English (US clients). Internal app stays Spanish.
const DECISION_LABEL: Record<Decision, { t: string; c: string }> = {
  aprobado: { t: 'You approved', c: 'text-emerald-700' },
  aprobado_con_comentarios: { t: 'Approved with comments', c: 'text-amber-700' },
  rechazado: { t: 'You requested changes', c: 'text-rose-700' },
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function dShort(d: string | null): string {
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number); void y
  return `${MONTHS[m - 1]} ${day}`
}
function dLong(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-').map(Number)
  return `${MONTHS[m - 1]} ${day}, ${y}`
}
function statusChip(sem: string): { t: string; c: string } {
  if (sem === 'rojo') return { t: 'Needs attention', c: 'text-rose-700 bg-rose-50 border-rose-200' }
  if (sem === 'amarillo') return { t: 'On watch', c: 'text-amber-700 bg-amber-50 border-amber-200' }
  if (sem === 'verde') return { t: 'On track', c: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
  return { t: 'Getting started', c: 'text-stone-600 bg-stone-50 border-stone-200' }
}

export default function ClientPortal() {
  const { token = '' } = useParams()
  const [data, setData] = useState<PortalVista | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [action, setAction] = useState<{ codigo: string; titulo: string; decision: Decision } | null>(null)
  const [comentario, setComentario] = useState('')
  const [busy, setBusy] = useState(false)

  async function load(silent = false) {
    if (!silent) setLoading(true)
    setError(false)
    try { setData((await portalService.getVista(token)).data) }
    catch { if (!silent) setError(true) } finally { if (!silent) setLoading(false) }
  }
  useEffect(() => { load() }, [token])

  async function confirmar() {
    if (!action) return
    setBusy(true)
    try {
      await portalService.aprobar(token, action.codigo, action.decision, comentario || undefined)
      toast.success('Thank you! Your response has been recorded.')
      setAction(null); setComentario('')
      await load(true)
    } catch { /* toast global */ } finally { setBusy(false) }
  }

  const est = useMemo(() => statusChip(data?.proyecto.semaforo ?? 'gris'), [data])

  if (loading) return <Centered><div className="text-stone-400 text-sm">Loading your project…</div></Centered>
  if (error || !data) return (
    <Centered>
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto"><X className="text-stone-400" /></div>
        <h1 className="mt-4 text-lg font-semibold text-stone-800">Invalid link</h1>
        <p className="mt-1 text-sm text-stone-500">This link is invalid or was deactivated. Please contact Central Millwork for a new one.</p>
      </div>
    </Centered>
  )

  const N = data.momentos.length
  const idxNow = data.momentos.findIndex((m) => m.estado === 'now')
  const idxSolido = idxNow >= 0 ? idxNow : N - 1

  const cardCls = 'rounded-2xl border border-card-border bg-white shadow-[0_1px_3px_rgba(31,27,20,0.04)]'
  const hdCls = 'px-4 py-3 border-b border-card-border'

  return (
    <div className="min-h-screen bg-[#F6F4EE] text-stone-800">
      <div className="bg-forest-600 text-white">
        <div className="max-w-[1120px] mx-auto px-5 py-3 flex items-center gap-2">
          <ShieldCheck size={18} className="opacity-90" />
          <span className="font-semibold tracking-tight">Central Millwork</span>
          <span className="ml-auto text-xs opacity-75">Project tracking</span>
        </div>
      </div>

      <div className="max-w-[1120px] mx-auto px-5 py-6">
        {/* project header */}
        <div>
          {data.contacto && <div className="text-sm text-stone-500">Hello, {data.contacto}</div>}
          <h1 className="text-2xl font-bold text-stone-900 mt-0.5">{data.proyecto.nombre}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-card-border bg-white px-4 py-2.5">
              <div className="text-[11px] uppercase tracking-wider text-stone-400 font-medium flex items-center gap-1"><CalendarClock size={12} /> Estimated delivery</div>
              <div className="text-xl font-bold text-stone-900">{dLong(data.proyecto.fecha_objetivo)}</div>
            </div>
            <div className={clsx('rounded-xl border px-4 py-2.5', est.c)}>
              <div className="text-[11px] uppercase tracking-wider font-medium opacity-80">Status</div>
              <div className="text-lg font-bold">{est.t}</div>
            </div>
          </div>
        </div>

        {/* changes-requested banner (post-decision on drawings) */}
        {data.planosEstado?.estado === 'cambios' && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3.5 flex items-start gap-3">
            <RefreshCw size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-900 text-sm">Preparing the next version of the drawings</div>
              <p className="text-[13px] text-amber-800/90 mt-0.5">{data.planosEstado.mensaje}</p>
            </div>
          </div>
        )}

        {/* main grid: journey + schedule (left), actions + decisions (right) */}
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px] lg:items-start">

          {/* JOURNEY — top-left */}
          <div className={clsx(cardCls, 'order-1 lg:col-start-1 lg:row-start-1')}>
            <div className={hdCls}>
              <h2 className="font-semibold text-forest-700 flex items-center gap-2 text-[15px]"><Clock size={16} /> Your project journey</h2>
              <p className="text-xs text-stone-400 mt-0.5">Where things stand — the steps where you're involved.</p>
            </div>
            <div className="px-3 pt-7 pb-4">
              <div className="relative flex justify-between items-start">
                <div className="absolute left-[7%] right-[7%] top-[18px] h-[3px] rounded bg-stone-200" />
                <div className="absolute left-[7%] top-[18px] h-[3px] rounded bg-forest-600" style={{ width: `${N > 1 ? (idxSolido / (N - 1)) * 86 : 0}%` }} />
                {data.momentos.map((m) => (
                  <div key={m.codigo} className="relative flex flex-col items-center text-center" style={{ width: `${100 / N}%` }}>
                    {m.estado === 'now' && <span className="absolute -top-6 text-[9px] font-bold text-white bg-forest-600 rounded-full px-2 py-0.5">NOW</span>}
                    <span className={clsx('w-9 h-9 rounded-full flex items-center justify-center border-2 z-10',
                      m.estado === 'done' ? 'bg-emerald-600 border-emerald-600'
                        : m.estado === 'now' ? 'bg-white border-forest-600 ring-4 ring-forest-100'
                        : m.estado === 'na' ? 'bg-stone-50 border-stone-200 border-dashed'
                        : 'bg-white border-stone-300')}>
                      {m.estado === 'done' ? <Check size={17} className="text-white" />
                        : m.estado === 'now' ? <span className="w-3 h-3 rounded-full bg-forest-600" />
                        : m.estado === 'na' ? <Minus size={13} className="text-stone-300" />
                        : <Lock size={13} className="text-stone-300" />}
                    </span>
                    <span className={clsx('mt-2 text-[11px] font-medium leading-tight px-0.5',
                      m.estado === 'done' ? 'text-emerald-700' : m.estado === 'now' ? 'text-forest-700' : m.estado === 'na' ? 'text-stone-300' : 'text-stone-400')}>
                      {m.label}
                      {m.estado === 'na' && <span className="block text-[9px] font-normal text-stone-300">n/a</span>}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-stone-100 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-stone-400">
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> Done</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-forest-600" /> In progress</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-stone-300" /> Coming up</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-stone-200" /> Not applicable</span>
              </div>
            </div>
          </div>

          {/* YOU'RE UP NOW — top-right */}
          <div className="order-2 lg:col-start-2 lg:row-start-1">
            {data.pendientes.length > 0 ? (
              <div className="rounded-2xl border-2 border-forest-100 bg-white overflow-hidden shadow-[0_1px_3px_rgba(31,27,20,0.04)]">
                <div className="px-4 py-3 bg-forest-50 border-b border-forest-100">
                  <h2 className="font-semibold text-forest-700 flex items-center gap-2 text-[15px]"><Clock size={16} /> You're up now</h2>
                  <p className="text-xs text-forest-600/85 mt-0.5">Your response keeps the project moving. It's recorded.</p>
                </div>
                <div className="divide-y divide-stone-100">
                  {data.pendientes.map((p) => (
                    <div key={p.codigo} className="px-4 py-3.5">
                      <div className="font-semibold text-stone-800">{p.titulo}</div>
                      {p.fecha_planeada && <div className="text-xs text-stone-400 mb-2.5">Suggested before {dShort(p.fecha_planeada)}</div>}
                      {p.documento_url && (
                        <a href={p.documento_url} target="_blank" rel="noopener noreferrer"
                           className="inline-flex items-center gap-1.5 text-sm font-medium text-forest-700 hover:text-forest-900 mb-2.5">
                          <FileText size={15} /> View the document
                        </a>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => { setAction({ codigo: p.codigo, titulo: p.titulo, decision: 'aprobado' }); setComentario('') }}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-2">
                          <ThumbsUp size={15} /> Approve
                        </button>
                        <button onClick={() => { setAction({ codigo: p.codigo, titulo: p.titulo, decision: 'aprobado_con_comentarios' }); setComentario('') }}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900 border border-stone-300 rounded-lg px-3.5 py-2">
                          <MessageSquare size={15} /> With comments
                        </button>
                        <button onClick={() => { setAction({ codigo: p.codigo, titulo: p.titulo, decision: 'rechazado' }); setComentario('') }}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 hover:text-rose-700 rounded-lg px-2.5 py-2">
                          <X size={15} /> Request changes
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={clsx(cardCls, 'px-5 py-6 text-center')}>
                <Check className="mx-auto text-emerald-500" size={26} />
                <p className="mt-2 text-sm text-stone-600 font-medium">Nothing needed from you right now.</p>
                <p className="text-xs text-stone-400 mt-0.5">We'll let you know when there's something to review. The team is working on your project.</p>
              </div>
            )}
          </div>

          {/* YOUR DECISIONS — bottom-right */}
          {data.decisiones.length > 0 && (
            <div className={clsx(cardCls, 'order-3 lg:col-start-2 lg:row-start-2 overflow-hidden')}>
              <div className={hdCls}>
                <h2 className="font-semibold text-stone-700 flex items-center gap-2 text-[15px]"><ClipboardList size={16} /> Your decisions</h2>
                <p className="text-xs text-stone-400 mt-0.5">A record of what you approved or commented.</p>
              </div>
              <div className="divide-y divide-stone-100">
                {data.decisiones.map((d, i) => {
                  const lbl = DECISION_LABEL[d.decision]
                  return (
                    <div key={i} className="px-4 py-3 flex items-start gap-3">
                      <div className={clsx('shrink-0 mt-0.5', lbl.c)}>
                        {d.decision === 'rechazado' ? <MessageSquare size={16} /> : <Check size={16} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-stone-800">
                          <span className={clsx('font-semibold', lbl.c)}>{lbl.t}</span>
                          <span className="text-stone-500"> · {d.que}</span>
                        </div>
                        {d.comentario && <div className="text-[13px] text-stone-500 mt-0.5 italic">“{d.comentario}”</div>}
                      </div>
                      <div className="text-xs text-stone-400 shrink-0 whitespace-nowrap">{dShort(d.fecha)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* PROJECT SCHEDULE (by phase) — bottom-left */}
          {data.fases.length > 0 && (
            <div className={clsx(cardCls, 'order-4 lg:col-start-1 lg:row-start-2 overflow-hidden')}>
              <div className={hdCls}>
                <h2 className="font-semibold text-forest-700 flex items-center gap-2 text-[15px]"><CalendarClock size={16} /> Project schedule</h2>
                <p className="text-xs text-stone-400 mt-0.5">Your project, by phase.</p>
              </div>
              <div className="divide-y divide-card-border">
                {data.fases.map((f) => (
                  <div key={f.key} className="px-4 py-3 flex items-center gap-3">
                    <span className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                      f.estado === 'done' ? 'bg-emerald-50 text-emerald-700'
                        : f.estado === 'now' ? 'bg-forest-50 text-forest-600 ring-1 ring-forest-100'
                        : 'bg-[#F6F4EE] text-stone-400')}>
                      {f.estado === 'done' ? <Check size={16} /> : f.estado === 'now' ? <Clock size={15} /> : <ChevronRight size={15} />}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-stone-800">{f.label}</div>
                      <div className="text-[11.5px] text-stone-400">{f.detalle}</div>
                    </div>
                    <div className="ml-auto text-right shrink-0">
                      <span className={clsx('inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full',
                        f.estado === 'done' ? 'bg-emerald-50 text-emerald-700'
                          : f.estado === 'now' ? 'bg-forest-50 text-forest-600'
                          : 'bg-[#F6F4EE] text-stone-400')}>
                        {f.estado === 'done' ? 'Done' : f.estado === 'now' ? 'In progress' : 'Coming up'}
                      </span>
                      {(f.inicio || f.fin) && <div className="text-[11px] text-stone-400 mt-1">{dShort(f.inicio)}{f.fin ? ` – ${dShort(f.fin)}` : ''}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-stone-400 pt-6">Central Millwork · This tracker updates automatically.</p>
      </div>

      {/* confirm modal */}
      {action && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => !busy && setAction(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-stone-800">
              {action.decision === 'rechazado' ? 'Request changes' : 'Approve'}: {action.titulo}
            </h3>
            <p className="text-sm text-stone-500 mt-1">
              {action.decision === 'aprobado' ? 'You confirm you approve this item and the project can continue.'
                : action.decision === 'rechazado' ? 'Tell us what needs to change. The team will review it.'
                : 'Leave your comments. We\'ll take them into account as we continue.'}
            </p>
            {action.decision !== 'aprobado' && (
              <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3}
                        placeholder="Your comments…" className="input mt-3 w-full resize-none" />
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAction(null)} disabled={busy} className="px-3 py-2 text-sm font-medium text-stone-500 hover:text-stone-800">Cancel</button>
              <button onClick={confirmar} disabled={busy || (action.decision === 'rechazado' && !comentario.trim())}
                      className={clsx('px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50',
                        action.decision === 'rechazado' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700')}>
                {busy ? 'Sending…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#F6F4EE] flex items-center justify-center p-6">{children}</div>
}
