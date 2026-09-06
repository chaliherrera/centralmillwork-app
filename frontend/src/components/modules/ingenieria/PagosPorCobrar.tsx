import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { ingenieriaService } from '@/services/ingenieria'
import { scheduleService } from '@/services/schedule'

// Bandeja del PM: "pagos por cobrar" = el depósito (C-04) y el pago final (X-03) que el
// cliente todavía no pagó (o no se registró). Finanzas avisa que el dinero entró y el PM
// lo registra acá con el monto — Finanzas ya no marca pagos en la app (solo avisa).
const LABEL: Record<string, string> = { 'C-04': 'Depósito', 'X-03': 'Pago final' }
const hoy = () => new Date().toISOString().slice(0, 10)

export default function PagosPorCobrar() {
  const qc = useQueryClient()
  const [montos, setMontos] = useState<Record<string, string>>({})
  const { data } = useQuery({
    queryKey: ['pagos-por-cobrar'],
    queryFn: () => ingenieriaService.pagosPorCobrar().then((r) => r.data ?? []),
    refetchInterval: 60_000,
  })
  const registrar = useMutation({
    mutationFn: ({ proyecto_id, hito, monto }: { proyecto_id: number; hito: string; monto: number }) =>
      scheduleService.registrarHito(proyecto_id, hito, hoy(), undefined, monto),
    onSuccess: () => {
      toast.success('Pago registrado')
      qc.invalidateQueries({ queryKey: ['pagos-por-cobrar'] })
      qc.invalidateQueries({ queryKey: ['escritorio'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo registrar'),
  })

  const items = data ?? []
  if (!items.length) return null

  return (
    <div className="rounded-2xl border border-forest-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 bg-forest-50/40 flex-wrap">
        <Wallet size={16} className="text-forest-600 shrink-0" />
        <h2 className="font-bold text-stone-800">Pagos por cobrar</h2>
        <span className="text-xs text-stone-400">Cuando Finanzas avise que entró el dinero, registrá el pago con el monto.</span>
      </div>
      <div className="divide-y divide-stone-100">
        {items.map((d) => {
          const key = `${d.proyecto_id}-${d.hito}`
          const monto = montos[key] ?? ''
          return (
            <div key={key} className="px-4 py-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-stone-800 truncate">
                  <span className="text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 bg-forest-100 text-forest-700 mr-2">{LABEL[d.hito] ?? d.hito}</span>
                  {d.nombre || d.proyecto_codigo} <span className="text-[11px] font-mono text-stone-400">· {d.proyecto_codigo}</span>
                </div>
                <div className="text-[11px] text-stone-400">pendiente hace {d.dias_pendiente ?? 0} día{d.dias_pendiente === 1 ? '' : 's'}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-stone-400 text-sm">$</span>
                <input type="number" min="0" step="0.01" value={monto} placeholder="Monto"
                  onChange={(e) => setMontos((m) => ({ ...m, [key]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { const n = Number(monto); if (monto && !Number.isNaN(n) && n >= 0) registrar.mutate({ proyecto_id: d.proyecto_id, hito: d.hito, monto: n }) } }}
                  className="w-28 rounded-lg border border-stone-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-300" />
                <button onClick={() => { const n = Number(monto); if (!monto || Number.isNaN(n) || n < 0) { toast.error('Poné un monto válido'); return } registrar.mutate({ proyecto_id: d.proyecto_id, hito: d.hito, monto: n }) }}
                  disabled={registrar.isPending}
                  className="inline-flex items-center gap-1 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1.5">
                  <Check size={13} /> Registrar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
