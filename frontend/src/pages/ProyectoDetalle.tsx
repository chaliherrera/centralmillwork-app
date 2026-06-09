import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, Package, ShoppingCart, Warehouse, Clock, AlertTriangle,
  Activity, BarChart3, Calendar, CalendarDays, User, DollarSign,
  CheckCircle2, AlertCircle, MessageSquare, Truck, Layers, FileText,
  ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightSm,
  Hammer, Beaker, Download, ExternalLink,
} from 'lucide-react'
import clsx from 'clsx'
import {
  proyectosService,
  type ActividadEvento,
  type ItemReadiness,
  type ItemReadinessMaterial,
  type EstadoItemReadiness,
} from '@/services/proyectos'
import { materialesService } from '@/services/materiales'
import { ordenesCompraService } from '@/services/ordenesCompra'
import { recepcionesService } from '@/services/recepciones'
import StatusBadge from '@/components/ui/StatusBadge'
import type { Material, OrdenCompra } from '@/types'
import {
  PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts'

const fmt = (n: number | string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n))

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${m}/${day}/${y}`
}

const fmtDateTime = (d: string | null | undefined) => {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleString('es-MX', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type TabKey = 'materiales' | 'items' | 'ocs' | 'recepciones' | 'muestras' | 'actividad' | 'calendar' | 'graficas'

export default function ProyectoDetalle() {
  const { id } = useParams<{ id: string }>()
  const proyectoId = parseInt(id ?? '0')
  const [tab, setTab] = useState<TabKey>('materiales')

  const { data: resumenData, isLoading } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'resumen'],
    queryFn: () => proyectosService.getResumen(proyectoId),
    enabled: !!proyectoId,
    staleTime: 15_000,
  })

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

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard icon={Package}      label="Materiales"   value={mat.total}      tone="forest" />
        <KpiCard icon={Clock}        label="Pendientes"   value={mat.pendientes} tone="yellow"
          hint={mat.pendientes > 0 ? `${fmt(Number(mat.monto_total) - Number(mat.monto_comprado))} sin orden` : undefined} />
        <KpiCard icon={ShoppingCart} label="Ordenados"    value={mat.ordenados}  tone="purple" />
        <KpiCard icon={Warehouse}    label="Recibidos"    value={mat.recibidos}  tone="emerald"
          hint={Number(mat.monto_recibido) > 0 ? fmt(mat.monto_recibido) : undefined} />
        <KpiCard icon={Layers}       label="OCs"          value={oc.total}       tone="cyan"
          hint={oc.vencidas > 0 ? `${oc.vencidas} vencidas` : undefined}
          hintTone={oc.vencidas > 0 ? 'red' : undefined} />
        <KpiCard icon={DollarSign}   label="Gastado"      value={fmt(oc.monto_total) as any} tone="gold"
          hint={Number(oc.freight_total) > 0 ? `Freight: ${fmt(oc.freight_total)}` : undefined} />
      </div>

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
          { key: 'materiales',  label: `Materiales (${mat.total})`,      icon: Package },
          { key: 'items',       label: 'Items',                           icon: Hammer },
          { key: 'ocs',         label: `Órdenes (${oc.total})`,           icon: ShoppingCart },
          { key: 'recepciones', label: `Recepciones (${kpis.recepciones.total})`, icon: Warehouse },
          { key: 'muestras',    label: 'Muestras aprobadas',              icon: Beaker },
          { key: 'actividad',   label: 'Actividad',                       icon: Activity },
          { key: 'calendar',    label: 'Calendar',                        icon: CalendarDays },
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
      {tab === 'materiales'  && <MaterialesTab  proyectoId={proyectoId} />}
      {tab === 'items'       && <ItemsTab       proyectoId={proyectoId} />}
      {tab === 'ocs'         && <OcsTab         proyectoId={proyectoId} />}
      {tab === 'recepciones' && <RecepcionesTab proyectoId={proyectoId} />}
      {tab === 'muestras'    && <MuestrasAprobadasTab proyectoId={proyectoId} />}
      {tab === 'actividad'   && <ActividadTab   proyectoId={proyectoId} />}
      {tab === 'calendar'    && <CalendarTab    proyectoId={proyectoId} proyectoNombre={proyecto.nombre} />}
      {tab === 'graficas'    && <GraficasTab    kpis={kpis} presupuesto={Number(proyecto.presupuesto)} />}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// KPI Card
// ──────────────────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon, label, value, tone, hint, hintTone,
}: {
  icon: typeof Package
  label: string
  value: number | string
  tone: 'forest' | 'yellow' | 'purple' | 'emerald' | 'cyan' | 'gold' | 'red'
  hint?: string
  hintTone?: 'red' | 'green'
}) {
  const toneMap = {
    forest:  'bg-forest-50 text-forest-700',
    yellow:  'bg-yellow-50 text-yellow-700',
    purple:  'bg-purple-50 text-purple-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    cyan:    'bg-cyan-50 text-cyan-700',
    gold:    'bg-gold-50 text-gold-700',
    red:     'bg-red-50 text-red-700',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={clsx('w-7 h-7 rounded-lg flex items-center justify-center', toneMap[tone])}>
          <Icon size={14} />
        </span>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-800 tabular-nums">{value}</p>
      {hint && (
        <p className={clsx(
          'text-[10px] mt-0.5',
          hintTone === 'red' ? 'text-red-600 font-medium' : 'text-gray-400'
        )}>
          {hint}
        </p>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Materiales
// ──────────────────────────────────────────────────────────────────────────────
function MaterialesTab({ proyectoId }: { proyectoId: number }) {
  const [estadoFilter, setEstadoFilter] = useState<string>('')
  const [origenFilter, setOrigenFilter] = useState<'' | 'MTO' | 'DIRECTA' | 'URGENTE' | 'NO_MTO'>('')
  const [search, setSearch]             = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'materiales', estadoFilter, origenFilter, search],
    queryFn: () => materialesService.getAll({
      proyecto_id: proyectoId, limit: 500,
      estado_cotiz: estadoFilter || undefined,
      origen:       origenFilter || undefined,
      search:       search || undefined,
    }),
    staleTime: 15_000,
  })
  const materiales: Material[] = data?.data ?? []

  // Need OC details (fecha_emision, fecha_entrega_estimada, fecha_entrega_real) for each material's OC
  const ocIds = useMemo(() => [...new Set(materiales.map((m) => m.oc_id).filter(Boolean) as number[])], [materiales])
  const { data: ocsData } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'ocs-light'],
    queryFn: () => ordenesCompraService.getAll({ proyecto_id: proyectoId, limit: 500 }),
    staleTime: 15_000,
    enabled: ocIds.length > 0,
  })
  const ocMap = useMemo(() => {
    const map = new Map<number, OrdenCompra>()
    ocsData?.data.forEach((o) => map.set(o.id, o))
    return map
  }, [ocsData])

  // Need recepción date per OC
  const { data: recepcionesData } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'recepciones'],
    queryFn: () => recepcionesService.getAll({ limit: 500 }),
    staleTime: 15_000,
  })
  const recepcionDateByOC = useMemo(() => {
    const map = new Map<number, string>()
    recepcionesData?.data.forEach((r: any) => {
      if (r.orden_compra_id) {
        const cur = map.get(r.orden_compra_id)
        if (!cur || (r.fecha_recepcion ?? '') > cur) {
          map.set(r.orden_compra_id, r.fecha_recepcion)
        }
      }
    })
    return map
  }, [recepcionesData])

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Buscar descripción, código…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input text-sm w-64"
        />
        <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} className="input text-sm w-44">
          <option value="">Todos los estados</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="COTIZADO">Cotizado</option>
          <option value="ORDENADO">Ordenado</option>
          <option value="RECIBIDO">Recibido</option>
          <option value="EN_STOCK">En stock</option>
        </select>
        <select value={origenFilter} onChange={(e) => setOrigenFilter(e.target.value as typeof origenFilter)} className="input text-sm w-44">
          <option value="">Todos los orígenes</option>
          <option value="MTO">MTO</option>
          <option value="DIRECTA">Directa</option>
          <option value="URGENTE">Urgente</option>
          <option value="NO_MTO">No-MTO (todas)</option>
        </select>
        <span className="text-xs text-gray-400 self-center ml-auto">{materiales.length} materiales</span>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2.5 text-center w-24">Estado</th>
              <th className="px-3 py-2.5 text-left w-16">Item</th>
              <th className="px-3 py-2.5 text-left w-28">CM Code</th>
              <th className="px-3 py-2.5 text-left min-w-[200px]">Descripción</th>
              <th className="px-3 py-2.5 text-left w-32">Vendor</th>
              <th className="px-3 py-2.5 text-right w-16">Qty</th>
              <th className="px-3 py-2.5 text-right w-20">Total</th>
              <th className="px-3 py-2.5 text-center w-28">OC #</th>
              <th className="px-3 py-2.5 text-center w-24">F. Ordenado</th>
              <th className="px-3 py-2.5 text-center w-24">ETA</th>
              <th className="px-3 py-2.5 text-center w-24">F. Recepción</th>
              <th className="px-3 py-2.5 text-left min-w-[150px]">Notas</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td colSpan={12} className="px-3 py-3 text-center text-gray-300">Cargando…</td>
              </tr>
            ))}
            {!isLoading && materiales.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-12 text-center text-gray-300">Sin materiales</td></tr>
            )}
            {!isLoading && materiales.map((m) => {
              const oc = m.oc_id ? ocMap.get(m.oc_id) : undefined
              const recFecha = m.oc_id ? recepcionDateByOC.get(m.oc_id) : undefined
              return (
                <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={clsx(
                        'inline-block text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                        m.estado_cotiz === 'COTIZADO'  && 'bg-green-100 text-green-700',
                        m.estado_cotiz === 'PENDIENTE' && 'bg-yellow-100 text-yellow-700',
                        m.estado_cotiz === 'EN_STOCK'  && 'bg-blue-100 text-blue-700',
                        m.estado_cotiz === 'ORDENADO'  && 'bg-purple-100 text-purple-700',
                        m.estado_cotiz === 'RECIBIDO'  && 'bg-emerald-200 text-emerald-800',
                      )}>
                        {m.estado_cotiz === 'EN_STOCK' ? 'EN STOCK' : m.estado_cotiz}
                      </span>
                      {m.origen === 'DIRECTA' && (
                        <span className="text-[9px] px-1 py-0 rounded font-bold bg-cyan-100 text-cyan-700">DIRECTA</span>
                      )}
                      {m.origen === 'URGENTE' && (
                        <span className="text-[9px] px-1 py-0 rounded font-bold bg-red-100 text-red-700">URGENTE</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-400 font-mono">{m.item || '—'}</td>
                  <td className="px-3 py-2">
                    {m.codigo
                      ? <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded">{m.codigo}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-800">{m.descripcion}</td>
                  <td className="px-3 py-2 text-gray-600">{m.vendor || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(m.qty)} {m.unidad}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(m.total_price)}</td>
                  <td className="px-3 py-2 text-center">
                    {m.oc_numero
                      ? <Link to={`/ordenes-compra?ocId=${m.oc_id}`} className="font-mono text-[11px] text-forest-700 hover:text-gold-500 hover:underline">{m.oc_numero}</Link>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center text-gray-600">{fmtDate(oc?.fecha_emision)}</td>
                  <td className={clsx('px-3 py-2 text-center', oc?.flag_vencida ? 'text-red-600 font-medium' : 'text-gray-600')}>
                    {fmtDate(oc?.fecha_entrega_estimada)}
                  </td>
                  <td className="px-3 py-2 text-center text-gray-600">{fmtDate(recFecha)}</td>
                  <td className="px-3 py-2 text-gray-500 italic">
                    {m.notas ? <span title={m.notas}>{m.notas.slice(0, 40)}{m.notas.length > 40 ? '…' : ''}</span> : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
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
// Tab: Actividad (timeline cronológico)
// ──────────────────────────────────────────────────────────────────────────────
function ActividadTab({ proyectoId }: { proyectoId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'actividad'],
    queryFn: () => proyectosService.getActividad(proyectoId),
    staleTime: 15_000,
  })
  const eventos = data?.data ?? []

  if (isLoading) return <div className="text-center text-gray-400 py-12">Cargando…</div>
  if (eventos.length === 0) return <div className="text-center text-gray-300 py-12">Sin actividad registrada</div>

  return (
    <div className="relative">
      <div className="absolute left-3.5 top-2 bottom-2 w-px bg-gray-200" />
      <div className="space-y-4">
        {eventos.map((ev, idx) => <EventoRow key={idx} ev={ev} />)}
      </div>
    </div>
  )
}

function EventoRow({ ev }: { ev: ActividadEvento }) {
  if (ev.tipo === 'mto_import') {
    return (
      <div className="flex gap-3 relative">
        <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 z-10 border-2 border-white">
          <Package size={13} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400">{fmtDateTime(ev.ts)}</p>
          <p className="text-sm text-gray-800 mt-0.5">
            <strong>📥 MTO importado</strong> — {ev.items_count} materiales
            {ev.origen !== 'MTO' && <span className="ml-1 text-xs text-orange-600">(origen: {ev.origen})</span>}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {ev.cotizar_si} para cotizar · {ev.en_stock} en stock
            {ev.vendor_principal && ` · Vendor principal: ${ev.vendor_principal}`}
          </p>
        </div>
      </div>
    )
  }

  if (ev.tipo === 'oc') {
    const isUrgent  = ev.origen === 'URGENTE'
    const isDirecta = ev.origen === 'DIRECTA'
    const isCancel  = ev.estado === 'cancelada'
    return (
      <div className="flex gap-3 relative">
        <span className={clsx(
          'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 border-white',
          isCancel  ? 'bg-gray-200 text-gray-500' :
          isUrgent  ? 'bg-red-100 text-red-700' :
          isDirecta ? 'bg-cyan-100 text-cyan-700' :
                      'bg-purple-100 text-purple-700'
        )}>
          {isUrgent ? <AlertTriangle size={13} /> : <ShoppingCart size={13} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400">{fmtDateTime(ev.ts)}</p>
          <p className="text-sm text-gray-800 mt-0.5">
            <strong>
              {isCancel && '❌ '}
              {isUrgent && '⚠️ Compra URGENTE '}
              {isDirecta && '🔵 Compra DIRECTA '}
              {!isCancel && !isUrgent && !isDirecta && '📦 OC enviada '}
            </strong>
            <Link to={`/ordenes-compra?ocId=${ev.id}`} className="font-mono text-forest-700 hover:underline">
              {ev.numero}
            </Link>
            {ev.vendor && <> a <strong>{ev.vendor}</strong></>}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {ev.items_count} item(s) · {fmt(ev.total)}
            {Number(ev.freight) > 0 && <> + freight {fmt(ev.freight)}</>}
            {ev.fecha_entrega_estimada && <> · ETA: {fmtDate(ev.fecha_entrega_estimada)}</>}
            {ev.categoria && <> · {ev.categoria}</>}
          </p>
          {ev.notas && (
            <div className="flex items-start gap-1.5 mt-1.5 text-xs text-gray-600 italic">
              <MessageSquare size={11} className="mt-0.5 flex-shrink-0 text-gray-400" />
              <span>{ev.notas}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (ev.tipo === 'recepcion') {
    const isDiff = ev.estado === 'con_diferencias'
    return (
      <div className="flex gap-3 relative">
        <span className={clsx(
          'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 border-white',
          isDiff ? 'bg-yellow-100 text-yellow-700' : 'bg-emerald-100 text-emerald-700'
        )}>
          {isDiff ? <AlertCircle size={13} /> : <Truck size={13} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400">{fmtDateTime(ev.ts)}</p>
          <p className="text-sm text-gray-800 mt-0.5">
            <strong>{isDiff ? '⚠️ Recepción con diferencias' : '✅ Recepción'}</strong>{' '}
            <span className="font-mono">{ev.folio}</span> de{' '}
            <Link to={`/ordenes-compra?ocId=${ev.oc_id}`} className="font-mono text-forest-700 hover:underline">{ev.oc_numero}</Link>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {fmtDate(ev.fecha_recepcion)}
            {ev.recibio && ` · Recibió: ${ev.recibio}`}
            {ev.diffs_count > 0 && ` · ${ev.diffs_count} item(s) con diferencias`}
          </p>
          {ev.notas && (
            <div className="flex items-start gap-1.5 mt-1.5 text-xs text-gray-600 italic">
              <MessageSquare size={11} className="mt-0.5 flex-shrink-0 text-gray-400" />
              <span>{ev.notas}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (ev.tipo === 'cotizacion') {
    return (
      <div className="flex gap-3 relative">
        <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 z-10 border-2 border-white">
          <FileText size={13} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400">{fmtDateTime(ev.ts)}</p>
          <p className="text-sm text-gray-800 mt-0.5">
            <strong>📄 Cotización {ev.estado}</strong>{' '}
            <span className="font-mono">{ev.folio}</span>
            {ev.vendor && <> a <strong>{ev.vendor}</strong></>}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {ev.fecha_solicitud && <>Solicitada: {fmtDate(ev.fecha_solicitud)}</>}
            {ev.fecha_respuesta && <> · Respondida: {fmtDate(ev.fecha_respuesta)}</>}
            {ev.monto_cotizado && Number(ev.monto_cotizado) > 0 && <> · Monto: {fmt(ev.monto_cotizado)}</>}
          </p>
          {ev.notas && (
            <div className="flex items-start gap-1.5 mt-1.5 text-xs text-gray-600 italic">
              <MessageSquare size={11} className="mt-0.5 flex-shrink-0 text-gray-400" />
              <span>{ev.notas}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Calendar — mismos eventos que Actividad pero en grilla mensual
// ──────────────────────────────────────────────────────────────────────────────
function CalendarTab({ proyectoId, proyectoNombre }: { proyectoId: number; proyectoNombre: string }) {
  const today = new Date()
  const [cursor, setCursor] = useState<{ year: number; month: number }>({
    year: today.getFullYear(),
    month: today.getMonth(), // 0-indexed
  })

  const { data, isLoading } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'actividad'],
    queryFn: () => proyectosService.getActividad(proyectoId),
    staleTime: 15_000,
  })
  const eventos = data?.data ?? []

  // Agrupar eventos por fecha YYYY-MM-DD (usando el campo de fecha relevante por tipo)
  const eventosPorDia = useMemo(() => {
    const map = new Map<string, ActividadEvento[]>()
    for (const ev of eventos) {
      const fechaStr = getEventoFecha(ev)
      if (!fechaStr) continue
      const key = fechaStr.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ev)
    }
    return map
  }, [eventos])

  // Build the grid: 6 rows × 7 cols
  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor])

  // Cuántos eventos hay en el mes mostrado vs fuera del mes
  // (para guiar al usuario: si hay actividad en otros meses, le decimos)
  const { eventosMesActual, eventosOtrosMeses, primerMesActivo, ultimoMesActivo } = useMemo(() => {
    const ymCursor = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
    let enMes = 0
    let fueraMes = 0
    const yms = new Set<string>()
    for (const ev of eventos) {
      const fecha = getEventoFecha(ev)
      if (!fecha) continue
      const ym = fecha.slice(0, 7)
      yms.add(ym)
      if (ym === ymCursor) enMes++
      else fueraMes++
    }
    const sorted = [...yms].sort()
    return {
      eventosMesActual:  enMes,
      eventosOtrosMeses: fueraMes,
      primerMesActivo:   sorted[0] ?? null,
      ultimoMesActivo:   sorted[sorted.length - 1] ?? null,
    }
  }, [eventos, cursor])

  const monthName = new Date(cursor.year, cursor.month, 1).toLocaleString('es-MX', { month: 'long', year: 'numeric' })
  const todayISO  = today.toISOString().slice(0, 10)

  const prevMonth = () => setCursor((c) => c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 })
  const nextMonth = () => setCursor((c) => c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 })
  const goToday   = () => setCursor({ year: today.getFullYear(), month: today.getMonth() })
  const goToYm    = (ym: string) => {
    const [y, m] = ym.split('-')
    setCursor({ year: parseInt(y), month: parseInt(m) - 1 })
  }

  if (isLoading) return <div className="text-center text-gray-400 py-12">Cargando…</div>

  const DIAS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

      {/* Header con gradient forest, mismo look del header principal */}
      <div className="bg-gradient-to-r from-forest-700 to-forest-600 text-white px-6 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <CalendarDays size={16} className="text-gold-300" />
              <h3 className="text-base font-bold">{proyectoNombre}</h3>
            </div>
            <p className="text-xs text-white/70">Calendario de hitos · <span className="text-gold-300 font-semibold">{capitalize(monthName)}</span></p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={prevMonth} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
              <ChevronLeft size={13} /> Anterior
            </button>
            <button onClick={goToday} className="px-3 py-1.5 text-xs font-bold bg-gold-500 hover:bg-gold-600 text-white rounded-lg transition-colors">
              Hoy
            </button>
            <button onClick={nextMonth} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
              Siguiente <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Hint de eventos fuera del mes actual */}
      {(eventosMesActual > 0 || eventosOtrosMeses > 0) && (
        <div className="bg-forest-50/40 border-b border-gray-100 px-6 py-2.5 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="text-gray-600">
            <strong className="text-forest-700">{eventosMesActual}</strong> {eventosMesActual === 1 ? 'evento' : 'eventos'} este mes
            {eventosOtrosMeses > 0 && (
              <> · <strong className="text-gray-700">{eventosOtrosMeses}</strong> en otros meses</>
            )}
          </div>
          {eventosOtrosMeses > 0 && primerMesActivo && ultimoMesActivo && (
            <div className="flex items-center gap-2 text-gray-500">
              <span>Ir a:</span>
              {primerMesActivo !== `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}` && (
                <button
                  onClick={() => goToYm(primerMesActivo)}
                  className="px-2 py-0.5 rounded text-forest-700 hover:bg-forest-100 font-medium transition-colors"
                >
                  Primer evento ({formatYmShort(primerMesActivo)})
                </button>
              )}
              {ultimoMesActivo !== primerMesActivo && ultimoMesActivo !== `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}` && (
                <button
                  onClick={() => goToYm(ultimoMesActivo)}
                  className="px-2 py-0.5 rounded text-forest-700 hover:bg-forest-100 font-medium transition-colors"
                >
                  Último evento ({formatYmShort(ultimoMesActivo)})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="p-5">
        <div className="grid grid-cols-7 gap-2 mb-2">
          {DIAS.map((d) => (
            <div key={d} className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center pb-1.5">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {grid.map((cell, idx) => {
            const isCurrentMonth = cell.month === cursor.month
            const isToday        = cell.dateISO === todayISO
            const dayEvents      = eventosPorDia.get(cell.dateISO) ?? []
            const isWeekend      = idx % 7 === 5 || idx % 7 === 6
            return (
              <div
                key={idx}
                className={clsx(
                  'min-h-[105px] rounded-xl border p-2 flex flex-col gap-1 transition-shadow',
                  isCurrentMonth
                    ? 'bg-white border-gray-200 hover:shadow-sm'
                    : 'bg-gray-50/60 border-gray-100',
                  isWeekend && isCurrentMonth && 'bg-gray-50/30',
                  isToday && '!bg-gradient-to-br from-gold-50 to-white !border-gold-400 ring-2 ring-gold-300/60 shadow-sm',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={clsx(
                    'text-sm font-bold tabular-nums',
                    isToday ? 'text-gold-700' :
                      isCurrentMonth ? 'text-gray-800' : 'text-gray-300'
                  )}>{cell.day}</span>
                  {isToday && (
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-gold-500 text-white px-1.5 py-0.5 rounded-full shadow-sm">
                      HOY
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1 overflow-hidden">
                  {dayEvents.slice(0, 3).map((ev, i) => <CalendarEventChip key={i} ev={ev} />)}
                  {dayEvents.length > 3 && (
                    <span className="text-[9px] text-gray-400 italic pl-1 font-medium">+ {dayEvents.length - 3} más</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Leyenda */}
      <div className="bg-gray-50/60 border-t border-gray-100 px-6 py-3">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Leyenda</p>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <LeyendaChip color="bg-blue-100 text-blue-700" icon={<Package size={10} />} label="MTO importado" />
          <LeyendaChip color="bg-amber-100 text-amber-700" icon={<FileText size={10} />} label="Cotización" />
          <LeyendaChip color="bg-purple-100 text-purple-700" icon={<ShoppingCart size={10} />} label="OC enviada" />
          <LeyendaChip color="bg-cyan-100 text-cyan-700" icon={<ShoppingCart size={10} />} label="OC Directa" />
          <LeyendaChip color="bg-red-100 text-red-700" icon={<AlertTriangle size={10} />} label="OC Urgente" />
          <LeyendaChip color="bg-orange-100 text-orange-700" icon={<ShoppingCart size={10} />} label="OC Operativa" />
          <LeyendaChip color="bg-emerald-100 text-emerald-700" icon={<Truck size={10} />} label="Recepción" />
          <LeyendaChip color="bg-yellow-100 text-yellow-700" icon={<AlertCircle size={10} />} label="Recepción c/ dif." />
        </div>
      </div>
    </div>
  )
}

// Format '2026-04' → 'abr 26'
function formatYmShort(ym: string): string {
  const [y, m] = ym.split('-')
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${meses[parseInt(m) - 1] ?? m} ${y.slice(2)}`
}

