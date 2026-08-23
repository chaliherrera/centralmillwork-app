import { ClipboardList } from 'lucide-react'
import MiTrabajo from '@/components/modules/schedule/MiTrabajo'
import ReservasPendientes from '@/components/modules/estimados/ReservasPendientes'

// Escritorio del PM — el hilo conductor: lo que le toca al PM en todos los
// proyectos (delivery requests, coordinación de instalación, closeout, etc.).
export default function ProjectMgmt() {
  return (
    <div className="max-w-3xl mx-auto py-6 px-1 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center">
          <ClipboardList className="text-forest-600" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">PM</h1>
          <p className="text-sm text-stone-500">Lo que le toca a la dirección de proyecto, en todos los proyectos.</p>
        </div>
      </div>
      <ReservasPendientes />
      <MiTrabajo area="pm" emptyMsg="El PM no tiene nada pendiente ahora mismo. 🎉" />
    </div>
  )
}
