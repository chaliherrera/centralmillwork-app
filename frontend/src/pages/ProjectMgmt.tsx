import { useState, useEffect } from 'react'
import { ClipboardList, Inbox, Gauge, Users, Loader2 } from 'lucide-react'
import MiTrabajo from '@/components/modules/schedule/MiTrabajo'
import ReservasPendientes from '@/components/modules/estimados/ReservasPendientes'
import DealsEnCurso from '@/components/modules/estimados/DealsEnCurso'
import ReprogramacionesPendientes from '@/components/modules/ingenieria/ReprogramacionesPendientes'
import DepositosBloqueando from '@/components/modules/ingenieria/DepositosBloqueando'
import GestionIngenieros from '@/components/modules/ingenieria/GestionIngenieros'
import { ingenieriaService, type IngCarga } from '@/services/ingenieria'
import IngenieriaPlan, { VistaDisponibilidad } from './IngenieriaPlan'

// Escritorio del PM. El PM es el dueño del recurso Ingeniería: acá tiene su bandeja
// (planes sugeridos a aceptar + lo que le toca) y el Plan de Ingeniería (capacidad,
// plan por proyecto, asignación). "Revisar plan" desde la bandeja abre el plan del
// proyecto para podar/asignar antes de aceptar.
export default function ProjectMgmt() {
  const [tab, setTab] = useState<'bandeja' | 'plan' | 'ingenieros'>('bandeja')
  const [revisarProy, setRevisarProy] = useState<string | undefined>()
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
          <DepositosBloqueando onRevisar={onRevisar} />
          <ReprogramacionesPendientes onRevisar={onRevisar} />
          <ReservasPendientes onRevisar={onRevisar} />
          <DealsEnCurso mode="pm" />
          <MiTrabajo area="pm" emptyMsg="El PM no tiene nada pendiente ahora mismo. 🎉" />
        </div>
      )}
      {tab === 'plan' && (
        <div className="mt-4 space-y-4">
          {revisarProy && (
            <div className="max-w-[1180px] mx-auto">
              <div className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold mb-2">La propuesta del sistema · la carga del ingeniero propuesto</div>
              <HeatIngenieroPropuesto proyectoExt={revisarProy} />
            </div>
          )}
          <IngenieriaPlan embedded initialProyecto={revisarProy} initialMode={revisarProy ? 'proyecto' : undefined} />
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
function HeatIngenieroPropuesto({ proyectoExt }: { proyectoExt: string }) {
  const [carga, setCarga] = useState<IngCarga | null>(null)
  const [propuesto, setPropuesto] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    setLoading(true)
    ;(async () => {
      try {
        const [c, t] = await Promise.all([ingenieriaService.getCarga(), ingenieriaService.getTareas(proyectoExt)])
        if (!live) return
        setCarga(c.data)
        const freq = new Map<string, number>()
        for (const tarea of t.data ?? []) if (tarea.asignado_nombre) freq.set(tarea.asignado_nombre, (freq.get(tarea.asignado_nombre) ?? 0) + 1)
        setPropuesto([...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0])
      } catch { if (live) { setCarga(null); setPropuesto(undefined) } }
      finally { if (live) setLoading(false) }
    })()
    return () => { live = false }
  }, [proyectoExt])

  if (loading) return <div className="rounded-2xl border border-stone-200 bg-white py-16 text-center text-stone-400"><Loader2 className="animate-spin inline" size={20} /></div>
  return <VistaDisponibilidad carga={carga} foco={propuesto} />
}
