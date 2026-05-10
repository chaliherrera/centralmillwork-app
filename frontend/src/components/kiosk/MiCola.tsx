import { useState } from 'react'
import { ListChecks, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { kioskService } from '@/services/kiosk'
import type { KioskOrdenEnCola } from '@/types/kiosk'

const PRIORIDAD_BG: Record<string, string> = {
  Alta:  'bg-red-100 text-red-800 border-red-200',
  Media: 'bg-amber-100 text-amber-800 border-amber-200',
  Baja:  'bg-gray-100 text-gray-700 border-gray-200',
}

export default function MiCola() {
  const qc = useQueryClient()
  const [completarId, setCompletarId] = useState<number | null>(null)

  const { data = [], isLoading } = useQuery({
    queryKey: ['kiosk', 'mi-cola'],
    queryFn:  kioskService.miCola,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,  // refrescar cada minuto
  })

  const completar = useMutation({
    mutationFn: (ordenId: number) => kioskService.completarProcesoOrden(ordenId),
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['kiosk', 'mi-cola'] })
      setCompletarId(null)
    },
    onError: () => setCompletarId(null),
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-gold-50 flex items-center justify-center">
          <ListChecks size={24} className="text-gold-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-forest-700">Mi cola</h2>
          <p className="text-sm text-gray-500">
            {data.length === 0 ? 'Sin órdenes asignadas' : `${data.length} ${data.length === 1 ? 'orden' : 'órdenes'} para vos`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 flex justify-center">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : data.length === 0 ? (
        <div className="py-6 text-center text-gray-400 text-sm">
          No tenés órdenes pendientes asignadas.
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((o: KioskOrdenEnCola) => (
            <OrdenItem
              key={o.id}
              orden={o}
              isCompleting={completar.isPending && completarId === o.id}
              isConfirming={completarId === o.id}
              onCompletarClick={() => setCompletarId(o.id)}
              onConfirm={() => completar.mutate(o.id)}
              onCancel={() => setCompletarId(null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface OrdenItemProps {
  orden: KioskOrdenEnCola
  isCompleting: boolean
  isConfirming: boolean
  onCompletarClick: () => void
  onConfirm: () => void
  onCancel: () => void
}

function OrdenItem({ orden, isCompleting, isConfirming, onCompletarClick, onConfirm, onCancel }: OrdenItemProps) {
  return (
    <div className={clsx(
      'rounded-xl border p-4 transition-all',
      orden.es_estacion_activa
        ? 'border-gold-300 bg-gold-50'
        : 'border-gray-200 bg-white'
    )}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-forest-700">{orden.numero_orden}</span>
            <span className={clsx(
              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
              PRIORIDAD_BG[orden.prioridad]
            )}>
              {orden.prioridad}
            </span>
            {orden.es_estacion_activa && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gold-200 text-forest-700">
                <AlertTriangle size={12} /> Tu turno
              </span>
            )}
          </div>
          <div className="text-sm text-gray-700 mt-1 truncate">{orden.item_nombre}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {orden.proyecto_codigo && <>Proyecto {orden.proyecto_codigo} · </>}
            Estación: <span className="uppercase">{orden.mi_estacion}</span> · Cant: {orden.cantidad}
            {orden.fecha_entrega && (
              <> · Entrega: {new Date(orden.fecha_entrega).toLocaleDateString('es-MX')}</>
            )}
          </div>
        </div>
        {orden.es_estacion_activa && (
          isConfirming ? (
            <div className="flex flex-col gap-1.5">
              <button
                onClick={onConfirm}
                disabled={isCompleting}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-1.5"
              >
                {isCompleting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Confirmar
              </button>
              <button
                onClick={onCancel}
                className="px-3 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-semibold"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={onCompletarClick}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-1.5"
            >
              <CheckCircle2 size={14} />
              Completé
            </button>
          )
        )}
      </div>
    </div>
  )
}
