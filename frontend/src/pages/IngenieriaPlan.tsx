import { useEffect, useMemo, useState } from 'react'
import { Users, Layers, ClipboardList, Plus, X, Loader2, Trash2, Gauge } from 'lucide-react'
import { ingenieriaService, type IngProyecto, type IngTarea, type TareaInput } from '@/services/ingenieria'

// ─────────────────────────────────────────────────────────────────────────────
// Plan de Ingeniería — réplica nativa del Master.Sched (Smartsheet).
// Centro: AGENDA por ingeniero (Gantt) — cada barra es una tarea en su fecha,
// coloreada por proyecto. Donde las barras se apilan, el ingeniero está saturado.
// Abajo: las tareas por proyecto, editables.
// ─────────────────────────────────────────────────────────────────────────────

const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DAY = 86400000
const d = (iso: string) => new Date(iso + 'T00:00:00')
const mondayOf = (dt: Date) => { const x = new Date(dt); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); x.setHours(0, 0, 0, 0); return x }

// paleta por proyecto (rota; la etiqueta desambigua)
const PAL = ['#2563eb', '#0d9488', '#ea580c', '#7c3aed', '#059669', '#db2777', '#ca8a04', '#4f46e5', '#0891b2', '#dc2626', '#65a30d', '#9333ea']
const shortProj = (p: string | null) => (p || '—').replace(/^\s*(\d{2}-\d{3}).*/, '$1')