function CalendarEventChip({ ev }: { ev: ActividadEvento }) {
  const { color, icon, label } = getEventoChipMeta(ev)
  return (
    <Link
      to={getEventoLink(ev)}
      className={clsx(
        'text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1 truncate hover:opacity-80 transition-opacity',
        color
      )}
      title={getEventoTooltip(ev)}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  )
}

function LeyendaChip({ color, icon, label }: { color: string; icon: React.ReactNode; label: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium', color)}>
      {icon} {label}
    </span>
  )
}

// ─── Helpers para el calendario ──────────────────────────────────────────────

function getEventoFecha(ev: ActividadEvento): string | null {
  if (ev.tipo === 'mto_import')  return ev.fecha ?? ev.ts
  if (ev.tipo === 'oc')          return ev.fecha_emision ?? ev.ts
  if (ev.tipo === 'recepcion')   return ev.fecha_recepcion ?? ev.ts
  if (ev.tipo === 'cotizacion')  return ev.fecha_solicitud ?? ev.ts
  return null
}

function getEventoLink(ev: ActividadEvento): string {
  if (ev.tipo === 'oc')        return `/ordenes-compra?ocId=${ev.id}`
  if (ev.tipo === 'recepcion') return `/ordenes-compra?ocId=${ev.oc_id}`
  return '#'
}

