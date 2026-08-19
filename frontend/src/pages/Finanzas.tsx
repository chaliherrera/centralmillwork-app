import { Wallet } from 'lucide-react'
import MiTrabajo from '@/components/modules/schedule/MiTrabajo'

// Escritorio de Finanzas — pagos (inicial, final) y P&L, en todos los proyectos.
export default function Finanzas() {
  return (
    <div className="max-w-3xl mx-auto py-6 px-1 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center">
          <Wallet className="text-forest-600" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Finanzas</h1>
          <p className="text-sm text-stone-500">Pagos y cierre financiero, en todos los proyectos.</p>
        </div>
      </div>
      <MiTrabajo area="finance" emptyMsg="Finanzas no tiene nada pendiente ahora mismo. 🎉" />
    </div>
  )
}
