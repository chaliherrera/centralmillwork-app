// PreciosBuscador — tab "Precios" dentro de /mtos (2026-08-21).
// Feature pedida por Chali: buscar precios pagados históricamente, con
// filtros combinables. Fuente = items_orden_compra (precio real de OC).
// Excluye OCs canceladas.
//
// Cada fila tiene botón 📈 que abre modal con evolución de precios del
// mismo ítem (LineChart por vendor) — a requerimiento, no auto.

import { useState, useMemo } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Search, X, Filter, ChevronDown, ChevronUp, TrendingUp,
  ExternalLink, DollarSign, Loader2, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react'
import clsx from 'clsx'
import { preciosService, type OrderByPrecios, type BuscarPreciosParams, type PrecioRow } from '@/services/precios'
import EvolucionPrecioModal from './EvolucionPrecioModal'

const fmtMoney = (n: number | string | null) => {
  if (n === null || n === undefined) return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)
}

const fmtDate = (s: string | null) => {
  if (!s) return '—'
  const [y, m, d] = s.slice(0, 10).split('-')
  return `${m}/${d}/${y}`
}

const PAGE_SIZE = 50

// Header de columna clickeable para ordenar
function SortHeader({
  label, orderKeyAsc, orderKeyDesc, current, onChange, align = 'left',
}: {
  label: string
  orderKeyAsc: OrderByPrecios
  orderKeyDesc: OrderByPrecios
  current: OrderByPrecios
  onChange: (v: OrderByPrecios) => void
  align?: 'left' | 'right'
}) {
  const isAsc = current === orderKeyAsc
  const isDesc = current === orderKeyDesc
  const next: OrderByPrecios = isDesc ? orderKeyAsc : orderKeyDesc
  return (
    <button
      onClick={() => onChange(next)}
      className={clsx(
        'inline-flex items-center gap-1 font-semibold text-gray-600 hover:text-forest-700',
        align === 'right' && 'justify-end w-full',
      )}
    >
      <span>{label}</span>
      {isAsc ? <ArrowUp size={10} /> : isDesc ? <ArrowDown size={10} /> : <ArrowUpDown size={10} className="opacity-40" />}
    </button>
  )
}

