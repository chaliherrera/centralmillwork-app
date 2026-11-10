import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Package, ShoppingCart, Warehouse, Clock, AlertTriangle,
  BarChart3, Calendar, User,
  CheckCircle2, AlertCircle, MessageSquare, Truck, Layers,
  ChevronDown, ChevronRight as ChevronRightSm,
  Hammer, Beaker, Download, ExternalLink, Pencil, Check, X,
} from 'lucide-react'
import clsx from 'clsx'
import {
  proyectosService,
  type ItemReadiness,
  type ItemReadinessMaterial,
  type EstadoItemReadiness,
  type MaterialTimeline,
  type CompraLoteItem,
} from '@/services/proyectos'
import { materialesService } from '@/services/materiales'
import MaterialesPorItemTab from '@/components/proyecto/MaterialesPorItemTab'
import { ordenesCompraService } from '@/services/ordenesCompra'
import { recepcionesService } from '@/services/recepciones'
import StatusBadge from '@/components/ui/StatusBadge'
import ScheduleTab from '@/components/modules/schedule/ScheduleTab'
import { GanttChartSquare } from 'lucide-react'
import {
  PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts'

const fmt = (n: number | string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n))

// Cantidad sin decimales inútiles (3 vs 3.000)
const fmtQty = (n: number) => String(Math.round(n * 1000) / 1000)

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${m}/${day}/${y}`
}


type TabKey = 'materialesporitem' | 'timeline' | 'porlote' | 'items' | 'ocs' | 'recepciones' | 'muestras' | 'schedule' | 'graficas'

export default function ProyectoDetalle() {
  const { id } = useParams<{ id: string }>()
  const proyectoId = parseInt(id ?? '0')
  const [tab, setTab] = useState<TabKey>('materialesporitem')

  const { data: resumenData, isLoading } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'resumen'],
    queryFn: () => proyectosService.getResumen(proyectoId),
    enabled: !!proyectoId,
    staleTime: 15_000,
  })

  // Avance del proyecto (reemplaza los KPI): se arma con la MISMA query que la
  // pestaña Línea de tiempo (React Query la comparte, una sola llamada).
  const { data: tlData } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'materiales-timeline'],
    queryFn: () => proyectosService.getMaterialesTimeline(proyectoId),
    enabled: !!proyectoId,
    staleTime: 30_000,
  })
  const tlRows: MaterialTimeline[] = tlData?.data ?? []

  if (isLoading || !resumenData?.data) {
    return (
      <div className="p-8 text-center text-gray-400">Cargando proyecto…</div>
    )
  }

  const { proyecto, kpis } = resumenData.data
  const mat = kpis.materiales
  const oc  = kpis.ocs

  return (
    <div className="space-y-5 pb-12">
      {/* ── Volver ── */}
      <Link to="/proyectos" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-forest-700">
        <ArrowLeft size={14} /> Volver a Proyectos
      </Link>

      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-forest-700 to-forest-600 text-white rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm font-bold text-gold-300">{proyecto.codigo}</span>
              <StatusBadge status={proyecto.estado} />
            </div>
            <h1 className="text-xl font-bold leading-tight">{proyecto.nombre}</h1>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 text-xs text-white/80">
              {proyecto.cliente && <span className="inline-flex items-center gap-1"><User size={12} /> {proyecto.cliente}</span>}
              {proyecto.responsable && <span className="inline-flex items-center gap-1"><User size={12} /> Resp: {proyecto.responsable}</span>}
              {proyecto.fecha_inicio && <span className="inline-flex items-center gap-1"><Calendar size={12} /> Inicio: {fmtDate(proyecto.fecha_inicio)}</span>}
              {proyecto.fecha_fin_estimada && <span className="inline-flex items-center gap-1"><Calendar size={12} /> ETA: {fmtDate(proyecto.fecha_fin_estimada)}</span>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/60">Presupuesto</p>
            <p className="text-2xl font-bold text-gold-300">{fmt(proyecto.presupuesto)}</p>
            {Number(oc.monto_total) > 0 && (
              <p className="text-xs text-white/70 mt-1">
                Ordenado: <strong className="text-white">{fmt(oc.monto_total)}</strong>{' '}
                ({Number(proyecto.presupuesto) > 0
                  ? `${Math.round((Number(oc.monto_total) / Number(proyecto.presupuesto)) * 100)}%`
                  : '—'})
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Avance del proyecto (reemplaza los KPI) ── */}
      <AvanceStrip rows={tlRows} />

      {/* ── Alertas / Sub-resumen ── */}
      {(mat.origen_directa + mat.origen_urgente > 0 || oc.vencidas > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {mat.origen_urgente > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium">
              <AlertTriangle size={12} /> {mat.origen_urgente} compra(s) URGENTE
            </span>
          )}
          {mat.origen_directa > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200 font-medium">
              <ShoppingCart size={12} /> {mat.origen_directa} compra(s) DIRECTA
            </span>
          )}
          {oc.vencidas > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 font-medium">
              <Clock size={12} /> {oc.vencidas} OC(s) con ETA vencida
            </span>
          )}
          {kpis.recepciones.con_diferencias > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 font-medium">
              <AlertCircle size={12} /> {kpis.recepciones.con_diferencias} recepción(es) con diferencias
            </span>
          )}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="border-b border-gray-200 flex gap-1 overflow-x-auto">
        {([
          { key: 'materialesporitem', label: 'Materiales por ítem',       icon: Package },
          { key: 'timeline',    label: 'Línea de tiempo',                 icon: Clock },
          { key: 'porlote',     label: 'Por lote',                        icon: Layers },
          { key: 'items',       label: 'Items',                           icon: Hammer },
          { key: 'ocs',         label: `Órdenes (${oc.total})`,           icon: ShoppingCart },
          { key: 'recepciones', label: `Recepciones (${kpis.recepciones.total})`, icon: Warehouse },
          { key: 'muestras',    label: 'Muestras aprobadas',              icon: Beaker },
          { key: 'schedule',    label: 'Schedule',                        icon: GanttChartSquare },
          { key: 'graficas',    label: 'Gráficas',                        icon: BarChart3 },
        ] as { key: TabKey; label: string; icon: typeof Package }[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === key
                ? 'border-forest-600 text-forest-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab === 'materialesporitem' && <MaterialesPorItemTab proyectoId={proyectoId} />}
      {tab === 'timeline'    && <TimelineTab    proyectoId={proyectoId} />}
      {tab === 'porlote'     && <PorLoteTab     proyectoId={proyectoId} />}
      {tab === 'items'       && <ItemsTab       proyectoId={proyectoId} />}
      {tab === 'ocs'         && <OcsTab         proyectoId={proyectoId} />}
      {tab === 'recepciones' && <RecepcionesTab proyectoId={proyectoId} />}
      {tab === 'muestras'    && <MuestrasAprobadasTab proyectoId={proyectoId} />}
      {tab === 'schedule'    && <ScheduleTab    proyectoId={proyectoId} />}
      {tab === 'graficas'    && <GraficasTab    kpis={kpis} presupuesto={Number(proyecto.presupuesto)} />}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: OCs
// ──────────────────────────────────────────────────────────────────────────────
function OcsTab({ proyectoId }: { proyectoId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'ocs'],
    queryFn: () => ordenesCompraService.getAll({ proyecto_id: proyectoId, limit: 500 }),
    staleTime: 15_000,
  })
  const ocs = data?.data ?? []

  if (isLoading) return <div className="text-center text-gray-400 py-12">Cargando…</div>
  if (ocs.length === 0) return <div className="text-center text-gray-300 py-12">Este proyecto no tiene OCs todavía</div>

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2.5 text-left w-32">OC #</th>
            <th className="px-3 py-2.5 text-center w-24">Estado</th>
            <th className="px-3 py-2.5 text-left">Vendor</th>
            <th className="px-3 py-2.5 text-left w-24">Categoría</th>
            <th className="px-3 py-2.5 text-center w-24">Emisión</th>
            <th className="px-3 py-2.5 text-center w-24">ETA</th>
            <th className="px-3 py-2.5 text-center w-24">Recepción</th>
            <th className="px-3 py-2.5 text-right w-24">Freight</th>
            <th className="px-3 py-2.5 text-right w-28">Total</th>
            <th className="px-3 py-2.5 text-left min-w-[150px]">Notas</th>
          </tr>
        </thead>
        <tbody>
          {ocs.map((o) => (
            <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2.5">
                <Link to={`/ordenes-compra?ocId=${o.id}`} className="font-mono text-[11px] font-bold text-forest-700 hover:text-gold-500 hover:underline">
                  {o.numero}
                </Link>
                {o.origen === 'DIRECTA' && <span className="ml-1 text-[9px] px-1 py-0 rounded font-bold bg-cyan-100 text-cyan-700">DIRECTA</span>}
                {o.origen === 'URGENTE' && <span className="ml-1 text-[9px] px-1 py-0 rounded font-bold bg-red-100 text-red-700">URGENTE</span>}
              </td>
              <td className="px-3 py-2.5 text-center">
                <span className={clsx(
                  'inline-block text-[10px] px-2 py-0.5 rounded-full font-bold',
                  o.estado_display === 'EN_EL_TALLER' && 'bg-emerald-100 text-emerald-700',
                  o.estado_display === 'EN_TRANSITO'  && 'bg-blue-100 text-blue-700',
                  o.estado_display === 'CANCELADA'    && 'bg-gray-200 text-gray-500',
                  o.estado_display === 'ORDENADO'     && 'bg-orange-100 text-orange-700',
                )}>
                  {o.estado_display === 'EN_EL_TALLER' ? 'EN TALLER' : o.estado_display}
                </span>
              </td>
              <td className="px-3 py-2.5">{o.proveedor?.nombre ?? '—'}</td>
              <td className="px-3 py-2.5 text-gray-600">{o.categoria || '—'}</td>
              <td className="px-3 py-2.5 text-center text-gray-600">{fmtDate(o.fecha_emision)}</td>
              <td className={clsx('px-3 py-2.5 text-center', o.flag_vencida ? 'text-red-600 font-medium' : 'text-gray-600')}>
                {fmtDate(o.fecha_entrega_estimada)}
              </td>
              <td className="px-3 py-2.5 text-center text-gray-600">{fmtDate(o.fecha_entrega_real)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{Number(o.freight) > 0 ? fmt(o.freight ?? 0) : '—'}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-medium">{fmt(o.total)}</td>
              <td className="px-3 py-2.5 text-gray-500 italic">
                {o.notas ? <span title={o.notas}>{o.notas.slice(0, 40)}{o.notas.length > 40 ? '…' : ''}</span> : <span className="text-gray-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Recepciones
// ──────────────────────────────────────────────────────────────────────────────
function RecepcionesTab({ proyectoId }: { proyectoId: number }) {
  const { data: ocsData } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'ocs-light'],
    queryFn: () => ordenesCompraService.getAll({ proyecto_id: proyectoId, limit: 500 }),
    staleTime: 15_000,
  })
  const ocIds = new Set((ocsData?.data ?? []).map((o) => o.id))

  const { data, isLoading } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'recepciones'],
    queryFn: () => recepcionesService.getAll({ limit: 500 }),
    staleTime: 15_000,
  })
  const recepciones = (data?.data ?? []).filter((r: any) => ocIds.has(r.orden_compra_id))

  if (isLoading) return <div className="text-center text-gray-400 py-12">Cargando…</div>
  if (recepciones.length === 0) return <div className="text-center text-gray-300 py-12">Sin recepciones registradas</div>

  return (
    <div className="space-y-3">
      {recepciones.map((r: any) => (
        <div key={r.id} className={clsx(
          'bg-white rounded-xl border p-4',
          r.estado === 'con_diferencias' ? 'border-yellow-200 bg-yellow-50/30' : 'border-gray-200'
        )}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              {r.estado === 'completa'
                ? <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
                : <AlertCircle size={18} className="text-yellow-500 flex-shrink-0" />}
              <div>
                <p className="text-sm font-bold text-gray-800">
                  {r.folio} {r.estado === 'con_diferencias' && <span className="text-xs text-yellow-700">· Con diferencias</span>}
                </p>
                <p className="text-xs text-gray-500">
                  <Link to={`/ordenes-compra?ocId=${r.orden_compra_id}`} className="font-mono text-forest-700 hover:underline">
                    {r.ordenes_compra?.numero ?? `OC #${r.orden_compra_id}`}
                  </Link>
                  {' · '}{fmtDate(r.fecha_recepcion)}
                  {r.recibio && ` · Recibió: ${r.recibio}`}
                </p>
              </div>
            </div>
          </div>
          {r.notas && (
            <div className="flex items-start gap-2 mt-2 px-3 py-2 bg-gray-50 rounded text-xs text-gray-700">
              <MessageSquare size={12} className="mt-0.5 flex-shrink-0 text-gray-400" />
              <span className="italic">{r.notas}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Muestras aprobadas (F6 — vínculo formal muestra ↔ proyecto)
// ──────────────────────────────────────────────────────────────────────────────
function MuestrasAprobadasTab({ proyectoId }: { proyectoId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'muestras-aprobadas'],
    queryFn: () => proyectosService.getMuestrasAprobadas(proyectoId),
    staleTime: 30_000,
  })
  const items = data?.data ?? []

  if (isLoading) {
    return <div className="text-center py-8 text-gray-400 text-sm">Cargando…</div>
  }
  if (!items.length) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
        <Beaker size={28} className="mx-auto mb-2 opacity-40" />
        <p>No hay muestras aprobadas para este proyecto.</p>
        <p className="text-xs mt-1">Aparecen acá cuando INGENIERIA aprueba una muestra vinculada al proyecto.</p>
      </div>
    )
  }

  const TIPO_COLOR: Record<string, string> = {
    PUERTA:   'bg-amber-100 text-amber-800 border-amber-200',
    ACABADO:  'bg-purple-100 text-purple-800 border-purple-200',
    HARDWARE: 'bg-blue-100 text-blue-800 border-blue-200',
    CABINET:  'bg-emerald-100 text-emerald-800 border-emerald-200',
    OTRO:     'bg-gray-100 text-gray-700 border-gray-200',
  }

  return (
    <div className="space-y-3">
      {items.map((m) => (
        <div key={m.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Link
                  to={`/muestras?focus=${m.muestra_id}`}
                  className="font-mono text-sm font-semibold text-forest-700 hover:underline"
                >
                  {m.codigo}{m.version_numero > 1 && <span className="text-purple-700 ml-1">V{m.version_numero}</span>}
                </Link>
                <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', TIPO_COLOR[m.tipo] ?? TIPO_COLOR.OTRO)}>
                  {m.tipo}
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  ✓ APROBADA
                </span>
              </div>
              <p className="text-sm text-gray-800 leading-snug">{m.descripcion}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                <span>Aprobada: {new Date(m.fecha_aprobacion).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                {m.aprobado_por_nombre && <span>por {m.aprobado_por_nombre}</span>}
              </div>
              {m.notas && (
                <p className="text-xs text-gray-600 italic mt-1">{m.notas}</p>
              )}
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0">
              {m.pdf_url ? (
                <a
                  href={m.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-forest-50 text-forest-700 hover:bg-forest-100 border border-forest-200"
                >
                  <Download size={12} /> Sample Request PDF
                </a>
              ) : (
                <span className="text-xs text-gray-400 italic">Sin PDF</span>
              )}
              <Link
                to={`/muestras?focus=${m.muestra_id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded text-gray-500 hover:bg-gray-50 border border-gray-200"
              >
                <ExternalLink size={12} /> Ver muestra
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Gráficas — solo 2 charts, polished
// ──────────────────────────────────────────────────────────────────────────────
function GraficasTab({ kpis, presupuesto }: { kpis: any; presupuesto: number }) {
  // ── Donut: Origen de los materiales ──────────────────────────────────────
  const origenData = [
    { name: 'MTO planificado',    value: kpis.materiales.origen_mto,     color: '#2c3126' },
    { name: 'Compra DIRECTA',     value: kpis.materiales.origen_directa, color: '#06B6D4' },
    { name: 'Compra URGENTE',     value: kpis.materiales.origen_urgente, color: '#EF4444' },
  ].filter((d) => d.value > 0)
  const totalOrigen = origenData.reduce((s, d) => s + d.value, 0)
  const pctNoMto    = totalOrigen > 0
    ? Math.round(((kpis.materiales.origen_directa + kpis.materiales.origen_urgente) / totalOrigen) * 100)
    : 0

  // ── Line: Gasto acumulado vs presupuesto ─────────────────────────────────
  const gastoAcumuladoData = useMemo(() => {
    let acum = 0
    return (kpis.gasto_mensual ?? []).map((g: any) => {
      acum += Number(g.monto)
      return {
        mes:        formatMes(g.mes),
        gastado:    acum,
        mes_actual: Number(g.monto),
      }
    })
  }, [kpis.gasto_mensual])
  const gastoFinal = gastoAcumuladoData.length > 0 ? gastoAcumuladoData[gastoAcumuladoData.length - 1].gastado : 0
  const pctBudget  = presupuesto > 0 ? (gastoFinal / presupuesto) * 100 : 0
  const budgetStatus =
    pctBudget > 100 ? { label: 'Sobre presupuesto', tone: 'red' as const, icon: AlertTriangle } :
    pctBudget > 80  ? { label: 'Cerca del límite',  tone: 'yellow' as const, icon: AlertCircle } :
                      { label: 'Dentro de presupuesto', tone: 'green' as const, icon: CheckCircle2 }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* 1. Origen donut polished */}
      <ChartCard
        title="Composición de las compras"
        subtitle="Distribución de materiales por origen de la decisión"
      >
        {origenData.length === 0 ? (
          <EmptyChart text="Sin materiales todavía" />
        ) : (
          <>
            <div className="relative">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={origenData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={3}
                    stroke="white"
                    strokeWidth={3}
                  >
                    {origenData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d: any = payload[0].payload
                      const pct = totalOrigen > 0 ? Math.round((d.value / totalOrigen) * 100) : 0
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
                          <p className="font-semibold text-gray-800">{d.name}</p>
                          <p className="text-gray-500">{d.value} ítems · {pct}%</p>
                        </div>
                      )
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Centro del donut */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-2xl font-bold text-forest-700 tabular-nums">{totalOrigen}</p>
                <p className="text-xs text-gray-400 uppercase tracking-wide">materiales</p>
              </div>
            </div>
            {/* Legend con breakdown */}
            <div className="mt-4 space-y-1.5">
              {origenData.map((d) => {
                const pct = totalOrigen > 0 ? (d.value / totalOrigen) * 100 : 0
                return (
                  <div key={d.name} className="flex items-center gap-2.5 text-xs">
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="flex-1 text-gray-700">{d.name}</span>
                    <span className="tabular-nums font-medium text-gray-800">{d.value}</span>
                    <span className="tabular-nums text-gray-400 w-12 text-right">{pct.toFixed(0)}%</span>
                  </div>
                )
              })}
            </div>
            {/* Callout interpretación */}
            {pctNoMto > 0 && (
              <div className={clsx(
                'mt-4 px-3 py-2 rounded-lg text-xs',
                pctNoMto > 20 ? 'bg-red-50 text-red-700 border border-red-200'
                             : 'bg-amber-50 text-amber-700 border border-amber-200'
              )}>
                <strong>{pctNoMto}%</strong> de los materiales fueron decididos fuera del MTO planificado.
                {pctNoMto > 20 && ' Considera revisar el proceso de planificación.'}
              </div>
            )}
          </>
        )}
      </ChartCard>

      {/* 2. Gasto acumulado vs presupuesto polished */}
      <ChartCard
        title="Gasto acumulado vs presupuesto"
        subtitle="Evolución mensual de los compromisos con vendors"
        rightSlot={
          presupuesto > 0 && gastoAcumuladoData.length > 0 ? (
            <span className={clsx(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
              budgetStatus.tone === 'green'  && 'bg-emerald-50 text-emerald-700',
              budgetStatus.tone === 'yellow' && 'bg-yellow-50 text-yellow-700',
              budgetStatus.tone === 'red'    && 'bg-red-50 text-red-700',
            )}>
              <budgetStatus.icon size={12} />
              {budgetStatus.label}
            </span>
          ) : null
        }
      >
        {gastoAcumuladoData.length === 0 ? (
          <EmptyChart text="Sin gastos registrados" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={gastoAcumuladoData} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="gastoGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#9B7200" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#9B7200" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const acum: number = payload[0].payload.gastado
                    const mesActual: number = payload[0].payload.mes_actual
                    const pct = presupuesto > 0 ? (acum / presupuesto) * 100 : 0
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
                        <p className="font-semibold text-gray-800 mb-1">{label}</p>
                        <p className="text-gray-500">Mes: <strong className="text-gray-800 tabular-nums">{fmt(mesActual)}</strong></p>
                        <p className="text-gray-500">Acumulado: <strong className="text-forest-700 tabular-nums">{fmt(acum)}</strong></p>
                        {presupuesto > 0 && (
                          <p className="text-gray-500">{pct.toFixed(1)}% del presupuesto</p>
                        )}
                      </div>
                    )
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="gastado"
                  stroke="#9B7200"
                  strokeWidth={2.5}
                  fill="url(#gastoGradient)"
                  dot={{ r: 3, fill: '#9B7200' }}
                  activeDot={{ r: 5, fill: '#9B7200' }}
                  name="Gasto acumulado"
                />
                {presupuesto > 0 && (
                  <ReferenceLine
                    y={presupuesto}
                    stroke="#EF4444"
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    label={{
                      value: `Presupuesto · ${fmt(presupuesto)}`,
                      position: 'insideTopRight',
                      fill: '#EF4444',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
            {/* Stats footer */}
            <div className="mt-4 grid grid-cols-3 gap-3 pt-3 border-t border-gray-100">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Gastado</p>
                <p className="text-sm font-bold text-forest-700 tabular-nums">{fmt(gastoFinal)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Disponible</p>
                <p className={clsx(
                  'text-sm font-bold tabular-nums',
                  presupuesto - gastoFinal < 0 ? 'text-red-600' : 'text-gray-700'
                )}>
                  {fmt(presupuesto - gastoFinal)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Utilizado</p>
                <p className={clsx(
                  'text-sm font-bold tabular-nums',
                  pctBudget > 100 ? 'text-red-600' :
                  pctBudget > 80  ? 'text-yellow-600' : 'text-emerald-600'
                )}>
                  {pctBudget.toFixed(1)}%
                </p>
              </div>
            </div>
          </>
        )}
      </ChartCard>
    </div>
  )
}

function ChartCard({
  title, subtitle, rightSlot, children,
}: {
  title: string
  subtitle?: string
  rightSlot?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-forest-700 leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {rightSlot}
      </div>
      {children}
    </div>
  )
}

function EmptyChart({ text }: { text: string }) {
  return <div className="h-60 flex items-center justify-center text-xs text-gray-300">{text}</div>
}

// Format '2026-05' → 'May 26'
function formatMes(yyyymm: string): string {
  const [y, m] = yyyymm.split('-')
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${meses[parseInt(m) - 1] ?? m} ${y.slice(2)}`
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Items — readiness por item (¿están todos sus materiales en el taller?)
// ──────────────────────────────────────────────────────────────────────────────
function ItemsTab({ proyectoId }: { proyectoId: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filtroEstado, setFiltroEstado] = useState<'' | EstadoItemReadiness>('')

  const { data, isLoading } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'items-readiness'],
    queryFn: () => proyectosService.getItemsReadiness(proyectoId),
    staleTime: 15_000,
  })

  if (isLoading) return <div className="text-center text-gray-400 py-12">Cargando…</div>
  if (!data?.data) return <div className="text-center text-gray-300 py-12">Sin datos</div>

  const { items, resumen } = data.data

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
        <Hammer size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">Este proyecto no tiene items definidos en el MTO todavía.</p>
        <p className="text-xs text-gray-400 mt-1">
          Los items se leen de la columna <code className="bg-gray-100 px-1 py-0.5 rounded">ITEM#</code> del Excel MTO al importarlo.
        </p>
      </div>
    )
  }

  const itemsFiltrados = filtroEstado
    ? items.filter((i) => i.estado === filtroEstado)
    : items

  const toggle = (item: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(item)) next.delete(item)
      else next.add(item)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Resumen + filtros */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-forest-700 to-forest-600 text-white px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Hammer size={16} className="text-gold-300" />
                <h3 className="text-base font-bold">Items del proyecto</h3>
              </div>
              <p className="text-xs text-white/70">
                Estado de readiness de cada item — <span className="text-gold-300 font-semibold">{resumen.total_items} items</span> en total
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/70 uppercase tracking-wide">Listos para fabricar</p>
              <p className="text-2xl font-bold text-emerald-300 tabular-nums">
                {resumen.listos} <span className="text-base text-white/50 font-normal">/ {resumen.total_items}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Filtros por estado */}
        <div className="px-6 py-3 border-t border-gray-100 flex flex-wrap gap-2 items-center text-xs">
          <span className="text-gray-500 font-medium mr-1">Filtrar:</span>
          <FiltroEstadoChip label="Todos"     count={resumen.total_items} active={filtroEstado === ''}          onClick={() => setFiltroEstado('')}          color="forest" />
          <FiltroEstadoChip label="Listos"    count={resumen.listos}      active={filtroEstado === 'LISTO'}     onClick={() => setFiltroEstado('LISTO')}     color="emerald" />
          <FiltroEstadoChip label="Parciales" count={resumen.parciales}   active={filtroEstado === 'PARCIAL'}   onClick={() => setFiltroEstado('PARCIAL')}   color="yellow" />
          <FiltroEstadoChip label="En tránsito" count={resumen.en_transito} active={filtroEstado === 'EN_TRANSITO'} onClick={() => setFiltroEstado('EN_TRANSITO')} color="blue" />
          <FiltroEstadoChip label="Ordenados" count={resumen.ordenados}   active={filtroEstado === 'ORDENADO'}  onClick={() => setFiltroEstado('ORDENADO')}  color="purple" />
          <FiltroEstadoChip label="Pendientes" count={resumen.pendientes}  active={filtroEstado === 'PENDIENTE'} onClick={() => setFiltroEstado('PENDIENTE')} color="red" />
        </div>
      </div>

      {/* Grid de items */}
      <div className="space-y-2">
        {itemsFiltrados.map((item) => (
          <ItemRow key={item.item} item={item} proyectoId={proyectoId} expanded={expanded.has(item.item)} onToggle={() => toggle(item.item)} />
        ))}
        {itemsFiltrados.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 py-10 text-center">
            <p className="text-xs text-gray-400">Sin items con ese filtro</p>
          </div>
        )}
      </div>
    </div>
  )
}

