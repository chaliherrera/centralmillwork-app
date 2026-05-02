import { useState, useMemo, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CheckCircle2, Package, FileDown, Send, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import { cotizacionesService, type MarcarEnviadaResult } from '@/services/cotizaciones'
import { generarCotizacionPDF } from '@/utils/cotizacionPdf'
import type { Material } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  proyectoId: number
  proyectoCodigo: string
  proyectoNombre?: string
  proyectoCliente?: string
  allMaterials: Material[]
}

export default function EnviarCotizacionesModal({
  open, onClose, proyectoId, proyectoCodigo, proyectoNombre, proyectoCliente, allMaterials,
}: Props) {
  const [selectedVendors, setSelectedVendors] = useState<Set<string>>(new Set())
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [results, setResults] = useState<MarcarEnviadaResult[] | null>(null)

  // Vendor summaries: count materials per vendor (cotizar='SI' only)
  const vendorSummaries = useMemo(() => {
    const map = new Map<string, { total: number; pendiente: number }>()
    for (const m of allMaterials) {
      if (!m.vendor || m.cotizar !== 'SI') continue
      const existing = map.get(m.vendor) ?? { total: 0, pendiente: 0 }
      existing.total++
      if (m.estado_cotiz === 'PENDIENTE') existing.pendiente++
      map.set(m.vendor, existing)
    }
    return Array.from(map.entries())
      .map(([vendor, counts]) => ({ vendor, ...counts }))
      .sort((a, b) => a.vendor.localeCompare(b.vendor))
  }, [allMaterials])

  // Materials grouped by vendor (cotizar='SI' only) — used for PDF generation
  const materialsByVendor = useMemo(() => {
    const map = new Map<string, Material[]>()
    for (const m of allMaterials) {
      if (!m.vendor || m.cotizar !== 'SI') continue
      const arr = map.get(m.vendor) ?? []
      arr.push(m)
      map.set(m.vendor, arr)
    }
    return map
  }, [allMaterials])

  useEffect(() => {
    if (open) {
      setSelectedVendors(new Set())
      setResults(null)
    }
  }, [open])

  const toggleVendor = (vendor: string) => {
    setSelectedVendors((prev) => {
      const next = new Set(prev)
      if (next.has(vendor)) next.delete(vendor)
      else next.add(vendor)
      return next
    })
  }

  const selectAll = () => setSelectedVendors(new Set(vendorSummaries.map((v) => v.vendor)))
  const clearAll  = () => setSelectedVendors(new Set())

  const selectedList = useMemo(
    () => vendorSummaries.filter((v) => selectedVendors.has(v.vendor)),
    [vendorSummaries, selectedVendors]
  )

  const totalSelected = selectedList.reduce((sum, v) => sum + v.total, 0)
  const canAct = selectedList.length > 0

  const handleGeneratePdf = async () => {
    if (!canAct) return
    setGeneratingPdf(true)
    try {
      const proyecto = { codigo: proyectoCodigo, nombre: proyectoNombre ?? '', cliente: proyectoCliente }
      let generated = 0
      for (const { vendor } of selectedList) {
        const mats = materialsByVendor.get(vendor) ?? []
        if (!mats.length) continue
        await generarCotizacionPDF(proyecto, vendor, mats)
        generated++
      }
      toast.success(`${generated} PDF(s) generado(s)`)
    } catch (err) {
      console.error('[cotizaciones] error generando PDF:', err)
      toast.error('Error generando PDF')
    } finally {
      setGeneratingPdf(false)
    }
  }

  const mutation = useMutation({
    mutationFn: () =>
      cotizacionesService.marcarEnviadas({
        proyecto_id: proyectoId,
        vendors: selectedList.map((v) => ({ vendor: v.vendor })),
      }),
    onSuccess: (res) => {
      setResults(res.data)
      toast.success(res.message)
    },
    onError: () => toast.error('Error registrando cotizaciones'),
  })

  const handleClose = () => {
    setSelectedVendors(new Set())
    setResults(null)
    onClose()
  }

  if (!open) return null

  return (
    <Modal open={open} onClose={handleClose} title="Cotizaciones" size="lg">
      {results ? (
        /* ── Results ── */
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600 font-medium">
            <CheckCircle2 size={20} />
            <span>{results.length} cotización(es) marcada(s) como enviada(s)</span>
          </div>

          <div className="divide-y divide-gray-100">
            {results.map((r) => (
              <div key={r.vendor} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-800 truncate">{r.vendor}</p>
                  <p className="text-xs text-gray-400">{r.folio} · {r.materiales_count} materials</p>
                </div>
                <span className="flex-shrink-0 text-xs text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} /> Enviada
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button onClick={handleClose} className="btn-primary">Close</button>
          </div>
        </div>
      ) : (
        /* ── Configure ── */
        <div className="space-y-5">
          {vendorSummaries.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay vendors con materiales para cotizar en este proyecto.</p>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
                <p className="leading-snug">
                  <strong>Flujo:</strong> 1) generá los PDF, 2) adjuntalos a un email desde tu cliente
                  de correo y enviálos a los proveedores, 3) marcá como enviadas para registrar en el sistema.
                </p>
              </div>

              {/* Vendor list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Vendors</label>
                  <div className="flex gap-3">
                    <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">Select all</button>
                    <button onClick={clearAll}  className="text-xs text-gray-400 hover:underline">Clear</button>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto">
                  {vendorSummaries.map((v) => {
                    const isSelected = selectedVendors.has(v.vendor)
                    return (
                      <label
                        key={v.vendor}
                        className={clsx(
                          'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                          isSelected ? 'bg-forest-50' : 'hover:bg-gray-50'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleVendor(v.vendor)}
                          className="rounded border-gray-300 text-forest-600 focus:ring-forest-500 flex-shrink-0"
                        />
                        <span className="flex-1 text-sm font-medium text-gray-800 truncate">{v.vendor}</span>
                        <div className="flex items-center gap-2 text-xs flex-shrink-0">
                          <span className="text-gray-500">{v.total} items</span>
                          {v.pendiente > 0 && (
                            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                              {v.pendiente} pending
                            </span>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              {selectedList.length > 0 && (
                <div className="bg-forest-50 border border-forest-200 rounded-lg px-4 py-3 text-sm text-forest-700">
                  <strong>{selectedList.length} vendor(s)</strong> seleccionado(s) con{' '}
                  <strong>{totalSelected} materiales</strong> para proyecto{' '}
                  <strong>{proyectoCodigo}</strong>.
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button type="button" onClick={handleClose} className="btn-ghost">Cancel</button>
                <button
                  onClick={handleGeneratePdf}
                  disabled={!canAct || generatingPdf}
                  className="btn-ghost flex items-center gap-2"
                >
                  {generatingPdf ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Generando…
                    </>
                  ) : (
                    <>
                      <FileDown size={15} />
                      Generar PDF {selectedList.length > 0 ? `(${selectedList.length})` : ''}
                    </>
                  )}
                </button>
                <button
                  onClick={() => mutation.mutate()}
                  disabled={!canAct || mutation.isPending}
                  className="btn-primary flex items-center gap-2"
                >
                  {mutation.isPending ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Registrando…
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      Marcar como enviada {selectedList.length > 0 ? `(${selectedList.length})` : ''}
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
