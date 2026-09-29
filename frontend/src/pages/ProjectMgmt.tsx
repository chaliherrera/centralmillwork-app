import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { ClipboardList, Inbox, Gauge, Users, Loader2, RotateCcw, CalendarRange } from 'lucide-react'
import ReservasPendientes from '@/components/modules/estimados/ReservasPendientes'
import DealsEnCurso from '@/components/modules/estimados/DealsEnCurso'
import ReprogramacionesPendientes from '@/components/modules/ingenieria/ReprogramacionesPendientes'
import DepositosBloqueando from '@/components/modules/ingenieria/DepositosBloqueando'
import GestionIngenieros from '@/components/modules/ingenieria/GestionIngenieros'
import CambiarIngeniero from '@/components/modules/ingenieria/CambiarIngeniero'
import { ingenieriaService, type IngCarga } from '@/services/ingenieria'
import IngenieriaPlan, { VistaDisponibilidad } from './IngenieriaPlan'
import Escritorio from '@/components/escritorio/Escritorio'
import PagosPorCobrar from '@/components/modules/ingenieria/PagosPorCobrar'
import InstalacionesPM from '@/components/modules/ingenieria/InstalacionesPM'
import AvisosPM from '@/components/modules/ingenieria/AvisosPM'

const MES_PM = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtDiaPM(iso: string | null): string {
  if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MES_PM[d.getMonth()]} ${d.getFullYear()}`
}

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
        <div className="max-w-[1180px] mx-auto mt-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
          {/* AVISOS — panel compacto (últimos 3). Arriba en móvil, columna derecha en escritorio.
              Son novedades para enterarse, no trabajo: van al costado, no ocupan el centro. */}
          <div className="lg:col-start-2 lg:row-start-1">
            <AvisosPM />
          </div>
          {/* TAREAS — la entrada principal: lo accionable del PM. */}
          <div className="lg:col-start-1 lg:row-start-1 space-y-5">
            <PagosPorCobrar />
            {/* Instalaciones (handoff 3 etapas): el PM inicia y, tras la verificación de Campo, cierra. */}
            <InstalacionesPM />
            <DepositosBloqueando onRevisar={onRevisar} />
            <ReprogramacionesPendientes onRevisar={onRevisar} />
            <ReservasPendientes onRevisar={onRevisar} />
            <DealsEnCurso mode="pm" />
            {/* Piedra (countertops): proveedor externo, 100% del PM. Plegada como UNA TAREA MÁS
                (compact): solo aparece cuando es su turno (hideWhenEmpty), sin panel aparte. */}
            <Escritorio rol="externo" hideWhenEmpty compact titulo="Piedra · countertops"
              subtitulo="proveedor externo — confirmá cada paso" />
          </div>
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
  const [regenerando, setRegenerando] = useState(false)
  const [fechaEstimados, setFechaEstimados] = useState<string | null>(null)  // comprometida por Estimados
  const [finRealista, setFinRealista] = useState<string | undefined>()       // fin real del plan = propuesta del PM
  useEffect(() => {
    let live = true
    setLoading(true)
    ;(async () => {
      try {
        const [c, t, pl] = await Promise.all([ingenieriaService.getCarga(), ingenieriaService.getTareas(proyectoExt), ingenieriaService.getPlan(proyectoExt)])
        if (!live) return
        setCarga(c.data)
        setFechaEstimados(pl.data?.fecha_entrega ?? null)
        // Fecha propuesta por el PM = fin de la última tarea del plan (la realista).
        setFinRealista((t.data ?? []).reduce((mx, x) => (x.fecha_fin && x.fecha_fin > mx ? x.fecha_fin : mx), '') || undefined)
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

  // Regenerar el plan sugerido desde cero: descarta el plan blando actual y lo reconstruye
  // con los datos del proyecto + la carga de ingenieros vigente. Si el PM no está de acuerdo
  // con el plan lo regenera acá mismo; si no está de acuerdo con el ingeniero, usa "Cambiar
  // ingeniero propuesto" al lado. Tras cualquiera de los dos, onChanged() re-monta el heat +
  // el Gantt para que vea el resultado.
  const regenerar = async () => {
    if (!window.confirm(
      '¿Regenerar el plan sugerido desde cero?\n\n' +
      'Se descartan los ajustes actuales del plan y se reconstruye con los datos del ' +
      'proyecto (ítems, montos, stone, instalación, fecha) y la carga de ingenieros vigente.'
    )) return
    setRegenerando(true)
    try {
      await ingenieriaService.regenerarPlan(proyectoExt)
      toast.success('Plan regenerado')
      onChanged?.()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'No se pudo regenerar el plan')
    } finally { setRegenerando(false) }
  }

  if (loading) return <div className="rounded-2xl border border-stone-200 bg-white py-16 text-center text-stone-400"><Loader2 className="animate-spin inline" size={20} /></div>
  return (
    <div className="space-y-2">
      {/* Dos fechas: la SOLICITADA por el cliente (referencia) y la PROPUESTA por el PM (fin
          factible del plan). La propuesta es la que se le enviará al cliente al aceptar. */}
      {(fechaEstimados || finRealista) && (
        <div className="flex items-center gap-3 flex-wrap text-[12.5px]">
          {fechaEstimados && (
            <span className="inline-flex items-center gap-1 text-stone-400">
              <CalendarRange size={13} /> Fecha solicitada: <span className="text-stone-600 font-medium">{fmtDiaPM(fechaEstimados)}</span>
            </span>
          )}
          {finRealista && (
            <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold text-emerald-800 bg-emerald-100">
              Fecha propuesta: {fmtDiaPM(finRealista)}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button onClick={regenerar} disabled={regenerando}
          title="Descarta el plan sugerido actual y lo reconstruye con los datos del proyecto y la carga de ingenieros vigente"
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 hover:bg-amber-50 text-amber-800 disabled:opacity-50 text-[12.5px] font-semibold px-3 py-1.5">
          {regenerando ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />} Regenerar plan
        </button>
        <CambiarIngeniero proyectoExt={proyectoExt} propuesto={propuesto}
          ingenieros={(carga?.ingenieros ?? []).map((i) => i.nombre)} onDone={() => onChanged?.()} />
      </div>
      <VistaDisponibilidad carga={carga} foco={propuesto} ruta={ruta} />
    </div>
  )
}

