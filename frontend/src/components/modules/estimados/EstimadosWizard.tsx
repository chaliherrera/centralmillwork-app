import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban, FileUp, CalendarClock, Rocket, Check, ChevronRight, ChevronLeft, Plus, Loader2, CheckCircle2, ArrowRight } from 'lucide-react'
import { proyectosService } from '@/services/proyectos'
import { scheduleService, type FactibilidadResult } from '@/services/schedule'
import { ingenieriaService } from '@/services/ingenieria'
import ProyectoForm from '@/components/modules/proyectos/ProyectoForm'
import FactibilidadCheck from './FactibilidadCheck'
import type { Proyecto } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Wizard de Estimados — el flujo guiado: Proyecto → Contrato → Factibilidad →
// Crear schedule. Encadena piezas existentes; el schedule se crea SOLO si la
// fecha es factible (o se comprometió una fecha real negociada).
// ─────────────────────────────────────────────────────────────────────────────

const PASOS = [
  { n: 1, label: 'Proyecto', icon: FolderKanban },
  { n: 2, label: 'Contrato', icon: FileUp },
  { n: 3, label: 'Factibilidad', icon: CalendarClock },
  { n: 4, label: 'Crear schedule', icon: Rocket },
]
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmt = (iso: string) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}` }

export default function EstimadosWizard() {
  const [paso, setPaso] = useState(1)
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [tienePlan, setTienePlan] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [contrato, setContrato] = useState<File | null>(null)
  const [factRes, setFactRes] = useState<FactibilidadResult | null>(null)
  const [fechaSolicitada, setFechaSolicitada] = useState('')
  const [fechaComprometida, setFechaComprometida] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creado, setCreado] = useState(false)
  const [reservadas, setReservadas] = useState(0)

  const cargarProyectos = () => proyectosService.getAll({ limit: 200 } as any).then((r) => setProyectos(r.data ?? [])).catch(() => {})
  useEffect(() => { cargarProyectos() }, [])

  const sel = useMemo(() => proyectos.find((p) => p.id === selId) ?? null, [proyectos, selId])

  const onSelect = async (id: number) => {
    setSelId(id); setTienePlan(false)
    try { const r = await scheduleService.getPlan(id); setTienePlan(!!r.data?.plan) } catch { setTienePlan(false) }
  }

  const canNext =
    paso === 1 ? !!sel && !tienePlan :
    paso === 2 ? !!contrato :
    paso === 3 ? !!fechaComprometida :
    false

  const crearSchedule = async () => {
    if (!sel || !fechaComprometida || !contrato) return
    setCreating(true); setError(null)
    try {
      await scheduleService.intake(sel.id, fechaComprometida, contrato)
      // Reservar la capacidad de Ingeniería (best-effort; el PM la confirma después).
      try { const rr = await ingenieriaService.reservar(sel.id); setReservadas(rr.data?.creadas ?? 0) } catch { /* la reserva no bloquea */ }
      setCreado(true)
    } catch (e: any) { setError(e?.response?.data?.message || 'No se pudo crear el schedule') } finally { setCreating(false) }
  }

  // ── pantalla final ──
  if (creado && sel) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-8 text-center">
        <CheckCircle2 size={44} className="text-emerald-600 mx-auto" />
        <h2 className="mt-3 text-xl font-bold text-stone-900">Schedule creado</h2>
        <p className="mt-1 text-stone-600">{sel.codigo} · {sel.nombre} — comprometido para el <b>{fmt(fechaComprometida)}</b>.</p>
        {reservadas > 0 && <p className="mt-1 text-sm text-forest-700">🔒 {reservadas} espacio{reservadas > 1 ? 's' : ''} de Ingeniería reservado{reservadas > 1 ? 's' : ''} — el PM confirma y asigna el ingeniero.</p>}
        <div className="mt-5 flex items-center justify-center gap-3">
          <Link to={`/proyectos/${sel.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-sm font-semibold px-4 py-2">
            Ver el schedule <ArrowRight size={15} />
          </Link>
          <button onClick={() => { setCreado(false); setPaso(1); setSelId(null); setContrato(null); setFactRes(null); setFechaSolicitada(''); setFechaComprometida(''); cargarProyectos() }}
            className="text-sm text-stone-500 hover:text-stone-800 px-3 py-2">Arrancar otro</button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
      {/* Stepper */}
      <div className="flex items-center gap-1 px-5 py-4 border-b border-stone-100 bg-stone-50/50">
        {PASOS.map((p, i) => {
          const done = paso > p.n, cur = paso === p.n
          const Icon = p.icon
          return (
            <div key={p.n} className="flex items-center gap-1 flex-1 last:flex-none">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-forest-600 text-white' : cur ? 'bg-forest-600 text-white ring-4 ring-forest-100' : 'bg-stone-200 text-stone-400'}`}>
                  {done ? <Check size={16} /> : <Icon size={15} />}
                </div>
                <span className={`text-[13px] font-semibold ${cur ? 'text-forest-800' : done ? 'text-stone-600' : 'text-stone-400'}`}>{p.label}</span>
              </div>
              {i < PASOS.length - 1 && <div className={`flex-1 h-0.5 mx-2 rounded ${done ? 'bg-forest-400' : 'bg-stone-200'}`} />}
            </div>
          )
        })}
      </div>

      <div className="p-5 min-h-[280px]">
        {/* PASO 1 — Proyecto */}
        {paso === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-stone-800">¿Para qué proyecto?</h3>
              <p className="text-sm text-stone-500">Elegí un proyecto o creá uno nuevo. Las fechas se definen más adelante, con la factibilidad.</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[280px]">
                <label className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold">Proyecto</label>
                <select value={selId ?? ''} onChange={(e) => onSelect(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm text-stone-800 bg-white focus:outline-none focus:ring-2 focus:ring-forest-300">
                  <option value="" disabled>Elegí un proyecto…</option>
                  {proyectos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}{p.cliente ? ` — ${p.cliente}` : ''}</option>)}
                </select>
              </div>
              <button onClick={() => setFormOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-forest-300 text-forest-700 hover:bg-forest-50 text-sm font-semibold px-3 py-2.5">
                <Plus size={15} /> Crear proyecto
              </button>
            </div>
            {sel && tienePlan && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                Este proyecto <b>ya tiene schedule</b>. <Link to={`/proyectos/${sel.id}`} className="underline font-semibold">Verlo</Link> o elegí otro.
              </div>
            )}
          </div>
        )}

        {/* PASO 2 — Contrato */}
        {paso === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-stone-800">Contrato firmado</h3>
              <p className="text-sm text-stone-500">Subí el PDF del contrato firmado. <b>Es obligatorio</b> — es el día cero del proyecto.</p>
            </div>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-10 cursor-pointer hover:border-forest-400 transition-colors">
              <FileUp size={28} className="text-stone-300" />
              <span className="text-sm text-stone-500">{contrato ? contrato.name : 'Elegí el PDF del contrato firmado'}</span>
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setContrato(e.target.files?.[0] ?? null)} />
            </label>
            {contrato && <div className="text-xs text-emerald-700 flex items-center gap-1"><Check size={13} /> {contrato.name} listo</div>}
            <div className="text-[11px] text-stone-400">Más adelante, la firma de DocuSign va a marcar automáticamente la fecha de firma. Por ahora, el PDF acá alcanza.</div>
          </div>
        )}

        {/* PASO 3 — Factibilidad */}
        {paso === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-stone-800">¿Se puede cumplir la fecha?</h3>
              <p className="text-sm text-stone-500">Ingresá la fecha que pide el cliente. El sistema revisa la carga de Ingeniería y te dice si es factible.</p>
            </div>
            <FactibilidadCheck fechaInicial={fechaSolicitada} onResult={(f, r) => {
              setFechaSolicitada(f); setFactRes(r)
              setFechaComprometida(r.factible ? f : r.fecha_real_mas_temprana)
            }} />
            {factRes && (
              <div className="rounded-xl border border-forest-200 bg-forest-50/40 p-4">
                <div className="text-[11px] uppercase tracking-wide text-forest-600 font-semibold">Fecha a comprometer con el cliente</div>
                <p className="text-xs text-stone-500 mt-0.5">
                  {factRes.factible ? 'La fecha pedida entra. Podés comprometerla.' : 'La pedida no entra. Comprometé la fecha real, o negociá otra con el cliente.'}
                </p>
                <input type="date" value={fechaComprometida} onChange={(e) => setFechaComprometida(e.target.value)}
                  className="mt-2 rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-forest-300" />
                <span className="ml-2 text-xs text-stone-400">esta será la fecha objetivo (sagrada) del schedule</span>
              </div>
            )}
          </div>
        )}

        {/* PASO 4 — Crear schedule */}
        {paso === 4 && sel && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-stone-800">Crear el schedule</h3>
              <p className="text-sm text-stone-500">Revisá y creá. Se genera el schedule (hacia atrás) y se registra el día cero.</p>
            </div>
            <div className="rounded-xl border border-stone-100 bg-stone-50/60 divide-y divide-stone-100">
              <Row k="Proyecto" v={`${sel.codigo} · ${sel.nombre}`} />
              <Row k="Contrato" v={contrato?.name ?? '—'} />
              <Row k="Fecha pedida por el cliente" v={fechaSolicitada ? fmt(fechaSolicitada) : '—'} />
              <Row k="Fecha comprometida (objetivo)" v={<b className="text-forest-700">{fmt(fechaComprometida)}</b>} />
              {factRes && !factRes.factible && <Row k="Aviso" v={<span className="text-amber-700">La pedida no era factible — se comprometió una fecha real.</span>} />}
            </div>
            {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <div className="text-[11px] text-stone-400">La reserva de la capacidad de Ingeniería se agrega en el próximo paso del sistema (la confirma el PM).</div>
          </div>
        )}
      </div>

      {/* Navegación */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-stone-100 bg-stone-50/50">
        <button onClick={() => setPaso((p) => Math.max(1, p - 1))} disabled={paso === 1}
          className="inline-flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-stone-800 disabled:opacity-30"><ChevronLeft size={16} /> Atrás</button>
        {paso < 4 ? (
          <button onClick={() => setPaso((p) => p + 1)} disabled={!canNext}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2">
            Continuar <ChevronRight size={16} />
          </button>
        ) : (
          <button onClick={crearSchedule} disabled={creating || !contrato || !fechaComprometida}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2">
            {creating ? <Loader2 className="animate-spin" size={16} /> : <Rocket size={16} />} Crear el schedule
          </button>
        )}
      </div>

      <ProyectoForm open={formOpen} onClose={() => setFormOpen(false)} hideDates
        onCreated={(p) => { setProyectos((prev) => [p, ...prev]); onSelect(p.id) }} />
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between px-4 py-2.5 text-sm"><span className="text-stone-400">{k}</span><span className="text-stone-800">{v}</span></div>
}
