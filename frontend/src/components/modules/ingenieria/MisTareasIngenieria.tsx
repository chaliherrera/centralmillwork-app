import { useEffect, useMemo, useState } from 'react'
import { Loader2, CircleDot, Circle, CheckCircle2, MinusCircle, StickyNote, CalendarClock, CalendarCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { ingenieriaService, type IngTarea } from '@/services/ingenieria'

// ─────────────────────────────────────────────────────────────────────────────
// "Mis tareas de ingeniería" — el ingeniero REPORTA avance de sus tareas del plan
// (estado + nota). NO edita el plan (fechas/deps/asignación) — eso es del PM.
// Usa el endpoint /tareas/:id/avance (EXEC). El ingeniero elige su nombre (los del
// Excel: Santos, Vivian…); por defecto intenta el del usuario logueado.
// ─────────────────────────────────────────────────────────────────────────────

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmt = (iso: string | null) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MES[d.getMonth()]}` }
const diasEntre = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)

const ESTADOS: { key: string; label: string; icon: typeof Circle; cls: string }[] = [
  { key: 'pendiente', label: 'Pendiente', icon: Circle,       cls: 'text-stone-500 bg-stone-100' },
  { key: 'en_curso',  label: 'En curso',  icon: CircleDot,    cls: 'text-amber-700 bg-amber-100' },
  { key: 'hecha',     label: 'Hecha',     icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-100' },
  { key: 'na',        label: 'N/A',       icon: MinusCircle,  cls: 'text-stone-400 bg-stone-50' },
]

export default function MisTareasIngenieria() {
  const { user } = useAuth()
  const [tareas, setTareas] = useState<IngTarea[]>([])
  const [loading, setLoading] = useState(true)
  const [ing, setIng] = useState<string>('')
  const [busy, setBusy] = useState<number | null>(null)
  const [notaOpen, setNotaOpen] = useState<number | null>(null)
  const [notaVal, setNotaVal] = useState('')
  const [verHechas, setVerHechas] = useState(false)

  const cargar = () => ingenieriaService.getTareas()
    .then((r) => setTareas(r.data ?? []))
    .catch(() => {}).finally(() => setLoading(false))
  useEffect(() => { cargar() }, [])

  // Ingenieros disponibles (nombres asignados en el plan).
  const ingenieros = useMemo(() =>
    [...new Set(tareas.map((t) => t.asignado_nombre).filter((n): n is string => !!n))].sort(), [tareas])

  // Default: el nombre del usuario logueado si aparece en el plan (match laxo).
  useEffect(() => {
    if (ing || !ingenieros.length) return
    const mine = user?.nombre && ingenieros.find((n) =>
      n.toLowerCase().includes(user.nombre.toLowerCase().split(' ')[0]) ||
      user.nombre.toLowerCase().includes(n.toLowerCase().split(' ')[0]))
    setIng(mine || ingenieros[0])
  }, [ingenieros, user, ing])

  const mias = useMemo(() => tareas
    .filter((t) => t.asignado_nombre === ing)
    .filter((t) => verHechas || (t.estado !== 'hecha' && t.estado !== 'na'))
    .sort((a, b) => (a.fecha_inicio ?? '9999').localeCompare(b.fecha_inicio ?? '9999')), [tareas, ing, verHechas])

  const porProyecto = useMemo(() => {
    const m = new Map<string, IngTarea[]>()
    for (const t of mias) { const k = t.proyecto_ext ?? '—'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(t) }
    return [...m.entries()]
  }, [mias])

  const abiertas = tareas.filter((t) => t.asignado_nombre === ing && t.estado !== 'hecha' && t.estado !== 'na').length

  const setEstado = async (t: IngTarea, estado: string) => {
    if (t.estado === estado) return
    setBusy(t.id)
    try {
      await ingenieriaService.avanceTarea(t.id, { estado })
      setTareas((prev) => prev.map((x) => x.id === t.id ? { ...x, estado } : x))
    } catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo actualizar') }
    finally { setBusy(null) }
  }

  // Patrón "comprometida + cumplida": el ingeniero programa cuándo hará la tarea
  // (compromiso) y registra cuándo la cumplió. El gap es la señal para el PM.
  const setFecha = async (t: IngTarea, campo: 'fecha_compromiso' | 'fecha_fin_real', val: string) => {
    const nuevo = val || null
    if ((t[campo] ?? null) === nuevo) return
    setBusy(t.id)
    try {
      await ingenieriaService.avanceTarea(t.id, { [campo]: nuevo })
      setTareas((prev) => prev.map((x) => x.id === t.id ? { ...x, [campo]: nuevo } : x))
    } catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo guardar la fecha') }
    finally { setBusy(null) }
  }

  const guardarNota = async (t: IngTarea) => {
    const val = notaVal.trim()
    setNotaOpen(null)
    if (val === (t.comentario ?? '')) return
    try {
      await ingenieriaService.avanceTarea(t.id, { comentario: val || null })
      setTareas((prev) => prev.map((x) => x.id === t.id ? { ...x, comentario: val || null } : x))
      toast.success('Nota guardada')
    } catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo guardar la nota') }
  }

  if (loading) return <div className="py-16 text-center text-stone-400"><Loader2 className="animate-spin inline" size={20} /></div>
  if (!ingenieros.length) return <div className="py-12 text-center text-stone-400 text-sm">No hay tareas de ingeniería todavía.</div>

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 bg-stone-50/50 flex-wrap">
        <h2 className="font-bold text-stone-800">Mis tareas de ingeniería</h2>
        <span className="text-xs text-stone-400">reportá tu avance · no edita el plan (eso es del PM)</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-[11px] uppercase tracking-wide text-stone-400 font-semibold">Ingeniero</label>
          <select value={ing} onChange={(e) => setIng(e.target.value)}
            className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-forest-300">
            {ingenieros.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-2 border-b border-stone-100 text-xs text-stone-500">
        <span><b className="text-stone-700">{abiertas}</b> abierta{abiertas === 1 ? '' : 's'}</span>
        <label className="ml-auto inline-flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={verHechas} onChange={(e) => setVerHechas(e.target.checked)} /> ver hechas / N/A
        </label>
      </div>

      {!porProyecto.length ? (
        <div className="py-12 text-center text-stone-400 text-sm">Nada pendiente para {ing}. 🎉</div>
      ) : (
        <div className="divide-y divide-stone-100">
          {porProyecto.map(([proy, ts]) => (
            <div key={proy} className="p-3">
              <div className="text-[12px] font-mono font-bold text-forest-700 px-1 mb-1.5">{proy}</div>
              <div className="space-y-1.5">
                {ts.map((t) => (
                  <div key={t.id} className="rounded-lg border border-stone-100 px-3 py-2">
                    <div className="flex items-start gap-2 flex-wrap">
                      <div className="flex-1 min-w-[180px]">
                        <div className="text-sm font-medium text-stone-800">{t.nombre}</div>
                        <div className="text-[11px] text-stone-400">plan: {fmt(t.fecha_inicio)} → {fmt(t.fecha_fin)}{t.tipo_clave ? ` · ${t.tipo_clave}` : ''}</div>
                        {/* Patrón "comprometida + cumplida": el ingeniero programa y registra */}
                        <div className="mt-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-stone-500">
                          <label className="inline-flex items-center gap-1" title="¿Cuándo la vas a hacer? (tu compromiso)">
                            <CalendarClock size={12} className="text-stone-400" />
                            <span className="hidden sm:inline">Comprometida</span>
                            <input type="date" value={t.fecha_compromiso ?? ''} disabled={busy === t.id}
                              onChange={(e) => setFecha(t, 'fecha_compromiso', e.target.value)}
                              className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] text-stone-700 focus:outline-none focus:ring-1 focus:ring-forest-300" />
                          </label>
                          <label className="inline-flex items-center gap-1" title="¿Cuándo la cumpliste? (fecha real)">
                            <CalendarCheck size={12} className="text-stone-400" />
                            <span className="hidden sm:inline">Cumplida</span>
                            <input type="date" value={t.fecha_fin_real ?? ''} disabled={busy === t.id}
                              onChange={(e) => setFecha(t, 'fecha_fin_real', e.target.value)}
                              className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] text-stone-700 focus:outline-none focus:ring-1 focus:ring-forest-300" />
                          </label>
                          {t.fecha_compromiso && t.fecha_fin_real && (() => {
                            const g = diasEntre(t.fecha_compromiso, t.fecha_fin_real)
                            return g > 0
                              ? <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5">{g} d tarde</span>
                              : <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 font-semibold px-1.5 py-0.5">a tiempo</span>
                          })()}
                        </div>
                        {t.comentario && notaOpen !== t.id && (
                          <div className="text-[11px] text-stone-500 mt-1 flex items-start gap-1"><StickyNote size={12} className="mt-0.5 shrink-0" /> {t.comentario}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {ESTADOS.map((e) => {
                          const Icon = e.icon; const on = t.estado === e.key
                          return (
                            <button key={e.key} onClick={() => setEstado(t, e.key)} disabled={busy === t.id}
                              title={e.label}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${on ? e.cls : 'text-stone-400 hover:bg-stone-100'}`}>
                              {busy === t.id && on ? <Loader2 className="animate-spin" size={12} /> : <Icon size={12} />}
                              <span className="hidden sm:inline">{e.label}</span>
                            </button>
                          )
                        })}
                        <button onClick={() => { setNotaOpen(t.id); setNotaVal(t.comentario ?? '') }}
                          title="Nota" className="inline-flex items-center rounded-md px-1.5 py-1 text-stone-400 hover:bg-stone-100">
                          <StickyNote size={13} />
                        </button>
                      </div>
                    </div>
                    {notaOpen === t.id && (
                      <div className="mt-2 flex items-center gap-2">
                        <input autoFocus value={notaVal} onChange={(e) => setNotaVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') guardarNota(t); if (e.key === 'Escape') setNotaOpen(null) }}
                          placeholder="Nota de avance…"
                          className="flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                        <button onClick={() => guardarNota(t)} className="text-sm font-semibold text-forest-700 hover:text-forest-800 px-2">Guardar</button>
                        <button onClick={() => setNotaOpen(null)} className="text-sm text-stone-400 hover:text-stone-600 px-1">Cancelar</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