export default function IngenieriaPlan() {
  const [resumen, setResumen] = useState<{ tareas: number; proyectos: number; ingenieros: number } | null>(null)
  const [proyectos, setProyectos] = useState<IngProyecto[]>([])
  const [all, setAll] = useState<IngTarea[]>([])
  const [sel, setSel] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<IngTarea | 'new' | null>(null)

  async function loadAll() {
    const [r, t] = await Promise.all([ingenieriaService.getResumen(), ingenieriaService.getTareas()])
    setResumen(r.data.resumen); setProyectos(r.data.proyectos); setAll(t.data)
    if (!sel && r.data.proyectos[0]) setSel(r.data.proyectos[0].proyecto_ext)
  }
  useEffect(() => { loadAll().finally(() => setLoading(false)) }, [])

  // color por proyecto (estable)
  const projColor = useMemo(() => {
    const m = new Map<string, string>()
    proyectos.forEach((p, i) => m.set(p.proyecto_ext, PAL[i % PAL.length]))
    return m
  }, [proyectos])

  // ── construir la agenda (Gantt) por ingeniero ──
  const agenda = useMemo(() => {
    // Solo tareas CON ingeniero asignado — las de fabricación/compras/envío (sin
    // ingeniero) no son carga de Ingeniería y ensuciarían la agenda.
    const conFecha = all.filter((t) => t.fecha_inicio && t.fecha_fin && t.estado !== 'na' && t.asignado_nombre)
    if (!conFecha.length) return null
    let min = d(conFecha[0].fecha_inicio!), max = d(conFecha[0].fecha_fin!)
    for (const t of conFecha) { const a = d(t.fecha_inicio!), b = d(t.fecha_fin!); if (a < min) min = a; if (b > max) max = b }
    const week0 = mondayOf(min)
    const nWeeks = Math.max(1, Math.ceil((max.getTime() - week0.getTime()) / (7 * DAY)) + 1)
    const wkIdx = (iso: string) => Math.floor((d(iso).getTime() - week0.getTime()) / (7 * DAY))

    // meses (para el header)
    const months: { label: string; startPct: number; wPct: number }[] = []
    for (let i = 0; i < nWeeks; i++) {
      const wkDate = new Date(week0.getTime() + i * 7 * DAY)
      const label = `${MES[wkDate.getMonth()]} ${String(wkDate.getFullYear()).slice(2)}`
      const last = months[months.length - 1]
      if (last && last.label === label) last.wPct += 100 / nWeeks
      else months.push({ label, startPct: (i / nWeeks) * 100, wPct: 100 / nWeeks })
    }

    // agrupar por ingeniero
    const byEng = new Map<string, IngTarea[]>()
    for (const t of conFecha) { const k = t.asignado_nombre || 'Sin asignar'; if (!byEng.has(k)) byEng.set(k, []); byEng.get(k)!.push(t) }

    // empaquetar cada ingeniero en sub-filas (greedy) → el # de sub-filas muestra el pico
    const engs = [...byEng.entries()].map(([nombre, tareas]) => {
      const sorted = [...tareas].sort((a, b) => wkIdx(a.fecha_inicio!) - wkIdx(b.fecha_inicio!))
      const rows: { endIdx: number; items: (IngTarea & { s: number; e: number })[] }[] = []
      for (const t of sorted) {
        const s = wkIdx(t.fecha_inicio!), e = Math.max(s, wkIdx(t.fecha_fin!))
        let row = rows.find((r) => r.endIdx < s)
        if (!row) { row = { endIdx: -1, items: [] }; rows.push(row) }
        row.items.push({ ...t, s, e }); row.endIdx = e
      }
      // pico de concurrencia (máx tareas solapadas en una semana)
      let pico = 0
      for (let w = 0; w < nWeeks; w++) { const c = tareas.filter((t) => wkIdx(t.fecha_inicio!) <= w && wkIdx(t.fecha_fin!) >= w).length; if (c > pico) pico = c }
      const nProj = new Set(tareas.map((t) => t.proyecto_ext)).size
      return { nombre, rows, pico, nProj, nTareas: tareas.length }
    }).sort((a, b) => b.pico - a.pico)

    return { nWeeks, months, engs, wkIdx }
  }, [all])

  const tareasProyecto = useMemo(() => all.filter((t) => t.proyecto_ext === sel), [all, sel])

  if (loading) return <div className="py-20 text-center text-stone-400">Cargando plan de Ingeniería…</div>

  return (
    <div className="max-w-[1180px] mx-auto py-6 px-2 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center"><Gauge className="text-forest-600" size={22} /></div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Plan de Ingeniería</h1>
          <p className="text-sm text-stone-500">Agenda por ingeniero y tareas por proyecto — importado del Master.Sched.</p>
        </div>
        <div className="ml-auto flex gap-5 text-center">
          <Stat icon={<Layers size={15} />} n={resumen?.proyectos ?? 0} l="proyectos" />
          <Stat icon={<ClipboardList size={15} />} n={resumen?.tareas ?? 0} l="tareas" />
          <Stat icon={<Users size={15} />} n={resumen?.ingenieros ?? 0} l="ingenieros" />
        </div>
      </div>

      {/* ── Agenda por ingeniero (Gantt) ── */}
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 flex-wrap">
          <Gauge size={17} className="text-forest-600" />
          <h2 className="font-bold text-stone-800">Agenda por ingeniero</h2>
          <span className="text-xs text-stone-400">cada barra = una tarea, en su fecha, coloreada por proyecto · <b className="text-rose-600">barras apiladas = saturado</b></span>
        </div>

        {agenda && (
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* header de meses */}
              <div className="flex items-stretch border-b border-stone-100 bg-stone-50/60">
                <div className="w-44 shrink-0 px-3 py-1.5 text-[10px] uppercase tracking-wide text-stone-400 font-semibold">Ingeniero</div>
                <div className="relative flex-1 h-7">
                  {agenda.months.map((m, i) => (
                    <div key={i} className="absolute top-0 bottom-0 border-l border-stone-200 flex items-center pl-1.5 text-[10.5px] font-semibold text-forest-700"
                         style={{ left: `${m.startPct}%`, width: `${m.wPct}%` }}>{m.label}</div>
                  ))}
                </div>
              </div>

              {/* filas por ingeniero */}
              {agenda.engs.map((eng) => (
                <div key={eng.nombre} className="flex border-b border-stone-100">
                  <div className="w-44 shrink-0 px-3 py-2 border-r border-stone-100">
                    <div className="font-semibold text-stone-800 text-[13px] truncate">{eng.nombre}</div>
                    <div className="text-[10px] text-stone-400">
                      {eng.nProj} proyectos · <b className={eng.pico >= 3 ? 'text-rose-600' : 'text-stone-600'}>pico {eng.pico} a la vez</b>
                    </div>
                  </div>
                  <div className="relative flex-1 py-1.5">
                    {/* líneas de mes de fondo */}
                    {agenda.months.map((m, i) => <div key={i} className="absolute top-0 bottom-0 border-l border-stone-50" style={{ left: `${m.startPct}%` }} />)}
                    <div className="space-y-1">
                      {eng.rows.map((row, ri) => (
                        <div key={ri} className="relative h-6">
                          {row.items.map((t) => {
                            const left = (t.s / agenda.nWeeks) * 100
                            const width = Math.max((t.e - t.s + 1) / agenda.nWeeks * 100, 100 / agenda.nWeeks)
                            const col = projColor.get(t.proyecto_ext || '') || '#78716c'
                            return (
                              <div key={t.id} onClick={() => setEdit(t)} title={`${t.proyecto_ext}\n${t.nombre}\n${t.fecha_inicio} → ${t.fecha_fin} · ${Math.round(t.allocation_pct * 100)}%`}
                                   className="absolute top-0 h-6 rounded-md flex items-center px-1.5 cursor-pointer overflow-hidden hover:ring-2 hover:ring-offset-1 hover:ring-stone-400"
                                   style={{ left: `${left}%`, width: `calc(${width}% - 2px)`, background: col + '26', borderLeft: `3px solid ${col}` }}>
                                <span className="text-[9.5px] font-semibold whitespace-nowrap" style={{ color: col }}>{shortProj(t.proyecto_ext)}</span>
                                <span className="text-[9.5px] text-stone-500 ml-1 truncate">{t.tipo_clave ? t.tipo_clave.replace(/_/g, ' ') : t.nombre}</span>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="px-4 py-2 text-[11px] text-stone-400 italic border-t border-stone-100">
          Clic en una barra para editarla. El "pico a la vez" es cuántas tareas se le solapan en la peor semana — Santos hace todo el CNC, por eso se le apila.
        </div>
      </div>

      {/* ── Tareas por proyecto ── */}
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 flex-wrap">
          <ClipboardList size={17} className="text-forest-600" />
          <h2 className="font-bold text-stone-800">Tareas del proyecto</h2>
          <select value={sel} onChange={(e) => setSel(e.target.value)}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-forest-300">
            {proyectos.map((p) => <option key={p.proyecto_ext} value={p.proyecto_ext}>{p.proyecto_ext} · {p.n_tareas} tareas</option>)}
          </select>
          <button onClick={() => setEdit('new')} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-sm font-semibold px-3 py-1.5"><Plus size={15} /> Nueva tarea</button>
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
              {tareasProyecto.map((t) => (
                <tr key={t.id} onClick={() => setEdit(t)} className="border-b border-stone-50 hover:bg-forest-50/40 cursor-pointer">
                  <td className="px-4 py-2"><div className="text-stone-800">{t.nombre}</div>{t.fase && <div className="text-[10px] text-stone-400">{t.fase}</div>}</td>
                  <td className="px-2 py-2 text-stone-600">{t.asignado_nombre || <span className="text-stone-300">—</span>}</td>
                  <td className="px-2 py-2 text-right tabular-nums"><span className={t.allocation_pct > 1 ? 'text-rose-600 font-semibold' : 'text-stone-700'}>{Math.round(t.allocation_pct * 100)}%</span></td>
                  <td className="px-2 py-2 text-right tabular-nums text-stone-600">{t.dur_dias}d</td>
                  <td className="px-2 py-2 text-stone-500 text-[12px] tabular-nums whitespace-nowrap">{t.fecha_inicio || '—'} → {t.fecha_fin || '—'}</td>
                  <td className="px-2 py-2">{t.hito_codigo ? <span className="text-[11px] font-mono bg-forest-50 text-forest-700 rounded px-1.5 py-0.5">{t.hito_codigo}</span> : <span className="text-stone-300 text-xs">libre</span>}</td>
                </tr>
              ))}
              {tareasProyecto.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-400">Sin tareas en este proyecto.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {edit && <EditModal tarea={edit === 'new' ? null : edit} proyecto={sel} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await loadAll() }} />}
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
          <span className="text-xs text-stone-400">· {f.proyecto_ext}</span>
          <button onClick={onClose} className="ml-auto text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <L t="Tarea"><input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className="inp" /></L>
          <div className="grid grid-cols-2 gap-3">
            <L t="Ingeniero"><input value={f.asignado_nombre ?? ''} onChange={(e) => set('asignado_nombre', e.target.value)} className="inp" /></L>
            <L t="Estado"><select value={f.estado} onChange={(e) => set('estado', e.target.value)} className="inp"><option value="pendiente">Pendiente</option><option value="en_curso">En curso</option><option value="hecha">Hecha</option><option value="na">No aplica</option></select></L>
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
