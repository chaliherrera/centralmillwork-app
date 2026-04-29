import { useState, useMemo, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Send, CheckCircle2, Package, Mail, AlertCircle, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import { cotizacionesService, type EnviarResult } from '@/services/cotizaciones'
import type { Material } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  proyectoId: number
  proyectoCodigo: string
  allMaterials: Material[]
}

export default function EnviarCotizacionesModal({ open, onClose, proyectoId, proyectoCodigo, allMaterials }: Props) {
  const [selectedVendors, setSelectedVendors] = useState<Set<string>>(new Set())
  const [manualEmails, setManualEmails] = useState<Record<string, string>>({})
  const [results, setResults] = useState<EnviarResult[] | null>(null)

  // Server-side lookup: vendor name → email via LOWER(TRIM) match in proveedores
  const { data: vendorEmailsData, isLoading: loadingEmails } = useQuery({
    queryKey: ['vendor-emails', proyectoId],
    queryFn: () => cotizacionesService.getVendorEmails(proyectoId),
    enabled: open && !!proyectoId,
    staleTime: 30_000,
  })

  // Map: vendor name → email (null if not registered)
  const autoEmailMap = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const row of vendorEmailsData?.data ?? []) {
      map.set(row.vendor, row.email || null)
    }
    return map
  }, [vendorEmailsData])

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

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setSelectedVendors(new Set())
      setManualEmails({})
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

  const getEmail = (vendor: string): string => {
    const auto = autoEmailMap.get(vendor)
    if (auto) return auto
    return manualEmails[vendor] ?? ''
  }

  const selectedList = useMemo(
    () => vendorSummaries.filter((v) => selectedVendors.has(v.vendor)),
    [vendorSummaries, selectedVendors]
  )

  const missingEmails = selectedList.filter((v) => !getEmail(v.vendor))
  const canSend = selectedList.length > 0 && missingEmails.length === 0

  const totalSelected = selectedList.reduce((sum, v) => sum + v.total, 0)

  const mutation = useMutation({
    mutationFn: () =>
      cotizacionesService.enviar({
        proyecto_id: proyectoId,
        vendors: selectedList.map((v) => ({
          vendor: v.vendor,
          email_to: getEmail(v.vendor),
        })),
      }),
    onSuccess: (res) => {
      setResults(res.data)
      toast.success(res.message)
    },
    onError: () => toast.error('Error sending quote requests'),
  })

  const handleClose = () => {
    setSelectedVendors(new Set())
    setManualEmails({})
    setResults(null)
    onClose()
  }

  if (!open) return null

  return (
    <Modal open={open} onClose={handleClose} title="Send Quote Requests" size="lg">
      {results ? (
        /* ── Results ── */
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600 font-medium">
            <CheckCircle2 size={20} />
            <span>{results.length} quote request(s) sent</span>
          </div>

          <div className="divide-y divide-gray-100">
            {results.map((r) => (
              <div key={r.vendor} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-800 truncate">{r.vendor}</p>
                  <p className="text-xs text-gray-400">{r.folio} · {r.materiales_count} materials</p>
                </div>
                <span className="flex-shrink-0 text-xs text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} /> Sent via Outlook
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
              <p className="text-sm">No vendors with materials to quote in this project.</p>
            </div>
          ) : (
            <>
              {/* Vendor list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">
                    Vendors to quote
                    {loadingEmails && <Loader2 size={12} className="inline ml-2 animate-spin text-gray-400" />}
                  </label>
                  <div className="flex gap-3">
                    <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">Select all</button>
                    <button onClick={clearAll}  className="text-xs text-gray-400 hover:underline">Clear</button>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto">
                  {vendorSummaries.map((v, idx) => {
                    const autoEmail = autoEmailMap.get(v.vendor) ?? null
                    const isSelected = selectedVendors.has(v.vendor)
                    const manual = manualEmails[v.vendor] ?? ''
                    const hasEmail = !!(autoEmail || manual)
                    // Unique id prevents browser from auto-filling all email fields identically
                    const inputId = `vendor-email-${idx}`

                    return (
                      <div
                        key={v.vendor}
                        className={clsx(
                          'px-4 py-3 transition-colors',
                          isSelected ? 'bg-forest-50' : 'hover:bg-gray-50'
                        )}
                      >
                        {/* Checkbox row */}
                        <label className="flex items-center gap-3 cursor-pointer">
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

                        {/* Email row */}
                        <div className="mt-2 ml-7">
                          {loadingEmails ? (
                            <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
                          ) : autoEmail ? (
                            <div className="flex items-center gap-1.5 text-xs text-green-700">
                              <Mail size={11} className="flex-shrink-0" />
                              <span className="font-medium">{autoEmail}</span>
                              <span className="text-green-500 text-[10px]">(from suppliers)</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <input
                                id={inputId}
                                name={inputId}
                                type="text"
                                autoComplete="off"
                                placeholder="No email registered — enter manually…"
                                value={manual}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setManualEmails((prev) => ({ ...prev, [v.vendor]: val }))
                                }}
                                className={clsx(
                                  'input text-xs py-1.5 flex-1',
                                  isSelected && !manual && 'border-red-300 focus:ring-red-400'
                                )}
                              />
                              {isSelected && !hasEmail && (
                                <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <p className="text-xs text-gray-400 mt-1.5">
                  Emails are pulled from the Suppliers table. To update an email permanently, edit the supplier in the Proveedores view.
                </p>
              </div>

              {/* Validation / summary */}
              {selectedList.length > 0 && (
                missingEmails.length > 0 ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                    <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                    <span>Enter email address for: <strong>{missingEmails.map((v) => v.vendor).join(', ')}</strong></span>
                  </div>
                ) : (
                  <div className="bg-forest-50 border border-forest-200 rounded-lg px-4 py-3 text-sm text-forest-700">
                    <strong>{selectedList.length} email(s)</strong> will be sent with{' '}
                    <strong>{totalSelected} materials</strong> for project{' '}
                    <strong>{proyectoCodigo}</strong>.
                  </div>
                )
              )}

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button type="button" onClick={handleClose} className="btn-ghost">Cancel</button>
                <button
                  onClick={() => mutation.mutate()}
                  disabled={!canSend || mutation.isPending}
                  className="btn-primary flex items-center gap-2"
                >
                  {mutation.isPending ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      Send {selectedList.length > 0 ? `(${selectedList.length})` : ''}
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
