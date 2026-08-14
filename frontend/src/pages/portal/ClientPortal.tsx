import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { CalendarClock, Check, Clock, ThumbsUp, MessageSquare, X, ShieldCheck } from 'lucide-react'
import { portalService, type PortalVista, type Decision } from '@/services/portal'

const FASE_LABEL: Record<string, string> = {
  CONTRACT: 'Contrato', ENGINEERING: 'Ingeniería', MATERIALS: 'Materiales', PRODUCTION: 'Producción',
  QC: 'Control de calidad', SHIPPING: 'Despacho', INSTALL: 'Instalación', COMPLETED: 'Cierre',
}
const SEM_DOT: Record<string, string> = { verde: 'bg-emerald-500', amarillo: 'bg-amber-500', rojo: 'bg-rose-500', gris: 'bg-stone-300' }
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

  async function load() {
    setLoading(true); setError(false)
    try { setData((await portalService.getVista(token)).data) }
    catch { setError(true) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [token])

  async function confirmar() {
    if (!action) return
    setBusy(true)
    try {
      await portalService.aprobar(token, action.codigo, action.decision, comentario || undefined)
      toast.success('¡Gracias! Registramos tu respuesta.')
      setAction(null); setComentario('')
      await load()
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

  return (
    <div className="min-h-screen bg-[#F6F4EE] text-stone-800">
      {/* barra superior */}
      <div className="bg-forest-600 text-white">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-2">
          <ShieldCheck size={18} className="opacity-90" />
          <span className="font-semibold tracking-tight">Central Millwork</span>
          <span className="ml-auto text-xs opacity-75">Seguimiento de proyecto</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
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

        {/* pendientes de aprobación */}
        {data.pendientes.length > 0 && (
          <div className="rounded-2xl border-2 border-forest-200 bg-white overflow-hidden">
            <div className="px-4 py-3 bg-forest-50 border-b border-forest-100">
              <h2 className="font-semibold text-forest-800 flex items-center gap-2"><Clock size={16} /> Necesitamos tu aprobación</h2>
              <p className="text-xs text-forest-700/80 mt-0.5">Cada aprobación permite que el proyecto avance. Tu respuesta queda registrada.</p>
            </div>
            <div className="divide-y divide-stone-100">
              {data.pendientes.map((p) => (
                <div key={p.codigo} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="flex-1 min-w-[180px]">
                      <div className="font-medium text-stone-800">{p.titulo}</div>
                      {p.fecha_planeada && <div className="text-xs text-stone-400">Sugerido antes del {fmt(p.fecha_planeada)}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setAction({ codigo: p.codigo, titulo: p.titulo, decision: 'aprobado' }); setComentario('') }}
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5">
                        <ThumbsUp size={14} /> Aprobar
                      </button>
                      <button onClick={() => { setAction({ codigo: p.codigo, titulo: p.titulo, decision: 'aprobado_con_comentarios' }); setComentario('') }}
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900 border border-stone-300 rounded-lg px-3 py-1.5">
                        <MessageSquare size={14} /> Con comentarios
                      </button>
                      <button onClick={() => { setAction({ codigo: p.codigo, titulo: p.titulo, decision: 'rechazado' }); setComentario('') }}
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 hover:text-rose-700 rounded-lg px-2.5 py-1.5">
                        <X size={14} /> Rechazar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* timeline */}
        <div>
          <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-2">El recorrido de tu proyecto</h2>
          <div className="space-y-2.5">
            {data.fases.map((f) => {
              const done = f.hitos.filter((h) => h.estado === 'cumplido').length
              return (
                <div key={f.fase} className="rounded-xl border border-card-border bg-white overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-stone-100">
                    <h3 className="font-semibold text-stone-800 text-sm">{FASE_LABEL[f.fase] ?? f.fase}</h3>
                    <span className="ml-auto text-xs text-stone-400">{done}/{f.hitos.length}</span>
                  </div>
                  <div className="divide-y divide-stone-50">
                    {f.hitos.map((h) => (
                      <div key={h.codigo} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <span className={clsx('w-2.5 h-2.5 rounded-full shrink-0', SEM_DOT[h.semaforo] ?? 'bg-stone-300')} />
                        <span className="flex-1 min-w-0 truncate text-stone-700">{h.nombre}</span>
                        {h.estado === 'cumplido'
                          ? <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5"><Check size={11} /> {fmt(h.fecha_real)}</span>
                          : <span className="text-[11px] text-stone-300">en curso</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

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