export default function PreciosBuscador() {
  const [search, setSearch] = useState('')
  const [vendor, setVendor] = useState('')
  const [categoria, setCategoria] = useState('')
  const [precioMin, setPrecioMin] = useState<string>('')
  const [precioMax, setPrecioMax] = useState<string>('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [orderBy, setOrderBy] = useState<OrderByPrecios>('fecha_desc')
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(true)

  const [evolucionOpen, setEvolucionOpen] = useState(false)
  const [evolucionRow, setEvolucionRow] = useState<PrecioRow | null>(null)

  // Filtros dropdown — se cargan una vez y quedan cacheados
  const { data: filtros } = useQuery({
    queryKey: ['precios-filtros'],
    queryFn: preciosService.getFiltros,
    staleTime: 5 * 60_000,
  })

  // Params activos — memo para que el queryKey sea estable
  const params = useMemo<BuscarPreciosParams>(() => ({
    search: search.trim() || undefined,
    vendor: vendor || undefined,
    categoria: categoria || undefined,
    precio_min: precioMin !== '' ? Number(precioMin) : undefined,
    precio_max: precioMax !== '' ? Number(precioMax) : undefined,
    fecha_desde: fechaDesde || undefined,
    fecha_hasta: fechaHasta || undefined,
    orderBy,
    page,
    limit: PAGE_SIZE,
  }), [search, vendor, categoria, precioMin, precioMax, fechaDesde, fechaHasta, orderBy, page])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['precios-buscar', params],
    queryFn: () => preciosService.buscar(params),
    placeholderData: keepPreviousData,
  })

  const rows = data?.data ?? []
  const total = data?.total ?? 0
  const resumen = data?.resumen
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const anyFilterActive = !!(search || vendor || categoria || precioMin || precioMax || fechaDesde || fechaHasta)

  const clearFilters = () => {
    setSearch(''); setVendor(''); setCategoria(''); setPrecioMin(''); setPrecioMax('')
    setFechaDesde(''); setFechaHasta(''); setPage(1)
  }

  // Al cambiar cualquier filtro, volvemos a página 1 (evita quedar en página vacía)
  const withReset = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1) }

  const openEvolucion = (r: PrecioRow) => {
    setEvolucionRow(r)
    setEvolucionOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Barra de filtros */}
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
          {/* Search */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Buscar en descripción…"
              value={search}
              onChange={(e) => withReset(setSearch)(e.target.value)}
              className="input pl-9 w-full text-sm"
            />
          </div>

          {/* Vendor */}
          <select
            value={vendor}
            onChange={(e) => withReset(setVendor)(e.target.value)}
            className="input text-sm"
          >
            <option value="">Todos los vendors</option>
            {filtros?.vendors.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>

          {/* Categoría */}
          <select
            value={categoria}
            onChange={(e) => withReset(setCategoria)(e.target.value)}
            className="input text-sm"
          >
            <option value="">Todas las categorías</option>
            {filtros?.categorias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Rango precio */}
          <div className="flex items-center gap-1">
            <div className="relative flex-1">
              <DollarSign size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="number"
                placeholder="Precio min"
                min={0}
                step="0.01"
                value={precioMin}
                onChange={(e) => withReset(setPrecioMin)(e.target.value)}
                className="input pl-6 text-sm w-full"
              />
            </div>
            <span className="text-gray-400 text-xs">–</span>
            <div className="relative flex-1">
              <DollarSign size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="number"
                placeholder="Precio max"
                min={0}
                step="0.01"
                value={precioMax}
                onChange={(e) => withReset(setPrecioMax)(e.target.value)}
                className="input pl-6 text-sm w-full"
              />
            </div>
          </div>

          {/* Rango fecha */}
          <div className="flex items-center gap-1 sm:col-span-2 lg:col-span-2">
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => withReset(setFechaDesde)(e.target.value)}
              className="input text-sm flex-1"
              title="Fecha desde"
            />
            <span className="text-gray-400 text-xs">→</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => withReset(setFechaHasta)(e.target.value)}
              className="input text-sm flex-1"
              title="Fecha hasta"
            />
          </div>
        </div>
      </div>

      {/* Resumen — solo si hay resultados */}
      {resumen && resumen.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ResumenBox label="Compras" value={resumen.total.toString()} />
          <ResumenBox label="Precio promedio" value={fmtMoney(resumen.precio_promedio)} color="text-forest-700" />
          <ResumenBox label="Rango" value={`${fmtMoney(resumen.precio_min)} — ${fmtMoney(resumen.precio_max)}`} small />
          <ResumenBox label="Total pagado" value={fmtMoney(resumen.subtotal_total)} color="text-gold-700" />
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center gap-2">
            <Loader2 className="animate-spin text-forest-600" size={24} />
            <p className="text-sm text-gray-500">Buscando precios…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <Search size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">
              {anyFilterActive ? 'No hay compras que coincidan con los filtros.' : 'No hay compras registradas todavía.'}
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
                  <th className="text-left px-3 py-2.5">
                    <SortHeader label="Descripción" orderKeyAsc="descripcion_asc" orderKeyDesc="descripcion_asc" current={orderBy} onChange={setOrderBy} />
                  </th>
                  <th className="text-left px-3 py-2.5">
                    <SortHeader label="Vendor" orderKeyAsc="vendor_asc" orderKeyDesc="vendor_asc" current={orderBy} onChange={setOrderBy} />
                  </th>
                  <th className="text-right px-3 py-2.5">
                    <SortHeader label="Precio unit." orderKeyAsc="precio_asc" orderKeyDesc="precio_desc" current={orderBy} onChange={setOrderBy} align="right" />
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600">Cant.</th>
                  <th className="text-left px-3 py-2.5">
                    <SortHeader label="Fecha OC" orderKeyAsc="fecha_asc" orderKeyDesc="fecha_desc" current={orderBy} onChange={setOrderBy} />
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600">OC</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Proyecto</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Categoría</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600 w-10">Evol.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.item_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-800 min-w-[240px] max-w-[360px]">
                      <div className="truncate" title={r.descripcion}>{r.descripcion}</div>
                      {r.material_codigo && (
                        <div className="text-[10px] font-mono text-gray-400 mt-0.5">{r.material_codigo}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700 truncate max-w-[150px]" title={r.vendor}>{r.vendor}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900 tabular-nums">
                      {fmtMoney(r.precio_unitario)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600 tabular-nums">
                      {r.cantidad !== null ? `${r.cantidad}${r.unidad ? ` ${r.unidad}` : ''}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(r.fecha_emision)}</td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/ordenes-compra/${r.oc_id}`}
                        className="text-forest-600 hover:text-gold-600 font-mono inline-flex items-center gap-1"
                      >
                        {r.oc_numero} <ExternalLink size={10} />
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {r.proyecto_id ? (
                        <Link
                          to={`/proyectos/${r.proyecto_id}`}
                          className="text-forest-600 hover:text-gold-600 font-mono inline-flex items-center gap-1"
                          title={r.proyecto_nombre ?? undefined}
                        >
                          {r.proyecto_codigo} <ExternalLink size={10} />
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600 truncate max-w-[110px]" title={r.categoria ?? ''}>
                      {r.categoria || '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => openEvolucion(r)}
                        className="p-1.5 text-gray-400 hover:text-forest-600 hover:bg-forest-50 rounded transition-colors"
                        title="Ver evolución de precio de este ítem"
                      >
                        <TrendingUp size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-600">
            <span>
              Página {page} de {totalPages} · {total} resultado{total === 1 ? '' : 's'}
              {isFetching && <span className="text-gray-400 ml-2">actualizando…</span>}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de evolución */}
      {evolucionRow && (
        <EvolucionPrecioModal
          open={evolucionOpen}
          onClose={() => setEvolucionOpen(false)}
          descripcion={evolucionRow.descripcion}
        />
      )}
    </div>
  )
}

function ResumenBox({ label, value, color = 'text-gray-900', small = false }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</div>
      <div className={clsx('font-bold tabular-nums', color, small ? 'text-sm' : 'text-lg')}>{value}</div>
    </div>
  )
}
