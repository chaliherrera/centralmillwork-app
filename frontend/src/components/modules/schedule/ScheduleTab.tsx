import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { CalendarClock, Lock, RefreshCw, Flag, ChevronRight } from 'lucide-react'
import { scheduleService, type ScheduleData, type ScheduleHito, type Semaforo } from '@/services/schedule'

// ─── Estilos de semáforo ──────────────────────────────────────────────────────
const SEM: Record<Semaforo, { dot: string; text: string; label: string; bg: string }> = {
  verde:    { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'En fecha',   bg: 'bg-emerald-50 border-emerald-200' },
  amarillo: { dot: 'bg-amber-500',   text: 'text-amber-700',   label: 'Ajustado',   bg: 'bg-amber-50 border-amber-200' },
  rojo:     { dot: 'bg-red-500',     text: 'text-red-700',     label: 'En riesgo',  bg: 'bg-red-50 border-red-200' },
  gris:     { dot: 'bg-gray-300',    text: 'text-gray-500',    label: 'En espera',  bg: 'bg-gray-50 border-gray-200' },
}

const FASE_LABEL: Record<string, string> = {
  CONTRACT: 'Contrato', ENGINEERING: 'Ingeniería', MATERIALS: 'Materiales',
  PRODUCTION: 'Producción', QC: 'Control de calidad', SHIPPING: 'Despacho',
  INSTALL: 'Instalación', COMPLETED: 'Cierre',
}

function fmt(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y.slice(2)}`
}

export default function ScheduleTab({ proyectoId }: { proyectoId: number }) {
  const [data, setData] = useState<ScheduleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fechaObjetivo, setFechaObjetivo] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await scheduleService.getPlan(proyectoId)
      setData(res.data)
    } catch { /* toast global */ } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [proyectoId])

  async function generar() {
    if (!fechaObjetivo) { toast.error('Elegí la fecha de entrega objetivo'); return }
    setBusy(true)
    try {
      await scheduleService.generar(proyectoId, fechaObjetivo)
      toast.success('Schedule generado')
      await load()
    } catch { /* toast global */ } finally { setBusy(false) }
  }
  async function recalcular() {
    setBusy(true)
    try {
      await scheduleService.recalcular(proyectoId)
      toast.success('Schedule recalculado')
      await load()
    } catch { /* toast global */ } finally { setBusy(false) }
  }

  // Agrupar hitos por fase (respetando el orden)
  const fases = useMemo(() => {
    const out: { fase: string; hitos: ScheduleHito[] }[] = []
    for (const h of data?.hitos ?? []) {
      let g = out[out.length - 1]
      if (!g || g.fase !== h.fase) { g = { fase: h.fase, hitos: [] }; out.push(g) }
      g.hitos.push(h)
    }
    return out
  }, [data])

  if (loading) return <div className="py-10 text-center text-gray-400 text-sm">Cargando schedule…</div>

  // ── Estado vacío: generar el plan ──────────────────────────────────────────
  if (!data?.plan) {
    return (
      <div className="max-w-lg mx-auto py-10 text-center">
        <CalendarClock className="mx-auto text-gray-300" size={40} />
        <h3 className="mt-3 text-lg font-semibold text-gray-800">Este proyecto todavía no tiene schedule</h3>
        <p className="mt-1 text-sm text-gray-500">
          Elegí la fecha de entrega comprometida con el cliente. El sistema calcula hacia atrás
          la fecha límite de cada hito.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <input type="date" value={fechaObjetivo} onChange={(e) => setFechaObjetivo(e.target.value)}
                 className="input w-44" />
          <button onClick={generar} disabled={busy}
                  className="btn-primary inline-flex items-center gap-2">
            <CalendarClock size={15} /> Generar schedule
          </button>
        </div>
      </div>
    )
  }

  const plan = data.plan
  const sem = SEM[plan.semaforo] ?? SEM.gris

  return (
    <div className="space-y-4">
      {/* ── Cabecera del plan ── */}
      <div className={clsx('rounded-xl border p-4 flex flex-wrap items-center gap-x-8 gap-y-3', sem.bg)}>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Entrega objetivo</div>
          <div className="text-2xl font-bold text-gray-900">{fmt(plan.fecha_objetivo)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Estado del proyecto</div>
          <div className={clsx('inline-flex items-center gap-2 text-lg font-semibold', sem.text)}>
            <span className={clsx('w-3 h-3 rounded-full', sem.dot)} /> {sem.label}
          </div>
        </div>
        {plan.holgura_dias !== null && (
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Holgura mínima</div>
            <div className={clsx('text-lg font-semibold', plan.holgura_dias < 0 ? 'text-red-700' : 'text-gray-800')}>
              {plan.holgura_dias} días hábiles
            </div>
          </div>
        )}
        <button onClick={recalcular} disabled={busy}
                className="ml-auto btn-secondary inline-flex items-center gap-2 text-sm">
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Recalcular
        </button>
      </div>

      <p className="text-xs text-gray-400">
        La fecha de entrega no se mueve sola: si un hito se atrasa, el proyecto se pone en rojo.
        Los hitos en gris esperan a que se cumplan los anteriores.
      </p>

      {/* ── Fases e hitos ── */}
      <div className="space-y-5">
        {fases.map(({ fase, hitos }) => (
          <div key={fase}>
            <div className="flex items-center gap-2 mb-1.5">
              <ChevronRight size={14} className="text-gray-400" />
              <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{FASE_LABEL[fase] ?? fase}</h4>
            </div>
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {hitos.map((h) => {
                const s = SEM[h.semaforo] ?? SEM.gris
                const isSub = !!h.parent_codigo
                return (
                  <div key={h.codigo}
                       className={clsx('flex items-center gap-3 px-3 py-2 text-sm', isSub && 'pl-8 bg-gray-50/50')}>
                    <span className={clsx('w-2.5 h-2.5 rounded-full shrink-0', s.dot)} />
                    <span className="font-mono text-xs text-gray-400 w-12 shrink-0">{h.codigo}</span>
                    <span className="flex-1 min-w-0 truncate text-gray-800">
                      {h.nombre}
                      {h.es_gate && <Lock size={11} className="inline ml-1.5 -mt-0.5 text-gray-400" />}
                      {h.es_ancla && <Flag size={11} className="inline ml-1.5 -mt-0.5 text-forest-600" />}
                    </span>
                    <span className="text-xs text-gray-500 w-20 text-right shrink-0" title="Fecha límite">
                      {fmt(h.fecha_planeada)}
                    </span>
                    <span className={clsx('text-xs w-20 text-right shrink-0',
                                          h.fecha_real ? 'text-emerald-700 font-medium' : 'text-gray-300')}
                          title="Fecha real">
                      {h.fecha_real ? fmt(h.fecha_real) : '—'}
                    </span>
                    <span className={clsx('text-[11px] w-16 text-right shrink-0', s.text)}>
                      {h.estado === 'cumplido' ? '✓' : h.holgura_dias !== null ? `${h.holgura_dias}d` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 text-[11px] text-gray-400 pt-1">
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> En fecha</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Ajustado</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> En riesgo</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-300" /> En espera</span>
        <span className="inline-flex items-center gap-1"><Lock size={11} /> Gate</span>
        <span className="inline-flex items-center gap-1"><Flag size={11} className="text-forest-600" /> Entrega</span>
      </div>
    </div>
  )
}
