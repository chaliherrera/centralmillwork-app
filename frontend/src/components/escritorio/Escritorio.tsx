import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, CheckCircle2, ClipboardList, ChevronDown, ChevronUp, ExternalLink, MessageSquarePlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { ingenieriaService, type EscritorioTarea } from '@/services/ingenieria'

// Etiqueta contextual del "completar" según el tipo de paso (mismo criterio que el
// escritorio del ingeniero): enviar = completar.
const CUMPLIDA_LABEL: Record<string, string> = {
  shop_drawings: 'Enviada al cliente',
  cnc: 'CNC a taller',
  field_measurements: 'Medida',
  sd_update: 'Set final listo',
  shipment: 'Enviado',
}
// Pasos que el propio rol COMPLETA a mano (trabajo interno + shipment). Los "de señal"
// (compras, producción, instalación) se cierran solos por el módulo → link, sin botón.
const COMPLETABLE = new Set([
  'meeting_designer', 'shop_drawings', 'samples', 'client_review',
  'field_measurements', 'sd_update', 'release', 'cnc', 'shipment',
])
// Deep-links a los módulos para los pasos de señal.
const LINK_MODULO: Record<string, { to: string; label: string }> = {
  long_leads: { to: '/mtos', label: 'Ir a Control MTOs' },
  material_proc: { to: '/mtos', label: 'Ir a Control MTOs' },
  fabrication: { to: '/produccion/ordenes', label: 'Ir a Producción' },
  installation: { to: '/produccion', label: 'Ir a Instalación' },
}
const shortProj = (p: string | null) => (p || '—').replace(/^\s*(\d{2}-\d{3})\s*/, '$1 · ')
const hoy = () => new Date().toISOString().slice(0, 10)
const fmtD = (iso: string | null) => {
  if (!iso) return '—'
  const [, m, d] = iso.split('-'); const M = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${+d} ${M[+m - 1]}`
}

export default function Escritorio({ rol, asignado, titulo, subtitulo }: {
  rol?: string; asignado?: string; titulo?: string; subtitulo?: string
}) {
  const qc = useQueryClient()
  const [verEspera, setVerEspera] = useState(false)
  const [fechas, setFechas] = useState<Record<number, string>>({})
  const [avisoOpen, setAvisoOpen] = useState<number | null>(null)
  const [avisoVal, setAvisoVal] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['escritorio', rol ?? '', asignado ?? ''],
    queryFn: () => ingenieriaService.escritorio({ rol, asignado }),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  })

  const completar = useMutation({
    mutationFn: ({ id, fecha }: { id: number; fecha: string }) =>
      ingenieriaService.avanceTarea(id, { estado: 'hecha', fecha_fin_real: fecha }),
    onSuccess: () => { toast.success('Tarea completada'); qc.invalidateQueries({ queryKey: ['escritorio'] }) },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo completar'),
  })

  // "Avisar al PM": el ingeniero no mueve fechas (son del PM, que replanifica 2×/semana);
  // le deja una señal libre pegada a la tarea — "no llego", "espero la madera", etc. — que el
  // PM ve en su plan. Reusa el canal reprogramacion_pedida/motivo (ya lo muestra IngenieriaPlan).
  const avisar = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string | null }) =>
      ingenieriaService.avanceTarea(id, { reprogramacion_pedida: true, reprogramacion_motivo: motivo }),
    onSuccess: () => { toast.success('Le avisamos al PM'); setAvisoOpen(null); setAvisoVal(''); qc.invalidateQueries({ queryKey: ['escritorio'] }) },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo enviar el aviso'),
  })
  const quitarAviso = useMutation({
    mutationFn: (id: number) => ingenieriaService.avanceTarea(id, { reprogramacion_pedida: false, reprogramacion_motivo: null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['escritorio'] }) },
  })

  const tareas = data?.data.tareas ?? []
  const bloqueadas = data?.data.bloqueadas ?? 0
  const porProyecto = useMemo(() => {
    const m = new Map<string, EscritorioTarea[]>()
    for (const t of tareas) { const k = t.proyecto_ext ?? '—'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(t) }
    return [...m.entries()]
  }, [tareas])

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100">
        <h2 className="font-bold text-stone-800 flex items-center gap-2"><ClipboardList size={17} /> {titulo ?? 'Mi escritorio'}</h2>
        <p className="text-xs text-stone-400">{subtitulo ?? 'Solo lo que te toca ahora, de todos tus proyectos — completá y aparece lo siguiente.'}</p>
      </div>

      {isLoading ? (
        <div className="py-14 text-center text-stone-400"><Loader2 className="animate-spin inline" size={22} /></div>
      ) : tareas.length === 0 ? (
        <div className="py-12 text-center">
          <CheckCircle2 className="inline text-emerald-500" size={26} />
          <p className="mt-2 text-sm text-stone-500">No tenés nada pendiente ahora mismo. 🎉</p>
        </div>
      ) : (
        <div className="divide-y divide-stone-100">
          {porProyecto.map(([proj, ts]) => (
            <div key={proj} className="px-4 py-3">
              <div className="text-[11px] font-bold text-forest-700 uppercase tracking-wide mb-2">{shortProj(proj)}</div>
              <div className="space-y-2">
                {ts.map((t) => {
                  const clave = t.tipo_clave ?? ''
                  const esCompletable = COMPLETABLE.has(clave)
                  const link = LINK_MODULO[clave]
                  const fecha = fechas[t.id] ?? hoy()
                  return (
                    <div key={t.id} className="rounded-lg border border-stone-200 px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-stone-800">{t.nombre}</div>
                          <div className="text-[11px] text-stone-400">plan {fmtD(t.fecha_inicio)} → {fmtD(t.fecha_fin)} · {t.dur_dias}d{t.estado === 'en_curso' ? ' · en curso' : ''}</div>
                        </div>
                        {esCompletable ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input type="date" value={fecha} onChange={(e) => setFechas((f) => ({ ...f, [t.id]: e.target.value }))}
                              className="text-xs border border-stone-300 rounded-lg px-2 py-1.5" title={CUMPLIDA_LABEL[clave] ?? 'Fecha de cumplimiento'} />
                            <button onClick={() => completar.mutate({ id: t.id, fecha })} disabled={completar.isPending}
                              className="inline-flex items-center gap-1 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1.5">
                              <CheckCircle2 size={13} /> {CUMPLIDA_LABEL[clave] ?? 'Completar'}
                            </button>
                          </div>
                        ) : link ? (
                          <Link to={link.to} className="inline-flex items-center gap-1 rounded-lg border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold px-2.5 py-1.5 shrink-0">
                            <ExternalLink size={13} /> {link.label}
                          </Link>
                        ) : (
                          <span className="text-[11px] text-stone-400 italic shrink-0">se cierra sola con el módulo</span>
                        )}
                        {/* Avisar al PM — señal libre, sin mover fechas */}
                        <button onClick={() => { setAvisoOpen(avisoOpen === t.id ? null : t.id); setAvisoVal(t.reprogramacion_motivo ?? '') }}
                          title="Avisar al PM (no llego, espero algo, contexto…)"
                          className={`inline-flex items-center rounded-lg px-1.5 py-1.5 shrink-0 ${t.reprogramacion_pedida ? 'text-amber-600 bg-amber-50' : 'text-stone-400 hover:bg-stone-100'}`}>
                          <MessageSquarePlus size={15} />
                        </button>
                      </div>

                      {/* Aviso ya enviado (colapsado) */}
                      {t.reprogramacion_pedida && avisoOpen !== t.id && (
                        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">
                          <MessageSquarePlus size={13} className="mt-0.5 shrink-0 text-amber-600" />
                          <span className="flex-1">Aviso al PM{t.reprogramacion_motivo ? <>: <span className="italic">“{t.reprogramacion_motivo}”</span></> : ' enviado'}</span>
                          <button onClick={() => quitarAviso.mutate(t.id)} className="shrink-0 font-semibold text-amber-700 hover:text-amber-900">quitar</button>
                        </div>
                      )}

                      {/* Editor del aviso */}
                      {avisoOpen === t.id && (
                        <div className="mt-2 flex items-center gap-2">
                          <MessageSquarePlus size={14} className="text-amber-600 shrink-0" />
                          <input autoFocus value={avisoVal} onChange={(e) => setAvisoVal(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') avisar.mutate({ id: t.id, motivo: avisoVal.trim() || null }); if (e.key === 'Escape') setAvisoOpen(null) }}
                            placeholder="Ej: no llego, movela · espero la madera del cliente…"
                            className="flex-1 rounded-lg border border-amber-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                          <button onClick={() => avisar.mutate({ id: t.id, motivo: avisoVal.trim() || null })} disabled={avisar.isPending}
                            className="text-sm font-semibold text-amber-700 hover:text-amber-800 px-2 whitespace-nowrap">Avisar al PM</button>
                          <button onClick={() => setAvisoOpen(null)} className="text-sm text-stone-400 hover:text-stone-600 px-1">Cancelar</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {bloqueadas > 0 && (
        <button onClick={() => setVerEspera((v) => !v)}
          className="w-full px-4 py-2.5 border-t border-stone-100 text-left text-xs font-medium text-stone-500 hover:bg-stone-50 flex items-center gap-1.5">
          {verEspera ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <b className="text-stone-700">{bloqueadas}</b> en espera (todavía no se cumplió su predecesor)
        </button>
      )}
    </div>
  )
}
