// Página /mtos — Control operativo de MTOs (2026-07-14)
// Resuelve el problema real de PROCUREMENT: "proceso varios MTOs al día
// y pierdo el control sobre en qué parte del proceso está cada uno".
//
// 1 pantalla, 3 segundos de mirada, sabés qué tenés pendiente. Cards
// apiladas por MTO activo (proyecto+batch), con vendors adentro y
// contadores por estado. Se recarga solo cada 60s.

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { ExternalLink, CheckCircle2, Clock, DollarSign, ShoppingCart, Warehouse, Search, X } from 'lucide-react'
import clsx from 'clsx'
import { mtosService, type MtoActivo, type EstadoCotizMto } from '@/services/mtos'

// Categoría operativa de un MTO — usada para chips de filtro y alertas.
// - sin_cotizar: 100% en PENDIENTE (aún no se ha cotizado nada)
// - casi_terminado: >= 70% ya recibido (a punto de cerrarse)
// - en_proceso: el resto (mix de estados con al menos algo COTIZADO/ORDENADO)
type CategoriaMto = 'sin_cotizar' | 'en_proceso' | 'casi_terminado'

function categoriaMto(mto: MtoActivo): CategoriaMto {
  if (mto.total_materiales === 0) return 'en_proceso'
  if (mto.counts.PENDIENTE === mto.total_materiales) return 'sin_cotizar'
  const pctRecibido = mto.counts.RECIBIDO / mto.total_materiales
  if (pctRecibido >= 0.7) return 'casi_terminado'
  return 'en_proceso'
}

type FiltroEstado = 'todos' | CategoriaMto

const CHIPS: { key: FiltroEstado; label: string; emoji: string; activeClass: string }[] = [
  { key: 'todos',           label: 'Todos',           emoji: '📋', activeClass: 'bg-forest-700 text-white border-forest-700' },
  { key: 'sin_cotizar',     label: 'Sin cotizar',     emoji: '⚠',  activeClass: 'bg-amber-500 text-white border-amber-500' },
  { key: 'en_proceso',      label: 'En proceso',      emoji: '🔄', activeClass: 'bg-blue-500 text-white border-blue-500' },
  { key: 'casi_terminado',  label: 'Casi terminados', emoji: '🏁', activeClass: 'bg-emerald-500 text-white border-emerald-500' },
]

const ESTADOS: {
  key: EstadoCotizMto
  label: string
  chip: string
  icon: typeof Clock
}[] = [
  { key: 'PENDIENTE', label: 'Cotización',   chip: 'bg-amber-100 text-amber-800 border-amber-200',     icon: Clock },
  { key: 'COTIZADO',  label: 'Con Precio',   chip: 'bg-blue-100 text-blue-800 border-blue-200',        icon: DollarSign },
  { key: 'ORDENADO',  label: 'Ordenado',     chip: 'bg-purple-100 text-purple-800 border-purple-200',  icon: ShoppingCart },
  { key: 'RECIBIDO',  label: 'En el Taller', chip: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: Warehouse },
]

