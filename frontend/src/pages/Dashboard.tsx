import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  FolderOpen, DollarSign, Warehouse, CheckCircle2,
  ShoppingCart, AlertTriangle, FileText,
} from 'lucide-react'
import clsx from 'clsx'
import { dashboardService } from '@/services/dashboard'
import ReporteModal from '@/components/ui/ReporteModal'

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD       = '#C9A84C'
const FOREST_MID = '#4A5240'

const ESTADO_PROY_COLOR: Record<string, string> = {
  cotizacion: '#8B5CF6',
  activo:     '#10B981',
  en_pausa:   '#F59E0B',
  completado: '#3B82F6',
  cancelado:  '#9CA3AF',
}

const ESTADO_PROY_BADGE: Record<string, string> = {
  cotizacion: 'bg-purple-100 text-purple-700',
  activo:     'bg-green-100  text-green-700',
  en_pausa:   'bg-yellow-100 text-yellow-700',
  completado: 'bg-blue-100   text-blue-700',
  cancelado:  'bg-gray-100   text-gray-500',
}

const ESTADO_PROY_LABEL: Record<string, string> = {
  cotizacion: 'Cotización',
  activo:     'Activo',
  en_pausa:   'En Pausa',
  completado: 'Completado',
  cancelado:  'Cancelado',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`
  // Para valores < 1000 evitamos el `$${n}` crudo porque emite floats raros
  // tipo "$139.20000000000005". Usamos Intl.NumberFormat con 2 decimales.
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('bg-white rounded-xl border border-gray-100 p-5', className)}
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)' }}>
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">{title}</h3>
      {children}
    </div>
  )
}

function KpiCard({
  icon: Icon, label, value, sub, iconBg, valueColor, alert,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  iconBg: string
  valueColor?: string
  alert?: boolean
}) {
  return (
    <div className={clsx(
      'bg-white rounded-xl border p-4 flex items-start gap-3',
      alert ? 'border-red-200 bg-red-50/40' : 'border-gray-100',
    )} style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)' }}>
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className={clsx('text-[26px] font-bold leading-tight', valueColor ?? 'text-gray-900')}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function CustomTooltip({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-md">
      {label && <p className="font-semibold text-gray-700 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? p.fill }}>
          {p.name}: {money ? fmtUSD(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-32 text-xs text-gray-300">Sin datos aún</div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [reporteOpen, setReporteOpen] = useState(false)

  const { data: statsRes, isLoading } = useQuery({
    queryKey: ['dashboard-full-stats'],
    queryFn: () => dashboardService.getStats(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const s = statsRes?.data

  // Cumplimiento donut data
  const cumplPct  = s?.kpis.cumplimiento_pct ?? 0
  const cumplData = [
    { name: 'Recibido',   value: cumplPct,       fill: '#10B981' },
    { name: 'Pendiente',  value: 100 - cumplPct, fill: '#E5E7EB' },
  ]

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Central Millwork · Procurement Overview</p>
        </div>
        <button
          onClick={() => setReporteOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors bg-white shadow-sm"
        >
          <FileText size={15} className="text-gold-500" />
          Generar Reporte
        </button>
      </div>

      {/* ── KPI Row — 6 cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          icon={FolderOpen}    label="Proyectos Activos"
          value={isLoading ? '—' : s?.kpis.proyectos_activos ?? 0}
          sub="en curso"
          iconBg="bg-forest-700"
        />
        <KpiCard
          icon={DollarSign}    label="Monto Total OCs"
          value={isLoading ? '—' : fmtUSD(s?.kpis.monto_total_ocs ?? 0)}
          sub="total emitido"
          iconBg="bg-gold-500"  valueColor="text-gold-700"
        />
        <KpiCard
          icon={Warehouse}     label="Monto Recibido"
          value={isLoading ? '—' : fmtUSD(s?.kpis.monto_recibido ?? 0)}
          sub="en taller"
          iconBg="bg-green-600" valueColor="text-green-700"
        />
        <KpiCard
          icon={CheckCircle2}  label="OCs Completadas"
          value={isLoading ? '—' : s?.kpis.ocs_completadas ?? 0}
          sub="recibidas"
          iconBg="bg-emerald-500"
        />
        <KpiCard
          icon={ShoppingCart}  label="OCs en Proceso"
          value={isLoading ? '—' : s?.kpis.ocs_en_proceso ?? 0}
          sub="ordenadas"
          iconBg="bg-amber-500" valueColor="text-amber-700"
        />
        <KpiCard
          icon={AlertTriangle} label="Retrasadas"
          value={isLoading ? '—' : s?.kpis.ocs_retrasadas ?? 0}
          sub="ETA vencida"
          iconBg={s?.kpis.ocs_retrasadas ? 'bg-red-500' : 'bg-gray-400'}
          valueColor={s?.kpis.ocs_retrasadas ? 'text-red-600' : 'text-gray-800'}
          alert={!!s?.kpis.ocs_retrasadas}
        />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Dona: distribución proyectos por estado */}
        <Card title="Proyectos por Estado">
          {!s?.dona_proyectos?.length ? <EmptyChart /> : (
            <div className="flex items-center gap-4">
              <div className="shrink-0">
                <ResponsiveContainer width={110} height={110}>
                  <PieChart>
                    <Pie data={s.dona_proyectos} dataKey="total" nameKey="estado"
                      innerRadius={30} outerRadius={52} paddingAngle={2}>
                      {s.dona_proyectos.map(r => (
                        <Cell key={r.estado} fill={ESTADO_PROY_COLOR[r.estado] ?? '#9CA3AF'} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 flex-1 min-w-0">
                {s.dona_proyectos.map(r => (
                  <div key={r.estado} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: ESTADO_PROY_COLOR[r.estado] ?? '#9CA3AF' }} />
                    <span className="text-xs text-gray-600 truncate flex-1">
                      {ESTADO_PROY_LABEL[r.estado] ?? r.estado}
                    </span>
                    <span className="text-xs font-bold text-gray-900">{r.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Barras: monto ordenado vs recibido por estado proyecto */}
        <Card title="Resumen Económico por Estado">
          {!s?.barras_economico?.filter(r => r.ordenado + r.recibido > 0).length ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart
                data={s.barras_economico.map(r => ({
                  ...r,
                  estado: ESTADO_PROY_LABEL[r.estado] ?? r.estado,
                }))}
                margin={{ top: 0, right: 4, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="estado" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => fmtShort(v)} />
                <Tooltip content={<CustomTooltip money />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="ordenado" name="Ordenado" fill={GOLD}       radius={[2,2,0,0]} />
                <Bar dataKey="recibido" name="Recibido" fill={FOREST_MID} radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Cumplimiento donut */}
        <Card title="Índice de Cumplimiento">
          <div className="flex flex-col items-center">
            <div className="relative">
              <ResponsiveContainer width={110} height={110}>
                <PieChart>
                  <Pie data={cumplData} dataKey="value" innerRadius={32} outerRadius={52}
                    paddingAngle={2} startAngle={90} endAngle={-270}>
                    {cumplData.map(e => <Cell key={e.name} fill={e.fill} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-gray-900">{cumplPct}%</span>
              </div>
            </div>
            <div className="flex gap-4 mt-1">
              {cumplData.map(e => (
                <div key={e.name} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: e.fill }} />
                  <span className="text-[10px] text-gray-500">{e.name}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              {s?.kpis.ocs_completadas ?? 0} de {(s?.kpis.ocs_completadas ?? 0) + (s?.kpis.ocs_en_proceso ?? 0)} OCs
            </p>
            <p className="text-xs text-gray-500 font-medium mt-1">
              {fmtUSD(s?.kpis.monto_recibido ?? 0)} recibido
            </p>
          </div>
        </Card>
      </div>

      {/* ── Middle: Top proyectos + Recientes ── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Top 5 proyectos por monto */}
        <Card title="Top 5 Proyectos por Monto">
          {!s?.top_proyectos?.length ? (
            <p className="text-xs text-gray-300 text-center py-6">Sin datos</p>
          ) : (
            <div className="space-y-2.5">
              {s.top_proyectos.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-300 w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-gray-800 truncate">{p.codigo}</p>
                      <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0', ESTADO_PROY_BADGE[p.estado] ?? 'bg-gray-100 text-gray-500')}>
                        {ESTADO_PROY_LABEL[p.estado] ?? p.estado}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate">{p.nombre}</p>
                    <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gold-500 rounded-full"
                        style={{ width: `${s.top_proyectos[0].monto_total > 0 ? Math.round(p.monto_total / s.top_proyectos[0].monto_total * 100) : 0}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-900 shrink-0">{fmtShort(p.monto_total)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Proyectos recientes */}
        <Card title="Proyectos Recientes">
          {!s?.proyectos_recientes?.length ? (
            <p className="text-xs text-gray-300 text-center py-6">Sin datos</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-2 font-medium">Proyecto</th>
                  <th className="text-right pb-2 font-medium">OCs</th>
                  <th className="text-right pb-2 font-medium">Ordenado</th>
                  <th className="text-right pb-2 font-medium">Recibido</th>
                  <th className="text-right pb-2 font-medium">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {s.proyectos_recientes.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2 pr-2">
                      <div className="flex items-start gap-1.5">
                        <div>
                          <p className="font-semibold text-gray-800 leading-tight">{p.codigo}</p>
                          <p className="text-gray-400 truncate max-w-[100px] leading-tight">{p.nombre}</p>
                          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-semibold', ESTADO_PROY_BADGE[p.estado] ?? 'bg-gray-100 text-gray-500')}>
                            {ESTADO_PROY_LABEL[p.estado] ?? p.estado}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 text-right text-gray-600">{p.cant_ocs}</td>
                    <td className="py-2 text-right text-gray-700 font-medium">{fmtShort(p.monto_ordenado)}</td>
                    <td className="py-2 text-right text-green-700 font-medium">{fmtShort(p.monto_recibido)}</td>
                    <td className="py-2 text-right">
                      {p.pendiente > 0
                        ? <span className="text-amber-600 font-semibold">{fmtShort(p.pendiente)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* ── Bottom: 4 widgets ── */}
      <div className="grid grid-cols-4 gap-4">

        {/* Proveedores principales */}
        <Card title="Top Proveedores">
          {!s?.top_vendors?.length ? <EmptyChart /> : (
            <div className="space-y-2">
              {s.top_vendors.map((v, i) => (
                <div key={v.proveedor} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-300 w-3 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs text-gray-700 truncate">{v.proveedor}</span>
                      <span className="text-xs font-bold text-gray-900 shrink-0">{fmtShort(v.monto)}</span>
                    </div>
                    <div className="mt-0.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-forest-600 rounded-full"
                        style={{ width: `${s.top_vendors[0].monto > 0 ? Math.round(v.monto / s.top_vendors[0].monto * 100) : 0}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Categorías principales */}
        <Card title="Top Categorías">
          {!s?.top_categorias?.length ? <EmptyChart /> : (
            <div className="space-y-2">
              {s.top_categorias.map((c, i) => (
                <div key={c.categoria} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-300 w-3 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs text-gray-700 truncate">{c.categoria}</span>
                      <span className="text-xs font-bold text-gray-900 shrink-0">{fmtShort(c.monto)}</span>
                    </div>
                    <div className="mt-0.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gold-500 rounded-full"
                        style={{ width: `${s.top_categorias[0].monto > 0 ? Math.round(c.monto / s.top_categorias[0].monto * 100) : 0}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* OCs por mes */}
        <Card title="Órdenes por Mes">
          {!s?.ocs_por_mes?.length ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={s.ocs_por_mes} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="mes" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name="OCs" fill={GOLD} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Recepciones por mes */}
        <Card title="Recepciones por Mes">
          {!s?.recepciones_por_mes?.length ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={s.recepciones_por_mes} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="mes" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name="Recepciones" fill={FOREST_MID} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

      </div>

      <ReporteModal open={reporteOpen} onClose={() => setReporteOpen(false)} />
    </div>
  )
}
