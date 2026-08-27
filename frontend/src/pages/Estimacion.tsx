import { FileSignature } from 'lucide-react'
import EstimadosWizard from '@/components/modules/estimados/EstimadosWizard'

// ─────────────────────────────────────────────────────────────────────────────
// Escritorio de Estimación — la PUERTA DE ENTRADA del schedule.
// Flujo guiado (wizard): Proyecto (intake) → Factibilidad → Aceptación PM →
// Reserva → Firma del contrato (día cero, al final).
// ─────────────────────────────────────────────────────────────────────────────

export default function Estimacion() {
  return (
    <div className="max-w-3xl mx-auto py-6 px-1 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center">
          <FileSignature className="text-forest-600" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Estimados</h1>
          <p className="text-sm text-stone-500">Arrancá un proyecto: intake → factibilidad → PM → reserva → firma del contrato.</p>
        </div>
      </div>

      <EstimadosWizard />
    </div>
  )
}
