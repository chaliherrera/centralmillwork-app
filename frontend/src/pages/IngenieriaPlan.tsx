import { useEffect, useMemo, useState } from 'react'
import { Users, Layers, ClipboardList, Plus, X, Loader2, Trash2, Gauge, Check, FolderKanban, Activity, AlertTriangle } from 'lucide-react'
import { ingenieriaService, type IngProyecto, type IngTarea, type TareaInput, type IngPlan, type IngTareaPlan, type IngArista, type IngCarga, type IngTareaCelda } from '@/services/ingenieria'
import MapaEtapas from '@/components/modules/ingenieria/MapaEtapas'

// ─────────────────────────────────────────────────────────────────────────────
// Plan de Ingeniería — réplica de la estructura del Master.Sched (Smartsheet):
// el PROYECTO agrupa las tareas (por fase), y cada tarea tiene un responsable.
// Vista secundaria: carga por ingeniero (agenda tipo Gantt).
// ─────────────────────────────────────────────────────────────────────────────

const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DAY = 86400000
const d = (iso: string) => new Date(iso + 'T00:00:00')
const mondayOf = (dt: Date) => { const x = new Date(dt); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); x.setHours(0, 0, 0, 0); return x }
const fmtD = (iso: string | null) => iso ? `${d(iso).getDate()} ${MES[d(iso).getMonth()]}` : '—'
const shortProj = (p: string | null) => (p || '—').replace(/^\s*(\d{2}-\d{3})\s*/, '$1 · ')
const PAL = ['#2563eb', '#0d9488', '#ea580c', '#7c3aed', '#059669', '#db2777', '#ca8a04', '#4f46e5', '#0891b2', '#dc2626', '#65a30d', '#9333ea']

export default function IngenieriaPlan({ embedded, initialProyecto, initialMode }: { embedded?: boolean; initialProyecto?: string; initialMode?: 'disponibilidad' | 'proyecto' | 'carga' | 'etapas' }) {
  const [resumen, setResumen] = useState<{ tareas: number; proyectos: number; ingenieros: number } | null>(null)
  const [proyectos, setProyectos] = useState<IngProyecto[]>([])
  const [all, setAll] = useState<IngTarea[]>([])
  const [mode, setMode] = useState<'disponibilidad' | 'proyecto' | 'carga' | 'etapas'>(initialMode ?? 'disponibilidad')
  const [selProj, setSelProj] = useState<string>(initialProyecto ?? '')
  const [selEng, setSelEng] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<IngTarea | 'new' | null>(null)
  const [plan, setPlan] = useState<IngPlan | null>(null)
  const [planLoading, setPlanLoading] = useState(false)

  const [carga, setCarga] = useState<IngCarga | null>(null)
  async function loadAll() {
    const [r, t, c] = await Promise.all([ingenieriaService.getResumen(), ingenieriaService.getTareas(), ingenieriaService.getCarga()])
    setResumen(r.data.resumen); setProyectos(r.data.proyectos); setAll(t.data); setCarga(c.data)
    if (!selProj && r.data.proyectos[0]) setSelProj(r.data.proyectos[0].proyecto_ext)
  }
  useEffect(() => { loadAll().finally(() => setLoading(false)) }, [])
  // Abrir un proyecto puntual (ej: el PM hace "Revisar plan" desde su bandeja).
  useEffect(() => { if (initialProyecto) { setSelProj(initialProyecto); setMode('proyecto') } }, [initialProyecto])

  // Plan (con holgura) del proyecto seleccionado — para el Gantt y el modal.
  async function loadPlan() {
    if (!selProj) { setPlan(null); return }
    setPlanLoading(true)
    try { setPlan((await ingenieriaService.getPlan(selProj)).data) } catch { setPlan(null) } finally { setPlanLoading(false) }
  }
  useEffect(() => { if (mode === 'proyecto') loadPlan() }, [selProj, mode])

  // #8: precargar el ingeniero PROPUESTO del proyecto en foco (el más asignado en su
  // plan), una sola vez, para que "Carga por ingeniero" abra en él y no en el alfabético.
  useEffect(() => {
    if (selEng || !selProj || !all.length) return
    const freq = new Map<string, number>()
    for (const t of all) if (t.proyecto_ext === selProj && t.asignado_nombre) freq.set(t.asignado_nombre, (freq.get(t.asignado_nombre) ?? 0) + 1)
    const propuesto = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (propuesto) setSelEng(propuesto)
  }, [selProj, all, selEng])

  if (loading) return <div className="py-20 text-center text-stone-400">Cargando plan de Ingeniería…</div>

  return (
    <div className={`max-w-[1180px] mx-auto px-2 space-y-5 ${embedded ? '' : 'py-6'}`}>
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        {!embedded && <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center"><Gauge className="text-forest-600" size={22} /></div>}
        {!embedded && <div>
          <h1 className="text-xl font-bold text-stone-900">Plan de Ingeniería</h1>
          <p className="text-sm text-stone-500">La estructura del Master.Sched: cada proyecto agrupa sus tareas, con su responsable.</p>
        </div>}
        <div className="ml-auto flex gap-5 text-center">
          <Stat icon={<Layers size={15} />} n={resumen?.proyectos ?? 0} l="proyectos" />
          <Stat icon={<ClipboardList size={15} />} n={resumen?.tareas ?? 0} l="tareas" />
          <Stat icon={<Users size={15} />} n={resumen?.ingenieros ?? 0} l="ingenieros" />
        </div>
      </div>

      {/* Toggle de vista */}
      <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1 text-sm">
        <button onClick={() => setMode('disponibilidad')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold ${mode === 'disponibilidad' ? 'bg-forest-600 text-white' : 'text-stone-500 hover:text-stone-800'}`}><Activity size={15} /> Disponibilidad</button>
        <button onClick={() => setMode('proyecto')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold ${mode === 'proyecto' ? 'bg-forest-600 text-white' : 'text-stone-500 hover:text-stone-800'}`}><FolderKanban size={15} /> Por proyecto</button>
        <button onClick={() => setMode('carga')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold ${mode === 'carga' ? 'bg-forest-600 text-white' : 'text-stone-500 hover:text-stone-800'}`}><Gauge size={15} /> Carga por ingeniero</button>
        <button onClick={() => setMode('etapas')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold ${mode === 'etapas' ? 'bg-forest-600 text-white' : 'text-stone-500 hover:text-stone-800'}`}><Layers size={15} /> Portafolio</button>
      </div>

      {mode === 'disponibilidad'
        ? <VistaDisponibilidad carga={carga} />
        : mode === 'proyecto'
          ? <VistaProyecto proyectos={proyectos} all={all} plan={plan} planLoading={planLoading} sel={selProj} setSel={setSelProj} onEdit={setEdit} />
          : mode === 'etapas'
            ? <MapaEtapas />
            : <VistaCarga all={all} proyectos={proyectos} selEng={selEng} setSelEng={setSelEng} onEdit={setEdit} />}

      {edit && <EditModal tarea={edit === 'new' ? null : edit} proyecto={selProj}
        engineers={[...new Set(all.map((t) => t.asignado_nombre).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b))}
        planTareas={mode === 'proyecto' ? plan?.tareas ?? null : null} aristas={mode === 'proyecto' ? plan?.aristas ?? null : null}
        onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await Promise.all([loadAll(), loadPlan()]) }} />}
    </div>
  )
}

