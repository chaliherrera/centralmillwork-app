import { useEffect, useMemo, useState } from 'react'
import { Users, Layers, ClipboardList, Plus, X, Loader2, Trash2, Gauge } from 'lucide-react'
import { ingenieriaService, type IngProyecto, type IngTarea, type IngCarga, type TareaInput } from '@/services/ingenieria'

// ─────────────────────────────────────────────────────────────────────────────
// Plan de Ingeniería — réplica nativa del Master.Sched (Smartsheet).
// Centro: la CARGA por ingeniero en el tiempo (mapa de calor). Abajo: las tareas
// por proyecto, editables (para probar con el creador y corregir en vivo).
// ─────────────────────────────────────────────────────────────────────────────

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmtWk = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MES[d.getMonth()]}` }
const monthOf = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return `${MES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` }

// Color de una celda de carga (% de asignación de un ingeniero en una semana).
function loadClass(v: number): string {
  if (v <= 0) return 'bg-stone-50 text-stone-300'
  if (v <= 0.8) return 'bg-emerald-100 text-emerald-800'
  if (v <= 1.0) return 'bg-amber-100 text-amber-800'
  if (v <= 1.5) return 'bg-orange-200 text-orange-900'
  return 'bg-rose-300 text-rose-950 font-bold'
}

export default function IngenieriaPlan() {
  const [resumen, setResumen] = useState<{ tareas: number; proyectos: number; ingenieros: number; con_tipo: number } | null>(null)
  const [proyectos, setProyectos] = useState<IngProyecto[]>([])
  const [carga, setCarga] = useState<IngCarga | null>(null)
  const [sel, setSel] = useState<string>('')
  const [tareas, setTareas] = useState<IngTarea[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<IngTarea | 'new' | null>(null)

  async function loadTop() {
    const [r, c] = await Promise.all([ingenieriaService.getResumen(), ingenieriaService.getCarga()])
    setResumen(r.data.resumen); setProyectos(r.data.proyectos); setCarga(c.data)
    if (!sel && r.data.proyectos[0]) setSel(r.data.proyectos[0].proyecto_ext)
  }
  async function loadTareas(p: string) { if (!p) return; setTareas((await ingenieriaService.getTareas(p)).data) }

  useEffect(() => { loadTop().finally(() => setLoading(false)) }, [])
  useEffect(() => { if (sel) loadTareas(sel) }, [sel])

  const refreshAll = async () => { await Promise.all([loadTop(), sel ? loadTareas(sel) : Promise.resolve()]) }

  // agrupación de meses para el header del heatmap
  const monthSpans = useMemo(() => {
    if (!carga) return []
    const out: { label: string; span: number }[] = []
    for (const w of carga.semanas) {
      const m = monthOf(w)
      const last = out[out.length - 1]
      if (last && last.label === m) last.span++
      else out.push({ label: m, span: 1 })
    }
    return out
  }, [carga])

  if (loading) return <div className="py-20 text-center text-stone-400">Cargando plan de Ingeniería…</div>

  return (
    <div className="max-w-[1180px] mx-auto py-6 px-2 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center">
          <Gauge className="text-forest-600" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Plan de Ingeniería</h1>
          <p className="text-sm text-stone-500">Carga de trabajo por ingeniero y tareas por proyecto — importado del Master.Sched.</p>
        </div>
        <div className="ml-auto flex gap-5 text-center">
          <Stat icon={<Layers size={15} />} n={resumen?.proyectos ?? 0} l="proyectos" />
          <Stat icon={<ClipboardList size={15} />} n={resumen?.tareas ?? 0} l="tareas" />
          <Stat icon={<Users size={15} />} n={resumen?.ingenieros ?? 0} l="ingenieros" />
        </div>
      </div>

      {/* ── Carga por ingeniero (mapa de calor) ── */}
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
          <Gauge size={17} className="text-forest-600" />
          <h2 className="font-bold text-stone-800">Carga por ingeniero</h2>
          <span className="text-xs text-stone-400">cada celda = % de asignación esa semana · <b className="text-rose-600">rojo = sobrecarga (&gt;100%)</b></span>
        </div>
        <div className="overflow-x-auto">
          <table className="border-collapse text-[11px] w-full">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-stone-50 text-left px-3 py-1.5 font-semibold text-stone-500 min-w-[150px]">Ingeniero</th>
                {monthSpans.map((m, i) => (
                  <th key={i} colSpan={m.span} className="px-1 py-1.5 text-center font-semibold text-forest-700 border-l border-stone-200 uppercase tracking-wide">{m.label}</th>
                ))}
              </tr>
              <tr>
                <th className="sticky left-0 z-10 bg-stone-50 px-3 py-1 text-right font-medium text-stone-400">pico</th>
                {carga?.semanas.map((w, i) => (
                  <th key={i} className="px-0.5 py-1 text-center font-normal text-stone-300 text-[8.5px] w-8">{new Date(w + 'T00:00:00').getDate()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carga?.ingenieros.map((g) => (
                <tr key={g.nombre} className="border-t border-stone-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                    <div className="font-semibold text-stone-800 truncate">{g.nombre}</div>
                    <div className="text-[10px] text-stone-400">pico <b className={g.pico > 1 ? 'text-rose-600' : 'text-stone-600'}>{Math.round(g.pico * 100)}%</b></div>
                  </td>
                  {g.cargas.map((v, i) => (
                    <td key={i} title={`${g.nombre} · ${fmtWk(carga.semanas[i])} · ${Math.round(v * 100)}% · ${g.n_tareas[i]} tareas`}
                        className={`text-center align-middle w-8 h-9 ${loadClass(v)}`}>
                      {v > 0 ? Math.round(v * 100) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500 items-center border-t border-stone-100">
          <Leg cls="bg-emerald-100" t="≤80%" /><Leg cls="bg-amber-100" t="~100%" />
          <Leg cls="bg-orange-200" t="hasta 150%" /><Leg cls="bg-rose-300" t="sobrecarga" />
          <span className="italic text-stone-400">Los números son % de asignación sumado. La interpretación exacta se valida con el creador.</span>
        </div>
      </div>

      {/* ── Tareas por proyecto ── */}
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 flex-wrap">
          <ClipboardList size={17} className="text-forest-600" />
          <h2 className="font-bold text-stone-800">Tareas</h2>
          <select value={sel} onChange={(e) => setSel(e.target.value)}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-forest-300">
            {proyectos.map((p) => <option key={p.proyecto_ext} value={p.proyecto_ext}>{p.proyecto_ext} · {p.n_tareas} tareas</option>)}
          </select>
          <button onClick={() => setEdit('new')}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-sm font-semibold px-3 py-1.5">
            <Plus size={15} /> Nueva tarea
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-stone-400 border-b border-stone-100">
                <th className="text-left font-semibold px-4 py-2">Tarea</th>
                <th className="text-left font-semibold px-2 py-2">Ingeniero</th>
                <th className="text-right font-semibold px-2 py-2">Asig.</th>
                <th className="text-right font-semibold px-2 py-2">Dur.</th>
                <th className="text-left font-semibold px-2 py-2">Fechas</th>
                <th className="text-left font-semibold px-2 py-2">Hito</th>
              </tr>
            </thead>
            <tbody>
              {tareas.map((t) => (
                <tr key={t.id} onClick={() => setEdit(t)} className="border-b border-stone-50 hover:bg-forest-50/40 cursor-pointer">
                  <td className="px-4 py-2">
                    <div className="text-stone-800">{t.nombre}</div>
                    {t.fase && <div className="text-[10px] text-stone-400">{t.fase}</div>}
                  </td>
                  <td className="px-2 py-2 text-stone-600">{t.asignado_nombre || <span className="text-stone-300">—</span>}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <span className={t.allocation_pct > 1 ? 'text-rose-600 font-semibold' : 'text-stone-700'}>{Math.round(t.allocation_pct * 100)}%</span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-stone-600">{t.dur_dias}d</td>
                  <td className="px-2 py-2 text-stone-500 text-[12px] tabular-nums whitespace-nowrap">{t.fecha_inicio || '—'} → {t.fecha_fin || '—'}</td>
                  <td className="px-2 py-2">{t.hito_codigo ? <span className="text-[11px] font-mono bg-forest-50 text-forest-700 rounded px-1.5 py-0.5">{t.hito_codigo}</span> : <span className="text-stone-300 text-xs">libre</span>}</td>
                </tr>
              ))}
              {tareas.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-400">Sin tareas en este proyecto.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {edit && <EditModal tarea={edit === 'new' ? null : edit} proyecto={sel} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await refreshAll() }} />}
    </div>
  )
}

function Stat({ icon, n, l }: { icon: React.ReactNode; n: number; l: string }) {
  return <div><div className="flex items-center justify-center gap-1 text-stone-400">{icon}</div><div className="text-xl font-bold text-stone-900 tabular-nums leading-none mt-0.5">{n}</div><div className="text-[10px] uppercase tracking-wide text-stone-400">{l}</div></div>
}
function Leg({ cls, t }: { cls: string; t: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`w-3.5 h-3.5 rounded ${cls} border border-black/5`} /> {t}</span>
}

function EditModal({ tarea, proyecto, onClose, onSaved }: { tarea: IngTarea | null; proyecto: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<TareaInput>({
    proyecto_ext: tarea?.proyecto_ext ?? proyecto,
    nombre: tarea?.nombre ?? '',
    asignado_nombre: tarea?.asignado_nombre ?? '',
    allocation_pct: tarea?.allocation_pct ?? 1,
    dur_dias: tarea?.dur_dias ?? 1,
    fecha_inicio: tarea?.fecha_inicio ?? '',
    fecha_fin: tarea?.fecha_fin ?? '',
    estado: tarea?.estado ?? 'pendiente',
    comentario: tarea?.comentario ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof TareaInput, v: any) => setF((p) => ({ ...p, [k]: v }))

  const save = async () => {
    if (!f.nombre.trim()) { setErr('Poné un nombre'); return }
    setBusy(true); setErr(null)
    const payload: TareaInput = {
      ...f,
      asignado_nombre: f.asignado_nombre || null,
      fecha_inicio: f.fecha_inicio || null, fecha_fin: f.fecha_fin || null,
      comentario: f.comentario || null,
    }
    try {
      if (tarea) await ingenieriaService.actualizarTarea(tarea.id, payload)
      else await ingenieriaService.crearTarea(payload)
      onSaved()
    } catch (e: any) { setErr(e?.response?.data?.message || 'No se pudo guardar'); setBusy(false) }
  }
  const del = async () => {
    if (!tarea) return
    setBusy(true)
    try { await ingenieriaService.borrarTarea(tarea.id); onSaved() }
    catch (e: any) { setErr(e?.response?.data?.message || 'No se pudo borrar'); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList size={18} className="text-forest-600" />
          <h3 className="font-semibold text-stone-800">{tarea ? 'Editar tarea' : 'Nueva tarea'}</h3>
          <span className="text-xs text-stone-400">· {f.proyecto_ext}</span>
          <button onClick={onClose} className="ml-auto text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <L t="Tarea"><input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className="inp" /></L>
          <div className="grid grid-cols-2 gap-3">
            <L t="Ingeniero"><input value={f.asignado_nombre ?? ''} onChange={(e) => set('asignado_nombre', e.target.value)} className="inp" /></L>
            <L t="Estado">
              <select value={f.estado} onChange={(e) => set('estado', e.target.value)} className="inp">
                <option value="pendiente">Pendiente</option><option value="en_curso">En curso</option>
                <option value="hecha">Hecha</option><option value="na">No aplica</option>
              </select>
            </L>
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
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2">
            {busy ? <Loader2 className="animate-spin" size={15} /> : 'Guardar'}
          </button>
        </div>
      </div>
      <style>{`.inp{width:100%;border:1px solid #d6d3d1;border-radius:.5rem;padding:.45rem .6rem;font-size:.875rem;color:#1c1917}.inp:focus{outline:none;box-shadow:0 0 0 2px #86bd8b}`}</style>
    </div>
  )
}
function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] uppercase tracking-wide text-stone-400 font-semibold">{t}</span><div className="mt-1">{children}</div></label>
}
