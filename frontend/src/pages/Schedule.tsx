import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Route, ChevronRight, Loader2, CalendarClock, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { scheduleService, type ProyectoOverview, type Semaforo } from '@/services/schedule'

// ─────────────────────────────────────────────────────────────────────────────
// Schedule — índice de la cartera. El estado de cada deal de un vistazo.
// Corte por PROYECTO (vs "Mi trabajo", que es corte por área). Read-only: navega
// al detalle; no actúa. El semáforo se corrige en vivo por vencimiento (el cron
// puede estar frío, pero fecha_planeada < hoy no miente).
// ─────────────────────────────────────────────────────────────────────────────

const FASE_LABEL: Record<string, string> = {
  CONTRACT: 'Contrato', ENGINEERING: 'Ingeniería', MATERIALS: 'Materiales', PRODUCTION: 'Producción',
  QC: 'QC', SHIPPING: 'Despacho', INSTALL: 'Instalación', COMPLETED: 'Cierre',
}
const SEM_DOT: Record<Semaforo, string> = { verde: 'bg-emerald-500', amarillo: 'bg-amber-500', rojo: 'bg-rose-600', gris: 'bg-stone-300' }
const SEM_LABEL: Record<Semaforo, string> = { verde: 'En fecha', amarillo: 'Ajustado', rojo: 'En riesgo', gris: 'En espera' }

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
}
function diffDias(a: string, b: string): number {
  return Math.round((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000)
}
// Semáforo efectivo: si hay hitos atrasados en vivo, es rojo aunque el guardado diga otra cosa.
const efectivo = (p: ProyectoOverview): Semaforo => (p.atrasados > 0 ? 'rojo' : p.semaforo)

export default function Schedule() {
  const nav = useNavigate()
  const [rows, setRows] = useState<ProyectoOverview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    scheduleService.getProyectosOverview()
      .then((r) => setRows(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const counts = useMemo(() => {
    const c = { rojo: 0, amarillo: 0, verde: 0, gris: 0 }
    rows.forEach((p) => { c[efectivo(p)]++ })
    return c
  }, [rows])

  return (
    <div className="max-w-6xl mx-auto py-6 px-1">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center">
          <Route className="text-forest-600" size={22} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-stone-900">Schedule</h1>
          <p className="text-sm text-stone-500">El estado de cada proyecto, de un vistazo. La columna vertebral del negocio.</p>
        </div>
        {!loading && rows.length > 0 && (
          <div className="hidden sm:flex items-center gap-2">
            {(['rojo', 'amarillo', 'verde'] as Semaforo[]).filter((s) => counts[s] > 0).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600">
                <span className={clsx('w-2 h-2 rounded-full', SEM_DOT[s])} /> {counts[s]} {SEM_LABEL[s].toLowerCase()}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center text-stone-400"><Loader2 className="animate-spin inline" size={24} /></div>
      ) : rows.length === 0 ? (
        <div className="max-w-md mx-auto py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-forest-50 flex items-center justify-center mx-auto">
            <CalendarClock className="text-forest-500" size={30} />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-stone-800">Todavía no hay proyectos con schedule</h3>
          <p className="mt-1.5 text-sm text-stone-500">Los proyectos arrancan su schedule desde <b className="text-stone-700">Estimados</b>, al firmar el contrato.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-card-border bg-white overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-stone-400 border-b border-stone-100 bg-[#faf8f2]">
                  <th className="py-2.5 pl-4 pr-2 font-semibold">Estado</th>
                  <th className="py-2.5 px-2 font-semibold">Proyecto</th>
                  <th className="py-2.5 px-2 font-semibold">Entrega</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Holgura</th>
                  <th className="py-2.5 px-2 font-semibold">Fase actual</th>
                  <th className="py-2.5 px-2 font-semibold">Qué sigue</th>
                  <th className="py-2.5 pr-4 pl-2 font-semibold text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {rows.map((p) => {
                  const sem = efectivo(p)
                  const slip = p.fecha_objetivo && p.fecha_objetivo_original && p.fecha_objetivo !== p.fecha_objetivo_original
                    ? diffDias(p.fecha_objetivo, p.fecha_objetivo_original) : 0
                  return (
                    <tr key={p.proyecto_id} onClick={() => nav(`/schedule/${p.proyecto_id}`)}
                        className="group cursor-pointer hover:bg-forest-50/40 transition-colors">
                      {/* Estado */}
                      <td className="py-3 pl-4 pr-2">
                        <span className="inline-flex items-center gap-2">
                          <span className={clsx('w-2.5 h-2.5 rounded-full shrink-0', SEM_DOT[sem])} />
                          <span className={clsx('text-xs font-medium',
                            sem === 'rojo' ? 'text-rose-700' : sem === 'amarillo' ? 'text-amber-700' : sem === 'verde' ? 'text-emerald-700' : 'text-stone-500')}>
                            {SEM_LABEL[sem]}
                          </span>
                        </span>
                      </td>
                      {/* Proyecto */}
                      <td className="py-3 px-2">
                        <div className="font-mono text-[11px] font-bold text-forest-700">{p.codigo}</div>
                        <div className="text-stone-700 truncate max-w-[220px]">{p.nombre}</div>
                      </td>
                      {/* Entrega + slip */}
                      <td className="py-3 px-2 whitespace-nowrap">
                        <div className="text-stone-800 tabular-nums">{fmt(p.fecha_objetivo)}</div>
                        {slip !== 0 && (
                          <div className={clsx('text-[10px] font-medium inline-flex items-center gap-0.5', slip > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                            {slip > 0 ? `movida +${slip}d` : `adelantada ${slip}d`}
                          </div>
                        )}
                      </td>
                      {/* Holgura */}
                      <td className="py-3 px-2 text-right whitespace-nowrap">
                        {p.holgura_dias !== null ? (
                          <span className={clsx('text-xs font-semibold tabular-nums rounded-full px-2 py-0.5',
                            p.holgura_dias < 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700')}>
                            {p.holgura_dias < 0 ? '' : '+'}{p.holgura_dias}d
                          </span>
                        ) : <span className="text-stone-300">—</span>}
                      </td>
                      {/* Fase actual */}
                      <td className="py-3 px-2 whitespace-nowrap">
                        <span className="text-stone-700">{p.prox_fase ? (FASE_LABEL[p.prox_fase] ?? p.prox_fase) : <span className="text-emerald-600 font-medium">Completado</span>}</span>
                        {p.atrasados > 0 && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-rose-700 bg-rose-50 rounded px-1 py-0.5">
                            <AlertTriangle size={9} /> {p.atrasados}
                          </span>
                        )}
                      </td>
                      {/* Qué sigue */}
                      <td className="py-3 px-2">
                        {p.prox_nombre ? (
                          <div className="max-w-[260px]">
                            <div className="text-stone-700 truncate">{p.prox_nombre}</div>
                            <div className="text-[11px] text-stone-400">
                              {p.prox_rol || '—'}{p.prox_fecha && <> · {fmt(p.prox_fecha)}</>}
                            </div>
                          </div>
                        ) : <span className="text-stone-300">—</span>}
                      </td>
                      {/* Chevron */}
                      <td className="py-3 pr-4 pl-2 text-right">
                        <ChevronRight size={16} className="inline text-stone-300 group-hover:text-forest-500 transition-colors" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
