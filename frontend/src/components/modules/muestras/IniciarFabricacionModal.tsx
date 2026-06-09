// ─────────────────────────────────────────────────────────────────────────────
// Modal "Iniciar fabricación" — F3 Muestras (2026-06-09)
// ─────────────────────────────────────────────────────────────────────────────
// Reemplaza el click directo "Pasar a En fabricación". Pre-llena la ruta
// según muestras.tipo (PUERTA / HARDWARE / CABINET / ACABADO / OTRO) y
// permite editar antes de confirmar.
//
// Acciones por proceso:
//  - Reordenar (↑/↓ visual)
//  - Editar tiempo estimado (minutos)
//  - Eliminar
//  - Agregar nuevo (botón + estación dropdown)
//
// Al confirmar → POST /api/muestras/:id/iniciar-fabricacion crea OP +
// procesos + transiciona muestra a EN_FABRICACION en una transacción.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2, Plus, X, ArrowUp, ArrowDown, Wrench } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { muestrasService, type ProcesoInput } from '@/services/muestras'

// Lista de estaciones — coincide con estaciones_config.activa=true en prod.
// El backend valida server-side contra la BD; este array sólo alimenta el
// dropdown del UI.
const ESTACIONES_DISPONIBLES = [
  'cnc',
  'edge_banding',
  'lamina',
  'pintura',
  'assembly',
  'final',
  'registro',
  'shipping',
] as const

interface Props {
  open: boolean
  onClose: () => void
  muestraId: number
  muestraCodigo: string
  muestraTipo: string
}

interface ProcesoRow {
  estacion: string
  tiempo_estimado_minutos: number | null
}

