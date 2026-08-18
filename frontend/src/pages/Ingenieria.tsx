import { DraftingCompass } from 'lucide-react'
import MiTrabajo from '@/components/modules/schedule/MiTrabajo'

// Escritorio de Ingeniería — "lo que le toca a Ingeniería", en todos los proyectos.
export default function Ingenieria() {
  return (
    <div className="max-w-3xl mx-auto py-6 px-1 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center">
          <DraftingCompass className="text-forest-600" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Ingeniería</h1>
          <p className="text-sm text-stone-500">Lo que le toca a Ingeniería, en todos los proyectos.</p>
        </div>
      </div>
      <MiTrabajo area="engineering" emptyMsg="Ingeniería no tiene nada pendiente ahora mismo. 🎉" />
    </div>
  )
}
