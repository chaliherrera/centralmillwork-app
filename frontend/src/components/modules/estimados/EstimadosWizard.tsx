import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban, CalendarClock, UserCheck, Lock, FileUp, Check, ChevronRight, ChevronLeft, Plus, Loader2, CheckCircle2, ArrowRight, Send } from 'lucide-react'
import { proyectosService } from '@/services/proyectos'
import { scheduleService, type FactibilidadResult } from '@/services/schedule'
import { ingenieriaService } from '@/services/ingenieria'
import ProyectoForm from '@/components/modules/proyectos/ProyectoForm'
import StatusBadge from '@/components/ui/StatusBadge'
import FactibilidadCheck from './FactibilidadCheck'
import MapaEtapas from '@/components/modules/ingenieria/MapaEtapas'
import type { Proyecto } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Wizard de Estimados — el flujo guiado, en el orden que el contrato va AL FINAL:
//   1 Proyecto (con hoja de intake) → 2 Factibilidad → 3 Aceptación del PM →
//   4 Reserva → 5 Firma + contrato (día cero).
// El schedule se calcula hacia atrás desde la fecha comprometida (no desde la
// firma), así que factibilidad y reserva pueden ir ANTES de la firma. El PM
// acepta la fecha y confirma la reserva en su bandeja (asíncrono, Estimados no
// espera). La firma cierra C-03 = día cero.
// ─────────────────────────────────────────────────────────────────────────────

