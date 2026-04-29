import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, DollarSign, Truck, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { materialesService } from '@/services/materiales'
import type { Material } from '@/types'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

interface Props {
  open: boolean
  vendor: string
  proyectoId: number
  proyectoNombre: string
  onClose: () => void
}

export default function CapturaPrecios({ open, vendor, proyectoId, proyectoNombre, onClose }: Props) {
  const qc = useQueryClient()
  const [prices, setPrices] = useState<Record<number, string>>({})
  const [freight, setFreight] = useState('')

  const enabled = open && !!vendor && !!proyectoId

  const { data: matsData, isLoading } = useQuery({
    queryKey: ['materiales-captura', proyectoId, vendor],
    queryFn: () => materialesService.getAll({ proyecto_id: proyectoId, vendor, estado_cotiz: 'PENDIENTE', cotizar: 'SI', limit: 500 }),
    enabled,
    staleTime: 5_000,
  })

  const { data: freightData } = useQuery({
    queryKey: ['materiales-freight', proyectoId, vendor],
    queryFn: () => materialesService.getPreciosFreight(proyectoId, vendor),
    enabled,
    staleTime: 5_000,
  })

  const mats: Material[] = matsData?.data ?? []

  // Seed price inputs when materials load
  useEffect(() => {
    if (!matsData) return
    const initial: Record<number, string> = {}
    mats.forEach((m) => {
      initial[m.id] = Number(m.unit_price) > 0 ? String(Number(m.unit_price)) : ''
    })
    setPrices(initial)
  }, [matsData]) // eslint-disable-line react-hooks/exhaustive-deps

  // Seed freight when it loads
  useEffect(() => {
    if (freightData?.data) {
      const f = Number(freightData.data.freight)
      setFreight(f > 0 ? String(f) : '')
    }
  }, [freightData])

  // Clear state on close
  useEffect(() => {
    if (!open) { setPrices({}); setFreight('') }
  }, [open])

  const subtotal = useMemo(
    () => mats.reduce((sum, m) => sum + Number(m.qty) * (parseFloat(prices[m.id] || '0') || 0), 0),
    [mats, prices]
  )
  const freightNum = parseFloat(freight || '0') || 0
  const totalOc = subtotal + freightNum

  const saveMutation = useMutation({
    mutationFn: () => {
      const items = mats.map((m) => ({ id: m.id, unit_price: parseFloat(prices[m.id] || '0') || 0 }))
      return materialesService.updatePreciosLote({ proyecto_id: proyectoId, vendor, freight: freightNum, items })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materiales'] })
      qc.invalidateQueries({ queryKey: ['materiales-kpis'] })
      qc.invalidateQueries({ queryKey: ['materiales-all'] })
      qc.invalidateQueries({ queryKey: ['materiales-captura'] })
      toast.success(`Precios de ${vendor} guardados`)
      onClose()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Error al guardar precios')
    },
  })

  const handleSave = () => {
    const missing = mats.filter((m) => (parseFloat(prices[m.id] || '0') || 0) <= 0)
    if (missing.length > 0) {
      toast.error(`${missing.length} material${missing.length > 1 ? 'es' : ''} sin precio — completa todos los campos`)
      return
    }
    saveMutation.mutate()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 bg-black/25 z-40 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className={clsx(
          'fixed top-0 right-0 h-full z-50 bg-white shadow-2xl flex flex-col',
          'w-full sm:w-[620px]',
          'transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* ─── Header ─── */}
        <div className="bg-forest-700 text-white px-5 py-4 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs text-white/60 uppercase tracking-widest font-medium mb-0.5">Capturar Precios</p>
              <h2 className="text-lg font-bold truncate">{vendor}</h2>
              <p className="text-xs text-white/70 mt-0.5 truncate">{proyectoNombre}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0 ml-3">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ─── Scrollable table ─── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : mats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-300">
              <DollarSign size={36} className="mb-2" />
              <p className="text-sm">Sin materiales pendientes para este vendor</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cód.</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Descripción</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-14">QTY</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Unit Price</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Total</th>
                </tr>
              </thead>
              <tbody>
                {mats.map((m) => {
                  const p = parseFloat(prices[m.id] || '0') || 0
                  const rowTotal = Number(m.qty) * p
                  const hasError = p <= 0

                  return (
                    <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
                      <td className="px-4 py-2.5">
                        {m.codigo
                          ? <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{m.codigo}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-xs font-medium text-gray-800 truncate max-w-[200px]">{m.descripcion}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-right font-medium text-gray-700 tabular-nums">
                        {Number(m.qty)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={prices[m.id] ?? ''}
                            onChange={(e) => setPrices((prev) => ({ ...prev, [m.id]: e.target.value }))}
                            className={clsx(
                              'w-full pl-6 pr-2 py-1.5 text-xs text-right rounded-lg border transition-colors bg-white',
                              hasError
                                ? 'border-red-300 bg-red-50/50 focus:outline-none focus:border-red-400'
                                : 'border-gray-200 hover:border-gray-300 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-200'
                            )}
                            placeholder="0.00"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-right tabular-nums font-semibold text-gray-800">
                        {rowTotal > 0 ? fmt(rowTotal) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ─── Footer: totals + freight + save ─── */}
        <div className="border-t border-gray-100 bg-gray-50/80 px-5 py-4 flex-shrink-0 space-y-3">

          {/* Subtotal */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span className="font-semibold text-gray-800 tabular-nums">{fmt(subtotal)}</span>
          </div>

          {/* Freight */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 flex-shrink-0">
              <Truck size={14} />
              <span>Freight</span>
            </div>
            <div className="relative w-40">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={freight}
                onChange={(e) => setFreight(e.target.value)}
                className="w-full pl-6 pr-3 py-1.5 text-sm text-right border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-200"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="border-t border-gray-200" />

          {/* Total OC */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-800">Total OC</span>
            <span className="text-xl font-bold text-gold-700 tabular-nums">{fmt(totalOc)}</span>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || mats.length === 0}
            className="w-full btn-primary justify-center py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveMutation.isPending ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <><Save size={15} /> Guardar Precios</>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
