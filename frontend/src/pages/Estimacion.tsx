import { useState } from 'react'
import { FileSignature, Inbox, Plus } from 'lucide-react'
import EstimadosWizard from '@/components/modules/estimados/EstimadosWizard'
import DealsEnCurso from '@/components/modules/estimados/DealsEnCurso'

// ─────────────────────────────────────────────────────────────────────────────
// Escritorio de Estimación — dos pestañas, como el del PM:
//   · Bandeja: los deals que esperan tu acción (mandar el schedule al cliente,
//     registrar la aprobación) después de que el PM aceptó el plan.
//   · Crear proyecto: el wizard guiado (intake → factibilidad → PM → firma).
// ─────────────────────────────────────────────────────────────────────────────

export default function Estimacion() {
  const [tab, setTab] = useState<'bandeja' | 'crear'>('bandeja')
  const tabCls = (t: string) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold ${tab === t ? 'bg-forest-600 text-white' : 'text-stone-500 hover:text-stone-800'}`

  return (
    <div className="max-w-3xl mx-auto py-6 px-1 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center">
          <FileSignature className="text-forest-600" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Estimados</h1>
          <p className="text-sm text-stone-500">Tu bandeja de deals y el alta de proyectos, en un solo lugar.</p>
        </div>
      </div>

      <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1 text-sm">
        <button onClick={() => setTab('bandeja')} className={tabCls('bandeja')}><Inbox size={15} /> Bandeja</button>
        <button onClick={() => setTab('crear')} className={tabCls('crear')}><Plus size={15} /> Crear proyecto</button>
      </div>

      {tab === 'bandeja' ? (
        <DealsEnCurso mode="estimados" emptyHint="Cuando el PM acepte un plan, el deal aparece acá para que le mandes el schedule al cliente." />
      ) : (
        <EstimadosWizard />
      )}
    </div>
  )
}
