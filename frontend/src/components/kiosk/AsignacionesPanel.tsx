import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ListChecks, Loader2, CheckCircle2, AlertTriangle, FileText, ExternalLink, X,
  Play, PlayCircle, Camera, ImagePlus,
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
    return cfg?.foto_obligatoria === true && (cfg?.fotos_minimas ?? 0) > 0
  }
  const fotosMinimasDeEstacion = (estacion: string) => {
    return estacionesConfig.find((c) => c.nombre === estacion)?.fotos_minimas ?? 3
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
    // Fix #3: onError recibe (err, variables) donde variables=ordenId.
    // Antes leíamos completarId (state) que es null cuando el flujo viene
    // desde el modal de fotos (handleFotoCompleto no lo setea). Eso hacía
    // que el 422 nunca re-abriera el modal — el operario se quedaba mudo.
    onError: (err: any, ordenId: number) => {
      const status = err?.response?.status
      const orden  = data.find((o: KioskOrdenEnCola) => o.id === ordenId)
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

  // Cuando el operario subió las N fotos y clickea "Completar proceso",
  // disparamos completar-proceso directo (sin el paso "Confirmar" inline).
  const handleFotoCompleto = (ordenId: number) => {
    setFotoModalOrden(null)
    qc.invalidateQueries({ queryKey: ['kiosk', 'avance-fotos', ordenId] })
    completar.mutate(ordenId)
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
          fotosMinimas={fotosMinimasDeEstacion(fotoModalOrden.mi_estacion)}
          onClose={() => setFotoModalOrden(null)}
          onCompleto={() => handleFotoCompleto(fotoModalOrden.id)}
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

// ─── Modal "Fotos de avance" — intercalado antes de Confirmar ────────────────
// Batch upload (estilo recepciones mobile):
//   1. El operario saca N fotos seguidas (cada una se acumula localmente)
//   2. Ve un strip de thumbnails con todas las locales (puede borrar cualquiera)
//   3. Un solo botón "Subir las N y completar" sube TODAS en secuencia +
//      dispara completar-proceso al final
//   4. Si abre/cierra modal a la mitad, las fotos previamente subidas al
//      servidor se cuentan (query a avance-fotos filtrado por estación)
function AvanceFotoModal({
  orden, fotosMinimas, onClose, onCompleto,
}: {
  orden: KioskOrdenEnCola
  fotosMinimas: number
  onClose: () => void
  /** Llamado cuando el operario subió todo y disparó completar. El padre
   *  ejecuta completar-proceso entonces. */
  onCompleto: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Fotos locales pendientes de subir (recién capturadas, no llegaron al servidor)
  const [archivosLocales, setArchivosLocales] = useState<File[]>([])
  const [previewsLocales, setPreviewsLocales] = useState<string[]>([])

  // Fix #1: ref sincronizada con previewsLocales para que el cleanup useEffect
  // (que corre al desmontar con deps=[]) tenga acceso a la lista ACTUAL, no
  // al snapshot inicial vacío. Sin esto, los blob URLs creados después del
  // mount nunca se revocan al cerrar el modal → memory leak en el iPad.
  const previewsLocalesRef = useRef<string[]>([])
  useEffect(() => { previewsLocalesRef.current = previewsLocales }, [previewsLocales])

  // Fotos ya en servidor (sesión interrumpida previa). Si alcanza el mínimo,
  // el operario puede completar sin sacar más.
  const { data: fotosExistentes = [], refetch } = useQuery({
    queryKey: ['kiosk', 'avance-fotos', orden.id],
    queryFn:  () => kioskService.avanceFotosOrden(orden.id),
  })
  const fotosDeMiEstacion = fotosExistentes.filter((f) => f.estacion === orden.mi_estacion)
  const subidasEnServer = fotosDeMiEstacion.length
  const totalProyectado = subidasEnServer + archivosLocales.length
  const cumpleMinimo = totalProyectado >= fotosMinimas
  // Cap estricto: no permitir más fotos que el mínimo. Si ya llegó al límite,
  // ocultamos el botón de captura.
  const puedeAgregarMas = totalProyectado < fotosMinimas

  const submit = useMutation({
    mutationFn: async () => {
      const fallidos: number[] = []
      // Upload secuencial: si una falla, las anteriores quedan subidas y las
      // posteriores no se intentan. Esto preserva orden de inserción.
      for (let i = 0; i < archivosLocales.length; i++) {
        try {
          await kioskService.uploadAvanceFoto(orden.id, archivosLocales[i])
        } catch (err) {
          fallidos.push(i)
        }
      }
      return { fallidos, totalIntento: archivosLocales.length }
    },
    onSuccess: async (res) => {
      // Limpiar previews de las exitosas; preservar las fallidas para retry.
      const fallidosSet = new Set(res.fallidos)
      const previewsAEliminar = previewsLocales.filter((_, i) => !fallidosSet.has(i))
      previewsAEliminar.forEach((url) => URL.revokeObjectURL(url))

      const nuevosArchivos = archivosLocales.filter((_, i) => fallidosSet.has(i))
      const nuevosPreviews = previewsLocales.filter((_, i) => fallidosSet.has(i))
      setArchivosLocales(nuevosArchivos)
      setPreviewsLocales(nuevosPreviews)

      // Refrescamos contador desde server
      const ref = await refetch()
      const fotosNuevasEnServer = (ref.data ?? []).filter((f) => f.estacion === orden.mi_estacion).length
      const exitosas = res.totalIntento - res.fallidos.length

      // Fix #5: el criterio para auto-completar es el SERVIDOR, no el frontend.
      // Si el operario ya cumple el mínimo (aunque hayan fallado algunas),
      // disparamos onCompleto. Antes se quedaba mostrando "X de Y fallaron"
      // y el operario tenía que borrar manualmente la fallida y volver a click.
      if (fotosNuevasEnServer >= fotosMinimas) {
        if (res.fallidos.length > 0) {
          toast.success(`${exitosas} subidas (ya cumplís el mínimo de ${fotosMinimas})`)
        } else {
          toast.success(`${res.totalIntento} ${res.totalIntento === 1 ? 'foto subida' : 'fotos subidas'}`)
        }
        onCompleto()
        return
      }

      // No alcanzamos el mínimo: mostrar resultado para que retoque y reintente
      if (res.fallidos.length === 0) {
        toast.success(`${res.totalIntento} ${res.totalIntento === 1 ? 'foto subida' : 'fotos subidas'}`)
      } else if (res.fallidos.length === res.totalIntento) {
        toast.error('No se pudo subir ninguna foto. Verificá la conexión y reintentá.')
      } else {
        toast.error(`${res.fallidos.length} de ${res.totalIntento} fallaron. Tocá "Subir" para reintentar.`)
      }
    },
    onError: (err: any) => {
      toast.error('Error: ' + (err?.message || 'desconocido'))
    },
  })

  // Cleanup de object URLs al desmontar (Fix #1: lee de la ref para tener
  // siempre la lista actual, no el snapshot inicial vacío).
  useEffect(() => {
    return () => {
      previewsLocalesRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const agregarFoto = (f: File | null) => {
    if (!f) return
    // Defensa: no exceder el mínimo configurado. El botón debería estar oculto
    // cuando ya se alcanzó, pero por las dudas.
    if (totalProyectado >= fotosMinimas) return
    setArchivosLocales((prev) => [...prev, f])
    setPreviewsLocales((prev) => [...prev, URL.createObjectURL(f)])
    // Limpiar el value del input para que el mismo file pueda re-seleccionarse
    if (inputRef.current) inputRef.current.value = ''
  }

  const eliminarFotoLocal = (idx: number) => {
    URL.revokeObjectURL(previewsLocales[idx])
    setArchivosLocales((prev) => prev.filter((_, i) => i !== idx))
    setPreviewsLocales((prev) => prev.filter((_, i) => i !== idx))
  }

  // Cerrar con confirm si hay fotos sin subir
  const handleClose = () => {
    if (submit.isPending) return
    if (archivosLocales.length > 0) {
      const sigue = window.confirm(
        `Tenés ${archivosLocales.length} ${archivosLocales.length === 1 ? 'foto sin subir' : 'fotos sin subir'}. ¿Salir y perderlas?`
      )
      if (!sigue) return
    }
    onClose()
  }

  const handleSubmit = () => {
    // Si ya cumple con fotos del server y no hay locales nuevas, completar directo
    if (archivosLocales.length === 0 && subidasEnServer >= fotosMinimas) {
      onCompleto()
      return
    }
    submit.mutate()
  }

  // Texto del botón principal
  const labelBoton = (() => {
    if (submit.isPending) return 'Subiendo…'
    if (archivosLocales.length === 0 && subidasEnServer >= fotosMinimas) return 'Completar proceso'
    const total = archivosLocales.length
    return `Subir ${total === 1 ? '1 foto' : `las ${total}`} y completar`
  })()

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-[70]" onClick={handleClose}>
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] rounded-t-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Camera size={20} className={cumpleMinimo ? 'text-emerald-600' : 'text-amber-600'} />
            <h2 className="text-lg font-bold text-forest-700">Fotos de avance</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50"
            disabled={submit.isPending}
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Info de la orden + barra de progreso */}
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
          <div className="text-xs text-amber-700 font-semibold uppercase tracking-wide">
            {orden.numero_orden} · {orden.mi_estacion.replace('_', ' ')}
          </div>
          <div className="text-sm text-amber-900 font-medium mt-0.5 truncate">
            {orden.numero_item}
          </div>
          {/* Progress visual: dots (verde=server, ámbar=local, gris=falta) */}
          <div className="flex items-center gap-1.5 mt-2">
            {Array.from({ length: Math.max(fotosMinimas, totalProyectado) }).map((_, i) => {
              const enServer = i < subidasEnServer
              const enLocal  = !enServer && i < totalProyectado
              return (
                <div
                  key={i}
                  className={clsx(
                    'h-1.5 flex-1 rounded-full transition-colors',
                    enServer ? 'bg-emerald-500' : enLocal ? 'bg-amber-500' : 'bg-amber-200'
                  )}
                />
              )
            })}
            <span className="text-xs font-bold text-amber-800 ml-2 tabular-nums">
              {totalProyectado}/{fotosMinimas}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Mensaje guía */}
          <p className="text-sm text-gray-600">
            {subidasEnServer > 0 && archivosLocales.length === 0 && (
              <>Ya tenés <strong>{subidasEnServer}</strong> {subidasEnServer === 1 ? 'foto subida' : 'fotos subidas'} de antes. </>
            )}
            {!cumpleMinimo && (
              <>Sacale <strong>{fotosMinimas - totalProyectado}</strong> {fotosMinimas - totalProyectado === 1 ? 'foto más' : 'fotos más'} al trabajo terminado.</>
            )}
            {cumpleMinimo && archivosLocales.length > 0 && (
              <>Tenés las <strong>{fotosMinimas}</strong> fotos. Tocá "Subir" para enviar y completar.</>
            )}
            {cumpleMinimo && archivosLocales.length === 0 && (
              <>Tenés todas las fotos. Tocá "Completar proceso" para terminar.</>
            )}
          </p>

          {/* Grid de thumbnails (fotos locales) */}
          {archivosLocales.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {previewsLocales.map((url, idx) => (
                <div
                  key={idx}
                  className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200"
                >
                  <img src={url} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                    {subidasEnServer + idx + 1}
                  </span>
                  <button
                    onClick={() => eliminarFotoLocal(idx)}
                    className="absolute top-1 right-1 p-1.5 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md disabled:opacity-50"
                    aria-label="Eliminar foto"
                    disabled={submit.isPending}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Botón "Sacar foto" — solo cuando falta llegar al mínimo.
              Una vez alcanzadas las 3, desaparece. Si el operario quiere
              cambiar alguna, primero borra de la grid (X rojo) y vuelve a sacar. */}
          {!submit.isPending && puedeAgregarMas && (
            <button
              onClick={() => inputRef.current?.click()}
              className={clsx(
                'w-full rounded-2xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-1.5',
                archivosLocales.length === 0
                  ? 'py-6 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200'
                  : 'py-4 border-gray-300 bg-gray-50 hover:bg-gray-100 active:bg-gray-200'
              )}
            >
              <ImagePlus
                size={archivosLocales.length === 0 ? 32 : 22}
                className={archivosLocales.length === 0 ? 'text-emerald-600' : 'text-gray-600'}
              />
              <span className={clsx(
                'font-bold',
                archivosLocales.length === 0 ? 'text-emerald-700' : 'text-gray-700 text-sm'
              )}>
                {archivosLocales.length === 0
                  ? 'Abrir cámara'
                  : `Sacar foto ${totalProyectado + 1} de ${fotosMinimas}`}
              </span>
              {archivosLocales.length === 0 && (
                <span className="text-emerald-600 text-xs">o elegir desde galería</span>
              )}
            </button>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => agregarFoto(e.target.files?.[0] ?? null)}
          />
        </div>

        {/* Footer botones */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button
            onClick={handleClose}
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold disabled:opacity-50"
            disabled={submit.isPending}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!cumpleMinimo || submit.isPending}
            className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {submit.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {labelBoton}
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                {labelBoton}
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
