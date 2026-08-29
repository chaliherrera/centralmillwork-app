import { useState } from 'react'
import { ClipboardList, Inbox, Gauge } from 'lucide-react'
import MiTrabajo from '@/components/modules/schedule/MiTrabajo'
import ReservasPendientes from '@/components/modules/estimados/ReservasPendientes'
import DealsEnCurso from '@/components/modules/estimados/DealsEnCurso'
import MapaEtapas from '@/components/modules/ingenieria/MapaEtapas'
import IngenieriaPlan from './IngenieriaPlan'

// Escritorio del PM. El PM es el dueño del recurso Ingeniería: acá tiene su bandeja
// (planes sugeridos a aceptar + lo que le toca) y el Plan de Ingeniería (capacidad,
// plan por proyecto, asignación). "Revisar plan" desde la bandeja abre el plan del
// proyecto para podar/asignar antes de aceptar.
export default function ProjectMgmt() {
  const [tab, setTab] = useState<'bandeja' | 'plan'>('bandeja')
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
        </div>
      </div>

      {tab === 'bandeja' ? (
        <div className="max-w-3xl mx-auto space-y-5 mt-4">
          <ReservasPendientes onRevisar={onRevisar} />
          <DealsEnCurso mode="pm" />
          <MiTrabajo area="pm" emptyMsg="El PM no tiene nada pendiente ahora mismo. 🎉" />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {revisarProy && (
            <div className="max-w-[1180px] mx-auto">
              <div className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold mb-2">La propuesta del sistema · cómo cae este proyecto sobre el portafolio</div>
              <MapaEtapas sugerenciaExt={revisarProy} />
            </div>
          )}
          <IngenieriaPlan embedded initialProyecto={revisarProy} initialMode={revisarProy ? 'proyecto' : undefined} />
        </div>
      )}
    </div>
  )
}