function FiltroEstadoChip({ label, count, active, onClick, color }: {
  label: string; count: number; active: boolean; onClick: () => void
  color: 'forest' | 'emerald' | 'yellow' | 'blue' | 'purple' | 'red'
}) {
  const colors = {
    forest:  active ? 'bg-forest-100 text-forest-700 border-forest-300'   : 'bg-white text-gray-600 border-gray-200 hover:border-forest-200',
    emerald: active ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-200',
    yellow:  active ? 'bg-yellow-100 text-yellow-700 border-yellow-300'   : 'bg-white text-gray-600 border-gray-200 hover:border-yellow-200',
    blue:    active ? 'bg-blue-100 text-blue-700 border-blue-300'         : 'bg-white text-gray-600 border-gray-200 hover:border-blue-200',
    purple:  active ? 'bg-purple-100 text-purple-700 border-purple-300'   : 'bg-white text-gray-600 border-gray-200 hover:border-purple-200',
    red:     active ? 'bg-red-100 text-red-700 border-red-300'             : 'bg-white text-gray-600 border-gray-200 hover:border-red-200',
  }
  return (
    <button
      onClick={onClick}
      className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-medium transition-colors', colors[color])}
    >
      {label} <span className="text-[10px] opacity-60">({count})</span>
    </button>
  )
}

