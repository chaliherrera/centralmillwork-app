// TopMateriales — tab "Top Materiales" dentro de /mtos (2026-08-22).
// Ranking agregado por descripcion normalizada. Toggle de orden y filtros
// compartidos con /buscar. Excluye OCs canceladas.
//
// Cada fila abre el modal de evolución de precio del mismo ítem — reusa
// EvolucionPrecioModal para consistencia visual con el buscador.

import { useState, useMemo } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  Filter, X, TrendingUp, Trophy, DollarSign, Repeat, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react'
import clsx from 'clsx'
import { preciosService, type OrdenRanking, type RankingsParams, type RankingMaterial } from '@/services/precios'
import EvolucionPrecioModal from './EvolucionPrecioModal'

const fmtMoney = (n: number | null | undefined) => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

const fmtMoneyShort = (n: number | null | undefined) => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}k`
  return fmtMoney(n)
}

const fmtDate = (s: string | null) => {
  if (!s) return '—'
  const [y, m, d] = s.slice(0, 10).split('-')
  return `${m}/${d}/${y}`
}

const fmtNum = (n: number | null | undefined) => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
}

const ORDENES: { key: OrdenRanking; label: string; icon: typeof Repeat; hint: string }[] = [
  { key: 'veces', label: 'Más comprados', icon: Repeat, hint: 'Ranking por # de compras' },
  { key: 'gasto', label: 'Más gastados', icon: DollarSign, hint: 'Ranking por $ total' },
  { key: 'precio_prom', label: 'Más caros', icon: Trophy, hint: 'Ranking por precio unitario promedio' },
]

const LIMITS = [25, 50, 100, 200] as const

export default function TopMateriales() {
  const [orden, setOrden] = useState<OrdenRanking>('veces')
  const [limit, setLimit] = useState<number>(50)
  const [vendor, setVendor] = useState('')
  const [categoria, setCategoria] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [showFilters, setShowFilters] = useState(true)

  const [evolucionOpen, setEvolucionOpen] = useState(false)
  const [evolucionDesc, setEvolucionDesc] = useState<string | null>(null)

  const { data: filtros } = useQuery({
    queryKey: ['precios-filtros'],
    queryFn: preciosService.getFiltros,
    staleTime: 5 * 60_000,
  })

  const params = useMemo<RankingsParams>(() => ({
    orden, limit,
    vendor: vendor || undefined,
    categoria: categoria || undefined,
    fecha_desde: fechaDesde || undefined,
    fecha_hasta: fechaHasta || undefined,
  }), [orden, limit, vendor, categoria, fechaDesde, fechaHasta])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['precios-rankings', params],
    queryFn: () => preciosService.getRankings(params),
    placeholderData: keepPreviousData,
  })

  const rankings = data?.rankings ?? []
  const anyFilterActive = !!(vendor || categoria || fechaDesde || fechaHasta)

  const clearFilters = () => {
    setVendor(''); setCategoria(''); setFechaDesde(''); setFechaHasta('')
  }

  const openEvolucion = (descripcion: string) => {
    setEvolucionDesc(descripcion)
    setEvolucionOpen(true)
  }

  // Barras horizontales — el máximo del set define el 100%
  const maxMetric = useMemo(() => {
    if (rankings.length === 0) return 0
    if (orden === 'veces') return Math.max(...rankings.map((r) => r.veces_comprado))
    if (orden === 'gasto') return Math.max(...rankings.map((r) => r.total_gastado))
    return Math.max(...rankings.map((r) => r.precio_promedio))
  }, [rankings, orden])

  const metricValue = (r: RankingMaterial) => {
    if (orden === 'veces') return r.veces_comprado
    if (orden === 'gasto') return r.total_gastado
    return r.precio_promedio
  }

  const metricLabel = (r: RankingMaterial) => {
    if (orden === 'veces') return `${r.veces_comprado} ${r.veces_comprado === 1 ? 'compra' : 'compras'}`
    if (orden === 'gasto') return fmtMoney(r.total_gastado)
    return fmtMoney(r.precio_promedio)
  }

  return (
    <div className="space-y-4">
      {/* Toggle de orden */}
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex items-center gap-2 flex-wrap">
          {ORDENES.map((o) => {
            const Icon = o.icon
            const isActive = orden === o.key
            return (
              <button
                key={o.key}
                onClick={() => setOrden(o.key)}
                className={clsx(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
                  isActive
                    ? 'bg-forest-700 text-white border-forest-700'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50',
                )}
                title={o.hint}
              >
                <Icon size={14} />
                {o.label}
              </button>
            )
          })}
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-600">
            <label>Top:</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="input text-xs py-1 px-2"
            >
              {LIMITS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Filter size={14} />
            <span>Filtros</span>
            {anyFilterActive && (
              <button
                onClick={clearFilters}
                className="text-xs font-medium text-red-600 hover:text-red-700 ml-2 inline-flex items-center gap-1"
              >
                <X size={11} /> Limpiar
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 sm:hidden"
          >
            {showFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showFilters ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>

        <div className={clsx('grid gap-3', showFilters ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'hidden sm:grid sm:grid-cols-2 lg:grid-cols-4')}>
          <select value={vendor} onChange={(e) => setVendor(e.target.value)} className="input text-sm">
            <option value="">Todos los vendors</option>
            {filtros?.vendors.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="input text-sm">
            <option value="">Todas las categorías</option>
            {filtros?.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex items-center gap-1 sm:col-span-2">
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="input text-sm flex-1"
              title="Fecha desde"
            />
            <span className="text-gray-400 text-xs">→</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="input text-sm flex-1"
              title="Fecha hasta"
            />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center gap-2">
            <Loader2 className="animate-spin text-forest-600" size={24} />
            <p className="text-sm text-gray-500">Calculando ranking…</p>
          </div>
        ) : rankings.length === 0 ? (
          <div className="py-16 text-center">
            <Trophy size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">
              {anyFilterActive ? 'No hay materiales que coincidan con los filtros.' : 'No hay compras registradas todavía.'}
            </p>
            {anyFilterActive && (
              <button onClick={clearFilters} className="text-xs text-forest-600 hover:text-forest-800 underline mt-2">
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="text-center px-3 py-2.5 font-semibold text-gray-600 w-12">#</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600 min-w-[240px]">Descripción</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600 w-56">Ranking</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600">Veces</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600">Total gastado</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600">Precio prom.</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600">Rango</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600">Cant. total</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Vendors</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Última compra</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600 w-10">Evol.</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r, idx) => {
                  const val = metricValue(r)
                  const pct = maxMetric > 0 ? (val / maxMetric) * 100 : 0
                  const isTop3 = idx < 3
                  return (
                    <tr key={r.descripcion + idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2 text-center">
                        <span className={clsx(
                          'inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold',
                          isTop3
                            ? idx === 0 ? 'bg-gold-500 text-white'
                              : idx === 1 ? 'bg-gray-400 text-white'
                              : 'bg-amber-700 text-white'
                            : 'bg-gray-100 text-gray-600',
                        )}>
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-800 max-w-[360px]">
                        <div className="truncate font-medium" title={r.descripcion}>{r.descripcion}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {r.material_codigo && (
                            <span className="text-[10px] font-mono text-gray-400">{r.material_codigo}</span>
                          )}
                          {r.categoria && (
                            <span className="text-[10px] text-gray-500 uppercase tracking-wide">{r.categoria}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-forest-500 h-full rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-500 tabular-nums w-16 text-right">{metricLabel(r)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-900">{r.veces_comprado}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-gold-700" title={fmtMoney(r.total_gastado)}>
                        {fmtMoneyShort(r.total_gastado)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-800">
                        {fmtMoney(r.precio_promedio)}
                      </td>
                      <td className="px-3 py-2 text-right text-[10px] text-gray-500 tabular-nums whitespace-nowrap">
                        {fmtMoney(r.precio_min)} – {fmtMoney(r.precio_max)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600 tabular-nums">
                        {fmtNum(r.cantidad_total)}{r.unidad ? <span className="text-gray-400 ml-0.5 text-[10px]">{r.unidad}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 cursor-help"
                          title={r.vendors.join(', ')}
                        >
                          {r.vendors_count}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(r.ultima_compra)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => openEvolucion(r.descripcion)}
                          className="p-1.5 text-gray-400 hover:text-forest-600 hover:bg-forest-50 rounded transition-colors"
                          title="Ver evolución de precio"
                        >
                          <TrendingUp size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {rankings.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
            <span>
              Top {rankings.length} materiales · agrupados por descripción normalizada
              {isFetching && <span className="text-gray-400 ml-2">actualizando…</span>}
            </span>
            <span className="italic">Excluye OCs canceladas</span>
          </div>
        )}
      </div>

      {/* Modal evolución (reutilizado) */}
      {evolucionDesc && (
        <EvolucionPrecioModal
          open={evolucionOpen}
          onClose={() => setEvolucionOpen(false)}
          descripcion={evolucionDesc}
        />
      )}
    </div>
  )
}
