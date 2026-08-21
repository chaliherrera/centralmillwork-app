// EvolucionPrecioModal — muestra una serie histórica de precios de un ítem
// específico en modal, con LineChart (Recharts). Se carga on-demand cuando
// el usuario clickea el ícono de tendencia en una fila del buscador.

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Loader2, AlertCircle, ExternalLink } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { preciosService } from '@/services/precios'

interface Props {
  open: boolean
  onClose: () => void
  descripcion: string
  vendorFiltro?: string
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n)

const fmtDate = (s: string | null) => {
  if (!s) return '—'
  const [y, m, d] = s.slice(0, 10).split('-')
  return `${m}/${d}/${y}`
}

// Paleta para vendors distintos en el gráfico
const VENDOR_COLORS = ['#9B7200', '#2c3126', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#0ea5e9']

export default function EvolucionPrecioModal({ open, onClose, descripcion, vendorFiltro }: Props) {
  const enabled = open && !!descripcion
  const { data, isLoading, error } = useQuery({
    queryKey: ['precios-evolucion', descripcion, vendorFiltro || ''],
    queryFn: () => preciosService.getEvolucion(descripcion, vendorFiltro),
    enabled,
  })

  // Transformación para Recharts: 1 línea por vendor
  // Cada punto: { fecha, [vendor1]: precio, [vendor2]: precio, ... }
  const chartData = useMemo(() => {
    if (!data?.puntos.length) return []

    // Agrupamos por fecha; si hay varias compras el mismo día al mismo vendor
    // tomamos la última (mejor UX que promediar)
    const map = new Map<string, Record<string, string | number>>()
    for (const p of data.puntos) {
      const dateKey = p.fecha.slice(0, 10)
      if (!map.has(dateKey)) map.set(dateKey, { fecha: dateKey })
      map.get(dateKey)![p.vendor] = p.precio
    }
    return Array.from(map.values()).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  }, [data])

  const stats = useMemo(() => {
    if (!data?.puntos.length) return null
    const precios = data.puntos.map((p) => p.precio)
    return {
      total: precios.length,
      min: Math.min(...precios),
      max: Math.max(...precios),
      avg: precios.reduce((s, n) => s + n, 0) / precios.length,
      first: data.puntos[0].precio,
      last: data.puntos[data.puntos.length - 1].precio,
    }
  }, [data])

  const trendPct = stats ? ((stats.last - stats.first) / stats.first) * 100 : 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Evolución de precio — ${descripcion.slice(0, 60)}${descripcion.length > 60 ? '…' : ''}`}
      size="xl"
    >
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="animate-spin text-forest-600" size={32} />
          <p className="text-sm text-gray-500">Buscando compras históricas…</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>No se pudo cargar el historial de precios.</span>
        </div>
      )}

      {!isLoading && !error && data && data.puntos.length === 0 && (
        <div className="text-center py-12 text-sm text-gray-500">
          No hay otras compras con esta descripción.
        </div>
      )}

      {!isLoading && !error && data && data.puntos.length > 0 && stats && (
        <div className="space-y-5">
          {/* KPIs arriba */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox label="Compras" value={stats.total.toString()} />
            <StatBox label="Precio mín" value={fmtMoney(stats.min)} color="text-emerald-700" />
            <StatBox label="Precio máx" value={fmtMoney(stats.max)} color="text-red-700" />
            <StatBox
              label="Tendencia"
              value={`${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(1)}%`}
              color={trendPct >= 0 ? 'text-red-700' : 'text-emerald-700'}
              hint={`${fmtMoney(stats.first)} → ${fmtMoney(stats.last)}`}
            />
          </div>

          {/* Gráfico */}
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="fecha"
                    tick={{ fontSize: 11 }}
                    tickFormatter={fmtDate}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
                  />
                  <Tooltip
                    formatter={(value: number) => fmtMoney(value)}
                    labelFormatter={(label: string) => fmtDate(label)}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {data.vendors.map((v, i) => (
                    <Line
                      key={v}
                      type="monotone"
                      dataKey={v}
                      stroke={VENDOR_COLORS[i % VENDOR_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Lista detallada */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Detalle de las {data.puntos.length} compras
            </h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Fecha</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Vendor</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Precio unit.</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Cant.</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">OC</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Proyecto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.puntos.map((p, i) => (
                    <tr key={`${p.oc_id}-${i}`} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700">{fmtDate(p.fecha)}</td>
                      <td className="px-3 py-2 text-gray-700 truncate max-w-[140px]" title={p.vendor}>{p.vendor}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900">{fmtMoney(p.precio)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {p.cantidad !== null ? `${p.cantidad}${p.unidad ? ` ${p.unidad}` : ''}` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          to={`/ordenes-compra/${p.oc_id}`}
                          className="text-forest-600 hover:text-gold-600 font-mono inline-flex items-center gap-1"
                          onClick={onClose}
                        >
                          {p.oc_numero} <ExternalLink size={10} />
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {p.proyecto_id ? (
                          <Link
                            to={`/proyectos/${p.proyecto_id}`}
                            className="text-forest-600 hover:text-gold-600 font-mono inline-flex items-center gap-1"
                            onClick={onClose}
                          >
                            {p.proyecto_codigo} <ExternalLink size={10} />
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function StatBox({ label, value, color = 'text-gray-900', hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</div>
      <div className={`text-lg font-bold ${color} tabular-nums`}>{value}</div>
      {hint && <div className="text-[10px] text-gray-500 mt-0.5">{hint}</div>}
    </div>
  )
}
