import { Ruler } from 'lucide-react'
import Escritorio from '@/components/escritorio/Escritorio'

// Escritorio del Field Specialist — mediciones en obra (VIF), en todos los proyectos.
export default function Field() {
  return (
    <div className="max-w-3xl mx-auto py-6 px-1 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center">
          <Ruler className="text-forest-600" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Campo</h1>
          <p className="text-sm text-stone-500">Mediciones en obra, en todos los proyectos.</p>
        </div>
      </div>
      <Escritorio rol="field" titulo="Mediciones — te toca ahora"
        subtitulo="Las mediciones de campo habilitadas, de todos los proyectos. Marcá con la fecha cuando mediste." />
    </div>
  )
}
