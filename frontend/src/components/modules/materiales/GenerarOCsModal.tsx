import { useState, useMemo, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ShoppingCart, CheckCircle2, Package, Loader2, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import { ordenesCompraService, type GenerarOCResult } from '@/services/ordenesCompra'

const fmt = (n: number | string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n))

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${m}/${day}/${y}`
}

interface Props {
  open: boolean
  onClose: () => void
  proyectoId: number
  proyectoCodigo: string
}

export default function GenerarOCsModal({ open, onClose, proyectoId, proyectoCodigo }: Props) {
  const qc = useQueryClient()
  const [selectedVendors, setSelectedVendors] = useState<Set<string>>(new Set())
  const [etas, setEtas] = useState<Record<string, string>>({})
  const [results, setResults] = useState<GenerarOCResult[] | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['vendors-cotizados', proyectoId],
    queryFn: () => ordenesCompraService.getVendorsCotizados(proyectoId),
    enabled: open && !!proyectoId,
    staleTime: 30_000,
  })

  const vendors = data?.data ?? []

  useEffect(() => {
    if (open) {
      setSelectedVendors(new Set())
      setEtas({})
      setResults(null)
    }
  }, [open])

  const toggle = (vendor: string) =>
    setSelectedVendors((prev) => {
      const next = new Set(prev)
      if (next.has(vendor)) next.delete(vendor)
      else next.add(vendor)
      return next
    })

  const selectAll = () => setSelectedVendors(new Set(vendors.map((v) => v.vendor)))
  const clearAll  = () => setSelectedVendors(new Set())

  const selectedList = useMemo(
    () => vendors.filter((v) => selectedVendors.has(v.vendor)),
    [vendors, selectedVendors]
  )

  const totalMonto = selectedList.reduce((sum, v) => sum + Number(v.total), 0)
  const totalItems = selectedList.reduce((sum, v) => sum + v.materiales_count, 0)
  const canGenerate = selectedList.length > 0

  const mutation = useMutation({
    mutationFn: () =>
      ordenesCompraService.generar({
        proyecto_id: proyectoId,
        vendors: selectedList.map((v) => ({
          vendor: v.vendor,
          fecha_entrega_estimada: etas[v.vendor] || null,
        })),
      }),
    onSuccess: (res) => {
      setResults(res.data)
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['ordenes-compra'] })
      qc.invalidateQueries({ queryKey: ['ordenes-compra-kpis'] })
    },
    onError: () => toast.error('Error al generar OCs'),
  })

  const handleClose = () => {
    setSelectedVendors(new Set())
    setEtas({})
    setResults(null)
    onClose()
  }

  if (!open) return null

  return (
    <Modal open={open} onClose={handleClose} title="Generar Órdenes de Compra" size="lg">
      {results ? (
        /* ── Results ── */
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600 font-medium">
            <CheckCircle2 size={20} />
            <span>{results.length} OC(s) generada(s) para proyecto {proyectoCodigo}</span>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">OC #</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Vendor</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Items</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r) => (
                  <tr key={r.numero}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.numero}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{r.vendor}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.materiales_count}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button onClick={handleClose} className="btn-primary">Cerrar</button>
          </div>
        </div>
      ) : (
        /* ── Configure ── */
        <div className="space-y-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 size={24} className="animate-spin mr-2" />
              <span className="text-sm">Cargando vendors cotizados…</span>
            </div>
          ) : vendors.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No hay vendors con materiales cotizados</p>
              <p className="text-xs mt-1">Captura precios primero en la vista de Materiales MTO.</p>
            </div>
          ) : (
            <>
              {/* Vendor list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Vendors con materiales cotizados</label>
                  <div className="flex gap-3">
                    <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">Seleccionar todos</button>
                    <button onClick={clearAll}  className="text-xs text-gray-400 hover:underline">Limpiar</button>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto">
                  {vendors.map((v) => {
                    const isSelected = selectedVendors.has(v.vendor)
                    return (
                      <div
                        key={v.vendor}
                        className={clsx(
                          'px-4 py-3 transition-colors',
                          isSelected ? 'bg-forest-50' : 'hover:bg-gray-50'
                        )}
                      >
                        {/* Checkbox + vendor info row */}
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(v.vendor)}
                            className="rounded border-gray-300 text-forest-600 focus:ring-forest-500 flex-shrink-0"
                          />
                          <span className="flex-1 text-sm font-medium text-gray-800">{v.vendor}</span>
                          <div className="flex items-center gap-3 text-xs flex-shrink-0">
                            <span className="text-gray-500">{v.materiales_count} items</span>
                            <span className="font-semibold text-green-700">{fmt(v.total)}</span>
                          </div>
                        </label>

                        {/* Batch date + ETA row */}
                        <div className="mt-2 ml-7 flex items-center gap-4">
                          <span className="text-xs text-gray-400">
                            Lote: <span className="text-gray-600 font-medium">{fmtDate(v.fecha_importacion)}</span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            <label className="text-xs text-gray-500 whitespace-nowrap">ETA:</label>
                            <input
                              type="date"
                              value={etas[v.vendor] ?? ''}
                              onChange={(e) => setEtas((prev) => ({ ...prev, [v.vendor]: e.target.value }))}
                              className="input text-xs py-1 w-36"
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Summary */}
              {selectedList.length > 0 && (
                <div className="bg-forest-50 border border-forest-200 rounded-lg px-4 py-3 text-sm text-forest-700 space-y-1">
                  <div className="flex justify-between">
                    <span>Se generarán <strong>{selectedList.length} OC(s)</strong> con <strong>{totalItems} materiales</strong></span>
                    <span className="font-semibold">{fmt(totalMonto)}</span>
                  </div>
                  {selectedList.some((v) => !etas[v.vendor]) && (
                    <div className="flex items-center gap-1.5 text-amber-700 text-xs pt-1">
                      <AlertCircle size={12} className="flex-shrink-0" />
                      <span>Vendors sin ETA: las OCs se crearán sin fecha de entrega estimada.</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button type="button" onClick={handleClose} className="btn-ghost">Cancelar</button>
                <button
                  onClick={() => mutation.mutate()}
                  disabled={!canGenerate || mutation.isPending}
                  className="btn-primary flex items-center gap-2"
                >
                  {mutation.isPending ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Generando…
                    </>
                  ) : (
                    <>
                      <ShoppingCart size={15} />
                      Generar {selectedList.length > 0 ? `(${selectedList.length})` : ''}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
