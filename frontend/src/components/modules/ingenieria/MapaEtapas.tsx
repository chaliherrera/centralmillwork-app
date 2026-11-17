import { useEffect, useMemo, useState } from 'react'
import { Loader2, X, Layers } from 'lucide-react'
import { ingenieriaService, type IngCargaEtapas, type IngProyectoEtapa, type IngLookahead } from '@/services/ingenieria'

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

// ── Lookahead: una etapa + rango de semanas → día a día (qué proyectos, cuántos simultáneos) ──
function LookaheadPanel({ etapas, semanas }: { etapas: IngCargaEtapas['etapas']; semanas: string[] }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [etapa, setEtapa] = useState(etapas.find((e) => e.clave === 'fabrication')?.clave ?? etapas[0]?.clave ?? '')
  const [desde, setDesde] = useState(() => semanas.find((w) => w >= hoy) ?? semanas[0] ?? '')
  const [sem, setSem] = useState(3)
  const [data, setData] = useState<IngLookahead | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!etapa || !desde) { setData(null); return }
    setLoading(true)
    ingenieriaService.getLookahead(etapa, desde, sem).then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false))
  }, [etapa, desde, sem])

  const celC = (n: number) => n <= 0 ? '#f5f5f4' : n <= 2 ? '#bbf7d0' : n <= 4 ? '#fde68a' : '#fecaca'
  const dlabel = (iso: string) => d(iso).getDate()
  const DW = 24   // ancho de columna por día

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden w-full max-w-full min-w-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 flex-wrap">
        <Layers size={17} className="text-forest-600" />
        <h2 className="font-bold text-stone-800">Lookahead · día a día</h2>
        <div className="flex items-center gap-2 ml-auto text-xs flex-wrap">
          <select value={etapa} onChange={(e) => setEtapa(e.target.value)} className="rounded-lg border border-stone-300 px-2 py-1 text-stone-700">
            {etapas.map((e) => <option key={e.clave} value={e.clave}>{e.nombre}</option>)}
          </select>
          <select value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-stone-300 px-2 py-1 text-stone-700">
            {semanas.map((w) => <option key={w} value={w}>sem. {d(w).getDate()} {MES[d(w).getMonth()]}</option>)}
          </select>
          <div className="inline-flex rounded-lg border border-stone-200 p-0.5">
            {[1, 2, 3, 4, 6].map((n) => <button key={n} onClick={() => setSem(n)} className={`rounded-md px-2 py-0.5 font-semibold ${sem === n ? 'bg-forest-600 text-white' : 'text-stone-500 hover:text-stone-800'}`}>{n}s</button>)}
          </div>
        </div>
      </div>
      {loading ? <div className="py-10 text-center text-stone-400"><Loader2 className="animate-spin inline" size={18} /></div>
        : !data || !data.proyectos.length ? <div className="py-10 text-center text-stone-400 text-sm">Ningún proyecto en <b>{data?.etapa?.nombre ?? 'esa etapa'}</b> en el rango elegido.</div>
        : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: 240 + data.dias.length * DW }}>
            {/* días */}
            <div className="flex items-stretch border-b border-stone-100 bg-stone-50/60">
              <div className="shrink-0 px-3 py-1.5 text-[10px] uppercase tracking-wide text-stone-400 font-semibold" style={{ width: 180 }}>Proyecto</div>
              <div className="shrink-0 px-1 py-1.5 text-[10px] uppercase tracking-wide text-stone-400 font-semibold text-right" style={{ width: 60 }}>Ítems</div>
              {data.dias.map((dia, i) => <div key={i} className={`shrink-0 text-center text-[10px] text-stone-500 py-1.5 tabular-nums ${i % 5 === 0 ? 'border-l border-stone-200' : ''}`} style={{ width: DW }} title={dia}>{dlabel(dia)}</div>)}
            </div>
            {/* simultáneos */}
            <div className="flex items-stretch border-b border-stone-100 bg-forest-50/40">
              <div className="shrink-0 px-3 py-1 text-[11px] font-bold text-forest-700" style={{ width: 240 }}>Simultáneos</div>
              {data.simultaneos.map((n, i) => <div key={i} className="shrink-0 text-center text-[10px] font-bold tabular-nums flex items-center justify-center" style={{ width: DW, background: celC(n), color: n > 4 ? '#991b1b' : n > 2 ? '#92400e' : n > 0 ? '#166534' : '#a8a29e' }} title={`${n} proyecto${n === 1 ? '' : 's'}`}>{n || ''}</div>)}
            </div>
            {/* proyectos */}
            {data.proyectos.map((p, pi) => (
              <div key={pi} className="flex items-stretch border-b border-stone-50 hover:bg-stone-50/40">
                <div className="shrink-0 px-3 py-1.5 min-w-0" style={{ width: 180 }}>
                  <div className="text-[12px] font-medium text-stone-800 truncate">{p.proyecto_ext ?? p.nombre}</div>
                  <div className="text-[10px] text-stone-400 truncate">{p.asignado_nombre ?? 'sin asignar'}</div>
                </div>
                <div className="shrink-0 px-1 py-1.5 text-[11px] text-stone-500 tabular-nums text-right" style={{ width: 60 }}>{p.n_items ?? '—'}</div>
                {p.dias.map((on, i) => <div key={i} className={`shrink-0 ${i % 5 === 0 ? 'border-l border-stone-200' : ''}`} style={{ width: DW, background: on ? '#2f5e4f' : 'transparent' }} title={on ? `${p.proyecto_ext} trabaja el ${data.dias[i]}` : undefined} />)}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="px-4 py-2 text-[11px] text-stone-400 border-t border-stone-100">
        La barra verde = días en que ese proyecto trabaja esa etapa. "Simultáneos" = cuántos proyectos coinciden cada día. Los montos $ de millwork se agregan cuando definamos lo de costos.
      </div>
    </div>
  )
}

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
    <div className="space-y-4 w-full max-w-full min-w-0">
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
      <LookaheadPanel etapas={g.etapas} semanas={g.semanas} />
    </div>
  )
}
