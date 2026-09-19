import { useEffect, useMemo, useState, Fragment } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  CalendarClock, Check, Clock, ThumbsUp, MessageSquare, X,
  Lock, FileText, RefreshCw, ClipboardList, Minus,
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
  const [, m, day] = d.split('-').map(Number)
  return `${MONTHS[m - 1]} ${day}`
}
function dRange(a: string | null, b: string | null): string {
  if (!a) return ''
  return !b || a === b ? dShort(a) : `${dShort(a)} – ${dShort(b)}`
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
// drawing-revision status → English pill
function docPill(estado: string): { t: string; c: string } {
  if (estado === 'aprobado') return { t: 'Approved', c: 'bg-emerald-50 text-emerald-700' }
  if (estado === 'aprobado_con_comentarios') return { t: 'Approved w/ comments', c: 'bg-amber-50 text-amber-700' }
  if (estado === 'rechazado') return { t: 'Changes requested', c: 'bg-amber-50 text-amber-700' }
  return { t: 'Your review', c: 'bg-forest-50 text-forest-700' }
}

export default function ClientPortal({ previewProyectoId }: { previewProyectoId?: number } = {}) {
  const { token = '' } = useParams()
  const preview = previewProyectoId != null
  const [data, setData] = useState<PortalVista | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [action, setAction] = useState<{ codigo: string; titulo: string; decision: Decision } | null>(null)
  const [comentario, setComentario] = useState('')
  const [busy, setBusy] = useState(false)

  async function load(silent = false) {
    if (!silent) setLoading(true)
    setError(false)
    try {
      const res = preview ? await portalService.getPreview(previewProyectoId!) : await portalService.getVista(token)
      setData(res.data)
    }
    catch { if (!silent) setError(true) } finally { if (!silent) setLoading(false) }
  }
  // El tracker se actualiza solo (como promete el pie): recarga silenciosa cada 20s y al
  // volver a la pestaña, así el cliente ve el avance (planos aprobados, muestra lista…) sin refrescar.
  useEffect(() => {
    load()
    const iv = setInterval(() => load(true), 20_000)
    const alVolver = () => { if (document.visibilityState !== 'hidden') load(true) }
    window.addEventListener('focus', alVolver)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(iv)
      window.removeEventListener('focus', alVolver)
      document.removeEventListener('visibilitychange', alVolver)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, previewProyectoId])

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
  const openAction = (codigo: string, titulo: string, decision: Decision) => { setAction({ codigo, titulo, decision }); setComentario('') }

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
  const planPend = data.pendientes.find((p) => p.codigo === 'PLAN')
  const drawPend = data.pendientes.find((p) => p.codigo === 'E-07')
  const planApproved = data.momentos.find((m) => m.codigo === 'PLAN')?.estado === 'done'

  const cardCls = 'rounded-2xl border border-card-border bg-white shadow-[0_1px_3px_rgba(31,27,20,0.04)]'
  const hdCls = 'px-4 py-3 border-b border-card-border'
  const scrollToPlan = () => document.getElementById('plan-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className={clsx('bg-[#F6F4EE] text-stone-800', !preview && 'min-h-screen')}>
      <div className="bg-forest-600 text-white">
        <div className="max-w-[1120px] mx-auto px-5 py-3 flex items-center gap-2.5">
          <img src="/logo_cm_login.png" alt="" className="h-7 w-auto object-contain" />
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

        {/* changes-requested banner */}
        {data.planosEstado?.estado === 'cambios' && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3.5 flex items-start gap-3">
            <RefreshCw size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-900 text-sm">Preparing the next version of the drawings</div>
              <p className="text-[13px] text-amber-800/90 mt-0.5">{data.planosEstado.mensaje}</p>
            </div>
          </div>
        )}

        {/* JOURNEY — first, full width */}
        <div className={clsx(cardCls, 'mt-5')}>
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

        {/* GRID: plan (left) + your-project timeline (right) */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px] lg:items-start">

          {/* LEFT: Review & approve (Gantt) + Your decisions, apiladas */}
          <div className="lg:col-start-1 lg:row-start-1 space-y-4">
          <div id="plan-card" className={clsx('rounded-2xl bg-white overflow-hidden shadow-[0_1px_3px_rgba(31,27,20,0.04)]', planPend ? 'border-2 border-forest-200' : 'border border-card-border')}>
            <div className={clsx('px-4 py-3.5 border-b', planPend ? 'bg-forest-50 border-forest-100' : 'border-card-border')}>
              <h2 className="font-semibold text-forest-700 flex items-center gap-2 text-[15px]">
                <ClipboardList size={16} /> {planPend ? 'Review & approve your project plan' : 'Your project plan'}
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                {planPend ? 'This is the proposed schedule for your project. Please review it and approve, or request changes.' : 'The agreed schedule for your project.'}
              </p>
            </div>
            <div className="px-4 pt-3.5 pb-1 flex items-center gap-2 text-sm">
              <CalendarClock size={15} className="text-forest-600" />
              <span className="text-stone-500">Estimated delivery:</span>
              <span className="font-bold text-stone-900">{dLong(data.proyecto.fecha_objetivo)}</span>
            </div>
            <div className="mx-4 my-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3">
              <div className="text-[12.5px] font-bold text-rose-700">Project Schedule Responsibility</div>
              <p className="text-[11.5px] text-rose-800/90 mt-1 leading-relaxed">
                Please be advised that the items highlighted in red are dependent upon client action. The project schedule is based on these items being completed within the specified timeframe. Any delay in providing the required information, approvals, selections, or other client responsibilities may result in corresponding adjustments to the project schedule and final completion date.
              </p>
            </div>
            <Gantt gantt={data.gantt} deps={data.deps} />
            {planPend && !preview && (
              <div className="flex items-center gap-2 flex-wrap px-4 py-3.5 border-t border-stone-100">
                <button onClick={() => openAction('PLAN', 'your project plan', 'aprobado')}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-2">
                  <ThumbsUp size={15} /> Approve the plan
                </button>
                <button onClick={() => openAction('PLAN', 'your project plan', 'rechazado')}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 hover:text-rose-700 border border-rose-200 rounded-lg px-3.5 py-2">
                  <X size={15} /> Request changes
                </button>
              </div>
            )}
            {planPend && preview && (
              <div className="px-4 py-3 border-t border-stone-100 text-[11px] text-stone-400 italic">Preview — the client would approve or request changes to the plan here.</div>
            )}
          </div>
          {/* YOUR DECISIONS — debajo del plan/Gantt, misma columna */}
          {data.decisiones.length > 0 && (
            <div className={clsx(cardCls, 'overflow-hidden')}>
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
          </div>

          {/* RIGHT: unified "Your project" timeline (roadmap + documents) */}
          <div className={clsx(cardCls, 'lg:col-start-2 lg:row-start-1 overflow-hidden')}>
            <div className={hdCls}>
              <h2 className="font-semibold text-forest-700 flex items-center gap-2 text-[15px]"><ClipboardList size={16} /> Your project</h2>
              <p className="text-xs text-stone-400 mt-0.5">Every milestone, document and photo in one place. When we need you, the step shows the action here.</p>
            </div>
            <Timeline
              gantt={data.gantt}
              docs={data.documentos}
              fotos={data.fotos}
              planApproved={planApproved}
              drawPend={!!drawPend}
              preview={preview}
              onScrollPlan={scrollToPlan}
              onAct={(dec) => openAction('E-07', 'the shop drawings', dec)}
            />
          </div>
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

// ── Bar-timeline Gantt (names + month grid + bars + dates + dependency lines) ──
function Gantt({ gantt, deps }: { gantt: PortalVista['gantt']; deps: PortalVista['deps'] }) {
  const G = gantt.filter((t) => t.inicio && t.fin)
  if (!G.length) return <div className="px-4 py-6 text-sm text-stone-400">The schedule is being prepared.</div>
  const DAY = 86400000
  const ms = (s: string) => new Date(s + 'T00:00:00').getTime()
  let min = ms(G[0].inicio!), max = ms(G[0].fin!)
  G.forEach((t) => { const a = ms(t.inicio!), b = ms(t.fin!); if (a < min) min = a; if (b > max) max = b })
  const span = (max - min) / DAY + 2
  const pct = (s: string) => ((ms(s) - min) / DAY) / span * 100
  const months: number[] = []
  let cur = new Date(min); cur = new Date(cur.getFullYear(), cur.getMonth(), 1)
  while (cur.getTime() <= max) { months.push(cur.getTime()); cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1) }
  const mLeft = (m: number) => ((m - min) / DAY) / span * 100
  const ROW = 30, H = G.length * ROW
  const paths = deps.map(([a, b]) => {
    const ta = G[a], tb = G[b]
    if (!ta || !tb || !ta.fin || !tb.inicio) return null
    const ax = pct(ta.fin), ay = a * ROW + ROW / 2, bx = pct(tb.inicio), by = b * ROW + ROW / 2
    return `M ${ax} ${ay} H ${ax + 1.4} V ${by} H ${bx}`
  }).filter(Boolean) as string[]

  return (
    <div className="px-3 pt-2 pb-2 overflow-x-auto">
      <div style={{ minWidth: 760 }}>
        <div className="flex">
          {/* names */}
          <div className="shrink-0" style={{ width: 232, paddingTop: 24 }}>
            {G.map((t, i) => (
              <div key={i} style={{ height: ROW }} className={clsx('flex items-center gap-1.5 whitespace-nowrap text-[12.5px]', t.es_cliente ? 'text-rose-700 font-semibold' : 'text-stone-800')}>
                <span className="truncate">{t.nombre}</span>
                {t.es_cliente && <span className="shrink-0 text-[8.5px] font-bold uppercase tracking-wide text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-px">Your input</span>}
              </div>
            ))}
          </div>
          {/* plot */}
          <div className="flex-1 min-w-0">
            <div className="relative h-6">
              {months.map((m, i) => { const l = mLeft(m); return l >= 0 && l <= 100 ? <span key={i} style={{ left: `${l}%` }} className="absolute top-1 text-[10.5px] font-semibold text-stone-400">{MONTHS[new Date(m).getMonth()]}</span> : null })}
            </div>
            <div className="relative" style={{ height: H }}>
              {months.map((m, i) => { const l = mLeft(m); return l >= 0 && l <= 100 ? <span key={i} style={{ left: `${l}%` }} className="absolute top-0 bottom-0 w-px bg-stone-100" /> : null })}
              <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" height={H} className="absolute inset-0 w-full pointer-events-none overflow-visible">
                {paths.map((d, i) => <path key={i} d={d} fill="none" stroke="#cbb6ae" strokeWidth={1.1} vectorEffect="non-scaling-stroke" />)}
              </svg>
              {G.map((t, i) => {
                const l = pct(t.inicio!), w = Math.max(pct(t.fin!) - pct(t.inicio!), 0.8)
                const mile = t.inicio === t.fin
                return (
                  <Fragment key={i}>
                    {mile
                      ? <span style={{ left: `calc(${l}% - 6px)`, top: i * ROW + (ROW - 12) / 2 }} className={clsx('absolute w-3 h-3 rounded-sm rotate-45', t.es_cliente ? 'bg-rose-500' : 'bg-forest-600')} />
                      : <span style={{ left: `${l}%`, width: `${w}%`, top: i * ROW + (ROW - 13) / 2 }} className={clsx('absolute h-[13px] rounded-md', t.es_cliente ? 'bg-gradient-to-r from-rose-500 to-rose-400' : 'bg-stone-300')} />}
                    <span style={{ left: mile ? `calc(${l}% + 11px)` : `calc(${l}% + ${w}% + 6px)`, top: i * ROW + ROW / 2 - 6 }} className="absolute text-[9.5px] text-stone-400 whitespace-nowrap">{dRange(t.inicio, t.fin)}</span>
                  </Fragment>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Unified timeline: milestones (from the Gantt) + drawing revisions, by date ──
type TLItem =
  | { kind: 'task'; date: string | null; name: string; estado: string; fin: string | null; cli: boolean; clave: string | null }
  | { kind: 'doc'; date: string | null; rev: string; estado: string; comentario: string | null; url: string | null; pending: boolean }
  | { kind: 'plan'; date: string | null }

function Timeline({ gantt, docs, fotos, planApproved, drawPend, preview, onScrollPlan, onAct }: {
  gantt: PortalVista['gantt']; docs: PortalVista['documentos']; fotos: PortalVista['fotos']; planApproved: boolean; drawPend: boolean
  preview: boolean; onScrollPlan: () => void; onAct: (d: Decision) => void
}) {
  const samplePhotos = fotos.filter((f) => f.es_muestra)
  const fabPhotos = fotos.filter((f) => !f.es_muestra)
  const items: TLItem[] = []
  if (planApproved) items.push({ kind: 'plan', date: null })
  gantt.forEach((t) => items.push({ kind: 'task', date: t.inicio, name: t.nombre, estado: t.estado, fin: t.fin, cli: t.es_cliente, clave: t.clave ?? null }))
  // La revisión más nueva sin resolver es la accionable (si el cliente tiene la revisión pendiente).
  const pendingRev = drawPend ? docs.find((d) => d.estado !== 'aprobado') : undefined
  docs.forEach((d) => items.push({ kind: 'doc', date: d.fecha, rev: d.rev, estado: d.estado, comentario: d.comentario, url: d.url, pending: !!pendingRev && pendingRev.rev === d.rev }))
  // Orden cronológico; 'plan' primero.
  items.sort((a, b) => {
    if (a.kind === 'plan') return -1
    if (b.kind === 'plan') return 1
    return (a.date ?? '').localeCompare(b.date ?? '')
  })

  const dot = (s: 'done' | 'now' | 'up') => (
    <span className={clsx('absolute left-0 top-[15px] w-4 h-4 rounded-full grid place-items-center z-10 border-2',
      s === 'done' ? 'bg-emerald-600 border-emerald-600' : s === 'now' ? 'bg-white border-forest-600 ring-4 ring-forest-50' : 'bg-white border-stone-300')}>
      {s === 'done' && <Check size={9} className="text-white" />}
      {s === 'now' && <span className="w-1.5 h-1.5 rounded-full bg-forest-600" />}
    </span>
  )
  const taskStatus = (estado: string): 'done' | 'now' | 'up' => estado === 'hecha' ? 'done' : estado === 'en_curso' ? 'now' : 'up'

  return (
    <div className="px-4 py-2">
      {items.map((it, i) => {
        const last = i === items.length - 1
        if (it.kind === 'plan') return (
          <Row key={i} status="done" last={last} dot={dot}>
            <div className="flex items-baseline gap-2">
              <span className="text-[13.5px] font-semibold">Project plan</span>
              <span className="text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Approved</span>
            </div>
            <button onClick={onScrollPlan} className="text-xs font-semibold text-forest-700 mt-1.5 inline-flex items-center gap-1"><ClipboardList size={12} /> View plan</button>
          </Row>
        )
        if (it.kind === 'doc') {
          const p = docPill(it.estado)
          const s: 'done' | 'now' | 'up' = it.pending ? 'now' : it.estado === 'aprobado' ? 'done' : 'now'
          return (
            <Row key={i} status={s} last={last} dot={dot}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[13.5px] font-semibold">Shop drawings — {it.rev}</span>
                <span className={clsx('text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full', p.c)}>{p.t}</span>
                <span className="text-[11px] text-stone-400 ml-auto whitespace-nowrap">{dShort(it.date)}</span>
              </div>
              {it.comentario && <div className="text-[12px] text-stone-500 italic mt-1">“{it.comentario}”</div>}
              {it.url && <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-forest-700 mt-1.5 inline-flex items-center gap-1"><FileText size={12} /> View PDF</a>}
              {it.pending && !preview && (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => onAct('aprobado')} className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5">Approve</button>
                  <button onClick={() => onAct('rechazado')} className="text-xs font-semibold text-stone-600 border border-stone-300 rounded-lg px-3 py-1.5">Request changes</button>
                </div>
              )}
            </Row>
          )
        }
        const s = taskStatus(it.estado)
        const photos = it.clave === 'samples' ? samplePhotos : it.clave === 'fabrication' ? fabPhotos : []
        return (
          <Row key={i} status={s} last={last} dot={dot}>
            <div className="flex items-baseline gap-2">
              <span className={clsx('text-[13.5px]', s === 'up' ? 'font-medium text-stone-500' : 'font-semibold', it.cli && 'text-rose-700')}>{it.name}</span>
              {it.cli && <span className="text-[8.5px] font-bold uppercase tracking-wide text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-px">Your input</span>}
              <span className="text-[11px] text-stone-400 ml-auto whitespace-nowrap">{dRange(it.date, it.fin)}</span>
            </div>
            {photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto mt-2 pb-1">
                {photos.map((f, j) => (
                  <a key={j} href={f.url} target="_blank" rel="noopener noreferrer" title={f.comentario ?? undefined}
                     className="relative shrink-0 w-[78px] h-[58px] rounded-lg overflow-hidden border border-card-border bg-stone-50">
                    <img src={f.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    {(f.estacion || f.fecha) && (
                      <span className="absolute inset-x-0 bottom-0 text-[8px] text-white bg-black/45 px-1 py-0.5 text-center truncate capitalize">
                        {f.estacion ?? ''}{f.fecha ? ` · ${dShort(f.fecha)}` : ''}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            )}
          </Row>
        )
      })}
    </div>
  )
}

function Row({ status, last, dot, children }: { status: 'done' | 'now' | 'up'; last: boolean; dot: (s: 'done' | 'now' | 'up') => JSX.Element; children: React.ReactNode }) {
  return (
    <div className="relative pl-7 pb-0">
      {!last && <span className="absolute left-[7px] top-4 bottom-0 w-0.5 bg-stone-100" />}
      {dot(status)}
      <div className={clsx('py-3', status === 'now' && 'rounded-xl bg-forest-50 border border-forest-100 -ml-1 pl-2 pr-3')}>{children}</div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#F6F4EE] flex items-center justify-center p-6">{children}</div>
}
