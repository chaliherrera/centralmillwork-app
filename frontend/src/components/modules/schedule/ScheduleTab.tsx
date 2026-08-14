import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  CalendarClock, Lock, RefreshCw, Flag, Check, AlertTriangle,
  FileSignature, Ruler, Package, Hammer, ShieldCheck, Truck, Wrench, PartyPopper,
} from 'lucide-react'
import { scheduleService, type ScheduleData, type ScheduleHito, type Semaforo } from '@/services/schedule'

// ─── Paleta de semáforo, armonizada con la estética cálida de la app ──────────
const SEM: Record<Semaforo, {
  dot: string; text: string; soft: string; ring: string; label: string; accent: string
}> = {
  verde:    { dot: 'bg-emerald-600', text: 'text-emerald-800', soft: 'bg-emerald-50', ring: 'ring-emerald-100', label: 'En fecha',  accent: 'border-l-emerald-500' },
  amarillo: { dot: 'bg-amber-500',   text: 'text-amber-800',   soft: 'bg-amber-50',   ring: 'ring-amber-100',   label: 'Ajustado',  accent: 'border-l-amber-500' },
  rojo:     { dot: 'bg-rose-600',    text: 'text-rose-800',    soft: 'bg-rose-50',    ring: 'ring-rose-100',    label: 'En riesgo', accent: 'border-l-rose-500' },
  gris:     { dot: 'bg-stone-300',   text: 'text-stone-500',   soft: 'bg-stone-50',   ring: 'ring-stone-100',   label: 'En espera', accent: 'border-l-stone-300' },
}

const FASES: { key: string; label: string; corto: string; icon: typeof Package }[] = [
  { key: 'CONTRACT',    label: 'Contrato',   corto: 'Contrato',  icon: FileSignature },
  { key: 'ENGINEERING', label: 'Ingeniería', corto: 'Ingen.',    icon: Ruler },
  { key: 'MATERIALS',   label: 'Materiales', corto: 'Materiales', icon: Package },
  { key: 'PRODUCTION',  label: 'Producción', corto: 'Producc.',  icon: Hammer },
  { key: 'QC',          label: 'Control de calidad', corto: 'QC', icon: ShieldCheck },
  { key: 'SHIPPING',    label: 'Despacho',   corto: 'Despacho',  icon: Truck },
  { key: 'INSTALL',     label: 'Instalación', corto: 'Instal.',  icon: Wrench },
  { key: 'COMPLETED',   label: 'Cierre',     corto: 'Cierre',    icon: PartyPopper },
]
const FASE_META = Object.fromEntries(FASES.map((f) => [f.key, f]))

