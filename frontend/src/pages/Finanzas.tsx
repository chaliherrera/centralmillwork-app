import { Wallet, Info } from 'lucide-react'

// Finanzas ya NO marca pagos en la app (decisión de Chali): su única participación en el
// flujo es AVISAR que el dinero entró; el PM registra el pago (con monto) desde su bandeja.
export default function Finanzas() {
  return (
    <div className="max-w-3xl mx-auto py-6 px-1 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center">
          <Wallet className="text-forest-600" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Finanzas</h1>
          <p className="text-sm text-stone-500">Pagos del cliente, en todos los proyectos.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white px-5 py-6 flex items-start gap-3">
        <Info size={18} className="text-forest-600 shrink-0 mt-0.5" />
        <div className="text-sm text-stone-600 leading-relaxed">
          <p className="font-semibold text-stone-800 mb-1">Los pagos se registran desde la bandeja del PM.</p>
          Cuando entre el <b>depósito</b> o el <b>pago final</b> de un cliente, avisale al PM
          (con el proyecto y el monto). El PM lo registra en su sección <b>“Pagos por cobrar”</b>,
          y eso desbloquea las compras del proyecto.
        </div>
      </div>
    </div>
  )
}
