import { useEffect, useState } from 'react'
import { Wallet, Loader2 } from 'lucide-react'
import { ingenieriaService, type DepositoBloqueando } from '@/services/ingenieria'

// Bandeja del PM: proyectos donde la aprobación (#8) está lista y el ingeniero llegó al
// paso 9 (Material Procurement / enviar MTO), pero el depósito NO se pagó ni el candado
// está abierto. El PM decide: abrir el candado (seguir) o frenar hasta que paguen.
export default function DepositosBloqueando({ onRevisar }: { onRevisar: (ext: string) => void }) {
  const [items, setItems] = useState<DepositoBloqueando[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    ingenieriaService.depositosBloqueando().then((r) => setItems(r.data ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-4 text-center text-stone-300"><Loader2 className="animate-spin inline" size={18} /></div>
  if (!items.length) return null

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-rose-100 flex-wrap">
        <Wallet size={17} className="text-rose-600 shrink-0" />
        <h2 className="font-bold text-rose-900">{items.length} proyecto{items.length === 1 ? '' : 's'} con el depósito sin pagar</h2>
        <span className="text-xs text-rose-700">las compras están listas para arrancar — abrí el candado para seguir o esperá el pago</span>
      </div>
      <div className="divide-y divide-rose-100">
        {items.map((d) => (
          <button key={d.proyecto_ext} onClick={() => onRevisar(d.proyecto_ext)}
            className="w-full text-left px-4 py-2.5 hover:bg-rose-100/40 flex items-center gap-3 transition">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-stone-800 truncate">{d.nombre || d.proyecto_ext} <span className="text-[11px] font-mono text-rose-700">· {d.proyecto_ext}</span></div>
              <div className="text-[11px] text-stone-500">
                el depósito lleva <b className="text-rose-700">{d.dias_pendiente ?? 0} día{d.dias_pendiente === 1 ? '' : 's'}</b> sin registrarse
              </div>
            </div>
            <span className="text-[11px] text-rose-700 font-semibold whitespace-nowrap">Abrir plan →</span>
          </button>
        ))}
      </div>
    </div>
  )
}
