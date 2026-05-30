import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, ArrowRight, Package, AlertCircle, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import { produccionService } from '@/services/produccion'
import type { EstadoItemDisponible, ItemDisponible } from '@/types/produccion'

// Colores por estado — alineados con la convención del módulo
const ESTADO_META: Record<EstadoItemDisponible, { label: string; bg: string; text: string; dot: string }> = {
  LISTO:     { label: 'Listo',     bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-500' },
  PARCIAL:   { label: 'Parcial',   bg: 'bg-yellow-50',   text: 'text-yellow-700',   dot: 'bg-yellow-500'  },
  ORDENADO:  { label: 'Ordenado',  bg: 'bg-purple-50',   text: 'text-purple-700',   dot: 'bg-purple-500'  },
  PENDIENTE: { label: 'Pendiente', bg: 'bg-red-50',      text: 'text-red-700',      dot: 'bg-red-500'     },
}

const ESTADO_ORDER: EstadoItemDisponible[] = ['LISTO', 'PARCIAL', 'ORDENADO', 'PENDIENTE']

export default function Disponibles() {
  const navigate = useNavigate()
  const [estados, setEstados] = useState<EstadoItemDisponible[]>([])
  const [soloListos, setSoloListos] = useState(false)

  // Filtros enviados al backend (vacío = todos)
  const filtros = useMemo(() => {
    if (soloListos) return { estados: ['LISTO' as const] }
    if (estados.length) return { estados }
    return undefined
  }, [estados, soloListos])

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['produccion-items-disponibles', filtros],
    queryFn:  () => produccionService.itemsDisponibles(filtros),
  })

  const items = data?.items ?? []
  const resumen = data?.resumen

  // Toggle de estado en el chip (multi-select)
  const toggleEstado = (e: EstadoItemDisponible) => {
    setSoloListos(false)
    setEstados((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e])
  }

  // Click en "Crear OP" → navega al form con proyecto + item pre-llenado
  const crearOp = (item: ItemDisponible) => {
    navigate(`/produccion/ordenes/nueva?proyecto_id=${item.proyecto_id}&numero_item=${item.item}`)
  }

  // Click en "Ver OP existente"
  const verOp = (opId: number) => navigate(`/produccion/ordenes/${opId}`)

  return (
    <div className="space-y-5">
      {/* Header + refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Items disponibles</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Qué se puede empezar a producir hoy, agregando todos los proyectos activos.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-ghost"
          title="Refrescar"
        >
          <RefreshCw size={14} className={clsx(isFetching && 'animate-spin')} />
          Refrescar
        </button>
      </div>

      {/* KPIs por estado — clickeables para filtrar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          label="Total"
          value={resumen?.total ?? 0}
          color="forest"
          active={!soloListos && estados.length === 0}
          onClick={() => { setSoloListos(false); setEstados([]) }}
        />
        {ESTADO_ORDER.map((e) => (
          <KpiCard
            key={e}
            label={ESTADO_META[e].label + 's'}
            value={
              e === 'LISTO'     ? (resumen?.listos     ?? 0)
              : e === 'PARCIAL' ? (resumen?.parciales  ?? 0)
              : e === 'ORDENADO'? (resumen?.ordenados  ?? 0)
              :                   (resumen?.pendientes ?? 0)
            }
            color={e === 'LISTO' ? 'emerald' : e === 'PARCIAL' ? 'yellow' : e === 'ORDENADO' ? 'purple' : 'red'}
            active={(soloListos && e === 'LISTO') || estados.includes(e)}
            onClick={() => toggleEstado(e)}
          />
        ))}
      </div>

      {/* Atajo: solo listos */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={soloListos}
            onChange={(e) => {
              setSoloListos(e.target.checked)
              if (e.target.checked) setEstados([])
            }}
            className="rounded text-gold-500 focus:ring-gold-500"
          />
          <span className="font-medium">Solo Listos</span>
          <span className="text-xs text-gray-500">— qué puedo empezar a producir HOY</span>
        </label>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">
              {soloListos || estados.length
                ? 'No hay items con los filtros aplicados.'
                : 'No hay items disponibles en proyectos activos.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="table-header">Proyecto</th>
                  <th className="table-header">Item</th>
                  <th className="table-header">Estado</th>
                  <th className="table-header">Materiales</th>
                  <th className="table-header text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const meta = ESTADO_META[it.estado]
                  const desglose: string[] = []
                  if (it.ordenados > 0)  desglose.push(`${it.ordenados} ord.`)
                  if (it.pendientes > 0) desglose.push(`${it.pendientes} pend.`)
                  return (
                    <tr key={`${it.proyecto_id}-${it.item}`} className="table-row">
                      <td className="table-cell">
                        <div className="font-mono text-xs text-gray-500">{it.proyecto_codigo}</div>
                        <div className="text-gray-900 truncate max-w-xs">{it.proyecto_nombre}</div>
                      </td>
                      <td className="table-cell font-mono font-semibold text-gray-900">{it.item}</td>
                      <td className="table-cell">
                        <span className={clsx('badge-status gap-1.5', meta.bg, meta.text)}>
                          <span className={clsx('w-1.5 h-1.5 rounded-full', meta.dot)} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="text-gray-900">
                          <span className="font-semibold">{it.disponibles}</span>
                          <span className="text-gray-400">/{it.total}</span>
                          <span className="text-gray-500 ml-1">listos</span>
                        </div>
                        {desglose.length > 0 && (
                          <div className="text-xs text-gray-500 mt-0.5">{desglose.join(' · ')}</div>
                        )}
                      </td>
                      <td className="table-cell text-right">
                        {it.op_existente ? (
                          <button
                            onClick={() => verOp(it.op_existente!.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded transition-colors"
                            title={`OP en estado ${it.op_existente.status}`}
                          >
                            <ArrowRight size={12} />
                            {it.op_existente.numero}
                          </button>
                        ) : it.estado === 'PENDIENTE' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <AlertCircle size={12} /> Faltan materiales
                          </span>
                        ) : (
                          <button
                            onClick={() => crearOp(it)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gold-700 bg-gold-50 hover:bg-gold-100 rounded transition-colors"
                          >
                            <Plus size={12} />
                            Crear OP
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer info */}
      <p className="text-xs text-gray-400">
        Los items se ordenan: Listos primero, después Parciales, Ordenados y Pendientes.
        Items sin OP activa muestran botón "Crear OP". Items con OP en curso linkean a la orden existente.
      </p>
    </div>
  )
}

// ─── KpiCard local ──────────────────────────────────────────────────────────
const COLOR_MAP: Record<string, { bg: string; text: string; ring: string }> = {
  forest:  { bg: 'bg-forest-50',   text: 'text-forest-700',   ring: 'ring-forest-400' },
  emerald: { bg: 'bg-emerald-50',  text: 'text-emerald-700',  ring: 'ring-emerald-400' },
  yellow:  { bg: 'bg-yellow-50',   text: 'text-yellow-700',   ring: 'ring-yellow-400' },
  purple:  { bg: 'bg-purple-50',   text: 'text-purple-700',   ring: 'ring-purple-400' },
  red:     { bg: 'bg-red-50',      text: 'text-red-700',      ring: 'ring-red-400' },
}

function KpiCard({ label, value, color, active, onClick }: {
  label: string; value: number; color: string; active: boolean; onClick: () => void
}) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.forest
  return (
    <button
      onClick={onClick}
      className={clsx(
        'kpi-card transition-all duration-150 cursor-pointer text-left',
        active ? `ring-2 ${c.ring}` : 'hover:shadow-md'
      )}
    >
      <div className={clsx('p-2.5 rounded-lg shrink-0', c.bg)}>
        <Package size={20} className={c.text} />
      </div>
      <div>
        <p className="kpi-label">{label}</p>
        <p className={clsx('kpi-value', c.text)}>{value}</p>
      </div>
    </button>
  )
}
