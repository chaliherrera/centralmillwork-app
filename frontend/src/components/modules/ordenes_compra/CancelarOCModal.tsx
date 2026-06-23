import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Ban } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '@/components/ui/Modal'
import { ordenesCompraService } from '@/services/ordenesCompra'
import type { OrdenCompra } from '@/types'

/**
 * Modal de cancelación de OC — UX simple: confirmar + opcional motivo.
 *
 * Reemplaza el window.confirm() genérico que se usaba antes. Razones del cambio:
 *   1) Confirm nativo no permite capturar motivo de cancelación → no queda
 *      auditoría de por qué se canceló esa OC.
 *   2) El botón Trash que dispara cancelar es confuso (parece "eliminar")
 *      y mezclado con el de Editar lleva al user a entrar al form completo.
 *
 * Diseño: nombre y total de la OC bien visibles arriba, alerta de impacto
 * (los materiales quedan disponibles), textarea para motivo (opcional pero
 * recomendado), botón rojo único para confirmar. ESC y backdrop cancelan.
 */
interface Props {
  open: boolean
  onClose: () => void
  oc?: OrdenCompra
  onCancelled?: () => void
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export default function CancelarOCModal({ open, onClose, oc, onCancelled }: Props) {
  const [motivo, setMotivo] = useState('')

  // Reset cuando se abre con otra OC distinta
  useEffect(() => {
    if (open) setMotivo('')
  }, [open, oc?.id])

  const mutation = useMutation({
    mutationFn: () => {
      if (!oc) throw new Error('Sin OC')
      return ordenesCompraService.updateEstado(oc.id, 'cancelada', motivo.trim() || undefined)
    },
    onSuccess: () => {
      toast.success(`Orden ${oc?.numero} cancelada`)
      onCancelled?.()
      onClose()
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'No se pudo cancelar la orden'),
  })

  if (!oc) return null

  return (
    <Modal open={open} onClose={onClose} title="Cancelar orden de compra" size="md">
      <div className="space-y-4">
        {/* Identidad de la OC */}
        <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold text-gray-800">{oc.numero}</p>
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {oc.proveedor?.nombre} · {oc.proyecto?.codigo}
            </p>
          </div>
          <p className="text-base font-bold text-gold-700 whitespace-nowrap">
            {fmt(Number(oc.total))}
          </p>
        </div>

        {/* Alerta de impacto */}
        <div className="flex gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
          <div className="text-xs leading-relaxed">
            <p className="font-semibold mb-1">¿Estás seguro?</p>
            <p>
              La OC queda registrada como <strong>CANCELADA</strong> (no se elimina, para preservar el
              historial). Los materiales asociados vuelven a quedar disponibles para una nueva
              cotización.
            </p>
          </div>
        </div>

        {/* Motivo */}
        <div>
          <label className="label" htmlFor="motivo-cancelacion">
            Motivo (opcional pero recomendado)
          </label>
          <textarea
            id="motivo-cancelacion"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. cliente cambió la especificación · proveedor no disponible · error de cantidad..."
            rows={3}
            className="input w-full resize-none"
            autoFocus
            maxLength={500}
          />
          <p className="text-[10px] text-gray-400 mt-1">
            Se appendea a las notas de la OC con fecha y tu email para auditoría posterior. {motivo.length}/500
          </p>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="btn-ghost"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {mutation.isPending
              ? <Loader2 size={14} className="animate-spin" />
              : <Ban size={14} />}
            Confirmar cancelación
          </button>
        </div>
      </div>
    </Modal>
  )
}
