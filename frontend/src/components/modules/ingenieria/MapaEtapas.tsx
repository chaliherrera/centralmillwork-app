import { useEffect, useMemo, useState } from 'react'
import { Loader2, X, Layers } from 'lucide-react'
import { ingenieriaService, type IngCargaEtapas, type IngProyectoEtapa } from '@/services/ingenieria'

// ─────────────────────────────────────────────────────────────────────────────
// Mapa de calor de ETAPAS del portafolio — herramienta de negociación de Estimados.
// Filas = etapas del proceso; columnas = semanas; celda = cuántos proyectos están en
// esa etapa esa semana (con fechas REALES del plan de ingeniería, no las teóricas).
// ─────────────────────────────────────────────────────────────────────────────

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DAY = 86400000
const d = (iso: string) => new Date(iso + 'T00:00:00')

// Marca la huella del plan sugerido del proyecto en negociación (prop sugerenciaExt).
const FOREST = '#2f5e4f'

export default function MapaEtapas({ sugerenciaExt }: { sugerenciaExt?: string } = {}) {
  const [carga, setCarga] = useState<IngCargaEtapas | null>(null)
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<{ etapa: string; nombre: string; sem: string } | null>(null)
  const [detail, setDetail] = useState<IngProyectoEtapa[] | null>(null)
  const [loadingDet, setLoadingDet] = useState(false)

  useEffect(() => {
    setLoading(true)
    ingenieriaService.getCargaEtapas(sugerenciaExt).then((r) => setCarga(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [sugerenciaExt])

  const hayOverlay = !!sugerenciaExt && !!carga?.etapas.some((e) => (e.overlay ?? []).some((v) => v > 0))

  const g = useMemo(() => {
    if (!carga || !carga.semanas.length || !carga.etapas.length) return null
    const semanas = carga.semanas, nWeeks = semanas.length
    const months: { label: string; startPct: number }[] = []
    semanas.forEach((w, i) => { const wd = d(w); const label = `${MES[wd.getMonth()]} ${String(wd.getFullYear()).slice(2)}`; const last = months[months.length - 1]; if (!last || last.label !== label) months.push({ label, startPct: (i / nWeeks) * 100 }) })
    const today = new Date(); today.setHours(0, 0, 0, 0)
    let hoyIdx = -1
    for (let i = 0; i < nWeeks; i++) { const ws = d(semanas[i]).getTime(); if (today.getTime() >= ws && today.getTime() < ws + 7 * DAY) { hoyIdx = i; break } }
    const hoyPct = hoyIdx >= 0 ? ((hoyIdx + (today.getTime() - d(semanas[hoyIdx]).getTime()) / (7 * DAY)) / nWeeks) * 100 : null
    return { semanas, nWeeks, months, hoyPct, etapas: carga.etapas }
  }, [carga])

  const abrir = async (etapa: string, nombre: string, sem: string) => {
    setSel({ etapa, nombre, sem }); setDetail(null); setLoadingDet(true)
    try { const r = await ingenieriaService.getEtapaDetalle(etapa, sem); setDetail(r.data ?? []) }
    catch { setDetail([]) } finally { setLoadingDet(false) }
  }

  if (loading) return <div className="py-16 text-center text-stone-400"><Loader2 className="animate-spin inline" size={20} /></div>
  if (!g) return <div className="py-12 text-center text-stone-400 text-sm">Sin datos de etapas todavía.</div>

  // color por CANTIDAD de proyectos en la etapa: libre / 1-2 / 3-4 / 5+ (congestión)
  const cell = (n: number): { bg: string; txt: string } => {
    if (n <= 0) return { bg: '#f5f5f4', txt: '' }
    if (n <= 2) return { bg: '#bbf7d0', txt: '#166534' }
    if (n <= 4) return { bg: '#fde68a', txt: '#92400e' }
    return { bg: '#fecaca', txt: '#991b1b' }
  }
  const fmtW = (w: string) => `${d(w).getDate()} ${MES[d(w).getMonth()]}`
  const GUT = 220

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
        <Layers size={17} className="text-forest-600" />
        <h2 className="font-bold text-stone-800">Portafolio por etapas · cada semana</h2>
        <span className="ml-auto text-xs text-stone-400">
          {hayOverlay ? <>el <b className="text-forest-700">borde verde</b> = dónde caería este proyecto</> : 'cuántos proyectos hay en cada etapa · click para verlos'}
        </span>
      </div>
      <div className="overflow-x-auto"><div className="min-w-[880px]">
        <div className="flex items-stretch border-b border-stone-100 bg-stone-50/60">
          <div className="shrink-0 px-3 py-1.5 text-[10px] uppercase tracking-wide text-stone-400 font-semibold" style={{ width: GUT }}>Etapa</div>
          <div className="relative flex-1 h-7">
            {g.months.map((m, i) => <div key={i} className="absolute top-0 bottom-0 border-l border-stone-200 flex items-center pl-1.5 text-[10.5px] font-semibold text-forest-700" style={{ left: `${m.startPct}%` }}>{m.label}</div>)}
            {g.hoyPct !== null && <div className="absolute top-0 bottom-0 border-l-2 border-rose-400 z-10" style={{ left: `${g.hoyPct}%` }}><span className="absolute top-0 left-1 text-[9px] font-bold text-rose-500">hoy</span></div>}
          </div>
        </div>
        {g.etapas.map((e) => (
          <div key={e.clave} className="flex items-center border-b border-stone-50 hover:bg-stone-50/40">
            <div className="shrink-0 px-3 py-1.5 flex items-center gap-2" style={{ width: GUT }}>
              <span className="text-[12.5px] font-semibold text-stone-700 truncate flex-1">{e.nombre}</span>
              {e.hito && <span className="text-[9px] font-mono text-stone-400">{e.hito}</span>}
            </div>
            <div className="flex-1 flex gap-px py-1">
              {g.semanas.map((wk, i) => { const n = e.counts[i] ?? 0; const ov = e.overlay?.[i] ?? 0; const c = cell(n); return (
                <button key={i} onClick={() => n > 0 && abrir(e.clave, e.nombre, wk)} disabled={n <= 0}
                  title={ov > 0
                    ? `${e.nombre} · ${fmtW(wk)}: este proyecto caería acá${n > 0 ? ` — encima de ${n} proyecto${n === 1 ? '' : 's'} ya comprometido${n === 1 ? '' : 's'}` : ' (semana libre)'}`
                    : `${e.nombre} · ${fmtW(wk)}: ${n} proyecto${n === 1 ? '' : 's'}${n > 0 ? ' — click para ver' : ''}`}
                  className={`relative flex-1 h-6 rounded-sm flex items-center justify-center text-[10px] font-bold transition-shadow ${n > 0 ? 'cursor-pointer hover:ring-2 hover:ring-forest-400' : 'cursor-default'}`}
                  style={{ background: c.bg, color: c.txt, boxShadow: ov > 0 ? `inset 0 0 0 2px ${FOREST}` : undefined }}>
                  {n > 0 ? n : ''}
                  {ov > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-2 ring-white" style={{ background: FOREST }} />}
                </button>
              ) })}
            </div>
          </div>
        ))}
      </div></div>
      <div className="px-4 py-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500 items-center border-t border-stone-100">
        <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm inline-block" style={{ background: '#f5f5f4' }} /> libre</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm inline-block" style={{ background: '#bbf7d0' }} /> 1-2 proyectos</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm inline-block" style={{ background: '#fde68a' }} /> 3-4</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm inline-block" style={{ background: '#fecaca' }} /> 5+ (congestión)</span>
        {hayOverlay && <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm inline-block ring-1 ring-white" style={{ background: '#f5f5f4', boxShadow: `inset 0 0 0 2px ${FOREST}` }} /> este proyecto (sugerido)</span>}
        <span className="italic text-stone-400">El número es cuántos proyectos están en esa etapa esa semana.</span>
      </div>

      {sel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSel(null)}>
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
              <Layers size={16} className="text-forest-600" />
              <div>
                <div className="font-bold text-stone-800 text-sm">{sel.nombre}</div>
                <div className="text-xs text-stone-400">semana del {fmtW(sel.sem)}{detail ? ` · ${detail.length} proyecto${detail.length === 1 ? '' : 's'}` : ''}</div>
              </div>
              <button onClick={() => setSel(null)} className="ml-auto text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto">
              {loadingDet ? <div className="py-10 text-center text-stone-400"><Loader2 className="animate-spin inline" size={18} /></div>
                : !detail || !detail.length ? <div className="py-10 text-center text-stone-400 text-sm">Sin proyectos.</div>
                : <div className="divide-y divide-stone-100">
                    {detail.map((t, i) => (
                      <div key={i} className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-stone-800 flex-1">{t.proyecto_ext ?? '—'}</span>
                          <span className="text-[11px] text-stone-500">{t.asignado_nombre ?? 'sin asignar'}</span>
                        </div>
                        <div className="text-[11px] text-stone-400 mt-0.5">{t.nombre} · {t.fecha_inicio ? fmtW(t.fecha_inicio) : '?'} → {t.fecha_fin ? fmtW(t.fecha_fin) : '?'}</div>
                      </div>
                    ))}
                  </div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
