import { DraftingCompass } from 'lucide-react'
import Escritorio from '@/components/escritorio/Escritorio'
import MisMuestrasEnProceso from '@/components/modules/muestras/MisMuestrasEnProceso'
import NovedadesCliente from '@/components/escritorio/NovedadesCliente'

// Escritorio de Ingeniería — "lo que le toca a Ingeniería", en todos los proyectos.
// Misma estructura que la Bandeja del PM: tareas cronológicas al centro, y a la derecha
// las notificaciones (decisiones del cliente en el portal + muestras en proceso).
export default function Ingenieria() {
  return (
    <div className="py-6 px-2">
      <div className="max-w-[1280px] mx-auto flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center">
          <DraftingCompass className="text-forest-600" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Ingeniería</h1>
          <p className="text-sm text-stone-500">Lo que le toca a Ingeniería, en todos los proyectos.</p>
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto mt-4 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5 items-start">
        {/* Tareas cronológicas — centro/izquierda */}
        <div className="lg:col-start-1 lg:row-start-1">
          <Escritorio rol="ingenieria,field" titulo="Escritorio de Ingeniería"
            subtitulo="Solo lo desbloqueado, de todos los proyectos. Completá (y adjuntá planos/CNC cuando corresponda) y aparece lo siguiente." />
        </div>

        {/* Notificaciones — derecha */}
        <div className="lg:col-start-2 lg:row-start-1 space-y-5">
          {/* Decisiones del cliente en el portal (planos/plan/muestras) — cotejá y registrá. */}
          <NovedadesCliente />
          {/* Tus muestras en proceso (fabricación / QC / enviada). */}
          <MisMuestrasEnProceso />
        </div>
      </div>
    </div>
  )
}
