import { useState } from 'react'
import { Briefcase, Play, StopCircle, Loader2, Search, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { kioskService } from '@/services/kiosk'
import { useKioskAuth } from '@/context/KioskAuthContext'
import Timer from './Timer'
import type { KioskProyectoDisponible } from '@/types/kiosk'

const ESTACIONES = [
  'cnc', 'edge_banding', 'lamina', 'pintura', 'boot_pintura',
  'final', 'assembly', 'packing', 'shipping',
]

export default function ProyectoActivo() {
  const { status, refresh } = useKioskAuth()
  const qc = useQueryClient()
  const [showSelector, setShowSelector] = useState(false)

  const finalizar = useMutation({
    mutationFn: () => kioskService.finalizarProyecto(),
    onSuccess: () => {
      toast.success('Proyecto finalizado')
      refresh()
      qc.invalidateQueries({ queryKey: ['kiosk', 'dia'] })
    },
  })

  const proyecto = status?.proyecto_activo
  const tieneClockIn = !!status?.registro_activo

  if (!tieneClockIn) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 opacity-60 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
            <Briefcase size={24} className="text-gray-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-500">Proyecto</h2>
            <p className="text-sm text-gray-400">Hacé clock-in primero</p>
          </div>
        </div>
      </div>
    )
  }

  if (!proyecto) {
    return (
      <>
        <div className="bg-white rounded-2xl border border-amber-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <Briefcase size={24} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-forest-700">Sin proyecto</h2>
              <p className="text-sm text-gray-500">Elegí en qué proyecto estás trabajando</p>
            </div>
          </div>
          <button
            onClick={() => setShowSelector(true)}
            className="w-full h-14 rounded-xl bg-gold-500 hover:bg-gold-600 text-white font-semibold flex items-center justify-center gap-2"
          >
            <Play size={18} />
            Iniciar trabajo en proyecto
          </button>
        </div>
        {showSelector && <ProyectoSelector onClose={() => setShowSelector(false)} />}
      </>
    )
  }

  // Proyecto activo
  return (
    <>
      <div className="bg-white rounded-2xl border border-gold-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-gold-50 flex items-center justify-center">
            <Briefcase size={24} className="text-gold-600" />
          </div>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-gray-500">Proyecto activo</div>
            <h2 className="text-lg font-bold text-forest-700">
              {proyecto.proyecto_codigo} — {proyecto.proyecto_nombre}
            </h2>
            <div className="text-sm text-gray-600 mt-0.5">
              Estación: <span className="font-medium uppercase">{proyecto.estacion}</span>
              {proyecto.orden_produccion_id && (
                <span className="ml-2 text-gray-500">· OP-{proyecto.orden_produccion_id}</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 uppercase tracking-wider">En este proyecto</div>
            <Timer startISO={proyecto.hora_inicio} className="text-xl font-bold text-gold-600 tabular-nums" />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowSelector(true)}
            className="flex-1 h-12 rounded-xl border-2 border-gold-300 text-gold-700 font-semibold hover:bg-gold-50"
          >
            Cambiar proyecto
          </button>
          <button
            onClick={() => finalizar.mutate()}
            disabled={finalizar.isPending}
            className="flex-1 h-12 rounded-xl bg-forest-600 hover:bg-forest-700 text-white font-semibold flex items-center justify-center gap-2"
          >
            {finalizar.isPending ? <Loader2 size={16} className="animate-spin" /> : <StopCircle size={18} />}
            Finalizar
          </button>
        </div>
      </div>
      {showSelector && <ProyectoSelector onClose={() => setShowSelector(false)} />}
    </>
  )
}

// ─── Modal de selección de proyecto + estación ──────────────────────────────
function ProyectoSelector({ onClose }: { onClose: () => void }) {
  const { refresh } = useKioskAuth()
  const qc = useQueryClient()
  const [search, setSearch]     = useState('')
  const [proyectoId, setProyId] = useState<number | null>(null)
  const [estacion, setEstacion] = useState<string>('')

  const { data: proyectos = [], isLoading } = useQuery({
    queryKey: ['kiosk', 'proyectos'],
    queryFn: kioskService.proyectosDisponibles,
    staleTime: 1000 * 60 * 5,
  })

  const filtered = proyectos.filter((p: KioskProyectoDisponible) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return p.codigo.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q)
  })

  const iniciar = useMutation({
    mutationFn: () => {
      if (!proyectoId || !estacion) throw new Error('Falta proyecto o estación')
      return kioskService.iniciarProyecto({ proyecto_id: proyectoId, estacion })
    },
    onSuccess: () => {
      toast.success('Trabajando en el proyecto')
      refresh()
      qc.invalidateQueries({ queryKey: ['kiosk', 'dia'] })
      onClose()
    },
  })

  const puedeIniciar = proyectoId !== null && estacion !== '' && !iniciar.isPending

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-xl font-bold text-forest-700">Elegí proyecto y estación</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Buscador de proyecto */}
          <div>
            <label className="label">Proyecto</label>
            <div className="relative mb-2">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por código o nombre…"
                className="input w-full pl-9 h-12 text-base"
              />
            </div>
            <div className="border border-gray-200 rounded-xl divide-y max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="px-4 py-8 text-center text-gray-500 flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> Cargando…
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500 text-sm">No hay proyectos</div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProyId(p.id)}
                    className={clsx(
                      'w-full px-4 py-3 text-left hover:bg-gold-50 transition-colors',
                      proyectoId === p.id && 'bg-gold-100 hover:bg-gold-100'
                    )}
                  >
                    <div className="font-semibold text-forest-700">{p.codigo}</div>
                    <div className="text-sm text-gray-600">{p.nombre}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Selector de estación */}
          <div>
            <label className="label">Estación</label>
            <div className="grid grid-cols-3 gap-2">
              {ESTACIONES.map((e) => (
                <button
                  key={e}
                  onClick={() => setEstacion(e)}
                  className={clsx(
                    'h-14 rounded-xl border-2 font-semibold uppercase text-sm transition-all',
                    estacion === e
                      ? 'border-gold-500 bg-gold-100 text-forest-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gold-300 hover:bg-gold-50'
                  )}
                >
                  {e.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 h-14 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={() => iniciar.mutate()}
            disabled={!puedeIniciar}
            className="flex-1 h-14 rounded-xl bg-gold-500 hover:bg-gold-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {iniciar.isPending ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
            Iniciar trabajo
          </button>
        </div>
      </div>
    </div>
  )
}
