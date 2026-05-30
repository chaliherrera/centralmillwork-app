import { useState } from 'react'
import {
  Wrench, Play, StopCircle, Loader2, Search, X, ChevronRight,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { kioskService } from '@/services/kiosk'
import { useKioskAuth } from '@/context/KioskAuthContext'
import type { KioskProyectoDisponible } from '@/types/kiosk'

const ESTACIONES = [
  'cnc', 'edge_banding', 'lamina', 'pintura',
  'final', 'assembly', 'registro', 'shipping',
]

/**
 * "Otro trabajo" — entry card secundaria + modal selector.
 *
 * Reemplaza el viejo "Iniciar trabajo en proyecto" como hero card.
 * Filosofía nueva: el trabajo PRINCIPAL del operario son sus asignaciones.
 * Este card cubre el ~20% no estructurado:
 *   - Prep antes de empezar un item
 *   - Espera de material
 *   - Ayuda a otro carpintero
 *   - Mantenimiento de máquina
 *   - Capacitación
 *
 * Tres estados visuales:
 *  - Sin clock-in: oculto (no aporta)
 *  - Clockeado, sin proyecto activo o con item (orden_produccion_id != null):
 *      → muestra el link discreto "¿Trabajando en algo no asignado? Registrar"
 *  - Clockeado, en "Otro trabajo" (proyecto_activo con orden_produccion_id = null):
 *      → muestra el card activo con código de proyecto + estación + Finalizar
 *
 * Nunca muestra timer corriendo — esa info ahora vive en el Mapa del SHOP_MANAGER.
 */
export default function OtroTrabajo() {
  const { status, refresh } = useKioskAuth()
  const qc = useQueryClient()
  const [showSelector, setShowSelector] = useState(false)

  const tieneClockIn = !!status?.registro_activo
  const proyecto    = status?.proyecto_activo
  // Sólo consideramos "Otro trabajo" si el proyecto activo NO está linkeado
  // a un item de producción (los items se manejan desde Asignaciones).
  const esOtroTrabajo = !!proyecto && !proyecto.orden_produccion_id

  const finalizar = useMutation({
    mutationFn: () => kioskService.finalizarProyecto(),
    onSuccess: () => {
      toast.success('Otro trabajo finalizado')
      refresh()
      qc.invalidateQueries({ queryKey: ['kiosk', 'dia'] })
    },
  })

  // Sin clock-in: ocultar
  if (!tieneClockIn) return null

  // Modo activo: hay un "Otro trabajo" en curso
  if (esOtroTrabajo && proyecto) {
    return (
      <div className="bg-white rounded-2xl border-2 border-gold-300 p-4 shadow-sm flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gold-50 flex items-center justify-center shrink-0">
          <Wrench size={22} className="text-gold-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-gold-600 font-semibold">Otro trabajo</div>
          <div className="font-bold text-forest-700 truncate">
            {proyecto.proyecto_codigo}
          </div>
          <div className="text-xs text-gray-500 truncate">
            <span className="uppercase">{proyecto.estacion.replace('_', ' ')}</span>
            {' · '}{proyecto.proyecto_nombre}
          </div>
        </div>
        <button
          onClick={() => finalizar.mutate()}
          disabled={finalizar.isPending}
          className="px-3 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
        >
          {finalizar.isPending ? <Loader2 size={14} className="animate-spin" /> : <StopCircle size={14} />}
          Finalizar
        </button>
      </div>
    )
  }

  // Modo idle: link discreto para registrar "otro trabajo"
  return (
    <>
      <button
        type="button"
        onClick={() => setShowSelector(true)}
        className="group w-full bg-gray-50 hover:bg-gold-50 rounded-xl border border-dashed border-gray-300 hover:border-gold-300 p-3 flex items-center gap-3 text-left transition-colors"
      >
        <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
          <Wrench size={16} className="text-gray-500 group-hover:text-gold-600" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-700">¿Trabajando en algo no asignado?</div>
          <div className="text-xs text-gray-500">Registrá prep, espera de material, ayuda, mantenimiento…</div>
        </div>
        <ChevronRight size={16} className="text-gray-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
      </button>
      {showSelector && <Selector onClose={() => setShowSelector(false)} />}
    </>
  )
}

// ─── Modal de selección (idéntico al de antes, ahora más discreto) ──────────
function Selector({ onClose }: { onClose: () => void }) {
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
      toast.success('Otro trabajo registrado')
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-forest-700">Registrar otro trabajo</h2>
            <p className="text-xs text-gray-500 mt-0.5">Para tareas que no vienen de una asignación</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
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
            Empezar
          </button>
        </div>
      </div>
    </div>
  )
}