function getEventoTooltip(ev: ActividadEvento): string {
  if (ev.tipo === 'mto_import') return `MTO importado: ${ev.items_count} ítems${ev.vendor_principal ? ` (${ev.vendor_principal})` : ''}`
  if (ev.tipo === 'oc') {
    const base = `${ev.numero} · ${ev.vendor ?? 'Sin vendor'} · ${fmt(ev.total)}`
    return ev.estado === 'cancelada' ? `❌ CANCELADA — ${base}` : base
  }
  if (ev.tipo === 'recepcion')  return `${ev.folio} · ${ev.estado === 'con_diferencias' ? 'Con diferencias' : 'Completa'}`
  if (ev.tipo === 'cotizacion') return `${ev.folio} · ${ev.estado}${ev.vendor ? ` · ${ev.vendor}` : ''}`
  return ''
}

function getEventoChipMeta(ev: ActividadEvento): { color: string; icon: React.ReactNode; label: string } {
  if (ev.tipo === 'mto_import') {
    return { color: 'bg-blue-100 text-blue-700', icon: <Package size={9} />, label: `MTO · ${ev.items_count}` }
  }
  if (ev.tipo === 'oc') {
    if (ev.estado === 'cancelada') {
      return { color: 'bg-gray-200 text-gray-500 line-through', icon: <ShoppingCart size={9} />, label: ev.numero }
    }
    if (ev.origen === 'URGENTE')   return { color: 'bg-red-100 text-red-700',     icon: <AlertTriangle size={9} />, label: ev.numero }
    if (ev.origen === 'DIRECTA')   return { color: 'bg-cyan-100 text-cyan-700',   icon: <ShoppingCart size={9} />,  label: ev.numero }
    if (ev.origen === 'OPERATIVA') return { color: 'bg-orange-100 text-orange-700', icon: <ShoppingCart size={9} />, label: ev.numero }
    return { color: 'bg-purple-100 text-purple-700', icon: <ShoppingCart size={9} />, label: ev.numero }
  }
  if (ev.tipo === 'recepcion') {
    if (ev.estado === 'con_diferencias') {
      return { color: 'bg-yellow-100 text-yellow-700', icon: <AlertCircle size={9} />, label: ev.folio }
    }
    return { color: 'bg-emerald-100 text-emerald-700', icon: <Truck size={9} />, label: ev.folio }
  }
  if (ev.tipo === 'cotizacion') {
    return { color: 'bg-amber-100 text-amber-700', icon: <FileText size={9} />, label: ev.folio }
  }
  return { color: 'bg-gray-100 text-gray-500', icon: null, label: '?' }
}

