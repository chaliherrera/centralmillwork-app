import { useEffect, useMemo, useState } from 'react'
import { Users, Layers, ClipboardList, Plus, X, Loader2, Trash2, Gauge, Check, FolderKanban } from 'lucide-react'
import { ingenieriaService, type IngProyecto, type IngTarea, type TareaInput } from '@/services/ingenieria'

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

export default function IngenieriaPlan() {
  const [resumen, setResumen] = useState<{ tareas: number; proyectos: number; ingenieros: number } | null>(null)
  const [proyectos, setProyectos] = useState<IngProyecto[]>([])
  const [all, setAll] = useState<IngTarea[]>([])
  const [mode, setMode] = useState<'proyecto' | 'carga'>('proyecto')
  const [selProj, setSelProj] = useState<string>('')
  const [selEng, setSelEng] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<IngTarea | 'new' | null>(null)

  async function loadAll() {
    const [r, t] = await Promise.all([ingenieriaService.getResumen(), ingenieriaService.getTareas()])
    setResumen(r.data.resumen); setProyectos(r.data.proyectos); setAll(t.data)
    if (!selProj && r.data.proyectos[0]) setSelProj(r.data.proyectos[0].proyecto_ext)
  }
  useEffect(() => { loadAll().finally(() => setLoading(false)) }, [])

  if (loading) return <div className="py-20 text-center text-stone-400">Cargando plan de Ingeniería…</div>

  return (
    <div className="max-w-[1180px] mx-auto py-6 px-2 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center"><Gauge className="text-forest-600" size={22} /></div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Plan de Ingeniería</h1>
          <p className="text-sm text-stone-500">La estructura del Master.Sched: cada proyecto agrupa sus tareas, con su responsable.</p>
        </div>
        <div className="ml-auto flex gap-5 text-center">
          <Stat icon={<Layers size={15} />} n={resumen?.proyectos ?? 0} l="proyectos" />
          <Stat icon={<ClipboardList size={15} />} n={resumen?.tareas ?? 0} l="tareas" />
          <Stat icon={<Users size={15} />} n={resumen?.ingenieros ?? 0} l="ingenieros" />
        </div>
      </div>

      {/* Toggle de vista */}
      <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1 text-sm">
        <button onClick={() => setMode('proyecto')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold ${mode === 'proyecto' ? 'bg-forest-600 text-white' : 'text-stone-500 hover:text-stone-800'}`}><FolderKanban size={15} /> Por proyecto</button>
        <button onClick={() => setMode('carga')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold ${mode === 'carga' ? 'bg-forest-600 text-white' : 'text-stone-500 hover:text-stone-800'}`}><Gauge size={15} /> Carga por ingeniero</button>
      </div>

      {mode === 'proyecto'
        ? <VistaProyecto proyectos={proyectos} all={all} sel={selProj} setSel={setSelProj} onEdit={setEdit} />
        : <VistaCarga all={all} proyectos={proyectos} selEng={selEng} setSelEng={setSelEng} onEdit={setEdit} />}

      {edit && <EditModal tarea={edit === 'new' ? null : edit} proyecto={selProj} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await loadAll() }} />}
    </div>
  )
}

