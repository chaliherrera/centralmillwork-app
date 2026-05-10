import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Users, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { produccionService } from '@/services/produccion'
import type { EstacionConStatus } from '@/types/produccion'

/**
 * Mapa del taller — read-only.
 * Renderiza un grid 4x4 usando posicion_x / posicion_y de estaciones_config.
 * Cada celda muestra: nombre, ordenes activas, personal asignado.
 */
export default function MapaTaller() {
  const { data: estaciones = [], isLoading } = useQuery({
    queryKey: ['estaciones'],
    queryFn:  produccionService.estaciones,
    refetchInterval: 30_000,
  })

  // Personal activo (clocked-in) — para mostrar en el mapa quién está trabajando ahora
  const { data: kpis } = useQuery({
    queryKey: ['ordenes-produccion-kpis'],
    queryFn:  produccionService.ordenesKpis,
    refetchInterval: 30_000,
  })

  // Indexar por (x, y) para render del grid
  const matriz = useMemo(() => {
    const m: Record<string, EstacionConStatus> = {}
    for (const e of estaciones) {
      if (e.posicion_x != null && e.posicion_y != null) {
        m[`${e.posicion_x},${e.posicion_y}`] = e
      }
    }
    return m
  }, [estaciones])

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  }

  // Dimensiones del grid (calcular max x, max y)
  const maxX = Math.max(1, ...estaciones.map((e) => e.posicion_x ?? 0))
  const maxY = Math.max(1, ...estaciones.map((e) => e.posicion_y ?? 0))

  return (
    <div className="space-y-4">
      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Órdenes activas"  value={kpis?.activas         ?? '—'} />
        <Kpi label="Completadas hoy"  value={kpis?.completadas_hoy ?? '—'} />
        <Kpi label="Pausadas"         value={kpis?.pausadas        ?? '—'} />
        <Kpi label="Vencidas"         value={kpis?.vencidas        ?? '—'} alert={(kpis?.vencidas ?? 0) > 0} />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3>Mapa del taller</h3>
          <div className="flex items-center gap-3 text-xs">
            <Legend color="bg-emerald-500" label="Activa" />
            <Legend color="bg-amber-400"   label="Bottleneck" />
            <Legend color="bg-gray-200"    label="Sin órdenes" />
          </div>
        </div>

        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${maxX}, minmax(0, 1fr))`,
            gridTemplateRows:    `repeat(${maxY}, minmax(120px, 1fr))`,
          }}
        >
          {Array.from({ length: maxY }).map((_, y) =>
            Array.from({ length: maxX }).map((_, x) => {
              const est = matriz[`${x + 1},${y + 1}`]
              return est ? (
                <EstacionCell key={`${x}-${y}`} est={est} />
              ) : (
                <div key={`${x}-${y}`} className="rounded-xl border-2 border-dashed border-gray-100" />
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function EstacionCell({ est }: { est: EstacionConStatus }) {
  const ordenesActivas = Number(est.ordenes_activas)
  const sobreCarga = est.capacidad_max != null && ordenesActivas > est.capacidad_max
  const vacia = ordenesActivas === 0

  const borderColor = sobreCarga ? 'border-amber-400 bg-amber-50'
    : vacia                       ? 'border-gray-200 bg-white'
                                  : 'border-emerald-300 bg-emerald-50'

  return (
    <Link
      to={`/produccion/ordenes?estacion=${est.nombre}`}
      className={clsx(
        'rounded-xl border-2 p-3 hover:shadow-md transition-all flex flex-col gap-2',
        borderColor
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-bold text-sm uppercase text-forest-700">
          {est.nombre.replace('_', ' ')}
        </div>
        {sobreCarga && <AlertTriangle size={14} className="text-amber-600 shrink-0" />}
      </div>

      <div className="flex items-baseline gap-1">
        <span className={clsx(
          'text-3xl font-bold tabular-nums',
          vacia ? 'text-gray-300' : sobreCarga ? 'text-amber-700' : 'text-emerald-700'
        )}>
          {ordenesActivas}
        </span>
        <span className="text-xs text-gray-500">
          / {est.capacidad_max ?? '∞'} órdenes
        </span>
      </div>

      <div className="flex items-center gap-1 mt-auto flex-wrap">
        <Users size={11} className="text-gray-400" />
        {est.personal.length === 0 ? (
          <span className="text-[11px] text-gray-400 italic">Sin personal</span>
        ) : (
          est.personal.map((p) => (
            <span
              key={p.personal_id}
              className={clsx(
                'inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold',
                p.es_estacion_principal
                  ? 'bg-forest-700 text-white'
                  : 'bg-gray-200 text-gray-700'
              )}
              title={p.nombre_completo}
            >
              {p.iniciales}
            </span>
          ))
        )}
      </div>
    </Link>
  )
}

function Kpi({ label, value, alert }: { label: string; value: number | string; alert?: boolean }) {
  return (
    <div className="kpi-card">
      <div>
        <div className="kpi-label">{label}</div>
        <div className={clsx('kpi-value', alert ? 'text-red-700' : 'text-forest-700')}>{value}</div>
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-500">
      <span className={clsx('w-3 h-3 rounded-sm', color)} />
      {label}
    </span>
  )
}