function fmt(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y.slice(2)}`
}
function diasHasta(d: string): number {
  const [y, m, day] = d.split('-').map(Number)
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const target = new Date(y, m - 1, day)
  return Math.round((target.getTime() - t.getTime()) / 86400000)
}

interface FaseGroup { key: string; hitos: ScheduleHito[]; total: number; cumplidos: number; semaforo: Semaforo }

export default function ScheduleTab({ proyectoId }: { proyectoId: number }) {
  const [data, setData] = useState<ScheduleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fechaObjetivo, setFechaObjetivo] = useState('')

  async function load() {
    setLoading(true)
    try { setData((await scheduleService.getPlan(proyectoId)).data) }
    catch { /* toast global */ } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [proyectoId])

  async function generar() {
    if (!fechaObjetivo) { toast.error('Elegí la fecha de entrega objetivo'); return }
    setBusy(true)
    try { await scheduleService.generar(proyectoId, fechaObjetivo); toast.success('Schedule generado'); await load() }
    catch { /* toast */ } finally { setBusy(false) }
  }
  async function recalcular() {
    setBusy(true)
    try { await scheduleService.recalcular(proyectoId); toast.success('Schedule recalculado'); await load() }
    catch { /* toast */ } finally { setBusy(false) }
  }

  const { fases, totalHitos, totalCumplidos } = useMemo(() => {
    const rank: Record<Semaforo, number> = { gris: 0, verde: 1, amarillo: 2, rojo: 3 }
    const out: FaseGroup[] = []
    let tot = 0, cum = 0
    for (const h of data?.hitos ?? []) {
      if (h.parent_codigo) continue // los sub-hitos no cuentan para el progreso de fase
      let g = out.find((x) => x.key === h.fase)
      if (!g) { g = { key: h.fase, hitos: [], total: 0, cumplidos: 0, semaforo: 'gris' }; out.push(g) }
      g.hitos.push(h); g.total++; tot++
      if (h.estado === 'cumplido') { g.cumplidos++; cum++ }
      if (h.estado !== 'cumplido' && h.semaforo !== 'gris' && rank[h.semaforo] > rank[g.semaforo]) g.semaforo = h.semaforo
    }
    // sub-hitos: adjuntarlos a su fase igual para mostrarlos
    for (const h of data?.hitos ?? []) {
      if (!h.parent_codigo) continue
      const g = out.find((x) => x.key === h.fase); if (g) g.hitos.push(h)
    }
    // reordenar hitos de cada fase por orden original
    for (const g of out) g.hitos.sort((a, b) => a.orden - b.orden)
    return { fases: out, totalHitos: tot, totalCumplidos: cum }
  }, [data])

  if (loading) return <div className="py-16 text-center text-stone-400 text-sm">Cargando schedule…</div>

  // ── Estado vacío ───────────────────────────────────────────────────────────
  if (!data?.plan) {
    return (
      <div className="max-w-md mx-auto py-14 text-center">
        <div className="w-16 h-16 rounded-2xl bg-forest-50 flex items-center justify-center mx-auto">
          <CalendarClock className="text-forest-500" size={30} />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-stone-800">Este proyecto todavía no tiene schedule</h3>
        <p className="mt-1.5 text-sm text-stone-500 leading-relaxed">
          Elegí la fecha de entrega comprometida con el cliente. El sistema calcula hacia atrás
          la fecha límite de cada hito y lo mantiene vivo con lo que pasa en la operación.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <input type="date" value={fechaObjetivo} onChange={(e) => setFechaObjetivo(e.target.value)} className="input w-44" />
          <button onClick={generar} disabled={busy} className="btn-primary">
            <CalendarClock size={16} /> Generar schedule
          </button>
        </div>
      </div>
    )
  }

  const plan = data.plan
  const sem = SEM[plan.semaforo] ?? SEM.gris
  const pct = totalHitos ? Math.round((totalCumplidos / totalHitos) * 100) : 0
  const dias = diasHasta(plan.fecha_objetivo)

  return (
    <div className="space-y-5">
      {/* ── HERO ── */}
      <div className="rounded-2xl border border-card-border bg-white overflow-hidden"
           style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)' }}>
        <div className="flex flex-wrap items-stretch">
          {/* Entrega */}
          <div className="flex-1 min-w-[220px] p-5 border-r border-card-border">
            <div className="text-[11px] uppercase tracking-wider text-stone-400 font-medium">Entrega objetivo</div>
            <div className="mt-1 text-3xl font-bold text-stone-900 tabular-nums">{fmt(plan.fecha_objetivo)}</div>
            <div className={clsx('mt-1 text-sm font-medium', dias < 0 ? 'text-rose-600' : 'text-stone-500')}>
              {dias < 0 ? `${Math.abs(dias)} días atrasado` : dias === 0 ? 'Es hoy' : `Faltan ${dias} días`}
            </div>
          </div>
          {/* Estado */}
          <div className={clsx('flex-1 min-w-[220px] p-5 border-r border-card-border', sem.soft)}>
            <div className="text-[11px] uppercase tracking-wider text-stone-400 font-medium">Estado del proyecto</div>
            <div className={clsx('mt-1.5 inline-flex items-center gap-2 text-xl font-bold', sem.text)}>
              <span className={clsx('w-3.5 h-3.5 rounded-full ring-4', sem.dot, sem.ring)} />
              {sem.label}
            </div>
            {plan.holgura_dias !== null && (
              <div className={clsx('mt-1.5 text-sm', plan.holgura_dias < 0 ? 'text-rose-600 font-medium' : 'text-stone-500')}>
                {plan.holgura_dias < 0
                  ? <span className="inline-flex items-center gap-1"><AlertTriangle size={13} /> {Math.abs(plan.holgura_dias)} días comidos del margen</span>
                  : `Holgura mínima: ${plan.holgura_dias} días hábiles`}
              </div>
            )}
          </div>
          {/* Progreso */}
          <div className="flex-1 min-w-[220px] p-5 flex flex-col justify-center">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-stone-400 font-medium">Avance</span>
              <span className="text-sm font-semibold text-stone-700 tabular-nums">{totalCumplidos}/{totalHitos} hitos · {pct}%</span>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-stone-100 overflow-hidden">
              <div className="h-full rounded-full bg-forest-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <button onClick={recalcular} disabled={busy}
                    className="mt-3 self-start inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 transition-colors">
              <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Recalcular
            </button>
          </div>
        </div>
      </div>

      {/* ── STEPPER de fases ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {fases.map((g) => {
          const meta = FASE_META[g.key]; const s = SEM[g.semaforo] ?? SEM.gris
          const Icon = meta?.icon ?? Package
          const done = g.total > 0 && g.cumplidos === g.total
          return (
            <div key={g.key}
                 className={clsx('flex-1 min-w-[92px] rounded-xl border px-2.5 py-2 bg-white',
                                 done ? 'border-emerald-200' : 'border-card-border')}>
              <div className="flex items-center gap-1.5">
                <span className={clsx('w-2 h-2 rounded-full', done ? 'bg-emerald-500' : s.dot)} />
                <Icon size={13} className="text-stone-400" />
              </div>
              <div className="mt-1 text-[11px] font-semibold text-stone-700 leading-tight">{meta?.corto ?? g.key}</div>
              <div className="text-[10px] text-stone-400 tabular-nums">{g.cumplidos}/{g.total}</div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-stone-400 flex items-center gap-1.5">
        <Flag size={12} className="text-forest-500" />
        La fecha de entrega no se mueve sola. Los hitos en verde ya ocurrieron; los grises esperan a los anteriores.
      </p>

      {/* ── FASES ── */}
      <div className="space-y-3.5">
        {fases.map((g) => {
          const meta = FASE_META[g.key]; const s = SEM[g.semaforo] ?? SEM.gris
          const Icon = meta?.icon ?? Package
          const done = g.total > 0 && g.cumplidos === g.total
          const pctF = g.total ? Math.round((g.cumplidos / g.total) * 100) : 0
          return (
            <div key={g.key} className={clsx('rounded-xl border border-card-border bg-white border-l-4', done ? 'border-l-emerald-500' : s.accent)}
                 style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              {/* header de fase */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100">
                <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', done ? 'bg-emerald-50' : 'bg-stone-50')}>
                  <Icon size={16} className={done ? 'text-emerald-600' : 'text-stone-500'} />
                </div>
                <h4 className="font-semibold text-stone-800">{meta?.label ?? g.key}</h4>
                <div className="ml-auto flex items-center gap-2.5">
                  <div className="w-24 h-1.5 rounded-full bg-stone-100 overflow-hidden hidden sm:block">
                    <div className={clsx('h-full rounded-full', done ? 'bg-emerald-500' : 'bg-forest-400')} style={{ width: `${pctF}%` }} />
                  </div>
                  <span className="text-xs font-medium text-stone-400 tabular-nums">{g.cumplidos}/{g.total}</span>
                </div>
              </div>
              {/* timeline de hitos */}
              <ol className="relative ml-6 my-1 border-l border-stone-200">
                {g.hitos.map((h) => {
                  const hs = SEM[h.semaforo] ?? SEM.gris
                  const isSub = !!h.parent_codigo
                  const cumplido = h.estado === 'cumplido'
                  return (
                    <li key={h.codigo} className="relative py-2 pl-4 pr-4">
                      <span className={clsx('absolute -left-[7px] top-3.5 rounded-full ring-2 ring-white',
                                            isSub ? 'w-2 h-2' : 'w-3 h-3', hs.dot)} />
                      <div className="flex items-center gap-2">
                        <span className={clsx('font-mono text-[10px] shrink-0 w-11',
                                              cumplido ? 'text-emerald-600' : 'text-stone-300')}>{h.codigo}</span>
                        <span className={clsx('flex-1 min-w-0 truncate', isSub ? 'text-[13px] text-stone-500' : 'text-sm text-stone-800')}>
                          {h.nombre}
                          {h.es_gate && (
                            <span className="inline-flex items-center gap-0.5 ml-1.5 align-middle text-[10px] font-medium text-stone-400 bg-stone-100 rounded px-1 py-px">
                              <Lock size={9} /> gate
                            </span>
                          )}
                          {h.es_ancla && (
                            <span className="inline-flex items-center gap-0.5 ml-1.5 align-middle text-[10px] font-semibold text-forest-600 bg-forest-50 rounded px-1 py-px">
                              <Flag size={9} /> entrega
                            </span>
                          )}
                        </span>

                        {/* fecha real / límite */}
                        {cumplido ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 shrink-0">
                            <Check size={11} /> {fmt(h.fecha_real)}
                          </span>
                        ) : (
                          <>
                            <span className="text-[11px] text-stone-400 shrink-0 tabular-nums w-16 text-right" title="Fecha límite">
                              {fmt(h.fecha_planeada)}
                            </span>
                            {h.semaforo !== 'gris' && h.holgura_dias !== null && (
                              <span className={clsx('text-[10px] font-medium rounded-full px-1.5 py-0.5 shrink-0 tabular-nums', hs.soft, hs.text)}>
                                {h.holgura_dias < 0 ? `${h.holgura_dias}d` : `+${h.holgura_dias}d`}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          )
        })}
      </div>

      {/* leyenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-400 pt-1">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> En fecha</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Ajustado</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-600" /> En riesgo</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-stone-300" /> En espera</span>
        <span className="inline-flex items-center gap-1"><Lock size={11} /> Punto de bloqueo</span>
        <span className="inline-flex items-center gap-1"><Flag size={11} className="text-forest-600" /> Entrega final</span>
        <span className="ml-auto text-stone-300">columna derecha: fecha real (verde) o fecha límite + holgura</span>
      </div>
    </div>
  )
}
