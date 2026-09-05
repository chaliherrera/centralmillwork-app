import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { toPng } from 'html-to-image'
import { CalendarClock, Check, Clock, ThumbsUp, MessageSquare, X, ShieldCheck, Lock, FileText, Download, Loader2 } from 'lucide-react'
import { portalService, type PortalVista, type Decision } from '@/services/portal'

function fmt(d: string | null): string {
  if (!d) return ''
  const [y, m, day] = d.split('-'); return `${day}/${m}/${y.slice(2)}`
}
function estadoCliente(sem: string): { t: string; c: string } {
  if (sem === 'rojo') return { t: 'Requiere atención', c: 'text-rose-700 bg-rose-50 border-rose-200' }
  if (sem === 'amarillo') return { t: 'En seguimiento', c: 'text-amber-700 bg-amber-50 border-amber-200' }
  if (sem === 'verde') return { t: 'En fecha', c: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
  return { t: 'En preparación', c: 'text-stone-600 bg-stone-50 border-stone-200' }
}

export default function ClientPortal() {
  const { token = '' } = useParams()
  const [data, setData] = useState<PortalVista | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [action, setAction] = useState<{ codigo: string; titulo: string; decision: Decision } | null>(null)
  const [comentario, setComentario] = useState('')
  const [busy, setBusy] = useState(false)
  const ganttRef = useRef<HTMLDivElement>(null)
  const [descargando, setDescargando] = useState(false)

  async function descargarGantt() {
    if (!ganttRef.current) return
    setDescargando(true)
    try {
      // skipFonts evita el error CORS al intentar inlinear el CSS de Google Fonts
      // (el PNG usa la fuente ya renderizada del DOM igual).
      const png = await toPng(ganttRef.current, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true, skipFonts: true })
      const a = document.createElement('a')
      a.href = png; a.download = `cronograma-${(data?.proyecto.nombre ?? 'proyecto').replace(/[^\w-]+/g, '_')}.png`
      a.click()
    } catch { toast.error('No se pudo generar la imagen') } finally { setDescargando(false) }
  }

  // silent=true refresca los datos SIN blanquear la pantalla con el spinner de carga
  // (tras aprobar). El full-screen loading solo va en la carga inicial.
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
      toast.success('¡Gracias! Registramos tu respuesta.')
      setAction(null); setComentario('')
      await load(true)   // refresco silencioso: no blanquea la pantalla
    } catch { /* toast global */ } finally { setBusy(false) }
  }

  const est = useMemo(() => estadoCliente(data?.proyecto.semaforo ?? 'gris'), [data])

  if (loading) return <Centered><div className="text-stone-400 text-sm">Cargando tu proyecto…</div></Centered>
  if (error || !data) return (
    <Centered>
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto"><X className="text-stone-400" /></div>
        <h1 className="mt-4 text-lg font-semibold text-stone-800">Link no válido</h1>
        <p className="mt-1 text-sm text-stone-500">Este enlace no es válido o fue desactivado. Contactá a Central Millwork para obtener uno nuevo.</p>
      </div>
    </Centered>
  )

  const N = data.momentos.length
  const idxNow = data.momentos.findIndex((m) => m.estado === 'now')
  const idxSolido = idxNow >= 0 ? idxNow : N - 1

  // Geometría del Gantt (la propuesta completa) sobre el eje de tiempo.
  const gantt = data.gantt
  const day = (d: string) => Math.floor(new Date(d + 'T00:00:00').getTime() / 86400000)
  const fechasG = gantt.flatMap((t) => [t.inicio, t.fin]).filter(Boolean) as string[]
  if (data.proyecto.fecha_objetivo) fechasG.push(data.proyecto.fecha_objetivo)
  const dMin = fechasG.length ? Math.min(...fechasG.map(day)) : 0
  const spanG = Math.max(1, (fechasG.length ? Math.max(...fechasG.map(day)) : 1) - dMin)
  const pctG = (d: string | null) => (d ? ((day(d) - dMin) / spanG) * 100 : 0)
  const MESG = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const mesesG: { label: string; left: number }[] = []
  if (gantt.length) {
    for (let dd = dMin; dd <= dMin + spanG; dd++) {
      const date = new Date(dd * 86400000); if (date.getUTCDate() > 3) continue
      const label = `${MESG[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(2)}`
      const left = ((dd - dMin) / spanG) * 100
      if (!mesesG.some((m) => m.label === label)) mesesG.push({ label, left })
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F4EE] text-stone-800">
      <div className="bg-forest-600 text-white">
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center gap-2">
          <ShieldCheck size={18} className="opacity-90" />
          <span className="font-semibold tracking-tight">Central Millwork</span>
          <span className="ml-auto text-xs opacity-75">Seguimiento de proyecto</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">
        {/* encabezado */}
        <div>
          {data.contacto && <div className="text-sm text-stone-500">Hola, {data.contacto}</div>}
          <h1 className="text-2xl font-bold text-stone-900 mt-0.5">{data.proyecto.nombre}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-card-border bg-white px-4 py-2.5">
              <div className="text-[11px] uppercase tracking-wider text-stone-400 font-medium flex items-center gap-1"><CalendarClock size={12} /> Entrega estimada</div>
              <div className="text-xl font-bold text-stone-900">{fmt(data.proyecto.fecha_objetivo) || '—'}</div>
            </div>
            <div className={clsx('rounded-xl border px-4 py-2.5', est.c)}>
              <div className="text-[11px] uppercase tracking-wider font-medium opacity-80">Estado</div>
              <div className="text-lg font-bold">{est.t}</div>
            </div>
          </div>
        </div>

        {/* mini-recorrido del cliente */}
        <div>
          <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Tu participación en el proyecto</div>
          <div className="rounded-2xl border border-card-border bg-white px-3 py-5"
               style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div className="relative flex justify-between items-start">
              {/* línea de fondo */}
              <div className="absolute left-[7%] right-[7%] top-[18px] h-[3px] rounded bg-stone-200" />
              <div className="absolute left-[7%] top-[18px] h-[3px] rounded bg-forest-600"
                   style={{ width: `${(idxSolido / (N - 1)) * 86}%` }} />
              {data.momentos.map((m) => (
                <div key={m.codigo} className="relative flex flex-col items-center text-center" style={{ width: `${100 / N}%` }}>
                  {m.estado === 'now' && (
                    <span className="absolute -top-6 text-[9px] font-bold text-white bg-forest-600 rounded-full px-2 py-0.5">AHORA</span>
                  )}
                  <span className={clsx('w-9 h-9 rounded-full flex items-center justify-center border-2 z-10',
                    m.estado === 'done' ? 'bg-emerald-600 border-emerald-600'
                      : m.estado === 'now' ? 'bg-white border-forest-600 ring-4 ring-forest-100'
                      : 'bg-white border-stone-300')}>
                    {m.estado === 'done' ? <Check size={17} className="text-white" />
                      : m.estado === 'now' ? <span className="w-3 h-3 rounded-full bg-forest-600" />
                      : <Lock size={13} className="text-stone-300" />}
                  </span>
                  <span className={clsx('mt-2 text-[11px] font-medium leading-tight px-0.5',
                    m.estado === 'done' ? 'text-emerald-700' : m.estado === 'now' ? 'text-forest-700' : 'text-stone-400')}>
                    {m.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cronograma del proyecto (Gantt completo) — la propuesta */}
        {gantt.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Cronograma del proyecto</span>
              <button onClick={descargarGantt} disabled={descargando}
                className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-forest-700 hover:text-forest-900 border border-forest-200 rounded-lg px-2.5 py-1">
                {descargando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Descargar
              </button>
            </div>
            <div ref={ganttRef} className="rounded-2xl border border-card-border bg-white p-4" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="text-[13px] font-bold text-stone-800 mb-3">{data.proyecto.nombre} · cronograma</div>
              <div className="overflow-x-auto"><div className="min-w-[560px]">
                <div className="flex items-stretch border-b border-stone-100 pb-1 mb-1">
                  <div className="shrink-0" style={{ width: 150 }} />
                  <div className="relative flex-1 h-4">
                    {mesesG.map((m, i) => <div key={i} className="absolute top-0 text-[9px] font-semibold text-stone-400" style={{ left: `${m.left}%` }}>{m.label}</div>)}
                  </div>
                </div>
                {gantt.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 py-0.5">
                    <div className={clsx('shrink-0 text-[11px] truncate flex items-center gap-1', t.es_cliente ? 'font-bold text-rose-700' : 'text-stone-600')} style={{ width: 150 }}>
                      {t.es_cliente && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />}
                      {t.nombre}
                    </div>
                    <div className="relative flex-1 h-4">
                      <div className={clsx('absolute top-0.5 h-3 rounded', t.es_cliente ? 'bg-rose-500' : t.estado === 'hecha' ? 'bg-emerald-400' : 'bg-forest-400')}
                        style={{ left: `${pctG(t.inicio)}%`, width: `${Math.max(1.2, pctG(t.fin) - pctG(t.inicio))}%` }} />
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-3 mt-3 pt-2 border-t border-stone-100 text-[10px] text-stone-500">
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> tus pasos</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-forest-400 inline-block" /> producción</span>
                  {data.proyecto.fecha_objetivo && <span className="ml-auto">Entrega: <b className="text-stone-700">{fmt(data.proyecto.fecha_objetivo)}</b></span>}
                </div>
                <div className="mt-2.5 text-[10.5px] text-rose-800 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-2 leading-snug">
                  Las tareas marcadas en <b>rojo</b> dependen de vos. El retraso en su cumplimiento pone en riesgo el cumplimiento de la fecha de entrega propuesta para el proyecto.
                </div>
              </div></div>
            </div>
          </div>
        )}

        {/* acciones que le tocan ahora */}
        {data.pendientes.length > 0 ? (
          <div className="rounded-2xl border-2 border-forest-200 bg-white overflow-hidden">
            <div className="px-4 py-3 bg-forest-50 border-b border-forest-100">
              <h2 className="font-semibold text-forest-800 flex items-center gap-2"><Clock size={16} /> Te toca a vos ahora</h2>
              <p className="text-xs text-forest-700/80 mt-0.5">Tu aprobación permite que el proyecto avance. Queda registrada.</p>
            </div>
            <div className="divide-y divide-stone-100">
              {data.pendientes.map((p) => (
                <div key={p.codigo} className="px-4 py-3.5">
                  <div className="font-semibold text-stone-800">{p.titulo}</div>
                  {p.fecha_planeada && <div className="text-xs text-stone-400 mb-2.5">Sugerido antes del {fmt(p.fecha_planeada)}</div>}
                  {p.documento_url && (
                    <a href={p.documento_url} target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-1.5 text-sm font-medium text-forest-700 hover:text-forest-900 mb-2.5">
                      <FileText size={15} /> Ver el documento
                    </a>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => { setAction({ codigo: p.codigo, titulo: p.titulo, decision: 'aprobado' }); setComentario('') }}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-2">
                      <ThumbsUp size={15} /> Aprobar
                    </button>
                    <button onClick={() => { setAction({ codigo: p.codigo, titulo: p.titulo, decision: 'aprobado_con_comentarios' }); setComentario('') }}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900 border border-stone-300 rounded-lg px-3.5 py-2">
                      <MessageSquare size={15} /> Con comentarios
                    </button>
                    <button onClick={() => { setAction({ codigo: p.codigo, titulo: p.titulo, decision: 'rechazado' }); setComentario('') }}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 hover:text-rose-700 rounded-lg px-2.5 py-2">
                      <X size={15} /> Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-card-border bg-white px-5 py-6 text-center">
            <Check className="mx-auto text-emerald-500" size={28} />
            <p className="mt-2 text-sm text-stone-600 font-medium">Por ahora no necesitamos nada de tu parte.</p>
            <p className="text-xs text-stone-400 mt-0.5">Te avisaremos cuando haya algo para aprobar. El equipo está trabajando en tu proyecto.</p>
          </div>
        )}

        <p className="text-center text-xs text-stone-400 pt-2">Central Millwork · Este seguimiento se actualiza automáticamente.</p>
      </div>

      {/* modal de confirmación */}
      {action && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => !busy && setAction(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-stone-800">
              {action.decision === 'rechazado' ? 'Rechazar' : 'Aprobar'}: {action.titulo}
            </h3>
            <p className="text-sm text-stone-500 mt-1">
              {action.decision === 'aprobado' ? 'Confirmás que aprobás este punto y el proyecto puede continuar.'
                : action.decision === 'rechazado' ? 'Contanos qué hay que corregir. El equipo lo revisará.'
                : 'Dejá tus comentarios. Los tendremos en cuenta al continuar.'}
            </p>
            {action.decision !== 'aprobado' && (
              <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3}
                        placeholder="Tus comentarios…" className="input mt-3 w-full resize-none" />
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAction(null)} disabled={busy} className="px-3 py-2 text-sm font-medium text-stone-500 hover:text-stone-800">Cancelar</button>
              <button onClick={confirmar} disabled={busy || (action.decision === 'rechazado' && !comentario.trim())}
                      className={clsx('px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50',
                        action.decision === 'rechazado' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700')}>
                {busy ? 'Enviando…' : 'Confirmar'}
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