const PASOS = [
  { n: 1, label: 'Proyecto', icon: FolderKanban },
  { n: 2, label: 'Factibilidad', icon: CalendarClock },
  { n: 3, label: 'Aceptación PM', icon: UserCheck },
  { n: 4, label: 'Reserva', icon: Lock },
  { n: 5, label: 'Firma', icon: FileUp },
]
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmt = (iso: string) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}` }

export default function EstimadosWizard() {
  const [paso, setPaso] = useState(1)
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [tienePlan, setTienePlan] = useState(false)
  const [formOpen, setFormOpen] = useState(false)

  const [factRes, setFactRes] = useState<FactibilidadResult | null>(null)
  const [fechaSolicitada, setFechaSolicitada] = useState('')
  const [fechaComprometida, setFechaComprometida] = useState('')

  // Paso 3/4 — envío al PM + reserva
  const [enviandoPM, setEnviandoPM] = useState(false)
  const [enviadoPM, setEnviadoPM] = useState(false)
  const [reservadas, setReservadas] = useState(0)
  const [liberando, setLiberando] = useState(false)

  // Paso 5 — contrato
  const [contrato, setContrato] = useState<File | null>(null)
  const [fechaEnvio, setFechaEnvio] = useState('')   // cuándo se envió el contrato al cliente
  const [fechaFirma, setFechaFirma] = useState('')   // cuándo el cliente firmó = día cero real
  const [firmando, setFirmando] = useState(false)
  const [firmado, setFirmado] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const cargarProyectos = () => proyectosService.getAll({ limit: 200 } as any).then((r) => setProyectos(r.data ?? [])).catch(() => {})
  useEffect(() => { cargarProyectos() }, [])

  const sel = useMemo(() => proyectos.find((p) => p.id === selId) ?? null, [proyectos, selId])

  const onSelect = async (id: number) => {
    setSelId(id); setTienePlan(false)
    try { const r = await scheduleService.getPlan(id); setTienePlan(!!r.data?.plan) } catch { setTienePlan(false) }
  }

  // Días que tardó el cliente en firmar (envío → firma) = retraso atribuible a él.
  const diasCliente = useMemo(() => {
    if (!fechaEnvio || !fechaFirma) return null
    return Math.round((new Date(fechaFirma + 'T00:00:00').getTime() - new Date(fechaEnvio + 'T00:00:00').getTime()) / 86400000)
  }, [fechaEnvio, fechaFirma])

  const resetTodo = () => {
    setPaso(1); setSelId(null); setTienePlan(false); setFactRes(null); setFechaSolicitada(''); setFechaComprometida('')
    setEnviadoPM(false); setReservadas(0); setContrato(null); setFechaEnvio(''); setFechaFirma(''); setFirmado(false); setError(null)
    cargarProyectos()
  }

  // ── Paso 3 → crea el plan (hacia atrás) + reserva provisional para el PM ──
  const enviarAlPM = async () => {
    if (!sel || !fechaComprometida) return
    setEnviandoPM(true); setError(null)
    try {
      await scheduleService.generar(sel.id, fechaComprometida)
      try { const rr = await ingenieriaService.reservar(sel.id); setReservadas(rr.data?.creadas ?? 0) } catch { /* la reserva no bloquea */ }
      setEnviadoPM(true); setTienePlan(true)
    } catch (e: any) { setError(e?.response?.data?.message || 'No se pudo enviar al PM') } finally { setEnviandoPM(false) }
  }

  const liberarReserva = async () => {
    if (!sel) return
    setLiberando(true); setError(null)
    try { await ingenieriaService.liberarReserva(sel.id); setReservadas(0) } catch { /* no bloquea */ } finally { setLiberando(false) }
  }

  // ── Paso 5 → registra la firma + contrato (cierra C-03 = día cero) ──
  const registrarFirma = async () => {
    if (!sel || !fechaComprometida || !contrato) return
    setFirmando(true); setError(null)
    try {
      await scheduleService.intake(sel.id, fechaComprometida, contrato,
        { fecha_firma: fechaFirma || undefined, fecha_envio: fechaEnvio || undefined })
      setFirmado(true)
    } catch (e: any) { setError(e?.response?.data?.message || 'No se pudo registrar la firma') } finally { setFirmando(false) }
  }

  const canNext =
    paso === 1 ? !!sel && (!tienePlan || enviadoPM) :
    paso === 2 ? !!fechaComprometida :
    paso === 3 ? enviadoPM :
    paso === 4 ? true :
    false

  // ── pantalla final ──
  if (firmado && sel) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-8 text-center">
        <CheckCircle2 size={44} className="text-emerald-600 mx-auto" />
        <h2 className="mt-3 text-xl font-bold text-stone-900">Contrato firmado y schedule en marcha</h2>
        <p className="mt-1 text-stone-600">{sel.codigo} · {sel.nombre} — comprometido para el <b>{fmt(fechaComprometida)}</b>.</p>
        <p className="mt-1 text-sm text-forest-700">Día cero = firma del cliente {fechaFirma ? <b>{fmt(fechaFirma)}</b> : '(hoy)'}.</p>
        {reservadas > 0 && <p className="mt-1 text-sm text-forest-700">🔒 {reservadas} espacio{reservadas > 1 ? 's' : ''} de Ingeniería reservado{reservadas > 1 ? 's' : ''} — el PM confirma y asigna el ingeniero.</p>}
        <div className="mt-5 flex items-center justify-center gap-3">
          <Link to={`/proyectos/${sel.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-sm font-semibold px-4 py-2">
            Ver el schedule <ArrowRight size={15} />
          </Link>
          <button onClick={resetTodo} className="text-sm text-stone-500 hover:text-stone-800 px-3 py-2">Arrancar otro</button>
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

      <div className="p-5 min-h-[300px]">
        {/* PASO 1 — Proyecto */}
        {paso === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-stone-800">¿Para qué proyecto?</h3>
              <p className="text-sm text-stone-500">Elegí un proyecto o creá uno nuevo con los datos de la hoja de intake. La fecha se evalúa en el próximo paso.</p>
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
            {sel && tienePlan && !enviadoPM && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
                Este proyecto <b>ya tiene schedule</b>. Podés <Link to={`/proyectos/${sel.id}`} className="underline font-semibold">verlo</Link>, elegir otro, o
                <button onClick={() => setPaso(5)} className="ml-1 underline font-semibold text-forest-700">retomar para firmar el contrato</button>.
              </div>
            )}
            {sel && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-sm text-stone-700"><b className="font-mono text-[12px] text-forest-700">{sel.codigo}</b> <StatusBadge status={sel.estado} /></span>
                {sel.items_qty != null && (
                  <span className="text-xs text-stone-500">Intake: <b>{sel.items_qty}</b> ítems{sel.presupuesto ? ` · Project Total $${Number(sel.presupuesto).toLocaleString()}` : ''}{sel.fecha_entrega_solicitada ? ` · Millwork Date ${fmt(sel.fecha_entrega_solicitada.slice(0,10))}` : ''}.</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* PASO 2 — Factibilidad */}
        {paso === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-stone-800">¿Se puede cumplir la fecha?</h3>
              <p className="text-sm text-stone-500">Ingresá la fecha que pide el cliente: el sistema busca un ingeniero con cupo y te dice si entra, quién está disponible y su carga. Es tu elemento de negociación.</p>
            </div>
            <FactibilidadCheck proyectoId={sel?.id} fechaInicial={fechaSolicitada || sel?.fecha_entrega_solicitada?.slice(0, 10) || ''} onResult={(f, r) => {
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

        {/* PASO 3 — Aceptación del PM */}
        {paso === 3 && sel && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-stone-800">Aceptación del PM</h3>
              <p className="text-sm text-stone-500">Se genera el schedule (hacia atrás desde la fecha comprometida) y se propone la reserva de Ingeniería. El <b>PM la acepta y confirma en su bandeja</b> — no hace falta esperarlo acá.</p>
            </div>
            <div className="rounded-xl border border-stone-100 bg-stone-50/60 divide-y divide-stone-100">
              <Row k="Proyecto" v={`${sel.codigo} · ${sel.nombre}`} />
              <Row k="Fecha pedida por el cliente" v={fechaSolicitada ? fmt(fechaSolicitada) : '—'} />
              <Row k="Fecha comprometida (objetivo)" v={<b className="text-forest-700">{fmt(fechaComprometida)}</b>} />
              {factRes && !factRes.factible && <Row k="Aviso" v={<span className="text-amber-700">La pedida no era factible — se comprometió una fecha real.</span>} />}
            </div>
            {!enviadoPM ? (
              <button onClick={enviarAlPM} disabled={enviandoPM}
                className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2">
                {enviandoPM ? <Loader2 className="animate-spin" size={16} /> : <Send size={15} />} Enviar al PM
              </button>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 size={16} /> Enviado. El PM acepta la fecha y confirma la reserva en su bandeja. Continuá cuando quieras.
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold mb-2">Así queda tu proyecto sobre el portafolio</div>
                  <MapaEtapas sugerenciaExt={sel.codigo} />
                </div>
              </div>
            )}
            {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
          </div>
        )}

        {/* PASO 4 — Reserva */}
        {paso === 4 && sel && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-stone-800">Reserva tentativa de Ingeniería</h3>
              <p className="text-sm text-stone-500">Se aparta capacidad de Ingeniería (pipeline) para que la próxima cotización cuente con este deal. Cuando el <b>PM acepte</b> en su bandeja, se genera el plan completo de tareas. Si el deal se cae, se libera.</p>
            </div>
            <div className="rounded-xl border border-forest-100 bg-forest-50/40 p-4">
              {reservadas > 0 ? (
                <p className="text-sm text-forest-800">🔒 <b>{reservadas}</b> espacio{reservadas > 1 ? 's' : ''} reservado{reservadas > 1 ? 's' : ''} para <b>{sel.codigo}</b>. El PM confirma y asigna el ingeniero en <Link to="/pm" className="underline font-semibold">su bandeja</Link>.</p>
              ) : (
                <p className="text-sm text-stone-500">No hay reserva activa para este proyecto.</p>
              )}
            </div>
            <div className="text-xs text-stone-400">
              ¿Se cae el deal? {reservadas > 0 && (
                <button onClick={liberarReserva} disabled={liberando} className="underline font-semibold text-rose-600 disabled:opacity-40">
                  {liberando ? 'Liberando…' : 'Liberar la reserva'}
                </button>
              )}
            </div>
            {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
          </div>
        )}

        {/* PASO 5 — Firma + contrato */}
        {paso === 5 && sel && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-stone-800">Firma del contrato</h3>
              <p className="text-sm text-stone-500">El <b>día cero</b> del proyecto es <b>la fecha en que el cliente firmó</b> — no la de hoy. Registrala para no regalar días.</p>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold">Contrato enviado al cliente</label>
                  <input type="date" value={fechaEnvio} onChange={(e) => setFechaEnvio(e.target.value)}
                    className="mt-1 block rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-forest-300" />
                </div>
                <div className="text-stone-300 pb-2"><ArrowRight size={16} /></div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-forest-600 font-semibold">Firmado por el cliente <span className="text-forest-700">· día cero</span></label>
                  <input type="date" value={fechaFirma} onChange={(e) => setFechaFirma(e.target.value)}
                    className="mt-1 block rounded-lg border-2 border-forest-300 px-3 py-2 text-sm text-stone-900 font-medium focus:outline-none focus:ring-2 focus:ring-forest-300" />
                </div>
              </div>
              {diasCliente !== null && diasCliente > 0 && (
                <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  El cliente tardó <b>{diasCliente} día{diasCliente > 1 ? 's' : ''}</b> en firmar (envío → firma). Es un retraso <b>atribuible al cliente</b>: queda documentado para renegociar la fecha.
                </div>
              )}
              {diasCliente !== null && diasCliente < 0 && (
                <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  La firma no puede ser anterior al envío. Revisá las fechas.
                </div>
              )}
              <div className="mt-2 text-[11px] text-stone-400">Cuando conectemos <b>DocuSign</b>, estas dos fechas llegan automáticas desde el portal del cliente.</div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold">PDF del contrato firmado · obligatorio</label>
              <label className="mt-1 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-8 cursor-pointer hover:border-forest-400 transition-colors">
                <FileUp size={26} className="text-stone-300" />
                <span className="text-sm text-stone-500">{contrato ? contrato.name : 'Elegí el PDF del contrato firmado'}</span>
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setContrato(e.target.files?.[0] ?? null)} />
              </label>
              {contrato && <div className="mt-1 text-xs text-emerald-700 flex items-center gap-1"><Check size={13} /> {contrato.name} listo</div>}
            </div>
            {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
          </div>
        )}
      </div>

      {/* Navegación */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-stone-100 bg-stone-50/50">
        <button onClick={() => setPaso((p) => Math.max(1, p - 1))} disabled={paso === 1}
          className="inline-flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-stone-800 disabled:opacity-30"><ChevronLeft size={16} /> Atrás</button>
        {paso < 5 ? (
          <button onClick={() => setPaso((p) => p + 1)} disabled={!canNext}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2">
            Continuar <ChevronRight size={16} />
          </button>
        ) : (
          <button onClick={registrarFirma} disabled={firmando || !contrato || (diasCliente !== null && diasCliente < 0)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2">
            {firmando ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />} Registrar firma y contrato
          </button>
        )}
      </div>

      <ProyectoForm open={formOpen} onClose={() => setFormOpen(false)} hideDates intake
        onCreated={(p) => { setProyectos((prev) => [p, ...prev]); onSelect(p.id) }} />
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between px-4 py-2.5 text-sm"><span className="text-stone-400">{k}</span><span className="text-stone-800">{v}</span></div>
}
