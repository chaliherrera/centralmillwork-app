import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ListChecks, Loader2, CheckCircle2, AlertTriangle, FileText, ExternalLink, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { kioskService } from '@/services/kiosk'
import type { KioskOrdenEnCola, KioskDocumento } from '@/types/kiosk'

const PRIORIDAD_BG: Record<string, string> = {
  Alta:  'bg-red-100 text-red-800 border-red-200',
  Media: 'bg-amber-100 text-amber-800 border-amber-200',
  Baja:  'bg-gray-100 text-gray-700 border-gray-200',
}

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Drawer slide-in (desde la derecha) con la lista completa de asignaciones
 * del operario. Reemplaza el card grande "Mi Cola" — ahora la lista se abre
 * cuando el operario hace click en la card compacta "Asignaciones" en el home.
 *
 * Mantiene exactamente la misma lógica de la antigua MiCola:
 *  - Lista órdenes asignadas (operador_id = personal, completado = false)
 *  - Resalta la fila si es la estación actual ("Tu turno")
 *  - Botón "Ver planos · N" si hay documentos en su estación + generales
 *  - Botón "Completé" con confirmación → POST completar-proceso
 */
export default function AsignacionesPanel({ open, onClose }: Props) {
  const qc = useQueryClient()
  const [completarId, setCompletarId] = useState<number | null>(null)
  const [docsOrdenId, setDocsOrdenId] = useState<number | null>(null)

  const { data = [], isLoading } = useQuery({
    queryKey: ['kiosk', 'mi-cola'],
    queryFn:  kioskService.miCola,
    staleTime: 1000 * 30,
    refetchInterval: open ? 1000 * 30 : 1000 * 60,  // refresca más rápido si el panel está abierto
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

  // Cerrar con tecla Escape (para teclados conectados a las tablets)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={clsx(
          'fixed inset-0 bg-black/60 z-40 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={clsx(
          'fixed top-0 right-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col',
          'transform transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        aria-label="Asignaciones"
      >
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-br from-forest-700 to-forest-600 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
              <ListChecks size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Asignaciones</h2>
              <p className="text-sm text-forest-100/90">
                {data.length === 0
                  ? 'Sin órdenes pendientes'
                  : `${data.length} ${data.length === 1 ? 'orden' : 'órdenes'} para vos`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl hover:bg-white/10 active:bg-white/20 transition-colors"
            aria-label="Cerrar panel"
          >
            <X size={22} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-16 flex justify-center">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : data.length === 0 ? (
            <div className="py-20 px-6 text-center">
              <ListChecks size={36} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">No tenés asignaciones pendientes</p>
              <p className="text-sm text-gray-400 mt-1">
                Cuando el supervisor te asigne una orden, va a aparecer acá.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
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
            </ul>
          )}
        </div>
      </aside>

      {docsOrdenId !== null && (
        <DocsModal ordenId={docsOrdenId} onClose={() => setDocsOrdenId(null)} />
      )}
    </>
  )
}

// ─── Una orden en la lista ────────────────────────────────────────────────────
interface OrdenItemProps {
  orden: KioskOrdenEnCola
  isCompleting: boolean
  isConfirming: boolean
  onCompletarClick: () => void
  onConfirm: () => void
  onCancel: () => void
  onVerPlanos: () => void
}

function OrdenItem({
  orden, isCompleting, isConfirming, onCompletarClick, onConfirm, onCancel, onVerPlanos,
}: OrdenItemProps) {
  return (
    <li className={clsx(
      'px-5 py-4',
      orden.es_estacion_activa && 'bg-gold-50'
    )}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-bold text-forest-700 text-base">{orden.numero_orden}</span>
            <span className={clsx(
              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
              PRIORIDAD_BG[orden.prioridad]
            )}>
              {orden.prioridad}
            </span>
            {orden.es_estacion_activa && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gold-500 text-white shadow-sm">
                <AlertTriangle size={11} /> Tu turno
              </span>
            )}
          </div>

          <div className="text-sm text-gray-800 font-medium truncate">{orden.item_nombre}</div>

          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5 flex-wrap">
            {orden.proyecto_codigo && (
              <>
                <span className="font-medium text-gray-700">{orden.proyecto_codigo}</span>
                <span>·</span>
              </>
            )}
            <span className="uppercase font-medium">{orden.mi_estacion.replace('_', ' ')}</span>
            <span>·</span>
            <span>{orden.cantidad} {orden.unidad}</span>
            {orden.fecha_entrega && (
              <>
                <span>·</span>
                <span>Entrega {new Date(orden.fecha_entrega).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</span>
              </>
            )}
          </div>

          {/* Botones de acción */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {orden.docs_count > 0 && (
              <button
                onClick={onVerPlanos}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-forest-700 hover:bg-forest-600 text-white text-xs font-semibold"
              >
                <FileText size={13} />
                Ver planos · {orden.docs_count}
              </button>
            )}

            {orden.es_estacion_activa && (
              isConfirming ? (
                <>
                  <button
                    onClick={onConfirm}
                    disabled={isCompleting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
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
                </>
              ) : (
                <button
                  onClick={onCompletarClick}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
                >
                  <CheckCircle2 size={14} />
                  Completé
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

// ─── Modal de documentos (idéntico al de antes, solo movido acá) ─────────────
function DocsModal({ ordenId, onClose }: { ordenId: number; onClose: () => void }) {
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['kiosk', 'docs', ordenId],
    queryFn:  () => kioskService.documentosOrden(ordenId),
  })

  // Si hay solo 1 doc, lo abrimos automáticamente sin mostrar el modal.
  const [autoOpened, setAutoOpened] = useState(false)
  if (!isLoading && docs.length === 1 && !autoOpened) {
    setAutoOpened(true)
    if (docs[0].url) window.open(docs[0].url, '_blank', 'noopener')
    setTimeout(onClose, 100)
    return null
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-[60]" onClick={onClose}>
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
