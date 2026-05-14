import { useState } from 'react'
import { ListChecks, Loader2, CheckCircle2, AlertTriangle, FileText, ExternalLink, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { kioskService } from '@/services/kiosk'
import type { KioskOrdenEnCola, KioskDocumento } from '@/types/kiosk'

const PRIORIDAD_BG: Record<string, string> = {
  Alta:  'bg-red-100 text-red-800 border-red-200',
  Media: 'bg-amber-100 text-amber-800 border-amber-200',
  Baja:  'bg-gray-100 text-gray-700 border-gray-200',
}

export default function MiCola() {
  const qc = useQueryClient()
  const [completarId, setCompletarId] = useState<number | null>(null)
  const [docsOrdenId, setDocsOrdenId] = useState<number | null>(null)

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
              onVerPlanos={() => setDocsOrdenId(o.id)}
            />
          ))}
        </div>
      )}

      {docsOrdenId !== null && (
        <DocsModal ordenId={docsOrdenId} onClose={() => setDocsOrdenId(null)} />
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
  onVerPlanos: () => void
}

// ─── Modal de documentos disponibles para el operario ────────────────────────
function DocsModal({ ordenId, onClose }: { ordenId: number; onClose: () => void }) {
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['kiosk', 'docs', ordenId],
    queryFn:  () => kioskService.documentosOrden(ordenId),
  })

  // Si hay solo 1 doc, lo abrimos automáticamente sin mostrar el modal.
  // (Detectamos al primer render con length === 1 después de la carga.)
  const [autoOpened, setAutoOpened] = useState(false)
  if (!isLoading && docs.length === 1 && !autoOpened) {
    setAutoOpened(true)
    if (docs[0].url) window.open(docs[0].url, '_blank', 'noopener')
    setTimeout(onClose, 100)
    return null
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-forest-700 flex items-center gap-2">
            <FileText size={18} className="text-gold-600" /> Planos disponibles
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
          ) : docs.length === 0 ? (
            <p className="py-10 text-center text-gray-400 text-sm">Sin documentos disponibles</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {docs.map((d: KioskDocumento) => (
                <li key={d.id}>
                  <a
                    href={d.url ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-5 py-4 hover:bg-gold-50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                      <FileText size={18} className="text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-forest-700 truncate">{d.nombre}</div>
                      <div className="text-xs text-gray-500">
                        {d.estacion ? (
                          <span className="uppercase font-medium">{d.estacion.replace('_', ' ')}</span>
                        ) : (
                          <span className="italic">General</span>
                        )}
                        {d.descripcion && <> · {d.descripcion}</>}
                      </div>
                    </div>
                    <ExternalLink size={16} className="text-gray-400 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function OrdenItem({ orden, isCompleting, isConfirming, onCompletarClick, onConfirm, onCancel, onVerPlanos }: OrdenItemProps) {
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
          {orden.docs_count > 0 && (
            <button
              onClick={onVerPlanos}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-700 hover:bg-forest-600 text-white text-xs font-semibold"
            >
              <FileText size={13} />
              Ver planos · {orden.docs_count}
            </button>
          )}
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