// Construye una grilla de 42 celdas (6 semanas × 7 días) empezando el lunes
// para el mes dado. Cada celda tiene { day, month, dateISO }.
function buildMonthGrid(year: number, month: number) {
  const firstOfMonth = new Date(year, month, 1)
  // JS: Sunday=0..Saturday=6. Lo convertimos a Lunes=0..Domingo=6
  const firstDayWeekday = (firstOfMonth.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - firstDayWeekday)

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return {
      day:     d.getDate(),
      month:   d.getMonth(),
      dateISO: toIsoDate(d),
    }
  })
}

function toIsoDate(d: Date): string {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
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
          <FiltroEstadoChip label="Ordenados" count={resumen.ordenados}   active={filtroEstado === 'ORDENADO'}  onClick={() => setFiltroEstado('ORDENADO')}  color="purple" />
          <FiltroEstadoChip label="Pendientes" count={resumen.pendientes}  active={filtroEstado === 'PENDIENTE'} onClick={() => setFiltroEstado('PENDIENTE')} color="red" />
        </div>
      </div>

      {/* Grid de items */}
      <div className="space-y-2">
        {itemsFiltrados.map((item) => (
          <ItemRow key={item.item} item={item} expanded={expanded.has(item.item)} onToggle={() => toggle(item.item)} />
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
  color: 'forest' | 'emerald' | 'yellow' | 'purple' | 'red'
}) {
  const colors = {
    forest:  active ? 'bg-forest-100 text-forest-700 border-forest-300'   : 'bg-white text-gray-600 border-gray-200 hover:border-forest-200',
    emerald: active ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-200',
    yellow:  active ? 'bg-yellow-100 text-yellow-700 border-yellow-300'   : 'bg-white text-gray-600 border-gray-200 hover:border-yellow-200',
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

function ItemRow({ item, expanded, onToggle }: { item: ItemReadiness; expanded: boolean; onToggle: () => void }) {
  const estadoMeta = getEstadoMeta(item.estado)
  const pctDisponible = item.total > 0 ? Math.round((item.disponibles / item.total) * 100) : 0

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
          {item.estado}
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
          {item.ordenados > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-medium">
              <Truck size={9} /> {item.ordenados} ord
            </span>
          )}
          {item.pendientes > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">
              <Clock size={9} /> {item.pendientes} pend
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
            {item.materiales.map((m) => <MaterialDetailRow key={m.id} m={m} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function MaterialDetailRow({ m }: { m: ItemReadinessMaterial }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 px-3 py-2 flex items-center gap-3 text-xs">
      <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 flex-shrink-0">{m.codigo}</span>
      <div className="flex-1 min-w-0">
        <p className="text-gray-800 truncate">{m.descripcion}</p>
        {m.vendor && <p className="text-[10px] text-gray-400 truncate">{m.vendor}</p>}
      </div>
      <span className="text-gray-500 tabular-nums flex-shrink-0">{Number(m.qty)} u.</span>
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
      {m.oc_numero
        ? <Link to={`/ordenes-compra?ocId=${m.oc_id}`} className="font-mono text-[10px] text-forest-700 hover:underline flex-shrink-0">{m.oc_numero}</Link>
        : <span className="text-[10px] text-gray-300 flex-shrink-0 w-20">—</span>}
    </div>
  )
}

function getEstadoMeta(estado: EstadoItemReadiness) {
  switch (estado) {
    case 'LISTO':     return { icon: CheckCircle2, badgeColor: 'bg-emerald-100 text-emerald-700',
                              borderColor: 'border-emerald-200', progressColor: 'bg-emerald-500' }
    case 'PARCIAL':   return { icon: AlertCircle,  badgeColor: 'bg-yellow-100 text-yellow-700',
                              borderColor: 'border-yellow-200', progressColor: 'bg-yellow-400' }
    case 'ORDENADO':  return { icon: Truck,        badgeColor: 'bg-purple-100 text-purple-700',
                              borderColor: 'border-purple-200', progressColor: 'bg-purple-400' }
    case 'PENDIENTE': return { icon: Clock,        badgeColor: 'bg-red-100 text-red-700',
                              borderColor: 'border-red-200',    progressColor: 'bg-red-400' }
  }
}
