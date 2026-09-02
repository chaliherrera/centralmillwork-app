import { Truck } from 'lucide-react'
import MiTrabajo from '@/components/modules/schedule/MiTrabajo'
import Escritorio from '@/components/escritorio/Escritorio'

// Escritorio de Logística — despacho de todos los proyectos (BOL, precinto, envío).
export default function Logistica() {
  return (
    <div className="max-w-3xl mx-auto py-6 px-1 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center">
          <Truck className="text-forest-600" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Logística</h1>
          <p className="text-sm text-stone-500">Despacho y transporte, en todos los proyectos.</p>
        </div>
      </div>
      <Escritorio rol="logistica" titulo="Despacho — te toca ahora"
        subtitulo="Los envíos listos para cargar y despachar, de todos los proyectos. Marcá cuando el producto salió." />
      <MiTrabajo area="logistics" emptyMsg="Logística no tiene nada pendiente ahora mismo. 🎉" />
    </div>
  )
}