// ── Vista de arranque: DISPONIBILIDAD — heatmap de CANTIDAD DE TAREAS por ingeniero/semana ──
function VistaDisponibilidad({ carga }: { carga: IngCarga | null }) {
  const [sel, setSel] = useState<{ ing: string; sem: string } | null>(null)
  const [detail, setDetail] = useState<IngTareaCelda[] | null>(null)
  const [loadingDet, setLoadingDet] = useState(false)

  const g = useMemo(() => {
    if (!carga || !carga.semanas.length || !carga.ingenieros.length) return null
    const semanas = carga.semanas, nWeeks = semanas.length
    const months: { label: string; startPct: number }[] = []
    semanas.forEach((w, i) => { const wd = d(w); const label = `${MES[wd.getMonth()]} ${String(wd.getFullYear()).slice(2)}`; const last = months[months.length - 1]; if (!last || last.label !== label) months.push({ label, startPct: (i / nWeeks) * 100 }) })
    const today = new Date(); today.setHours(0, 0, 0, 0)
    let hoyIdx = -1
    for (let i = 0; i < nWeeks; i++) { const ws = d(semanas[i]).getTime(); if (today.getTime() >= ws && today.getTime() < ws + 7 * DAY) { hoyIdx = i; break } }
    const hoyPct = hoyIdx >= 0 ? ((hoyIdx + (today.getTime() - d(semanas[hoyIdx]).getTime()) / (7 * DAY)) / nWeeks) * 100 : null
    // libres por semana = ingenieros sin ninguna tarea esa semana
    const libres: number[] = []
    for (let i = 0; i < nWeeks; i++) libres.push(carga.ingenieros.filter((e) => (e.n_tareas[i] ?? 0) <= 0).length)
    return { semanas, nWeeks, months, hoyPct, ingenieros: carga.ingenieros, libres, total: carga.ingenieros.length }
  }, [carga])

  const abrirCelda = async (ing: string, sem: string) => {
    setSel({ ing, sem }); setDetail(null); setLoadingDet(true)
    try { const r = await ingenieriaService.getCargaDetalle(ing, sem); setDetail(r.data ?? []) }
    catch { setDetail([]) } finally { setLoadingDet(false) }
  }

  if (!carga) return <div className="py-20 text-center text-stone-400"><Loader2 className="animate-spin inline" size={22} /></div>
  if (!g) return <div className="py-16 text-center text-stone-400">Sin datos de carga de ingeniería.</div>
  // color por CANTIDAD de tareas: libre / 1 verde / 2 ámbar / 3+ rojo (sobrecarga)
  const cell = (n: number): { bg: string; txt: string } => {
    if (n <= 0) return { bg: '#f5f5f4', txt: '' }
    if (n === 1) return { bg: '#bbf7d0', txt: '#166534' }
    if (n === 2) return { bg: '#fde68a', txt: '#92400e' }
    return { bg: '#fecaca', txt: '#991b1b' }
  }
  const libCls = (l: number) => l <= 0 ? 'bg-rose-200 text-rose-900' : l === 1 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
  const fmtW = (w: string) => `${d(w).getDate()} ${MES[d(w).getMonth()]}`
  const GUT = 176

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
          <Activity size={17} className="text-forest-600" />
          <h2 className="font-bold text-stone-800">Carga por ingeniero · tareas cada semana</h2>
          <span className="ml-auto text-xs text-stone-400">cuántas tareas tiene encimadas · click en una celda para verlas</span>
        </div>
        <div className="overflow-x-auto"><div className="min-w-[880px]">
          {/* header meses */}
          <div className="flex items-stretch border-b border-stone-100 bg-stone-50/60">
            <div className="shrink-0 px-3 py-1.5 text-[10px] uppercase tracking-wide text-stone-400 font-semibold" style={{ width: GUT }}>Ingeniero</div>
            <div className="relative flex-1 h-7">
              {g.months.map((m, i) => <div key={i} className="absolute top-0 bottom-0 border-l border-stone-200 flex items-center pl-1.5 text-[10.5px] font-semibold text-forest-700" style={{ left: `${m.startPct}%` }}>{m.label}</div>)}
              {g.hoyPct !== null && <div className="absolute top-0 bottom-0 border-l-2 border-rose-400 z-10" style={{ left: `${g.hoyPct}%` }}><span className="absolute top-0 left-1 text-[9px] font-bold text-rose-500">hoy</span></div>}
            </div>
          </div>
          {/* fila resumen: libres */}
          <div className="flex items-center border-b border-stone-200 bg-stone-50/40">
            <div className="shrink-0 px-3 py-1.5 text-[11px] font-bold text-stone-600" style={{ width: GUT }}>Ingenieros libres</div>
            <div className="flex-1 flex gap-px py-1">
              {g.libres.map((l, i) => <div key={i} title={`${fmtW(g.semanas[i])}: ${l} de ${g.total} libres`} className={`flex-1 h-6 rounded-sm flex items-center justify-center text-[10px] font-bold ${libCls(l)}`}>{l}</div>)}
            </div>
          </div>
          {/* una fila por ingeniero — heatmap de cantidad de tareas */}
          {g.ingenieros.map((e) => { const picoN = Math.max(0, ...e.n_tareas); return (
            <div key={e.nombre} className="flex items-center border-b border-stone-50 hover:bg-stone-50/40">
              <div className="shrink-0 px-3 py-1.5 flex items-center gap-1.5" style={{ width: GUT }}>
                <span className="text-[12.5px] font-semibold text-stone-700 truncate flex-1">{e.nombre}</span>
                <span className={`text-[11px] font-bold tabular-nums ${picoN > 2 ? 'text-rose-600' : 'text-stone-400'}`} title="pico: máximo de tareas en una semana">{picoN}</span>
              </div>
              <div className="flex-1 flex gap-px py-1">
                {g.semanas.map((wk, i) => { const n = e.n_tareas[i] ?? 0; const pct = e.cargas[i] ?? 0; const c = cell(n); return (
                  <button key={i} onClick={() => n > 0 && abrirCelda(e.nombre, wk)} disabled={n <= 0}
                    title={`${e.nombre} · ${fmtW(wk)}: ${n} tarea${n === 1 ? '' : 's'} · ${Math.round(pct * 100)}% de asignación${n > 0 ? ' — click para ver' : ''}`}
                    className={`flex-1 h-6 rounded-sm flex items-center justify-center text-[10px] font-bold transition-shadow ${n > 0 ? 'cursor-pointer hover:ring-2 hover:ring-forest-400' : 'cursor-default'}`}
                    style={{ background: c.bg, color: c.txt }}>
                    {n > 0 ? n : ''}
                  </button>
                ) })}
              </div>
            </div>
          ) })}
        </div></div>
        <div className="px-4 py-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500 items-center border-t border-stone-100">
          <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm inline-block" style={{ background: '#f5f5f4' }} /> libre</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm inline-block" style={{ background: '#bbf7d0' }} /> 1 tarea</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm inline-block" style={{ background: '#fde68a' }} /> 2 tareas</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-sm inline-block" style={{ background: '#fecaca' }} /> 3+ sobrecarga</span>
          <span className="italic text-stone-400">El número es cuántas tareas tiene encimadas esa semana. A la izquierda, el pico. Click en una celda para ver cuáles.</span>
        </div>
      </div>

      {/* Modal: detalle de tareas de una celda */}
      {sel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSel(null)}>
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
              <Activity size={16} className="text-forest-600" />
              <div>
                <div className="font-bold text-stone-800 text-sm">{sel.ing}</div>
                <div className="text-xs text-stone-400">semana del {fmtW(sel.sem)}{detail ? ` · ${detail.length} tarea${detail.length === 1 ? '' : 's'}` : ''}</div>
              </div>
              <button onClick={() => setSel(null)} className="ml-auto text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto">
              {loadingDet ? <div className="py-10 text-center text-stone-400"><Loader2 className="animate-spin inline" size={18} /></div>
                : !detail || !detail.length ? <div className="py-10 text-center text-stone-400 text-sm">Sin tareas esa semana.</div>
                : <div className="divide-y divide-stone-100">
                    {detail.map((t, i) => (
                      <div key={i} className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-stone-800 flex-1">{t.nombre}</span>
                          <span className="text-[10px] font-bold text-stone-500 tabular-nums shrink-0">{Math.round(t.allocation_pct * 100)}%</span>
                        </div>
                        <div className="text-[11px] text-stone-400 mt-0.5">{t.proyecto_ext ?? '—'} · {t.fecha_inicio ? fmtW(t.fecha_inicio) : '?'} → {t.fecha_fin ? fmtW(t.fecha_fin) : '?'}</div>
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

// ── Vista PRINCIPAL: Gantt del proyecto con holgura/riesgo (CPM sobre fecha fija) ──
function VistaProyecto({ proyectos, all, plan, planLoading, sel, setSel, onEdit }: { proyectos: IngProyecto[]; all: IngTarea[]; plan: IngPlan | null; planLoading: boolean; sel: string; setSel: (s: string) => void; onEdit: (t: IngTarea | 'new') => void }) {
  const loadingPlan = planLoading
  // color por ingeniero (estable en todo el sistema)
  const engColor = useMemo(() => { const m = new Map<string, string>(); [...new Set(all.map((t) => t.asignado_nombre).filter(Boolean))].forEach((e, i) => m.set(e as string, PAL[i % PAL.length])); return m }, [all])
  const tareas = plan?.tareas ?? []
  const ingenieros = useMemo(() => [...new Set(tareas.map((t) => t.asignado_nombre).filter(Boolean))], [tareas])
  // Validación vs Excel: la app calcula la fecha (early_finish); el Excel la trae (fecha_fin).
  // Si difieren, suele faltar una dependencia (o el experto la puso a mano) — a revisar.
  const difExcel = (t: IngTareaPlan) => !!(t.early_finish && t.fecha_fin && t.early_finish !== t.fecha_fin)
  const valida = useMemo(() => { const con = tareas.filter((t) => t.early_finish && t.fecha_fin); return { match: con.filter((t) => t.early_finish === t.fecha_fin).length, total: con.length } }, [tareas])

  // ── Geometría del Gantt (usa las fechas tempranas del CPM + la entrega fija) ──
  const GUT = 320, ROW_H = 40, PH_H = 26, BAR_H = 22
  const g = useMemo(() => {
    // fases en orden, tareas por fecha temprana
    const fasesMap = new Map<string, typeof tareas>()
    for (const t of tareas) { const k = t.fase || '— Sin fase —'; if (!fasesMap.has(k)) fasesMap.set(k, []); fasesMap.get(k)!.push(t) }
    for (const arr of fasesMap.values()) arr.sort((a, b) => (a.early_start || a.fecha_inicio || '~').localeCompare(b.early_start || b.fecha_inicio || '~'))
    const fases = [...fasesMap.entries()]

    // layout vertical: y de cada tarea (para alinear barras y conectores)
    const rows: { type: 'phase'; label: string; count: number; y: number }[] & any[] = [] as any
    const yOf = new Map<number, number>()
    let y = 0
    for (const [fase, ts] of fases) {
      rows.push({ type: 'phase', label: fase, count: ts.length, y }); y += PH_H
      for (const t of ts) { rows.push({ type: 'task', tarea: t, y }); yOf.set(t.id, y); y += ROW_H }
    }
    const totalH = y

    // rango temporal: incluye tareas + la entrega fija
    const fechas: string[] = []
    for (const t of tareas) { if (t.early_start) fechas.push(t.early_start); if (t.late_finish) fechas.push(t.late_finish); if (t.fecha_inicio) fechas.push(t.fecha_inicio); if (t.fecha_fin) fechas.push(t.fecha_fin) }
    if (plan?.fecha_inicio) fechas.push(plan.fecha_inicio)
    if (plan?.fecha_entrega) fechas.push(plan.fecha_entrega)
    if (!fechas.length) return { fases, rows, totalH, months: [] as any[], pct: () => 0, hoyPct: null as number | null, entregaPct: null as number | null }
    let min = d(fechas[0]), max = d(fechas[0])
    for (const f of fechas) { const dd = d(f); if (dd < min) min = dd; if (dd > max) max = dd }
    const week0 = mondayOf(min); const nWeeks = Math.max(1, Math.ceil((max.getTime() - week0.getTime()) / (7 * DAY)) + 2)
    const span = nWeeks * 7 * DAY
    const pct = (iso: string) => ((d(iso).getTime() - week0.getTime()) / span) * 100
    const months: { label: string; startPct: number }[] = []
    for (let i = 0; i < nWeeks; i++) { const wd = new Date(week0.getTime() + i * 7 * DAY); const label = `${MES[wd.getMonth()]} ${String(wd.getFullYear()).slice(2)}`; const last = months[months.length - 1]; if (!last || last.label !== label) months.push({ label, startPct: (i / nWeeks) * 100 }) }
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const hoyPct = today >= week0 && today <= max ? pct(today.toISOString().slice(0, 10)) : null
    const entregaPct = plan?.fecha_entrega ? pct(plan.fecha_entrega) : null
    return { fases, rows, totalH, months, pct, hoyPct, entregaPct, yOf }
  }, [tareas, plan])

  // barra mínima (para hitos de 0 días): medio % de una semana
  const minW = 0.7
  const barGeom = (t: IngTareaPlan) => {
    const s = t.early_start || t.fecha_inicio, e = t.early_finish || t.fecha_fin
    if (!s || !e) return null
    const x = g.pct(s)
    const w = Math.max(g.pct(e) - x, minW)
    const lf = t.late_finish ? g.pct(t.late_finish) : g.pct(e)
    const slackW = Math.max(0, lf - (x + w))   // sombreado de holgura tras la barra
    return { x, w, slackW, hito: (t.early_start === t.early_finish) }
  }

  return (
    <div className="space-y-4">
      {/* selector + estado del proyecto */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={sel} onChange={(e) => setSel(e.target.value)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-forest-300 min-w-[280px]">
          {proyectos.map((pr) => <option key={pr.proyecto_ext} value={pr.proyecto_ext}>{pr.proyecto_ext} · {pr.n_tareas} tareas</option>)}
        </select>
        <span className="text-xs text-stone-400 inline-flex items-center gap-1"><Users size={13} /> {ingenieros.length ? ingenieros.join(', ') : 'sin responsables'}</span>
        <button onClick={() => onEdit('new')} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-sm font-semibold px-3 py-1.5"><Plus size={15} /> Nueva tarea</button>
      </div>

      {/* tarjeta de estado: entrega fija + holgura/riesgo */}
      {plan && plan.fecha_entrega && (
        <div className={`rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2 ${plan.en_riesgo ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <div><div className="text-[10px] uppercase tracking-wide text-stone-400 font-semibold">Entrega (fija)</div><div className="text-lg font-bold text-stone-900 tabular-nums">{fmtD(plan.fecha_entrega)}</div></div>
          <div><div className="text-[10px] uppercase tracking-wide text-stone-400 font-semibold">Termina</div><div className="text-lg font-bold text-stone-900 tabular-nums">{fmtD(plan.fin_proyectado)}</div></div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-stone-400 font-semibold">{plan.en_riesgo ? 'Atraso' : 'Holgura'}</div>
            <div className={`text-lg font-bold tabular-nums ${plan.en_riesgo ? 'text-rose-700' : 'text-emerald-700'}`}>{Math.abs(plan.holgura_proyecto)} <span className="text-xs font-medium text-stone-500">días</span></div>
          </div>
          {valida.total > 0 && (
            <div title="Tareas cuya fecha calculada por la app coincide con la del Excel. Las que no, suelen tener una dependencia faltante.">
              <div className="text-[10px] uppercase tracking-wide text-stone-400 font-semibold">vs Excel</div>
              <div className={`text-lg font-bold tabular-nums ${valida.match === valida.total ? 'text-emerald-700' : 'text-amber-700'}`}>{valida.match}/{valida.total} <span className="text-xs font-medium text-stone-500">coinciden</span></div>
            </div>
          )}
          <div className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${plan.en_riesgo ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>
            {plan.en_riesgo ? <><AlertTriangle size={15} /> En riesgo</> : <><Check size={15} /> En fecha</>}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        {loadingPlan && !plan ? <div className="py-16 text-center text-stone-400"><Loader2 className="animate-spin inline" size={22} /></div> : (
        <div className="overflow-x-auto"><div className="min-w-[960px]">
          {/* header: gutter + meses + marca de entrega */}
          <div className="flex items-stretch border-b border-stone-100 bg-stone-50/60">
            <div className="shrink-0 px-4 py-2 text-[10.5px] uppercase tracking-wide text-stone-400 font-semibold" style={{ width: GUT }}>Tarea · responsable · holgura</div>
            <div className="relative flex-1 h-7">
              {g.months.map((m, i) => <div key={i} className="absolute top-0 bottom-0 border-l border-stone-200 flex items-center pl-1.5 text-[10.5px] font-semibold text-forest-700" style={{ left: `${m.startPct}%` }}>{m.label}</div>)}
              {g.hoyPct !== null && <div className="absolute top-0 bottom-0 border-l-2 border-rose-400 z-10" style={{ left: `${g.hoyPct}%` }}><span className="absolute -top-0 left-1 text-[9px] font-bold text-rose-500">hoy</span></div>}
              {g.entregaPct !== null && <div className="absolute top-0 bottom-0 z-10" style={{ left: `${g.entregaPct}%`, borderLeft: '2px dashed #059669' }}><span className="absolute top-0 -left-8 text-[9px] font-bold text-emerald-700">entrega</span></div>}
            </div>
          </div>

          {/* cuerpo: columna izquierda (nombres) + columna derecha (barras + conectores) */}
          <div className="flex items-stretch">
            {/* gutter: filas de nombres */}
            <div className="shrink-0" style={{ width: GUT }}>
              {g.rows.map((r: any, i: number) => r.type === 'phase'
                ? <div key={i} className="bg-forest-50/40 px-4 text-[11px] font-bold text-forest-700 uppercase tracking-wide flex items-center" style={{ height: PH_H }}>{r.label} <span className="text-forest-400 font-normal normal-case ml-1">· {r.count}</span></div>
                : (() => { const t = r.tarea as IngTareaPlan; const holg = t.holgura_dias
                    return (
                      <div key={i} onClick={() => onEdit(t)} className="px-4 border-b border-stone-50 border-r border-stone-100 hover:bg-forest-50/30 cursor-pointer flex flex-col justify-center" style={{ height: ROW_H }}>
                        <div className="flex items-center gap-1.5">
                          {difExcel(t) && <span className="shrink-0 flex" title={`No coincide con el Excel\nExcel: ${fmtD(t.fecha_fin)} · app: ${fmtD(t.early_finish)}\n(revisá dependencias)`}><AlertTriangle size={12} className="text-amber-500" /></span>}
                          <div className="text-[12.5px] text-stone-800 truncate flex-1">{t.nombre}</div>
                          {holg !== null && (
                            <span className={`text-[10px] font-bold rounded px-1 py-0.5 tabular-nums shrink-0 ${t.critico ? 'bg-forest-100 text-forest-700' : holg < 0 ? 'bg-rose-100 text-rose-700' : 'bg-stone-100 text-stone-500'}`}>
                              {t.critico ? 'crítico' : (holg < 0 ? holg : '+' + holg) + 'd'}
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] text-stone-400 truncate flex items-center gap-1">
                          {t.asignado_nombre
                            ? <><span className="w-2 h-2 rounded-full shrink-0" style={{ background: engColor.get(t.asignado_nombre) }} /><span className="font-semibold text-stone-600">{t.asignado_nombre}</span></>
                            : <span className="text-stone-300">sin responsable</span>}
                          <span>· <span className={t.allocation_pct > 1 ? 'text-rose-600 font-semibold' : ''}>{Math.round(t.allocation_pct * 100)}%</span> · {t.dur_dias}d</span>
                        </div>
                      </div>
                    ) })()
              )}
            </div>

            {/* timeline: barras + slack + conectores (SVG) */}
            <div className="relative flex-1" style={{ height: g.totalH }}>
              {/* gridlines de meses + hoy + entrega */}
              {g.months.map((m: any, i: number) => <div key={i} className="absolute top-0 bottom-0 border-l border-stone-50" style={{ left: `${m.startPct}%` }} />)}
              {g.hoyPct !== null && <div className="absolute top-0 bottom-0 border-l-2 border-rose-200" style={{ left: `${g.hoyPct}%` }} />}
              {g.entregaPct !== null && <div className="absolute top-0 bottom-0 z-20" style={{ left: `${g.entregaPct}%`, borderLeft: '2px dashed #059669' }} />}

              {/* conectores entre dependencias (predecesor -> sucesor) */}
              {plan && g.yOf && (
                <svg className="absolute inset-0 w-full pointer-events-none" style={{ height: g.totalH }} viewBox={`0 0 100 ${g.totalH}`} preserveAspectRatio="none">
                  {plan.aristas.map((a, i) => {
                    const pre = tareas.find((t) => t.id === a.depende_de_id), suc = tareas.find((t) => t.id === a.tarea_id)
                    if (!pre || !suc) return null
                    const gp = barGeom(pre), gs = barGeom(suc)
                    const yp = g.yOf.get(pre.id), ys = g.yOf.get(suc.id)
                    if (!gp || !gs || yp === undefined || ys === undefined) return null
                    const x1 = gp.x + gp.w, y1 = yp + ROW_H / 2
                    const x2 = gs.x, y2 = ys + ROW_H / 2
                    const midX = Math.max(x1 + 0.4, x2 - 0.6)
                    return <path key={i} d={`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`} fill="none" stroke="#a8a29e" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  })}
                </svg>
              )}

              {/* barras */}
              {g.rows.filter((r: any) => r.type === 'task').map((r: any, i: number) => {
                const t = r.tarea as IngTareaPlan; const geo = barGeom(t); if (!geo) return null
                const col = t.asignado_nombre ? engColor.get(t.asignado_nombre)! : '#78716c'
                const done = t.estado === 'hecha'
                return (
                  <div key={i} className="absolute" style={{ top: r.y, height: ROW_H, left: 0, right: 0 }}>
                    {/* holgura sombreada tras la barra */}
                    {geo.slackW > 0.3 && (
                      <div className="absolute rounded-r-sm" title={`holgura ${t.holgura_dias}d`}
                        style={{ top: (ROW_H - BAR_H) / 2 + 4, height: BAR_H - 8, left: `${geo.x + geo.w}%`, width: `${geo.slackW}%`,
                          background: 'repeating-linear-gradient(45deg,#e7e5e4,#e7e5e4 3px,transparent 3px,transparent 6px)' }} />
                    )}
                    {/* barra de la tarea (crítica: borde fuerte forest; normal: color del ingeniero) */}
                    <div onClick={() => onEdit(t)} title={`${t.nombre}\n${t.asignado_nombre || 'sin responsable'}\n${geo.hito ? 'hito ' + fmtD(t.early_start) : fmtD(t.early_start) + ' → ' + fmtD(t.early_finish)}\nholgura ${t.holgura_dias ?? '—'}d${t.critico ? ' · CRÍTICO' : ''}`}
                      className="absolute rounded-md flex items-center px-1.5 gap-1 overflow-hidden cursor-pointer hover:ring-2 hover:ring-stone-400"
                      style={{ top: (ROW_H - BAR_H) / 2, height: BAR_H, left: `${geo.x}%`, width: `calc(${geo.w}% - 1px)`,
                        background: done ? '#d1fae5' : col + '26',
                        borderLeft: `3px solid ${done ? '#059669' : col}`,
                        boxShadow: t.critico ? 'inset 0 0 0 1.5px #3b4233' : undefined }}>
                      {done && <Check size={11} className="text-emerald-700 shrink-0" />}
                      {!geo.hito && <span className="text-[9.5px] font-semibold text-stone-600 whitespace-nowrap">{fmtD(t.early_start)}→{fmtD(t.early_finish)}</span>}
                      {geo.hito && <span className="text-[9px] font-bold" style={{ color: col }}>◆</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          {tareas.length === 0 && <div className="px-4 py-10 text-center text-stone-400">Sin tareas en este proyecto.</div>}
        </div></div>)}

        <div className="px-4 py-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500 items-center border-t border-stone-100">
          <span className="inline-flex items-center gap-1"><span className="w-4 h-3 rounded" style={{ boxShadow: 'inset 0 0 0 1.5px #3b4233', background: '#f5f5f4' }} /> camino crítico</span>
          <span className="inline-flex items-center gap-1"><span className="w-4 h-3 rounded" style={{ background: 'repeating-linear-gradient(45deg,#e7e5e4,#e7e5e4 3px,transparent 3px,transparent 6px)' }} /> holgura</span>
          <span className="inline-flex items-center gap-1"><span className="w-0.5 h-3.5 inline-block" style={{ borderLeft: '2px dashed #059669' }} /> entrega fija</span>
          <span className="inline-flex items-center gap-1"><span className="w-0.5 h-3.5 bg-rose-400 inline-block" /> hoy</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-stone-400 inline-block" /> = ingeniero</span>
          <span className="italic text-stone-400">Barras = fechas calculadas (CPM). Editá una tarea y la holgura se recalcula.</span>
        </div>
      </div>
    </div>
  )
}
// ── Vista SECUNDARIA: carga por ingeniero (agenda Gantt) ──
function VistaCarga({ all, proyectos, selEng, setSelEng, onEdit }: { all: IngTarea[]; proyectos: IngProyecto[]; selEng: string; setSelEng: (s: string) => void; onEdit: (t: IngTarea) => void }) {
  const projColor = useMemo(() => { const m = new Map<string, string>(); proyectos.forEach((p, i) => m.set(p.proyecto_ext, PAL[i % PAL.length])); return m }, [proyectos])

  const ingenieros = useMemo(() => {
    const byEng = new Map<string, IngTarea[]>()
    for (const t of all) { if (!t.asignado_nombre || !t.fecha_inicio || !t.fecha_fin || t.estado === 'na') continue; const k = t.asignado_nombre; if (!byEng.has(k)) byEng.set(k, []); byEng.get(k)!.push(t) }
    return [...byEng.entries()].map(([nombre, tareas]) => {
      let min = d(tareas[0].fecha_inicio!), max = d(tareas[0].fecha_fin!)
      for (const t of tareas) { const a = d(t.fecha_inicio!), b = d(t.fecha_fin!); if (a < min) min = a; if (b > max) max = b }
      let pico = 0; const w0 = mondayOf(min), nW = Math.ceil((max.getTime() - w0.getTime()) / (7 * DAY)) + 1
      for (let w = 0; w < nW; w++) { const wk = w0.getTime() + w * 7 * DAY; const c = tareas.filter((t) => d(t.fecha_inicio!).getTime() <= wk + 6 * DAY && d(t.fecha_fin!).getTime() >= wk).length; if (c > pico) pico = c }
      return { nombre, nProj: new Set(tareas.map((t) => t.proyecto_ext)).size, nTareas: tareas.length, pico, min, max }
    }).sort((a, b) => b.pico - a.pico)
  }, [all])

  useEffect(() => { if (!selEng && ingenieros[0]) setSelEng(ingenieros[0].nombre) }, [ingenieros, selEng, setSelEng])

  const eng = useMemo(() => {
    const meta = ingenieros.find((e) => e.nombre === selEng); if (!meta) return null
    const tareas = all.filter((t) => t.asignado_nombre === selEng && t.fecha_inicio && t.fecha_fin && t.estado !== 'na')
    const week0 = mondayOf(meta.min)
    const nWeeks = Math.max(1, Math.ceil((meta.max.getTime() - week0.getTime()) / (7 * DAY)) + 1)
    const pct = (iso: string) => ((d(iso).getTime() - week0.getTime()) / (nWeeks * 7 * DAY)) * 100
    const wPct = (a: string, b: string) => Math.max(((d(b).getTime() - d(a).getTime()) / (nWeeks * 7 * DAY)) * 100 + 100 / nWeeks / 2, 100 / nWeeks * 0.6)
    const wkIdx = (iso: string) => Math.floor((d(iso).getTime() - week0.getTime()) / (7 * DAY))
    const months: { label: string; startPct: number }[] = []
    for (let i = 0; i < nWeeks; i++) { const wd = new Date(week0.getTime() + i * 7 * DAY); const label = `${MES[wd.getMonth()]} ${String(wd.getFullYear()).slice(2)}`; const last = months[months.length - 1]; if (!last || last.label !== label) months.push({ label, startPct: (i / nWeeks) * 100 }) }
    const byProj = new Map<string, IngTarea[]>()
    for (const t of tareas) { const k = t.proyecto_ext || '—'; if (!byProj.has(k)) byProj.set(k, []); byProj.get(k)!.push(t) }
    const lanes = [...byProj.entries()].map(([proyecto, ts]) => {
      const sorted = ts.sort((a, b) => d(a.fecha_inicio!).getTime() - d(b.fecha_inicio!).getTime())
      const rows: { endIdx: number; items: IngTarea[] }[] = []
      for (const t of sorted) { const s = wkIdx(t.fecha_inicio!), e = Math.max(s, wkIdx(t.fecha_fin!)); let row = rows.find((r) => r.endIdx < s); if (!row) { row = { endIdx: -1, items: [] }; rows.push(row) } row.items.push(t); row.endIdx = e }
      return { proyecto, tareas: sorted, rows }
    }).sort((a, b) => d(a.tareas[0].fecha_inicio!).getTime() - d(b.tareas[0].fecha_inicio!).getTime())
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const hoyPct = today >= week0 && today <= meta.max ? ((today.getTime() - week0.getTime()) / (nWeeks * 7 * DAY)) * 100 : null
    return { meta, lanes, months, pct, wPct, hoyPct }
  }, [all, selEng, ingenieros])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ingenieros.map((e) => {
          const on = e.nombre === selEng
          return (
            <button key={e.nombre} onClick={() => setSelEng(e.nombre)} className={`rounded-xl border px-3 py-2 text-left transition-colors ${on ? 'border-forest-500 bg-forest-50 ring-1 ring-forest-300' : 'border-stone-200 bg-white hover:border-stone-300'}`}>
              <div className={`text-sm font-semibold ${on ? 'text-forest-800' : 'text-stone-700'}`}>{e.nombre}</div>
              <div className="text-[10.5px] text-stone-400">{e.nProj} proyectos · pico <b className={e.pico >= 3 ? 'text-rose-600' : 'text-stone-600'}>{e.pico}</b></div>
            </button>
          )
        })}
      </div>

      {eng && (
        <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 flex-wrap">
            <Gauge size={17} className="text-forest-600" /><h2 className="font-bold text-stone-800">{eng.meta.nombre}</h2>
            <span className="text-xs text-stone-400">{fmtD(eng.meta.min.toISOString().slice(0, 10))} → {fmtD(eng.meta.max.toISOString().slice(0, 10))} · {eng.lanes.length} proyectos · pico <b className={eng.meta.pico >= 3 ? 'text-rose-600' : 'text-stone-600'}>{eng.meta.pico} a la vez</b></span>
          </div>
          <div className="overflow-x-auto"><div className="min-w-[820px]">
            <div className="flex items-stretch border-b border-stone-100 bg-stone-50/60">
              <div className="w-52 shrink-0 px-3 py-1.5 text-[10px] uppercase tracking-wide text-stone-400 font-semibold">Proyecto</div>
              <div className="relative flex-1 h-7">
                {eng.months.map((m, i) => <div key={i} className="absolute top-0 bottom-0 border-l border-stone-200 flex items-center pl-1.5 text-[10.5px] font-semibold text-forest-700" style={{ left: `${m.startPct}%` }}>{m.label}</div>)}
                {eng.hoyPct !== null && <div className="absolute top-0 bottom-0 border-l-2 border-rose-400 z-10" style={{ left: `${eng.hoyPct}%` }} />}
              </div>
            </div>
            {eng.lanes.map((lane) => {
              const col = projColor.get(lane.proyecto) || '#78716c'
              return (
                <div key={lane.proyecto} className="flex border-b border-stone-100">
                  <div className="w-52 shrink-0 px-3 py-2 border-r border-stone-100">
                    <div className="text-[12px] font-semibold text-stone-800 truncate flex items-center gap-1.5"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: col }} />{shortProj(lane.proyecto)}</div>
                    <div className="text-[10px] text-stone-400">{lane.tareas.length} tareas</div>
                  </div>
                  <div className="relative flex-1 py-1.5">
                    {eng.months.map((m, i) => <div key={i} className="absolute top-0 bottom-0 border-l border-stone-50" style={{ left: `${m.startPct}%` }} />)}
                    {eng.hoyPct !== null && <div className="absolute top-0 bottom-0 border-l-2 border-rose-200 z-0" style={{ left: `${eng.hoyPct}%` }} />}
                    <div className="space-y-1">
                      {lane.rows.map((row, ri) => (
                        <div key={ri} className="relative h-6">
                          {row.items.map((t) => (
                            <div key={t.id} onClick={() => onEdit(t)} title={`${t.nombre}\n${t.fecha_inicio} → ${t.fecha_fin} · ${Math.round(t.allocation_pct * 100)}%`}
                              className="absolute top-0 h-6 rounded-md flex items-center px-1.5 cursor-pointer overflow-hidden hover:ring-2 hover:ring-stone-400"
                              style={{ left: `${eng.pct(t.fecha_inicio!)}%`, width: `calc(${eng.wPct(t.fecha_inicio!, t.fecha_fin!)}% - 2px)`, background: (t.estado === 'hecha' ? '#d1fae5' : col + '1f'), borderLeft: `3px solid ${t.estado === 'hecha' ? '#059669' : col}` }}>
                              {t.estado === 'hecha' && <Check size={10} className="text-emerald-700 shrink-0 mr-0.5" />}
                              <span className="text-[9.5px] font-medium text-stone-600 truncate">{t.nombre}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div></div>
        </div>
      )}
    </div>
  )
}

function Stat({ icon, n, l }: { icon: React.ReactNode; n: number; l: string }) {
  return <div><div className="flex items-center justify-center gap-1 text-stone-400">{icon}</div><div className="text-xl font-bold text-stone-900 tabular-nums leading-none mt-0.5">{n}</div><div className="text-[10px] uppercase tracking-wide text-stone-400">{l}</div></div>
}

function EditModal({ tarea, proyecto, engineers, planTareas, aristas, onClose, onSaved }: { tarea: IngTarea | null; proyecto: string; engineers: string[]; planTareas: IngTareaPlan[] | null; aristas: IngArista[] | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<TareaInput>({
    proyecto_ext: tarea?.proyecto_ext ?? proyecto, nombre: tarea?.nombre ?? '', asignado_nombre: tarea?.asignado_nombre ?? '',
    allocation_pct: tarea?.allocation_pct ?? 1, dur_dias: tarea?.dur_dias ?? 1,
    fecha_inicio: tarea?.fecha_inicio ?? '', fecha_fin: tarea?.fecha_fin ?? '', estado: tarea?.estado ?? 'pendiente', comentario: tarea?.comentario ?? '',
  })
  // Responsable por desplegable (evita nombres partidos por tipeo). "Otro…" abre texto libre
  // solo para dar de alta un ingeniero genuinamente nuevo.
  const asignActual = tarea?.asignado_nombre ?? ''
  const [nuevoIng, setNuevoIng] = useState(!!asignActual && !engineers.includes(asignActual))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof TareaInput, v: any) => setF((p) => ({ ...p, [k]: v }))

  // Predecesores (solo en la vista por proyecto, donde tenemos el plan)
  const origPreds = useMemo(() => (tarea && aristas ? aristas.filter((a) => a.tarea_id === tarea.id) : []), [tarea, aristas])
  const [preds, setPreds] = useState<{ id: number; lag: number }[]>(origPreds.map((a) => ({ id: a.depende_de_id, lag: a.lag_dias })))
  const nameOf = (id: number) => planTareas?.find((t) => t.id === id)?.nombre ?? `#${id}`
  const opciones = useMemo(() => (planTareas ?? []).filter((t) => t.id !== tarea?.id && !preds.some((p) => p.id === t.id)), [planTareas, tarea, preds])

  const syncDeps = async (id: number) => {
    for (const p of preds) await ingenieriaService.agregarDep(id, p.id, p.lag)         // upsert (agrega o cambia lag)
    for (const o of origPreds) if (!preds.some((p) => p.id === o.depende_de_id)) await ingenieriaService.borrarDep(id, o.depende_de_id)
  }
  const save = async () => {
    if (!f.nombre.trim()) { setErr('Poné un nombre'); return }
    setBusy(true); setErr(null)
    const payload: TareaInput = { ...f, asignado_nombre: f.asignado_nombre || null, fecha_inicio: f.fecha_inicio || null, fecha_fin: f.fecha_fin || null, comentario: f.comentario || null }
    try {
      let id = tarea?.id
      if (tarea) await ingenieriaService.actualizarTarea(tarea.id, payload)
      else id = (await ingenieriaService.crearTarea(payload)).data.id
      if (planTareas && id) await syncDeps(id)
      onSaved()
    } catch (e: any) { setErr(e?.response?.data?.message || 'No se pudo guardar'); setBusy(false) }
  }
  const del = async () => { if (!tarea) return; setBusy(true); try { const r = await ingenieriaService.borrarTarea(tarea.id); onSaved(); if (r.data.reconectadas) { /* cadena reconectada */ } } catch (e: any) { setErr(e?.response?.data?.message || 'No se pudo borrar'); setBusy(false) } }
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList size={18} className="text-forest-600" /><h3 className="font-semibold text-stone-800">{tarea ? 'Editar tarea' : 'Nueva tarea'}</h3>
          <span className="text-xs text-stone-400">· {shortProj(f.proyecto_ext ?? '')}</span>
          <button onClick={onClose} className="ml-auto text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <L t="Tarea"><input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className="inp" /></L>
          <div className="grid grid-cols-2 gap-3">
            <L t="Responsable">
              {nuevoIng ? (
                <div className="flex items-center gap-1.5">
                  <input value={f.asignado_nombre ?? ''} onChange={(e) => set('asignado_nombre', e.target.value)} placeholder="Nombre del ingeniero" className="inp" autoFocus />
                  <button type="button" onClick={() => { setNuevoIng(false); set('asignado_nombre', '') }} title="Elegir de la lista" className="text-[11px] text-stone-400 hover:text-stone-700 whitespace-nowrap">↩ lista</button>
                </div>
              ) : (
                <select value={f.asignado_nombre ?? ''} onChange={(e) => { if (e.target.value === '__nuevo__') { setNuevoIng(true); set('asignado_nombre', '') } else set('asignado_nombre', e.target.value) }} className="inp">
                  <option value="">— sin asignar —</option>
                  {engineers.map((n) => <option key={n} value={n}>{n}</option>)}
                  <option value="__nuevo__">+ Otro…</option>
                </select>
              )}
            </L>
            <L t="Estado"><select value={f.estado} onChange={(e) => set('estado', e.target.value)} className="inp"><option value="pendiente">Pendiente</option><option value="en_curso">En curso</option><option value="hecha">Completada</option><option value="na">No aplica</option></select></L>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <L t="% de asignación"><input type="number" step="0.1" min="0" value={f.allocation_pct} onChange={(e) => set('allocation_pct', Number(e.target.value))} className="inp" /></L>
            <L t="Duración (días)"><input type="number" step="0.5" min="0" value={f.dur_dias} onChange={(e) => set('dur_dias', Number(e.target.value))} className="inp" /></L>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <L t="Inicio"><input type="date" value={f.fecha_inicio ?? ''} onChange={(e) => set('fecha_inicio', e.target.value)} className="inp" /></L>
            <L t="Fin"><input type="date" value={f.fecha_fin ?? ''} onChange={(e) => set('fecha_fin', e.target.value)} className="inp" /></L>
          </div>

          {/* Predecesores — esta tarea empieza después de… (recalcula holgura al guardar) */}
          {planTareas && (
            <L t="Predecesores · empieza después de">
              <div className="space-y-1.5">
                {preds.length === 0 && <div className="text-[12px] text-stone-400 italic">Sin predecesores (arranca al inicio del proyecto).</div>}
                {preds.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 bg-stone-50 rounded-lg px-2 py-1.5">
                    <span className="flex-1 text-[13px] text-stone-700 truncate">{nameOf(p.id)}</span>
                    <span className="text-[11px] text-stone-400">lag</span>
                    <input type="number" step="1" value={p.lag} onChange={(e) => setPreds((xs) => xs.map((x) => x.id === p.id ? { ...x, lag: Math.trunc(Number(e.target.value) || 0) } : x))}
                      className="w-14 rounded-md border border-stone-300 px-1.5 py-1 text-[12px] text-stone-800" />
                    <span className="text-[11px] text-stone-400">d</span>
                    <button onClick={() => setPreds((xs) => xs.filter((x) => x.id !== p.id))} className="text-stone-400 hover:text-rose-600"><X size={14} /></button>
                  </div>
                ))}
                {opciones.length > 0 && (
                  <select value="" onChange={(e) => { const id = Number(e.target.value); if (id) setPreds((xs) => [...xs, { id, lag: 0 }]) }}
                    className="inp text-[13px]">
                    <option value="">+ agregar predecesor…</option>
                    {opciones.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                )}
              </div>
            </L>
          )}

          {err && <div className="text-sm text-rose-600">{err}</div>}
        </div>
        <div className="mt-4 flex items-center gap-2">
          {tarea && <button onClick={del} disabled={busy} className="inline-flex items-center gap-1 text-sm text-rose-600 hover:text-rose-800 px-2 py-2"><Trash2 size={14} /> Borrar</button>}
          <button onClick={onClose} disabled={busy} className="ml-auto px-3 py-2 text-sm text-stone-500">Cancelar</button>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2">{busy ? <Loader2 className="animate-spin" size={15} /> : 'Guardar'}</button>
        </div>
      </div>
      <style>{`.inp{width:100%;border:1px solid #d6d3d1;border-radius:.5rem;padding:.45rem .6rem;font-size:.875rem;color:#1c1917}.inp:focus{outline:none;box-shadow:0 0 0 2px #86bd8b}`}</style>
    </div>
  )
}
function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] uppercase tracking-wide text-stone-400 font-semibold">{t}</span><div className="mt-1">{children}</div></label>
}