// ── Vista PRINCIPAL: Gantt del proyecto (réplica del Excel + barra por tarea) ──
function barBg(estado: string) {
  if (estado === 'hecha') return { background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46' }
  if (estado === 'en_curso') return { background: '#fde68a', border: '1px solid #fbbf24', color: '#92400e' }
  return { background: '#dbeafe', border: '1px solid #93c5fd', color: '#1e40af' }
}
function VistaProyecto({ proyectos, all, sel, setSel, onEdit }: { proyectos: IngProyecto[]; all: IngTarea[]; sel: string; setSel: (s: string) => void; onEdit: (t: IngTarea | 'new') => void }) {
  const tareas = useMemo(() => all.filter((t) => t.proyecto_ext === sel), [all, sel])
  const p = proyectos.find((x) => x.proyecto_ext === sel)
  const ingenieros = useMemo(() => [...new Set(tareas.map((t) => t.asignado_nombre).filter(Boolean))], [tareas])

  const g = useMemo(() => {
    const conF = tareas.filter((t) => t.fecha_inicio && t.fecha_fin)
    const fasesMap = new Map<string, IngTarea[]>()
    for (const t of tareas) { const k = t.fase || '— Sin fase —'; if (!fasesMap.has(k)) fasesMap.set(k, []); fasesMap.get(k)!.push(t) }
    for (const arr of fasesMap.values()) arr.sort((a, b) => (a.fecha_inicio || '~').localeCompare(b.fecha_inicio || '~'))
    const fases = [...fasesMap.entries()]
    if (!conF.length) return { fases, months: [], pct: () => 0, wPct: () => 0, hoyPct: null as number | null }
    let min = d(conF[0].fecha_inicio!), max = d(conF[0].fecha_fin!)
    for (const t of conF) { const a = d(t.fecha_inicio!), b = d(t.fecha_fin!); if (a < min) min = a; if (b > max) max = b }
    const week0 = mondayOf(min); const nWeeks = Math.max(1, Math.ceil((max.getTime() - week0.getTime()) / (7 * DAY)) + 1)
    const pct = (iso: string) => ((d(iso).getTime() - week0.getTime()) / (nWeeks * 7 * DAY)) * 100
    const wPct = (a: string, b: string) => Math.max(((d(b).getTime() - d(a).getTime()) / (nWeeks * 7 * DAY)) * 100 + 100 / nWeeks / 2, 100 / nWeeks * 0.55)
    const months: { label: string; startPct: number }[] = []
    for (let i = 0; i < nWeeks; i++) { const wd = new Date(week0.getTime() + i * 7 * DAY); const label = `${MES[wd.getMonth()]} ${String(wd.getFullYear()).slice(2)}`; const last = months[months.length - 1]; if (!last || last.label !== label) months.push({ label, startPct: (i / nWeeks) * 100 }) }
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const hoyPct = today >= week0 && today <= max ? ((today.getTime() - week0.getTime()) / (nWeeks * 7 * DAY)) * 100 : null
    return { fases, months, pct, wPct, hoyPct }
  }, [tareas])

  const GUT = 300

  return (
    <div className="space-y-4">
      {/* selector de proyecto */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={sel} onChange={(e) => setSel(e.target.value)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-forest-300 min-w-[280px]">
          {proyectos.map((pr) => <option key={pr.proyecto_ext} value={pr.proyecto_ext}>{pr.proyecto_ext} · {pr.n_tareas} tareas</option>)}
        </select>
        {p && <span className="text-sm text-stone-400">{p.fecha_inicio} → {p.fecha_fin} · {p.status_ext || '—'}</span>}
        <span className="text-xs text-stone-400 inline-flex items-center gap-1"><Users size={13} /> {ingenieros.length ? ingenieros.join(', ') : 'sin responsables'}</span>
        <button onClick={() => onEdit('new')} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-sm font-semibold px-3 py-1.5"><Plus size={15} /> Nueva tarea</button>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <div className="overflow-x-auto"><div className="min-w-[900px]">
          {/* header: gutter + meses */}
          <div className="flex items-stretch border-b border-stone-100 bg-stone-50/60">
            <div className="shrink-0 px-4 py-2 text-[10.5px] uppercase tracking-wide text-stone-400 font-semibold" style={{ width: GUT }}>Tarea · responsable</div>
            <div className="relative flex-1">
              {g.months.map((m, i) => <div key={i} className="absolute top-0 bottom-0 border-l border-stone-200 flex items-center pl-1.5 text-[10.5px] font-semibold text-forest-700" style={{ left: `${m.startPct}%` }}>{m.label}</div>)}
              {g.hoyPct !== null && <div className="absolute top-0 bottom-0 border-l-2 border-rose-400 z-10" style={{ left: `${g.hoyPct}%` }} />}
            </div>
          </div>

          {g.fases.map(([fase, ts]) => (
            <div key={fase}>
              <div className="bg-forest-50/40 px-4 py-1.5 text-[11px] font-bold text-forest-700 uppercase tracking-wide">{fase} <span className="text-forest-400 font-normal normal-case">· {ts.length} tareas</span></div>
              {ts.map((t) => (
                <div key={t.id} onClick={() => onEdit(t)} className="flex items-stretch border-b border-stone-50 hover:bg-forest-50/30 cursor-pointer">
                  <div className="shrink-0 px-4 py-2 border-r border-stone-100" style={{ width: GUT }}>
                    <div className="text-[13px] text-stone-800 truncate">{t.nombre}</div>
                    <div className="text-[11px] text-stone-400 truncate">
                      {t.asignado_nombre || 'sin responsable'} · <span className={t.allocation_pct > 1 ? 'text-rose-600 font-semibold' : ''}>{Math.round(t.allocation_pct * 100)}%</span> · {t.dur_dias}d
                      {t.hito_codigo && <span className="font-mono text-forest-600 ml-1">{t.hito_codigo}</span>}
                    </div>
                  </div>
                  <div className="relative flex-1 py-2 min-h-[42px]">
                    {g.months.map((m, i) => <div key={i} className="absolute top-0 bottom-0 border-l border-stone-50" style={{ left: `${m.startPct}%` }} />)}
                    {g.hoyPct !== null && <div className="absolute top-0 bottom-0 border-l-2 border-rose-200 z-0" style={{ left: `${g.hoyPct}%` }} />}
                    {t.fecha_inicio && t.fecha_fin ? (
                      <div title={`${t.fecha_inicio} → ${t.fecha_fin}`}
                        className="absolute top-1.5 h-6 rounded-md flex items-center px-2 gap-1 overflow-hidden"
                        style={{ left: `${g.pct(t.fecha_inicio)}%`, width: `calc(${g.wPct(t.fecha_inicio, t.fecha_fin)}% - 3px)`, ...barBg(t.estado) }}>
                        {t.estado === 'hecha' && <Check size={11} className="shrink-0" />}
                        <span className="text-[10px] font-semibold whitespace-nowrap">{fmtD(t.fecha_inicio)} → {fmtD(t.fecha_fin)}</span>
                      </div>
                    ) : <span className="absolute top-3 left-2 text-[10px] text-stone-300 italic">sin fecha</span>}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {tareas.length === 0 && <div className="px-4 py-10 text-center text-stone-400">Sin tareas en este proyecto.</div>}
        </div></div>
        <div className="px-4 py-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500 items-center border-t border-stone-100">
          <Leg style={barBg('pendiente')} t="pendiente" /><Leg style={barBg('en_curso')} t="en curso" /><Leg style={barBg('hecha')} t="completada" />
          <span className="inline-flex items-center gap-1"><span className="w-0.5 h-3.5 bg-rose-400 inline-block" /> hoy</span>
          <span className="italic text-stone-400">La barra muestra desde/hasta cuándo el responsable está ocupado en la tarea.</span>
        </div>
      </div>
    </div>
  )
}
function Leg({ style, t }: { style: React.CSSProperties; t: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className="w-4 h-3.5 rounded" style={style} /> {t}</span>
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

function EditModal({ tarea, proyecto, onClose, onSaved }: { tarea: IngTarea | null; proyecto: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<TareaInput>({
    proyecto_ext: tarea?.proyecto_ext ?? proyecto, nombre: tarea?.nombre ?? '', asignado_nombre: tarea?.asignado_nombre ?? '',
    allocation_pct: tarea?.allocation_pct ?? 1, dur_dias: tarea?.dur_dias ?? 1,
    fecha_inicio: tarea?.fecha_inicio ?? '', fecha_fin: tarea?.fecha_fin ?? '', estado: tarea?.estado ?? 'pendiente', comentario: tarea?.comentario ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof TareaInput, v: any) => setF((p) => ({ ...p, [k]: v }))
  const save = async () => {
    if (!f.nombre.trim()) { setErr('Poné un nombre'); return }
    setBusy(true); setErr(null)
    const payload: TareaInput = { ...f, asignado_nombre: f.asignado_nombre || null, fecha_inicio: f.fecha_inicio || null, fecha_fin: f.fecha_fin || null, comentario: f.comentario || null }
    try { if (tarea) await ingenieriaService.actualizarTarea(tarea.id, payload); else await ingenieriaService.crearTarea(payload); onSaved() }
    catch (e: any) { setErr(e?.response?.data?.message || 'No se pudo guardar'); setBusy(false) }
  }
  const del = async () => { if (!tarea) return; setBusy(true); try { await ingenieriaService.borrarTarea(tarea.id); onSaved() } catch (e: any) { setErr(e?.response?.data?.message || 'No se pudo borrar'); setBusy(false) } }
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
            <L t="Responsable"><input value={f.asignado_nombre ?? ''} onChange={(e) => set('asignado_nombre', e.target.value)} className="inp" /></L>
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
