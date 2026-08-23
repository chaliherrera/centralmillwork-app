import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileSignature, CalendarClock, Upload, CheckCircle2, ArrowRight, Loader2, ClipboardList } from 'lucide-react'
import { proyectosService } from '@/services/proyectos'
import { scheduleService, type ScheduleData } from '@/services/schedule'
import MiTrabajo from '@/components/modules/schedule/MiTrabajo'
import FactibilidadCheck from '@/components/modules/estimados/FactibilidadCheck'
import type { Proyecto } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Escritorio de Estimación — la PUERTA DE ENTRADA del schedule.
// El estimador elige un proyecto, carga la fecha de entrega comprometida y el
// contrato firmado. Eso genera el schedule (hacia atrás) y cierra C-03 (día cero).
// ─────────────────────────────────────────────────────────────────────────────

export default function Estimacion() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [plan, setPlan] = useState<ScheduleData | null>(null)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [fecha, setFecha] = useState('')
  const [contrato, setContrato] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [editFecha, setEditFecha] = useState(false)
  const [nuevaFecha, setNuevaFecha] = useState('')

  useEffect(() => {
    proyectosService.getAll({ limit: 200 } as any).then((r) => setProyectos(r.data ?? [])).catch(() => {})
  }, [])

  const selectedProyecto = useMemo(() => proyectos.find((p) => p.id === selId) ?? null, [proyectos, selId])

  const cargarPlan = (id: number) => {
    setLoadingPlan(true); setPlan(null); setError(null); setOkMsg(null)
    scheduleService.getPlan(id)
      .then((r) => setPlan(r.data))
      .catch(() => setPlan(null))
      .finally(() => setLoadingPlan(false))
  }

  const onSelect = (id: number) => {
    setSelId(id)
    const p = proyectos.find((x) => x.id === id)
    // Pre-cargar la fecha con la ETA del proyecto si la tiene.
    setFecha(p?.fecha_fin_estimada ? p.fecha_fin_estimada.slice(0, 10) : '')
    setContrato(null)
    cargarPlan(id)
  }

  const iniciar = async () => {
    if (!selId || !fecha) return
    setBusy(true); setError(null); setOkMsg(null)
    try {
      const r = await scheduleService.intake(selId, fecha, contrato)
      setOkMsg(r.data?.planNuevo ? 'Proyecto iniciado en el schedule — día cero registrado.' : 'Contrato registrado — día cero.')
      cargarPlan(selId)
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo iniciar el proyecto')
    } finally {
      setBusy(false)
    }
  }

  const guardarFecha = async () => {
    if (!selId || !nuevaFecha) return
    setBusy(true); setError(null); setOkMsg(null)
    try {
      await scheduleService.cambiarFechaObjetivo(selId, nuevaFecha)
      setEditFecha(false)
      setOkMsg('Fecha de entrega actualizada — el schedule se recalculó.')
      cargarPlan(selId)
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo cambiar la fecha')
    } finally {
      setBusy(false)
    }
  }

  const tienePlan = !!plan?.plan
  const c03 = plan?.hitos?.find((h) => h.codigo === 'C-03')

  return (
    <div className="max-w-3xl mx-auto py-6 px-1 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center">
          <FileSignature className="text-forest-600" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Estimados</h1>
          <p className="text-sm text-stone-500">Arrancá un proyecto en el schedule: contrato firmado + fecha de entrega.</p>
        </div>
      </div>

      {/* Chequeo de factibilidad (nuevo — paso 4 del flujo). Read-only. */}
      <FactibilidadCheck />

      {/* Paso previo: el proyecto debe existir. */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
        <span className="font-semibold shrink-0">Paso previo:</span>
        <span>
          el proyecto tiene que estar creado. Si no lo ves en la lista, crealo primero en{' '}
          <Link to="/proyectos" className="font-semibold underline hover:text-amber-900">Proyectos</Link>.
        </span>
      </div>

      {/* Selector de proyecto */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <label className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold">Proyecto</label>
        <select
          value={selId ?? ''}
          onChange={(e) => onSelect(Number(e.target.value))}
          className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-forest-300"
        >
          <option value="" disabled>Elegí un proyecto…</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}{p.cliente ? ` — ${p.cliente}` : ''}</option>
          ))}
        </select>
      </div>

      {/* Cuerpo según estado del proyecto elegido */}
      {selId && (
        loadingPlan ? (
          <div className="py-10 text-center text-stone-400 text-sm flex items-center justify-center gap-2">
            <Loader2 className="animate-spin" size={16} /> Cargando…
          </div>
        ) : tienePlan ? (
          // Ya tiene schedule
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 size={18} />
              <span className="font-semibold text-sm">Este proyecto ya está en el schedule</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold">Entrega objetivo</div>
                {editFecha ? (
                  <div className="mt-1 flex items-center gap-1.5">
                    <input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)}
                      className="rounded-lg border border-stone-300 px-2 py-1 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-forest-300" />
                    <button onClick={guardarFecha} disabled={busy || !nuevaFecha}
                      className="rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1.5">
                      {busy ? <Loader2 className="animate-spin" size={13} /> : 'Guardar'}
                    </button>
                    <button onClick={() => setEditFecha(false)} className="text-xs text-stone-500 px-1">Cancelar</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-stone-900 font-bold tabular-nums">{plan?.plan?.fecha_objetivo ?? '—'}</span>
                    <button onClick={() => { setNuevaFecha(plan?.plan?.fecha_objetivo ?? ''); setEditFecha(true) }}
                      className="text-[11px] font-semibold text-forest-700 hover:text-forest-800 underline">Cambiar</button>
                  </div>
                )}
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold">Contrato (día cero)</div>
                <div className={c03?.fecha_real ? 'text-emerald-700 font-semibold' : 'text-amber-600 font-semibold'}>
                  {c03?.fecha_real ? `✓ ${c03.fecha_real}` : 'pendiente'}
                </div>
              </div>
            </div>
            {okMsg && <div className="mt-3 text-sm text-emerald-700">{okMsg}</div>}
            <Link to={`/proyectos/${selId}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:text-forest-800">
              Ver el schedule del proyecto <ArrowRight size={15} />
            </Link>
          </div>
        ) : (
          // No tiene schedule → intake
          <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-4">
            <div>
              <p className="text-sm text-stone-600">
                {selectedProyecto?.nombre} todavía no arrancó en el schedule. Cargá la fecha de entrega
                comprometida y el contrato firmado para darle vida.
              </p>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold flex items-center gap-1.5">
                <CalendarClock size={13} /> Fecha de entrega comprometida
              </label>
              <input
                type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-forest-300"
              />
              <p className="mt-1 text-xs text-stone-400">El sistema calcula hacia atrás la fecha límite de cada paso.</p>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold flex items-center gap-1.5">
                <Upload size={13} /> Contrato firmado (PDF) <span className="normal-case tracking-normal text-stone-400">— opcional</span>
              </label>
              <input
                type="file" accept="application/pdf"
                onChange={(e) => setContrato(e.target.files?.[0] ?? null)}
                className="mt-1.5 w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-forest-50 file:px-3 file:py-2 file:text-forest-700 file:font-semibold"
              />
              {contrato && <p className="mt-1 text-xs text-stone-500">{contrato.name}</p>}
            </div>

            {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}

            <button
              onClick={iniciar} disabled={busy || !fecha}
              className="w-full rounded-xl bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white font-semibold py-3 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="animate-spin" size={17} /> : <FileSignature size={17} />}
              Iniciar el proyecto en el schedule
            </button>
          </div>
        )
      )}

      {/* Mi trabajo — lo que Estimación debe registrar en todos los proyectos. */}
      <div className="pt-4">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardList size={17} className="text-forest-600" />
          <h2 className="text-base font-bold text-stone-900">Mi trabajo</h2>
        </div>
        <p className="text-xs text-stone-500 mb-3">
          Todo lo que Estimación tiene que resolver, en todos los proyectos a la vez. Aparece acá en cuanto
          está habilitado (sus pasos previos cumplidos) y desaparece cuando lo registrás.
        </p>
        <MiTrabajo area="estimating" emptyMsg="Estimación no tiene nada pendiente ahora mismo. 🎉" />
      </div>
    </div>
  )
}
