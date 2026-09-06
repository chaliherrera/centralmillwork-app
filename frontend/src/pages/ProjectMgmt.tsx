import { useState, useEffect } from 'react'
import { ClipboardList, Inbox, Gauge, Users, Loader2, UserCog, ArrowRight, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import ReservasPendientes from '@/components/modules/estimados/ReservasPendientes'
import DealsEnCurso from '@/components/modules/estimados/DealsEnCurso'
import ReprogramacionesPendientes from '@/components/modules/ingenieria/ReprogramacionesPendientes'
import DepositosBloqueando from '@/components/modules/ingenieria/DepositosBloqueando'
import GestionIngenieros from '@/components/modules/ingenieria/GestionIngenieros'
import { ingenieriaService, type IngCarga, type ReasignarPreview } from '@/services/ingenieria'
import IngenieriaPlan, { VistaDisponibilidad } from './IngenieriaPlan'
import Escritorio from '@/components/escritorio/Escritorio'
import PagosPorCobrar from '@/components/modules/ingenieria/PagosPorCobrar'

// Escritorio del PM. El PM es el dueño del recurso Ingeniería: acá tiene su bandeja
// (planes sugeridos a aceptar + lo que le toca) y el Plan de Ingeniería (capacidad,
// plan por proyecto, asignación). "Revisar plan" desde la bandeja abre el plan del
// proyecto para podar/asignar antes de aceptar.
export default function ProjectMgmt() {
  const [tab, setTab] = useState<'bandeja' | 'plan' | 'ingenieros'>('bandeja')
  const [revisarProy, setRevisarProy] = useState<string | undefined>()
  const [refreshKey, setRefreshKey] = useState(0)  // bump → re-monta heatmap + plan tras reasignar
  const goPlan = () => { setRevisarProy(undefined); setTab('plan') }
  const onRevisar = (ext: string) => { setRevisarProy(ext); setTab('plan') }
  const tabCls = (t: string) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold ${tab === t ? 'bg-forest-600 text-white' : 'text-stone-500 hover:text-stone-800'}`

  return (
    <div className="py-6 px-2">
      <div className="max-w-[1180px] mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center">
            <ClipboardList className="text-forest-600" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-900">PM · Dirección de proyecto</h1>
            <p className="text-sm text-stone-500">Tu bandeja y la gestión de recursos de Ingeniería, en un solo lugar.</p>
          </div>
        </div>
        <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1 text-sm">
          <button onClick={() => setTab('bandeja')} className={tabCls('bandeja')}><Inbox size={15} /> Bandeja</button>
          <button onClick={goPlan} className={tabCls('plan')}><Gauge size={15} /> Plan de Ingeniería</button>
          <button onClick={() => setTab('ingenieros')} className={tabCls('ingenieros')}><Users size={15} /> Ingenieros</button>
        </div>
      </div>

      {tab === 'bandeja' && (
        <div className="max-w-3xl mx-auto space-y-5 mt-4">
          <PagosPorCobrar />
          <DepositosBloqueando onRevisar={onRevisar} />
          <ReprogramacionesPendientes onRevisar={onRevisar} />
          <ReservasPendientes onRevisar={onRevisar} />
          <DealsEnCurso mode="pm" />
          {/* Fabricación de piedra (paso 17): el PM confirma cuando el proveedor entregó.
              Solo aparece si hay algo (hideWhenEmpty). */}
          <Escritorio rol="externo" hideWhenEmpty titulo="Fabricación de piedra"
            subtitulo="Confirmá cuando el proveedor entregó la piedra fabricada." />
        </div>
      )}
      {tab === 'plan' && (
        <div className="mt-4 space-y-4">
          {revisarProy && (
            <div className="max-w-[1180px] mx-auto">
              <div className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold mb-2">La propuesta del sistema · la carga del ingeniero propuesto</div>
              <HeatIngenieroPropuesto proyectoExt={revisarProy} refreshKey={refreshKey} onChanged={() => setRefreshKey((k) => k + 1)} />
            </div>
          )}
          <IngenieriaPlan key={`${revisarProy ?? 'all'}:${refreshKey}`} embedded initialProyecto={revisarProy} initialMode={revisarProy ? 'proyecto' : undefined} />
        </div>
      )}
      {tab === 'ingenieros' && (
        <div className="max-w-3xl mx-auto mt-4">
          <GestionIngenieros />
        </div>
      )}
    </div>
  )
}

// El PM, al revisar un plan propuesto, ve PRIMERO la carga del ingeniero propuesto (su
// heat map). El propuesto = el ingeniero más asignado en el plan de este proyecto. Desde
// el heatmap puede desplegar a todos los ingenieros para buscar una alternativa.
function HeatIngenieroPropuesto({ proyectoExt, refreshKey, onChanged }: { proyectoExt: string; refreshKey?: number; onChanged?: () => void }) {
  const [carga, setCarga] = useState<IngCarga | null>(null)
  const [propuesto, setPropuesto] = useState<string | undefined>()
  const [ruta, setRuta] = useState<boolean[] | undefined>()
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    setLoading(true)
    ;(async () => {
      try {
        const [c, t] = await Promise.all([ingenieriaService.getCarga(), ingenieriaService.getTareas(proyectoExt)])
        if (!live) return
        setCarga(c.data)
        // El propuesto = el más asignado en el plan de este proyecto.
        const freq = new Map<string, number>()
        for (const tarea of t.data ?? []) if (tarea.asignado_nombre) freq.set(tarea.asignado_nombre, (freq.get(tarea.asignado_nombre) ?? 0) + 1)
        const prop = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
        setPropuesto(prop)
        // Ruta tentativa: qué semanas ocupan las tareas del propuesto en ESTE proyecto,
        // alineadas a las mismas semanas del heatmap (para sobreponerlas a su carga).
        const semanas = c.data?.semanas ?? []
        const suyas = (t.data ?? []).filter((x) => x.asignado_nombre === prop && x.fecha_inicio && x.fecha_fin)
        const DAY = 86400000
        setRuta(semanas.map((w) => {
          const ws = new Date(w + 'T00:00:00').getTime(), we = ws + 6 * DAY
          return suyas.some((x) => {
            const ti = new Date(x.fecha_inicio! + 'T00:00:00').getTime(), tf = new Date(x.fecha_fin! + 'T00:00:00').getTime()
            return ti <= we && tf >= ws
          })
        }))
      } catch { if (live) { setCarga(null); setPropuesto(undefined); setRuta(undefined) } }
      finally { if (live) setLoading(false) }
    })()
    return () => { live = false }
  }, [proyectoExt, refreshKey])

  if (loading) return <div className="rounded-2xl border border-stone-200 bg-white py-16 text-center text-stone-400"><Loader2 className="animate-spin inline" size={20} /></div>
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <CambiarIngeniero proyectoExt={proyectoExt} propuesto={propuesto}
          ingenieros={(carga?.ingenieros ?? []).map((i) => i.nombre)} onDone={() => onChanged?.()} />
      </div>
      <VistaDisponibilidad carga={carga} foco={propuesto} ruta={ruta} />
    </div>
  )
}

// Cambiar el ingeniero propuesto del proyecto: elegir otro → preview (cómo queda la fecha
// con su disponibilidad) → confirmar → reasigna TODAS las tareas de ingeniería + recalcula.
function CambiarIngeniero({ proyectoExt, propuesto, ingenieros, onDone }: {
  proyectoExt: string; propuesto?: string; ingenieros: string[]; onDone: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [sel, setSel] = useState('')
  const [prev, setPrev] = useState<ReasignarPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const cerrar = () => { setAbierto(false); setSel(''); setPrev(null); setBusy(false) }
  const opciones = ingenieros.filter((n) => n !== propuesto)

  const pedirPreview = async (nombre: string) => {
    setSel(nombre); setPrev(null); if (!nombre) return
    setBusy(true)
    try { const r = await ingenieriaService.reasignarIngeniero(proyectoExt, nombre, true); setPrev(r.data) }
    catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo calcular') }
    finally { setBusy(false) }
  }
  const confirmar = async () => {
    if (!sel) return
    setBusy(true)
    try {
      await ingenieriaService.reasignarIngeniero(proyectoExt, sel, false)
      toast.success(`Ingeniero cambiado a ${sel}`)
      cerrar(); onDone()
    } catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo aplicar'); setBusy(false) }
  }

  if (!abierto) return (
    <button onClick={() => setAbierto(true)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 hover:bg-stone-50 text-stone-700 text-[12.5px] font-semibold px-3 py-1.5">
      <UserCog size={14} /> Cambiar ingeniero propuesto
    </button>
  )
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => !busy && cerrar()}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <UserCog size={18} className="text-forest-600" />
          <h3 className="font-semibold text-stone-800">Cambiar ingeniero propuesto</h3>
          <button onClick={cerrar} className="ml-auto text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <p className="text-[12.5px] text-stone-500 mb-3">
          Reasigna <b>todas</b> las tareas de ingeniería al nuevo y recalcula el plan según cuándo se libera.
          Actual: <b className="text-stone-700">{propuesto ?? '—'}</b>.
        </p>
        <select value={sel} onChange={(e) => pedirPreview(e.target.value)}
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800">
          <option value="">Elegí el nuevo ingeniero…</option>
          {opciones.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>

        {busy && !prev && <div className="text-center py-4 text-stone-400"><Loader2 className="animate-spin inline" size={18} /></div>}

        {prev && (
          <div className="mt-3 space-y-2">
            <div className={`rounded-xl border px-3 py-2.5 ${prev.entra ? 'border-emerald-200 bg-emerald-50/60' : 'border-rose-200 bg-rose-50/60'}`}>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-stone-500">Entrega interna:</span>
                <b className="text-stone-700">{fmtDia(prev.fin_actual)}</b>
                <ArrowRight size={14} className="text-stone-400" />
                <b className={prev.entra ? 'text-emerald-700' : 'text-rose-700'}>{fmtDia(prev.fin_nuevo)}</b>
              </div>
              <div className="text-[12px] text-stone-500 mt-1">
                {prev.ingeniero_nuevo} se libera el <b className="text-stone-700">{fmtDia(prev.disponible_desde)}</b> ·
                {' '}{prev.n_tareas} tarea{prev.n_tareas === 1 ? '' : 's'} de ingeniería se reasignan
              </div>
              <div className={`text-[12px] mt-1 font-semibold ${prev.entra ? 'text-emerald-700' : 'text-rose-700'}`}>
                {prev.entra
                  ? `Entra: quedan ${prev.holgura_dias} días de holgura hasta la entrega (${fmtDia(prev.entrega)}).`
                  : `⚠ No entra: se pasa ${Math.abs(prev.holgura_dias)} días de la entrega (${fmtDia(prev.entrega)}).`}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={cerrar} disabled={busy} className="px-3 py-2 text-sm font-medium text-stone-500 hover:text-stone-800">Cancelar</button>
              <button onClick={confirmar} disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-semibold">
                {busy ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} Confirmar cambio
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const MES_D = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtDia(iso: string | null): string {
  if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MES_D[d.getMonth()]}`
}