// Determina cuál es el estado dominante de un vendor (donde tiene más materiales)
function estadoDominante(vendorCounts: Record<EstadoCotizMto, number>): EstadoCotizMto {
  let dominante: EstadoCotizMto = 'PENDIENTE'
  let max = -1
  for (const key of ['PENDIENTE', 'COTIZADO', 'ORDENADO', 'RECIBIDO'] as EstadoCotizMto[]) {
    if (vendorCounts[key] > max) {
      max = vendorCounts[key]
      dominante = key
    }
  }
  return dominante
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${m}/${day}/${y}`
}

export default function Mtos() {
  const { data: mtos = [], isLoading } = useQuery({
    queryKey: ['mtos', 'activos'],
    queryFn: mtosService.getActivos,
    refetchInterval: 60_000, // auto-refresh cada 1 min
  })

  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos')
  const [search, setSearch] = useState('')

  // Contadores globales por categoría — se computan sobre el total (no filtrado)
  // para que los chips siempre muestren cuánto hay en cada bucket.
  const conteos = useMemo(() => {
    const c = { todos: 0, sin_cotizar: 0, en_proceso: 0, casi_terminado: 0 } as Record<FiltroEstado, number>
    for (const mto of mtos) {
      c.todos++
      c[categoriaMto(mto)]++
    }
    return c
  }, [mtos])

  // Lista filtrada — aplica chip de estado + búsqueda por texto (proyecto o vendor)
  const mtosFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    return mtos.filter((mto) => {
      if (filtroEstado !== 'todos' && categoriaMto(mto) !== filtroEstado) return false
      if (q) {
        const matchProyecto =
          mto.proyecto.codigo.toLowerCase().includes(q) ||
          mto.proyecto.nombre.toLowerCase().includes(q)
        const matchVendor = mto.vendors.some((v) => v.vendor.toLowerCase().includes(q))
        if (!matchProyecto && !matchVendor) return false
      }
      return true
    })
  }, [mtos, filtroEstado, search])

  const totalGlobal = conteos.todos
  const hayFiltroActivo = filtroEstado !== 'todos' || search.trim().length > 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-forest-900">Control de MTOs</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isLoading ? (
              'Cargando...'
            ) : (
              <span className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{totalGlobal} MTOs activos</span>
                {conteos.sin_cotizar > 0 && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-amber-700">⚠ {conteos.sin_cotizar} sin cotizar</span>
                  </>
                )}
                {conteos.en_proceso > 0 && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-blue-700">🔄 {conteos.en_proceso} en proceso</span>
                  </>
                )}
                {conteos.casi_terminado > 0 && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-emerald-700">🏁 {conteos.casi_terminado} casi terminado{conteos.casi_terminado > 1 ? 's' : ''}</span>
                  </>
                )}
              </span>
            )}
          </p>
        </div>
        <span className="text-xs text-gray-400 italic hidden sm:inline">Actualiza automáticamente cada minuto</span>
      </div>

      {/* Filtros: chips de estado + buscador */}
      {!isLoading && totalGlobal > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {/* Chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {CHIPS.map((chip) => {
              const count = conteos[chip.key]
              const isActive = filtroEstado === chip.key
              const isDisabled = count === 0 && chip.key !== 'todos'
              return (
                <button
                  key={chip.key}
                  onClick={() => setFiltroEstado(chip.key)}
                  disabled={isDisabled}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                    isActive
                      ? chip.activeClass
                      : isDisabled
                        ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50',
                  )}
                >
                  <span>{chip.emoji}</span>
                  <span>{chip.label}</span>
                  <span className={clsx(
                    'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums',
                    isActive ? 'bg-white/25' : 'bg-gray-100 text-gray-600',
                  )}>{count}</span>
                </button>
              )
            })}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md ml-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar proyecto o vendor..."
              className="input pl-9 pr-9 w-full text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty state — no hay MTOs activos en absoluto */}
      {!isLoading && totalGlobal === 0 && (
        <div className="card text-center py-16">
          <CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-3" />
          <h2 className="text-lg font-semibold text-gray-700">No hay MTOs pendientes</h2>
          <p className="text-sm text-gray-500 mt-1">Todos los materiales de proyectos activos ya están en el taller.</p>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty por filtro — hay MTOs pero el filtro los oculta */}
      {!isLoading && totalGlobal > 0 && mtosFiltrados.length === 0 && (
        <div className="card text-center py-12">
          <Search size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">Ningún MTO coincide con los filtros aplicados.</p>
          {hayFiltroActivo && (
            <button
              onClick={() => { setFiltroEstado('todos'); setSearch('') }}
              className="text-xs text-forest-600 hover:text-forest-800 underline mt-2"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Cards de MTOs */}
      <div className="space-y-3">
        {mtosFiltrados.map((mto) => (
          <MtoCard key={mto.batch_key} mto={mto} />
        ))}
      </div>
    </div>
  )
}

function MtoCard({ mto }: { mto: MtoActivo }) {
  const pctRecibido = mto.porcentaje_recibido
  const pctOrdenado = mto.total_materiales > 0
    ? Math.round(((mto.counts.RECIBIDO + mto.counts.ORDENADO) / mto.total_materiales) * 100)
    : 0
  const pctConPrecio = mto.total_materiales > 0
    ? Math.round(((mto.counts.RECIBIDO + mto.counts.ORDENADO + mto.counts.COTIZADO) / mto.total_materiales) * 100)
    : 0

  const isComplete = pctRecibido === 100
  const isStuck = mto.counts.PENDIENTE === mto.total_materiales // 100% sin cotizar

  return (
    <div className={clsx(
      'bg-white rounded-lg border shadow-sm p-4',
      isComplete ? 'border-emerald-200' : isStuck ? 'border-amber-300' : 'border-gray-200',
    )}>
      {/* Header con proyecto + link + info del MTO */}
      <div className="flex items-start justify-between mb-3 gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Link
              to={`/proyectos/${mto.proyecto.id}`}
              className="font-mono text-sm font-bold text-forest-700 hover:text-gold-600 flex items-center gap-1"
            >
              {mto.proyecto.codigo}
              <ExternalLink size={12} />
            </Link>
            <span className="text-sm text-gray-800 font-medium truncate">{mto.proyecto.nombre}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>Importado {fmtDate(mto.fecha_importacion)}</span>
            <span>·</span>
            <span>{mto.total_materiales} materiales</span>
            {mto.origen && mto.origen !== 'MTO' && (
              <>
                <span>·</span>
                <span className="uppercase font-semibold text-gray-600">{mto.origen}</span>
              </>
            )}
          </div>
        </div>

        {/* Alertas rápidas */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isStuck && (
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full font-medium border border-amber-300">
              ⚠ Sin cotizar
            </span>
          )}
          {isComplete && (
            <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full font-medium border border-emerald-300">
              ✓ 100% recibido
            </span>
          )}
        </div>
      </div>

      {/* Progress bar apilada — muestra el flujo completo visualmente */}
      <div className="mb-3">
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
          {mto.counts.RECIBIDO > 0 && (
            <div className="bg-emerald-500" style={{ width: `${(mto.counts.RECIBIDO / mto.total_materiales) * 100}%` }} />
          )}
          {mto.counts.ORDENADO > 0 && (
            <div className="bg-purple-500" style={{ width: `${(mto.counts.ORDENADO / mto.total_materiales) * 100}%` }} />
          )}
          {mto.counts.COTIZADO > 0 && (
            <div className="bg-blue-500" style={{ width: `${(mto.counts.COTIZADO / mto.total_materiales) * 100}%` }} />
          )}
          {mto.counts.PENDIENTE > 0 && (
            <div className="bg-amber-500" style={{ width: `${(mto.counts.PENDIENTE / mto.total_materiales) * 100}%` }} />
          )}
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 mt-1">
          <span>{pctRecibido}% en el taller</span>
          <span>{pctOrdenado}% ordenado o más</span>
          <span>{pctConPrecio}% con precio o más</span>
        </div>
      </div>

      {/* Grid de vendors — cada uno con su estado dominante y contadores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {mto.vendors.map((v) => {
          const estDom = estadoDominante(v.counts)
          const estMeta = ESTADOS.find((e) => e.key === estDom)!
          const Icon = estMeta.icon
          return (
            <div
              key={v.vendor}
              className={clsx('border rounded-md px-3 py-2 flex items-center justify-between gap-2', estMeta.chip)}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold truncate" title={v.vendor}>{v.vendor}</div>
                <div className="text-[10px] flex items-center gap-1 opacity-80">
                  <Icon size={10} />
                  <span>{estMeta.label}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {(['PENDIENTE', 'COTIZADO', 'ORDENADO', 'RECIBIDO'] as EstadoCotizMto[]).map((est) => {
                  if (v.counts[est] === 0) return null
                  return (
                    <span
                      key={est}
                      className="text-[10px] font-semibold bg-white/50 px-1.5 py-0.5 rounded"
                      title={ESTADOS.find((e) => e.key === est)?.label}
                    >
                      {v.counts[est]}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Contadores globales — chips debajo */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Total:</span>
        {(['PENDIENTE', 'COTIZADO', 'ORDENADO', 'RECIBIDO'] as EstadoCotizMto[]).map((est) => {
          const count = mto.counts[est]
          if (count === 0) return null
          const meta = ESTADOS.find((e) => e.key === est)!
          return (
            <span key={est} className={clsx('text-xs px-2 py-0.5 rounded-full border', meta.chip)}>
              {meta.label}: <span className="font-bold">{count}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
