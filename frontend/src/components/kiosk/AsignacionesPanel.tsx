import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ListChecks, Loader2, CheckCircle2, AlertTriangle, FileText, ExternalLink, X,
  Play, PlayCircle, Camera, ImagePlus, RotateCcw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { kioskService } from '@/services/kiosk'
import { useKioskAuth } from '@/context/KioskAuthContext'
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
  const { status, refresh } = useKioskAuth()
  const qc = useQueryClient()
  const [completarId, setCompletarId] = useState<number | null>(null)
  const [fotoModalOrden, setFotoModalOrden] = useState<KioskOrdenEnCola | null>(null)
  const [docsOrdenId, setDocsOrdenId] = useState<number | null>(null)

  const { data = [], isLoading } = useQuery({
    queryKey: ['kiosk', 'mi-cola'],
    queryFn:  kioskService.miCola,
    staleTime: 1000 * 30,
    refetchInterval: open ? 1000 * 30 : 1000 * 60,  // refresca más rápido si el panel está abierto
  })

  // Config de estaciones (qué estación requiere foto) — cacheado largo.
  const { data: estacionesConfig = [] } = useQuery({
    queryKey: ['kiosk', 'estaciones-config'],
    queryFn:  kioskService.estacionesConfig,
    staleTime: 1000 * 60 * 30,  // 30 min, casi no cambia
  })
  const requiereFotoEstacion = (estacion: string) => {
    const cfg = estacionesConfig.find((c) => c.nombre === estacion)
    return cfg?.foto_obligatoria === true
  }

  const tieneClockIn = !!status?.registro_activo

  const iniciar = useMutation({
    mutationFn: (ordenId: number) => kioskService.iniciarItemOrden(ordenId),
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['kiosk', 'mi-cola'] })
      qc.invalidateQueries({ queryKey: ['kiosk', 'dia'] })
      refresh()  // status del kiosk auth (proyecto_activo etc.)
    },
  })

  const completar = useMutation({
    mutationFn: (ordenId: number) => kioskService.completarProcesoOrden(ordenId),
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['kiosk', 'mi-cola'] })
      qc.invalidateQueries({ queryKey: ['kiosk', 'dia'] })
      refresh()
      setCompletarId(null)
      setFotoModalOrden(null)
    },
    onError: (err: any) => {
      // 422 = backend bloqueó por falta de foto. El frontend ya debería haber
      // abierto el modal, pero por las dudas re-abrimos.
      const status = err?.response?.status
      const orden  = data.find((o: KioskOrdenEnCola) => o.id === completarId)
      if (status === 422 && orden) {
        toast.error('Necesitás subir una foto antes de completar')
        setFotoModalOrden(orden)
      }
      setCompletarId(null)
    },
  })

  // Click "Item completado" → si la estación pide foto, abre modal; si no,
  // pasa directo a "Confirmar".
  const handleCompletarClick = (orden: KioskOrdenEnCola) => {
    if (requiereFotoEstacion(orden.mi_estacion)) {
      setFotoModalOrden(orden)
    } else {
      setCompletarId(orden.id)
    }
  }

  // Cuando la foto subió OK, pasamos al confirm final (que dispara completar).
  const handleFotoUploaded = (ordenId: number) => {
    setFotoModalOrden(null)
    qc.invalidateQueries({ queryKey: ['kiosk', 'avance-fotos', ordenId] })
    setCompletarId(ordenId)
  }

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
                  tieneClockIn={tieneClockIn}
                  isIniciating={iniciar.isPending && iniciar.variables === o.id}
                  isCompleting={completar.isPending && completarId === o.id}
                  isConfirming={completarId === o.id}
                  onIniciar={() => iniciar.mutate(o.id)}
                  onCompletarClick={() => handleCompletarClick(o)}
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

      {fotoModalOrden && (
        <AvanceFotoModal
          orden={fotoModalOrden}
          onClose={() => setFotoModalOrden(null)}
          onUploaded={() => handleFotoUploaded(fotoModalOrden.id)}
        />
      )}
    </>
  )
}

// ─── Una orden en la lista ────────────────────────────────────────────────────
interface OrdenItemProps {
  orden: KioskOrdenEnCola
  tieneClockIn: boolean
  isIniciating: boolean
  isCompleting: boolean
  isConfirming: boolean
  onIniciar: () => void
  onCompletarClick: () => void
  onConfirm: () => void
  onCancel: () => void
  onVerPlanos: () => void
}