export default function IniciarFabricacionModal({ open, onClose, muestraId, muestraCodigo, muestraTipo }: Props) {
  const qc = useQueryClient()
  const [procesos, setProcesos] = useState<ProcesoRow[]>([])
  const [notas, setNotas] = useState('')
  const [nuevaEstacion, setNuevaEstacion] = useState<string>(ESTACIONES_DISPONIBLES[0])

  // Defaults según tipo
  const { data: defaults, isLoading: loadingDefaults } = useQuery({
    queryKey: ['muestra-procesos-default', muestraId],
    queryFn:  () => muestrasService.procesosDefault(muestraId),
    enabled:  open,
    staleTime: 5 * 60_000,
  })

  // Cargar defaults al abrir (reset al cerrar)
  useEffect(() => {
    if (!open) return
    if (defaults?.procesos.length) {
      setProcesos(defaults.procesos.map((p) => ({
        estacion: p.estacion,
        tiempo_estimado_minutos: p.tiempo_estimado_minutos,
      })))
    } else {
      setProcesos([])
    }
    setNotas('')
  }, [open, defaults])

  const tiempoTotal = useMemo(
    () => procesos.reduce((sum, p) => sum + (p.tiempo_estimado_minutos ?? 0), 0),
    [procesos]
  )

  const moverArriba = (i: number) => {
    if (i === 0) return
    setProcesos((prev) => {
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  }
  const moverAbajo = (i: number) => {
    setProcesos((prev) => {
      if (i >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
      return next
    })
  }
  const eliminar = (i: number) => {
    setProcesos((prev) => prev.filter((_, idx) => idx !== i))
  }
  const editarTiempo = (i: number, valor: string) => {
    const n = parseInt(valor)
    setProcesos((prev) => prev.map((p, idx) =>
      idx === i ? { ...p, tiempo_estimado_minutos: Number.isFinite(n) && n > 0 ? n : null } : p
    ))
  }
  const agregar = () => {
    setProcesos((prev) => [...prev, { estacion: nuevaEstacion, tiempo_estimado_minutos: 60 }])
  }

  const mutation = useMutation({
    mutationFn: () => {
      const body: { procesos: ProcesoInput[]; notas?: string | null } = {
        procesos: procesos.map((p) => ({
          estacion: p.estacion,
          tiempo_estimado_minutos: p.tiempo_estimado_minutos,
        })),
        notas: notas.trim() ? notas.trim() : null,
      }
      return muestrasService.iniciarFabricacion(muestraId, body)
    },
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['muestra', muestraId] })
      qc.invalidateQueries({ queryKey: ['muestras'] })
      qc.invalidateQueries({ queryKey: ['ordenes-produccion'] })
      qc.invalidateQueries({ queryKey: ['muestras-kpis'] })
      onClose()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? err?.response?.data?.error ?? 'Error al iniciar fabricación'
      toast.error(msg)
    },
  })

  const canConfirm = procesos.length > 0 && !mutation.isPending

  return (
    <Modal open={open} onClose={onClose} title={`Iniciar fabricación · ${muestraCodigo}`} size="lg">
      {loadingDefaults ? (
        <div className="py-10 flex justify-center text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Cargando defaults...
        </div>
      ) : (
        <div className="space-y-5">
          <div className="bg-forest-50 border border-forest-200 rounded-lg px-4 py-3 text-sm text-forest-800">
            <div className="font-medium mb-1">Tipo: <span className="uppercase">{muestraTipo}</span></div>
            <p className="text-xs leading-snug">
              Ruta de procesos sugerida según el tipo de muestra. Editá lo que haga falta y confirmá —
              se va a crear la orden de producción con estos procesos y la muestra pasa a <strong>EN FABRICACIÓN</strong>.
            </p>
          </div>

          {/* Lista de procesos */}
          <div>
            <label className="label">Procesos (orden = secuencia)</label>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {procesos.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">
                  <Wrench size={20} className="mx-auto mb-2 opacity-40" />
                  No hay procesos. Agregá al menos uno abajo.
                </div>
              ) : (
                procesos.map((p, i) => (
                  <div key={i} className="px-3 py-2.5 flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400 w-6 text-right">{i + 1}.</span>
                    <select
                      value={p.estacion}
                      onChange={(e) => {
                        const v = e.target.value
                        setProcesos((prev) => prev.map((x, idx) => idx === i ? { ...x, estacion: v } : x))
                      }}
                      className="input text-sm flex-1"
                    >
                      {ESTACIONES_DISPONIBLES.map((est) => (
                        <option key={est} value={est}>{est}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={p.tiempo_estimado_minutos ?? ''}
                      onChange={(e) => editarTiempo(i, e.target.value)}
                      className="input text-sm w-20"
                      placeholder="min"
                    />
                    <span className="text-xs text-gray-400 w-8">min</span>
                    <button
                      onClick={() => moverArriba(i)}
                      disabled={i === 0}
                      className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                      title="Mover arriba"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={() => moverAbajo(i)}
                      disabled={i === procesos.length - 1}
                      className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                      title="Mover abajo"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      onClick={() => eliminar(i)}
                      className="p-1 text-red-400 hover:text-red-600"
                      title="Eliminar"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Agregar proceso */}
          <div className="flex items-center gap-2">
            <select
              value={nuevaEstacion}
              onChange={(e) => setNuevaEstacion(e.target.value)}
              className="input text-sm w-44"
            >
              {ESTACIONES_DISPONIBLES.map((est) => (
                <option key={est} value={est}>{est}</option>
              ))}
            </select>
            <button onClick={agregar} className="btn-ghost flex items-center gap-1 text-sm">
              <Plus size={14} /> Agregar proceso
            </button>
            <div className="ml-auto text-xs text-gray-500">
              Total estimado: <strong>{tiempoTotal} min</strong> ({(tiempoTotal / 60).toFixed(1)} h)
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="label">Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className="input text-sm w-full"
              placeholder="Observaciones para el operario (especificaciones, advertencias, etc)"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button onClick={onClose} className="btn-ghost" disabled={mutation.isPending}>Cancelar</button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!canConfirm}
              className="btn-primary flex items-center gap-2"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Creando OP...
                </>
              ) : (
                <>
                  <Wrench size={15} /> Iniciar fabricación
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