function ItemRow({ item, proyectoId, expanded, onToggle }: { item: ItemReadiness; proyectoId: number; expanded: boolean; onToggle: () => void }) {
  const estadoMeta = getEstadoMeta(item.estado)
  // total ya excluye los materiales 'propios' (NO). Si no hay nada que comprar, 100%.
  const pctDisponible = item.total > 0 ? Math.round((item.disponibles / item.total) * 100) : 100

  return (
    <div className={clsx(
      'bg-white rounded-xl border overflow-hidden transition-shadow',
      estadoMeta.borderColor,
      expanded && 'shadow-md'
    )}>
      {/* Row clickeable */}
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors text-left">
        <span className="flex-shrink-0 text-gray-400">
          {expanded ? <ChevronDown size={16} /> : <ChevronRightSm size={16} />}
        </span>

        {/* Item # */}
        <div className="flex-shrink-0 w-16">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Item</p>
          <p className="text-lg font-bold text-forest-700 tabular-nums">{item.item}</p>
        </div>

        {/* Badge estado */}
        <span className={clsx(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0',
          estadoMeta.badgeColor
        )}>
          <estadoMeta.icon size={12} />
          {item.estado === 'EN_TRANSITO' ? 'EN TRÁNSITO' : item.estado}
        </span>

        {/* Progress bar */}
        <div className="flex-1 min-w-0 px-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-500">
              <strong className="text-gray-800">{item.disponibles}</strong>
              {' / '}
              <strong className="text-gray-800">{item.total}</strong>
              {' materiales disponibles'}
            </span>
            <span className="text-gray-500 tabular-nums">{pctDisponible}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={clsx('h-full transition-all', estadoMeta.progressColor)}
              style={{ width: `${pctDisponible}%` }}
            />
          </div>
        </div>

        {/* Breakdown chips */}
        <div className="flex items-center gap-1.5 flex-shrink-0 text-[10px]">
          {item.recibidos > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
              <CheckCircle2 size={9} /> {item.recibidos} rec
            </span>
          )}
          {item.en_stock > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
              <Warehouse size={9} /> {item.en_stock} stock
            </span>
          )}
          {item.en_transito > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium" title="Materiales con una parte ya recibida (en tránsito)">
              <Truck size={9} /> {item.en_transito} tránsito
            </span>
          )}
          {item.ordenados > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-medium">
              <ShoppingCart size={9} /> {item.ordenados} ord
            </span>
          )}
          {item.pendientes > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">
              <Clock size={9} /> {item.pendientes} pend
            </span>
          )}
          {item.propios > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium" title="Materiales propios (los fabricamos nosotros / no se compran)">
              <Hammer size={9} /> {item.propios} propio
            </span>
          )}
        </div>
      </button>

      {/* Detalle expandido — lista de materiales del item */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/40 px-4 py-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2 pl-7">
            Materiales necesarios ({item.materiales.length})
          </p>
          <div className="space-y-1.5">
            {item.materiales.map((m) => <MaterialDetailRow key={m.id} m={m} proyectoId={proyectoId} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function MaterialDetailRow({ m, proyectoId }: { m: ItemReadinessMaterial; proyectoId: number }) {
  const esPropio = m.cotizar === 'NO'
  const tieneNota = !!(m.nota && m.nota.trim())
  // La nota se muestra siempre en propios (con prompt) y en cualquier material que ya tenga una.
  const mostrarNota = esPropio || tieneNota
  // Parcialmente recibido = en tránsito: ya llegó una parte pero falta el resto.
  const recibidoQty = m.cantidad_recibida != null ? Number(m.cantidad_recibida) : null
  const ordenadoQty = Number(m.qty) || 0
  const esParcial = !esPropio && recibidoQty != null && recibidoQty > 0 && recibidoQty < ordenadoQty

  const queryClient = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(m.nota ?? '')

  const guardarNota = useMutation({
    mutationFn: (texto: string) => materialesService.update(m.id, { notas: texto.trim() || null }),
    onSuccess: () => {
      setEditando(false)
      queryClient.invalidateQueries({ queryKey: ['proyecto-detalle', proyectoId, 'items-readiness'] })
    },
  })

  return (
    <div className={clsx(
      'rounded-lg border px-3 py-2 text-xs',
      esPropio ? 'bg-amber-50/60 border-amber-200' : 'bg-white border-gray-100'
    )}>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 flex-shrink-0">{m.codigo}</span>
        <div className="flex-1 min-w-0">
          <p className="text-gray-800 truncate">{m.descripcion}</p>
          {m.vendor && !esPropio && <p className="text-[10px] text-gray-400 truncate">{m.vendor}</p>}
        </div>
        <span className="text-gray-500 tabular-nums flex-shrink-0">{Number(m.qty)} u.</span>
        {esPropio ? (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 bg-amber-100 text-amber-800" title="No se compra: lo fabricamos nosotros o hay un impedimento">
            <Hammer size={10} /> PROPIO
          </span>
        ) : esParcial ? (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 bg-blue-100 text-blue-700" title="Llegó una parte; el resto está en tránsito">
            <Truck size={10} /> EN TRÁNSITO
          </span>
        ) : (
          <span className={clsx(
            'inline-block text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0',
            m.estado_cotiz === 'RECIBIDO'  && 'bg-emerald-100 text-emerald-700',
            m.estado_cotiz === 'EN_STOCK'  && 'bg-blue-100 text-blue-700',
            m.estado_cotiz === 'ORDENADO'  && 'bg-purple-100 text-purple-700',
            m.estado_cotiz === 'COTIZADO'  && 'bg-green-100 text-green-700',
            m.estado_cotiz === 'PENDIENTE' && 'bg-yellow-100 text-yellow-700',
          )}>
            {m.estado_cotiz === 'EN_STOCK' ? 'EN STOCK' : m.estado_cotiz}
          </span>
        )}
        {esPropio
          ? <span className="flex-shrink-0 w-20" />
          : (m.oc_numero
              ? <Link to={`/ordenes-compra?ocId=${m.oc_id}`} className="font-mono text-[10px] text-forest-700 hover:underline flex-shrink-0">{m.oc_numero}</Link>
              : <span className="text-[10px] text-gray-300 flex-shrink-0 w-20">—</span>)}
      </div>

      {/* Cantidad recibida (recepción por cantidades): cuánto llegó de lo ordenado.
          Se ve en TODOS los ítems que tengan este material. */}
      {!esPropio && m.cantidad_recibida != null && (() => {
        const recibido = Number(m.cantidad_recibida)
        const ordenado = Number(m.qty) || 0
        const completo = ordenado > 0 && recibido >= ordenado
        const faltan = Math.max(0, ordenado - recibido)
        return (
          <div className={clsx(
            'mt-1.5 flex items-center gap-1.5 text-[11px]',
            completo ? 'text-emerald-700' : 'text-amber-700'
          )}>
            {completo ? <CheckCircle2 size={11} className="flex-shrink-0" /> : <Truck size={11} className="flex-shrink-0" />}
            <span>
              Recibido <b className="tabular-nums">{fmtQty(recibido)}</b> de <span className="tabular-nums">{fmtQty(ordenado)}</span> u.
              {completo ? ' · completo' : ` · faltan ${fmtQty(faltan)}`}
            </span>
          </div>
        )
      })()}

      {/* Nota del material — para propios "debe verse" (por qué lo fabricamos / impedimento);
          para el resto, se muestra la nota que cargaste en Materiales si existe.
          Editable inline, sin salir de la pestaña. */}
      {mostrarNota && !editando && (
        <div className={clsx(
          'mt-1.5 flex items-start gap-1.5 rounded px-2 py-1 text-[11px] group',
          esPropio
            ? (tieneNota ? 'bg-amber-100/70 text-amber-900' : 'bg-gray-50 text-gray-400 italic')
            : 'bg-slate-50 text-slate-600'
        )}>
          <MessageSquare size={11} className="mt-0.5 flex-shrink-0" />
          <span className="min-w-0 flex-1">{tieneNota ? m.nota : 'Sin nota — indicá por qué es propio o si hay un impedimento.'}</span>
          <button
            onClick={() => { setValor(m.nota ?? ''); setEditando(true) }}
            className={clsx(
              'flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-medium not-italic',
              esPropio ? 'text-amber-700 hover:text-amber-900' : 'text-forest-600 hover:text-forest-800'
            )}
          >
            <Pencil size={10} /> {tieneNota ? 'Editar' : 'Agregar nota'}
          </button>
        </div>
      )}

      {mostrarNota && editando && (
        <div className="mt-1.5 rounded bg-white border border-amber-200 p-2">
          <textarea
            autoFocus
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            rows={2}
            placeholder="¿Lo fabricamos nosotros? ¿Hay algún impedimento?"
            className="w-full text-[11px] text-gray-800 border border-gray-200 rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
          />
          <div className="flex items-center justify-end gap-2 mt-1.5">
            <button
              onClick={() => { setEditando(false); setValor(m.nota ?? '') }}
              disabled={guardarNota.isPending}
              className="inline-flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700 font-medium px-2 py-1"
            >
              <X size={11} /> Cancelar
            </button>
            <button
              onClick={() => guardarNota.mutate(valor)}
              disabled={guardarNota.isPending}
              className="inline-flex items-center gap-1 text-[10px] bg-amber-600 hover:bg-amber-700 text-white font-semibold px-2.5 py-1 rounded disabled:opacity-50"
            >
              <Check size={11} /> {guardarNota.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          {guardarNota.isError && (
            <p className="text-[10px] text-red-600 mt-1">No se pudo guardar. Intentá de nuevo.</p>
          )}
        </div>
      )}
    </div>
  )
}

function getEstadoMeta(estado: EstadoItemReadiness) {
  switch (estado) {
    case 'LISTO':     return { icon: CheckCircle2, badgeColor: 'bg-emerald-100 text-emerald-700',
                              borderColor: 'border-emerald-200', progressColor: 'bg-emerald-500' }
    case 'PARCIAL':   return { icon: AlertCircle,  badgeColor: 'bg-yellow-100 text-yellow-700',
                              borderColor: 'border-yellow-200', progressColor: 'bg-yellow-400' }
    case 'EN_TRANSITO': return { icon: Truck,      badgeColor: 'bg-blue-100 text-blue-700',
                              borderColor: 'border-blue-200',   progressColor: 'bg-blue-400' }
    case 'ORDENADO':  return { icon: ShoppingCart, badgeColor: 'bg-purple-100 text-purple-700',
                              borderColor: 'border-purple-200', progressColor: 'bg-purple-400' }
    case 'PENDIENTE': return { icon: Clock,        badgeColor: 'bg-red-100 text-red-700',
                              borderColor: 'border-red-200',    progressColor: 'bg-red-400' }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Avance del proyecto — materiales repartidos en las 5 etapas. Reemplaza las
// cards de KPI en la cabecera. Usa la misma data de la línea de tiempo.
// ──────────────────────────────────────────────────────────────────────────────
const AVANCE_STAGES = [
  { key: 'importado', label: 'Importados', bar: 'bg-stone-400',   text: 'text-stone-600' },
  { key: 'cotizado',  label: 'Cotizados',  bar: 'bg-sky-500',     text: 'text-sky-700' },
  { key: 'precio',    label: 'Con precio', bar: 'bg-blue-600',    text: 'text-blue-700' },
  { key: 'ordenado',  label: 'Ordenados',  bar: 'bg-purple-500',  text: 'text-purple-700' },
  { key: 'recibido',  label: 'Recibidos',  bar: 'bg-emerald-500', text: 'text-emerald-700' },
] as const

function AvanceStrip({ rows }: { rows: MaterialTimeline[] }) {
  const total = rows.length
  const reached = (key: string) =>
    key === 'precio'
      ? rows.filter((r) => r.tiene_precio).length
      : rows.filter((r) => !!(r as unknown as Record<string, string | null>)[key]).length
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {AVANCE_STAGES.map((s) => {
        const n = total ? reached(s.key) : 0
        const pct = total ? Math.round((n / total) * 100) : 0
        return (
          <div key={s.key} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
            <div className="text-xs text-gray-500">{s.label}</div>
            <div className={clsx('text-2xl font-bold leading-tight mt-0.5 tabular-nums', s.text)}>{n}</div>
            <div className="h-1.5 rounded-full bg-gray-100 mt-2 overflow-hidden">
              <div className={clsx('h-full rounded-full', s.bar)} style={{ width: `${pct}%` }} />
            </div>
            <div className="text-[11px] text-gray-400 mt-1">{pct}% de {total}</div>
          </div>
        )
      })}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Línea de tiempo (parte 1) — reconstruye, de un vistazo, cuándo cada
// material fue importado / cotizado / con precio / ordenado / recibido.
// ──────────────────────────────────────────────────────────────────────────────
const TL_STAGES = [
  { key: 'importado', label: 'Importado' },
  { key: 'cotizado',  label: 'Cotizado' },
  { key: 'precio',    label: 'Con precio' },
  { key: 'ordenado',  label: 'Ordenado' },
  { key: 'recibido',  label: 'Recibido' },
] as const

const tlShort = (d: string | null) => {
  if (!d) return null
  const [, m, day] = d.split('-')
  const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][parseInt(m) - 1]
  return `${parseInt(day)} ${mes}`
}

function TimelineTab({ proyectoId }: { proyectoId: number }) {
  const [search, setSearch] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'materiales-timeline'],
    queryFn: () => proyectosService.getMaterialesTimeline(proyectoId),
    staleTime: 30_000,
  })
  const rows: MaterialTimeline[] = data?.data ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      (r.codigo ?? '').toLowerCase().includes(q) ||
      (r.descripcion ?? '').toLowerCase().includes(q) ||
      (r.item ?? '').toLowerCase().includes(q) ||
      (r.vendor ?? '').toLowerCase().includes(q))
  }, [rows, search])

  // fecha de cada etapa: null = no alcanzada; '' = alcanzada sin fecha (con precio histórico)
  const dateOf = (r: MaterialTimeline, key: string): string | null => {
    if (key === 'precio') return r.con_precio ?? (r.tiene_precio ? '' : null)
    return (r as unknown as Record<string, string | null>)[key] ?? null
  }

  // Agrupar por vendor (alfabético, 'Sin vendor' al final).
  const vendorGroups = useMemo(() => {
    const m = new Map<string, MaterialTimeline[]>()
    for (const r of filtered) {
      const v = (r.vendor ?? '').trim() || 'Sin vendor'
      if (!m.has(v)) m.set(v, [])
      m.get(v)!.push(r)
    }
    return [...m.entries()]
      .sort((a, b) => (a[0] === 'Sin vendor' ? 1 : b[0] === 'Sin vendor' ? -1 : a[0].localeCompare(b[0])))
      .map(([vendor, items]) => ({ vendor, items }))
  }, [filtered])

  const renderRow = (r: MaterialTimeline) => {
    const cells = TL_STAGES.map((s) => ({ s, date: dateOf(r, s.key) }))
    const reachedIdx = cells.reduce((acc, c, i) => (c.date !== null ? i : acc), -1)
    const fillPct = reachedIdx > 0 ? (reachedIdx / (TL_STAGES.length - 1)) * 80 : 0
    return (
      <div key={r.id} className="grid min-w-[780px] items-center hover:bg-gray-50/70 transition-colors" style={{ gridTemplateColumns: '220px 1fr' }}>
        <div className="px-4 py-4 border-t border-gray-50 min-w-0">
          <div className="text-sm font-semibold text-gray-800 leading-tight truncate">
            {r.item ? <span className="text-gray-400 font-normal mr-1.5">#{r.item}</span> : null}{r.codigo || '—'}
          </div>
          <div className="text-xs text-gray-400 truncate">{r.descripcion || ''}</div>
        </div>
        <div className="relative grid py-4 border-t border-gray-50" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
          <div className="absolute top-[10px] left-[10%] right-[10%] h-[3px] rounded-full bg-gray-100" />
          {reachedIdx > 0 && (
            <div className="absolute top-[10px] left-[10%] h-[3px] rounded-full bg-forest-500" style={{ width: `${fillPct}%` }} />
          )}
          {cells.map(({ s, date }, i) => {
            const done = date !== null
            const isCur = i === reachedIdx
            const isRec = s.key === 'recibido'
            const linkable = done && !!r.oc_id && (s.key === 'ordenado' || s.key === 'recibido')
            const inner = (
              <>
                <div className={clsx(
                  'w-[22px] h-[22px] rounded-full mx-auto flex items-center justify-center text-[11px] font-bold leading-none',
                  done ? (isRec ? 'bg-emerald-500 text-white' : 'bg-forest-600 text-white') : 'bg-white border-[1.5px] border-gray-300',
                  isCur && (isRec ? 'ring-4 ring-emerald-500/20' : 'ring-4 ring-forest-500/20'),
                )}>
                  {done ? '✓' : ''}
                </div>
                <div className={clsx('text-[11px] mt-2', done ? (isCur ? 'font-semibold text-gray-700' : 'text-gray-500') : 'text-gray-300', linkable && 'underline decoration-dotted underline-offset-2')}>
                  {done ? (date ? tlShort(date) : 'listo') : '—'}
                </div>
                {linkable && isRec && r.oc_numero && (
                  <div className="text-[10px] text-forest-600 mt-0.5 truncate px-1">{r.oc_numero}</div>
                )}
              </>
            )
            return (
              <div key={s.key} className="relative z-10 text-center">
                {linkable
                  ? <Link to={`/ordenes-compra?ocId=${r.oc_id}`} title={`Ver ${r.oc_numero ?? 'la OC'} — fotos y recepción`} className="block hover:opacity-80 transition-opacity">{inner}</Link>
                  : inner}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (isLoading) return <div className="py-16 text-center text-gray-400 text-sm">Cargando línea de tiempo…</div>
  if (!rows.length) return <div className="py-16 text-center text-gray-400 text-sm">Este proyecto no tiene materiales.</div>

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="text-sm text-gray-500">
          {filtered.length} material{filtered.length === 1 ? '' : 'es'} · recorrido de cada uno
        </p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por código de material…"
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-72 max-w-full focus:outline-none focus:ring-2 focus:ring-forest-200 focus:border-forest-400"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        <div className="grid min-w-[780px]" style={{ gridTemplateColumns: '220px 1fr' }}>
          <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100">Material</div>
          <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
            {TL_STAGES.map((s) => (
              <div key={s.key} className="px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 text-center">{s.label}</div>
            ))}
          </div>
        </div>

        {vendorGroups.map(({ vendor, items }) => (
          <div key={vendor}>
            <div className="min-w-[780px] px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wide truncate">{vendor}</span>
              <span className="text-[11px] text-gray-400 tabular-nums">· {items.length}</span>
            </div>
            {items.map(renderRow)}
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Reconstruido de los datos existentes. "Con precio" muestra ✓ cuando el material ya tiene precio —
        la fecha exacta no se registró en el pasado (se captura de ahora en más).
      </p>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Por lote — recorrido de los materiales de cada lote de importación, con
// desglose interactivo (clic en una categoría → ver los materiales).
// ──────────────────────────────────────────────────────────────────────────────
const PL_CATS: Record<string, { l: string; c: string; t: string }> = {
  recibido:   { l: 'Recibido',      c: '#1baf7a', t: '#1b7a5a' },
  transito:   { l: 'En tránsito',   c: '#6250d6', t: '#4a3fb0' },
  con_precio: { l: 'Con precio',    c: '#2a78d6', t: '#185fa5' },
  falta:      { l: 'Falta cotizar', c: '#eda100', t: '#9a6a00' },
  stock:      { l: 'En stock',      c: '#5da9c9', t: '#2a6a85' },
  no_cotizar: { l: 'No cotizar',    c: '#9a988f', t: '#6b6a62' },
}
const PL_ORD = ['recibido', 'transito', 'con_precio', 'falta', 'stock', 'no_cotizar'] as const
const plDate = (iso: string | null) => {
  if (!iso) return null
  const [, m, d] = iso.split('-')
  const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][parseInt(m) - 1]
  return `${parseInt(d)} ${mes}`
}

function PorLoteTab({ proyectoId }: { proyectoId: number }) {
  const [open, setOpen] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'compras-por-lote'],
    queryFn: () => proyectosService.getComprasPorLote(proyectoId),
    staleTime: 30_000,
  })
  const items: CompraLoteItem[] = data?.data ?? []

  const lotes = useMemo(() => {
    const m = new Map<string, CompraLoteItem[]>()
    for (const it of items) { const k = it.lote ?? 'sin fecha'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(it) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  const tot = useMemo(() => ({
    sub: items.length,
    cot: items.filter((i) => ['recibido', 'transito', 'con_precio'].includes(i.cat)).length,
    ord: items.filter((i) => ['recibido', 'transito'].includes(i.cat)).length,
    rec: items.filter((i) => i.cat === 'recibido').length,
  }), [items])

  if (isLoading) return <div className="py-16 text-center text-gray-400 text-sm">Cargando compras por lote…</div>
  if (!items.length) return <div className="py-16 text-center text-gray-400 text-sm">Este proyecto no tiene materiales.</div>

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {([['Subidos', String(tot.sub), 'text-gray-800'],
          ['Cotizados', `${tot.cot} · ${tot.sub ? Math.round(tot.cot / tot.sub * 100) : 0}%`, 'text-emerald-700'],
          ['Ordenados', String(tot.ord), 'text-purple-700'],
          ['Recibidos', String(tot.rec), 'text-emerald-600']] as [string, string, string][]).map(([l, v, c]) => (
          <div key={l} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
            <div className="text-xs text-gray-500">{l}</div>
            <div className={clsx('text-2xl font-bold mt-0.5 tabular-nums', c)}>{v}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500 mb-3">
        {PL_ORD.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: PL_CATS[c].c }} />{PL_CATS[c].l}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mb-2">Clic en una etiqueta de un lote para ver los materiales.</p>

      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-x-auto">
        {lotes.map(([lote, mats]) => {
          const cnt: Record<string, number> = {}
          PL_ORD.forEach((c) => { cnt[c] = mats.filter((m) => m.cat === c).length })
          // Notas únicas por OC (la nota vive en la OC; no repetir por material).
          const notes = [...new Map(mats.filter((m) => m.nota).map((m) => [`${m.oc_numero}|${m.nota}`, { oc: m.oc_numero, nota: m.nota as string }])).values()]
          const llegs = mats.filter((m) => m.lleg).map((m) => m.lleg as string).sort()
          const lw = llegs.length
            ? `${plDate(llegs[0])}${llegs[llegs.length - 1] !== llegs[0] ? '–' + plDate(llegs[llegs.length - 1]) : ''}`
            : (cnt.transito ? 'en tránsito' : '—')
          const openCat = open && open.startsWith(lote + '|') ? open.split('|')[1] : null
          return (
            <div key={lote} className="px-4 py-3 min-w-[620px]">
              <div className="grid items-center gap-3" style={{ gridTemplateColumns: '90px 1fr 110px' }}>
                <div>
                  <div className="text-sm font-semibold text-gray-800">{plDate(lote) ?? lote}</div>
                  <div className="text-[11px] text-gray-400">{mats.length} subidos</div>
                </div>
                <div>
                  <div className="flex h-4 rounded overflow-hidden bg-gray-50">
                    {PL_ORD.map((c) => cnt[c] > 0 ? <div key={c} style={{ width: `${cnt[c] / mats.length * 100}%`, background: PL_CATS[c].c }} /> : null)}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {PL_ORD.filter((c) => cnt[c] > 0).map((c) => (
                      <button key={c} onClick={() => setOpen(open === `${lote}|${c}` ? null : `${lote}|${c}`)}
                        className={clsx('text-[10.5px] font-medium px-1.5 py-0.5 rounded border transition-colors', openCat === c ? 'border-gray-400 bg-gray-50' : 'border-gray-200 hover:bg-gray-50')}
                        style={{ color: PL_CATS[c].t }}>
                        {cnt[c]} {PL_CATS[c].l.toLowerCase()}
                      </button>
                    ))}
                    {notes.length > 0 && (
                      <button onClick={() => setOpen(open === `${lote}|notas` ? null : `${lote}|notas`)}
                        className={clsx('inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-0.5 rounded border transition-colors text-amber-700', openCat === 'notas' ? 'border-amber-300 bg-amber-50' : 'border-amber-200 hover:bg-amber-50')}>
                        <MessageSquare size={10} />{notes.length} nota{notes.length === 1 ? '' : 's'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-right text-[11.5px]" style={{ color: lw === 'en tránsito' ? '#9a6a00' : '#6b7280' }}>{lw}</div>
              </div>
              {openCat === 'notas' ? (
                <div className="mt-2 bg-amber-50/60 rounded-lg px-3 py-2">
                  <div className="text-[11px] font-medium mb-1.5 text-amber-700">Notas de recepción · {notes.length}</div>
                  {notes.map((n, i) => (
                    <div key={i} className="flex items-start gap-1.5 py-1 border-t border-amber-100 text-xs">
                      <MessageSquare size={11} className="mt-0.5 shrink-0 text-amber-600" />
                      <span>{n.oc ? <span className="font-mono text-amber-600 mr-1">{n.oc}:</span> : null}<span className="text-gray-700">{n.nota}</span></span>
                    </div>
                  ))}
                </div>
              ) : openCat && (
                <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2">
                  <div className="text-[11px] font-medium mb-1.5" style={{ color: PL_CATS[openCat]?.t }}>
                    {PL_CATS[openCat]?.l} · {mats.filter((m) => m.cat === openCat).length} material(es)
                  </div>
                  {mats.filter((m) => m.cat === openCat).map((m) => (
                    <div key={m.id} className="flex gap-2 items-baseline py-1 border-t border-gray-100 text-xs">
                      <span className="font-mono text-[11px] text-gray-800 shrink-0" style={{ minWidth: 120 }}>{m.codigo}</span>
                      <span className="text-gray-500 flex-1 min-w-0 truncate">{m.descripcion}</span>
                      <span className="text-gray-400 text-[11px] whitespace-nowrap">{m.vendor ?? '—'}{m.lleg ? ` · llegó ${plDate(m.lleg)}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