function formatMinutos(min: number): string {
  if (min <= 0) return '0m'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function OrdenItem({
  orden, tieneClockIn, isIniciating, isCompleting, isConfirming,
  onIniciar, onCompletarClick, onConfirm, onCancel, onVerPlanos,
}: OrdenItemProps) {
  const enCurso  = orden.proceso_estado === 'en_curso'
  const pausado  = orden.proceso_estado === 'pausado'
  const previos  = orden.minutos_previos ?? 0

  return (
    <li className={clsx(
      'px-5 py-4 transition-colors',
      enCurso ? 'bg-emerald-50 border-l-4 border-emerald-500'
        : pausado ? 'bg-amber-50/60 border-l-4 border-amber-400'
        : orden.es_estacion_activa ? 'bg-gold-50'
        : ''
    )}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Línea 1: N°, prioridad, badges de estado */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-bold text-forest-700 text-base">{orden.numero_orden}</span>
            <span className={clsx(
              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
              PRIORIDAD_BG[orden.prioridad]
            )}>
              {orden.prioridad}
            </span>
            {enCurso && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-sm">
                ● En curso
              </span>
            )}
            {pausado && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white shadow-sm">
                ⏸ Pausado · {formatMinutos(previos)}
              </span>
            )}
            {!enCurso && !pausado && orden.es_estacion_activa && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gold-500 text-white shadow-sm">
                <AlertTriangle size={11} /> Tu turno
              </span>
            )}
          </div>

          {/* Línea 2: item */}
          <div className="text-sm text-gray-800 font-medium truncate">{orden.numero_item}</div>

          {/* Línea 3: metadata */}
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

            {/* CTA principal según estado del proceso */}
            {/* La orden tiene que estar en MI estación para que se pueda actuar.
                Si la estación actual NO es la mía, solo es info (siguiente turno). */}
            {orden.es_estacion_activa && (
              enCurso ? (
                // Estado: en curso → mostrar "Item completado" con confirm
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
                    Item completado
                  </button>
                )
              ) : pausado ? (
                // Estado: pausado → "Continuar item"
                <button
                  onClick={onIniciar}
                  disabled={isIniciating || !tieneClockIn}
                  title={!tieneClockIn ? 'Hacé clock-in primero' : undefined}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {isIniciating ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
                  Continuar item
                </button>
              ) : (
                // Estado: no iniciado → "Iniciar item"
                <button
                  onClick={onIniciar}
                  disabled={isIniciating || !tieneClockIn}
                  title={!tieneClockIn ? 'Hacé clock-in primero' : undefined}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gold-500 hover:bg-gold-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {isIniciating ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  Iniciar item
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

// ─── Modal "Foto de avance" — intercalado antes de Confirmar ─────────────────
// El operario abre la cámara del iPad (input capture=environment), revisa el
// preview, agrega un comentario opcional y sube. Al éxito, el flow pasa al
// "Confirmar" (que dispara completar-proceso).
function AvanceFotoModal({
  orden, onClose, onUploaded,
}: {
  orden: KioskOrdenEnCola
  onClose: () => void
  onUploaded: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [comentario, setComentario] = useState('')

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Sin archivo')
      return kioskService.uploadAvanceFoto(orden.id, file, comentario.trim() || undefined)
    },
    onSuccess: () => {
      toast.success('Foto subida')
      onUploaded()
    },
    onError: (err: any) => {
      toast.error('Error subiendo: ' + (err?.response?.data?.error || err?.message || 'desconocido'))
    },
  })

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleFile = (f: File | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(f)
    setPreviewUrl(f ? URL.createObjectURL(f) : null)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-[70]" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] rounded-t-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Camera size={20} className="text-emerald-600" />
            <h2 className="text-lg font-bold text-forest-700">Foto de avance</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Info de la orden */}
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
          <div className="text-xs text-amber-700 font-semibold uppercase tracking-wide">
            {orden.numero_orden} · {orden.mi_estacion.replace('_', ' ')}
          </div>
          <div className="text-sm text-amber-900 font-medium mt-0.5 truncate">
            {orden.numero_item}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!file ? (
            <>
              <p className="text-sm text-gray-600">
                Sacale una foto al trabajo terminado antes de confirmar. Va a quedar
                como evidencia visual de avance del proyecto.
              </p>
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full py-6 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 transition-colors flex flex-col items-center gap-2"
              >
                <ImagePlus size={32} className="text-emerald-600" />
                <span className="text-emerald-700 font-bold">Abrir cámara</span>
                <span className="text-emerald-600 text-xs">o elegir desde galería</span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </>
          ) : (
            <>
              {/* Preview */}
              <div className="relative rounded-2xl overflow-hidden bg-gray-900">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="preview"
                    className="w-full h-auto max-h-[50vh] object-contain"
                  />
                )}
                <button
                  onClick={() => handleFile(null)}
                  className="absolute top-2 right-2 p-2 rounded-full bg-black/70 text-white hover:bg-black/80"
                  aria-label="Sacar otra foto"
                >
                  <RotateCcw size={16} />
                </button>
              </div>

              {/* Comentario opcional */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Comentario (opcional)
                </label>
                <input
                  type="text"
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Ej: Banding terminado en panel A"
                  maxLength={200}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer botones */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold"
            disabled={upload.isPending}
          >
            Cancelar
          </button>
          <button
            onClick={() => upload.mutate()}
            disabled={!file || upload.isPending}
            className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {upload.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Subiendo…
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                Subir y seguir
              </>
            )}
          </button>
        </div>
      </div>
    </div>
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
