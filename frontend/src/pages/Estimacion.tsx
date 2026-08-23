import { FileSignature, ClipboardList } from 'lucide-react'
import MiTrabajo from '@/components/modules/schedule/MiTrabajo'
import EstimadosWizard from '@/components/modules/estimados/EstimadosWizard'

// ─────────────────────────────────────────────────────────────────────────────
// Escritorio de Estimación — la PUERTA DE ENTRADA del schedule.
// Flujo guiado (wizard): Proyecto → Contrato → Factibilidad → Crear schedule.
// Debajo, "Mi trabajo": lo que Estimación debe registrar en todos los proyectos.
// ─────────────────────────────────────────────────────────────────────────────

export default function Estimacion() {
  return (
    <div className="max-w-3xl mx-auto py-6 px-1 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center">
          <FileSignature className="text-forest-600" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Estimados</h1>
          <p className="text-sm text-stone-500">Arrancá un proyecto: contrato firmado → factibilidad → schedule.</p>
        </div>
      </div>

      {/* El flujo guiado */}
      <EstimadosWizard />

      {/* Mi trabajo — lo que Estimación debe registrar en todos los proyectos. */}
      <div className="pt-2">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardList size={17} className="text-forest-600" />
          <h2 className="text-base font-bold text-stone-900">Mi trabajo</h2>
        </div>
        <p className="text-xs text-stone-500 mb-3">
          Todo lo que Estimación tiene que resolver, en todos los proyectos a la vez. Aparece acá en cuanto
          está habilitado y desaparece cuando lo registrás.
        </p>
        <MiTrabajo area="estimating" emptyMsg="Estimación no tiene nada pendiente ahora mismo. 🎉" />
      </div>
    </div>
  )
}
