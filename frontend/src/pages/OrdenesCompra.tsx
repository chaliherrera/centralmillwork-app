import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, ShoppingCart, Warehouse, DollarSign, Clock,
  AlertTriangle, FileText, X, Plus, Pencil, Trash2,
  CheckCircle2, Calendar, Package, Timer, AlertCircle, ImageIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import OrdenCompraForm from '@/components/modules/ordenes_compra/OrdenCompraForm'
import ReporteModal from '@/components/ui/ReporteModal'
import { ordenesCompraService } from '@/services/ordenesCompra'
import { recepcionesService } from '@/services/recepciones'
import DynamicImageGrid from '@/components/ui/DynamicImageGrid'
import type { OrdenCompra, Material } from '@/types'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${m}/${day}/${y}`
}

const CATEGORIAS = ['MILLWORK', 'HARDWARE', 'PAINT', 'SOLID WOOD', 'EDGE BANDING', 'METAL', 'LAMINATE', 'GLASS', 'OTHER']

// ─── Timeline ─────────────────────────────────────────────────────────────────
function Timeline({ oc }: { oc: OrdenCompra }) {
  const steps = [
    { label: 'Fecha MTO',   date: oc.fecha_mto,                done: !!oc.fecha_mto },
    { label: 'Fecha OC',    date: oc.fecha_emision,            done: !!oc.fecha_emision },
    { label: 'ETA',         date: oc.fecha_entrega_estimada,   done: !!oc.fecha_entrega_real, warn: oc.flag_vencida },
    { label: 'Recepción',   date: oc.fecha_entrega_real,       done: !!oc.fecha_entrega_real, final: true },
  ]
  return (
    <div className="relative py-1">
      <div className="absolute top-3 left-4 right-4 h-px bg-gray-100 z-0" />
      <div className="flex items-start justify-between relative z-10">
        {steps.map((s, i) => (
          <div key={i} className="flex flex-col items-center flex-1">
            <div className={clsx(
              'w-6 h-6 rounded-full border-2 flex items-center justify-center mb-1.5',
              s.final && s.done  ? 'bg-green-500 border-green-500' :
              s.done             ? 'bg-forest-500 border-forest-500' :
              s.warn             ? 'bg-red-100 border-red-400' :
                                   'bg-white border-gray-200'
            )}>
              {s.done
                ? <CheckCircle2 size={13} className="text-white" />
                : <div className={clsx('w-2 h-2 rounded-full', s.warn ? 'bg-red-400' : 'bg-gray-200')} />}
            </div>
            <p className="text-xs font-medium text-gray-500 text-center leading-tight">{s.label}</p>
            <p className={clsx('text-xs text-center tabular-nums mt-0.5',
              s.warn && !s.done ? 'text-red-500 font-bold' : 'text-gray-400'
            )}>
              {fmtDate(s.date)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Materials list ───────────────────────────────────────────────────────────
function MaterialesLote({ ocId }: { ocId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['oc-materiales-lote', ocId],
    queryFn: () => ordenesCompraService.getMaterialesLote(ocId),
    staleTime: 30_000,
  })
  const mats: Material[] = data?.data ?? []

  if (isLoading) return (
    <div className="space-y-1.5">
      {[1,2,3].map((i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
    </div>
  )
  if (!mats.length) return (
    <p className="text-xs text-gray-300 italic">Sin materiales en este lote</p>
  )
  return (
    <div className="space-y-0 border border-gray-100 rounded-lg overflow-hidden">
      <div className="grid grid-cols-[3rem_1fr_auto] gap-0 bg-gray-50 px-2 py-1.5">
        <span className="text-xs font-semibold text-gray-400 uppercase">Cód.</span>
        <span className="text-xs font-semibold text-gray-400 uppercase">Descripción</span>
        <span className="text-xs font-semibold text-gray-400 uppercase text-right">QTY</span>
      </div>
      {mats.map((m) => (
        <div key={m.id} className="grid grid-cols-[3rem_1fr_auto] gap-0 px-2 py-1.5 border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
          <span className="text-xs font-mono text-gray-500 truncate">{m.codigo || '—'}</span>
          <span className="text-xs text-gray-700 truncate pr-2">{m.descripcion}</span>
          <span className="text-xs font-medium text-gray-700 text-right tabular-nums">{Number(m.qty)} {m.unidad}</span>
        </div>
      ))}
    </div>
  )
}


// ─── Recepcion Historial ──────────────────────────────────────────────────────
function RecepcionHistorialSection({ ocId }: { ocId: number }) {
  const { data } = useQuery({
    queryKey: ['recepcion-historial', ocId],
    queryFn: () => recepcionesService.getHistorial(ocId),
    staleTime: 10_000,
  })
  const historial = data?.data ?? []
  if (!historial.length) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Recepciones</p>
      <div className="space-y-2">
        {historial.map((rec) => (
          <div key={rec.id} className="rounded-lg border border-green-100 bg-green-50 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono font-bold text-gray-700">{rec.folio}</span>
              <span className={clsx(
                'text-xs font-semibold px-2 py-0.5 rounded-full',
                rec.estado === 'completa'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
              )}>
                {rec.estado === 'completa' ? 'TOTAL' : 'PARCIAL'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {fmtDate(rec.fecha_recepcion)}{rec.recibio ? ` · Recibió: ${rec.recibio}` : ''}
            </p>
            {rec.notas && (
              <p className="text-xs text-gray-600 italic mt-1 bg-white/60 rounded px-2 py-1 border border-green-100">
                "{rec.notas}"
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function OcDetailPanel({
  oc,
  onClose,
  onEdit,
  onDelete,
  onOpenReporte,
}: {
  oc: OrdenCompra
  onClose: () => void
  onEdit: (o: OrdenCompra) => void
  onDelete: (o: OrdenCompra) => void
  onOpenReporte: () => void
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="bg-forest-700 text-white px-4 py-3 flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono text-sm font-bold">{oc.numero}</span>
              {oc.estado_display === 'EN_EL_TALLER' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-400/20 text-green-200 border border-green-400/30">
                  <Warehouse size={10} /> EN TALLER
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-400/20 text-orange-200 border border-orange-400/30">
                  <ShoppingCart size={10} /> ORDENADO
                </span>
              )}
            </div>
            <p className="text-xs text-white/70 truncate">{oc.proyecto?.codigo} · {oc.proyecto?.nombre}</p>
            <p className="text-base font-bold text-gold-300 mt-0.5">{fmt(Number(oc.total))}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => onEdit(oc)} className="p-1.5 hover:bg-white/10 rounded transition-colors" title="Editar">
              <Pencil size={14} />
            </button>
            <button onClick={() => onDelete(oc)} className="p-1.5 hover:bg-red-400/20 rounded transition-colors" title="Eliminar">
              <Trash2 size={14} />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

        {/* Data grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Proveedor',    value: oc.proveedor?.nombre },
            { label: 'Categoría',    value: oc.categoria || '—' },
            { label: 'Fecha MTO',    value: fmtDate(oc.fecha_mto) },
            { label: 'Fecha OC',     value: fmtDate(oc.fecha_emision) },
            { label: 'ETA',          value: fmtDate(oc.fecha_entrega_estimada), warn: oc.flag_vencida },
            { label: 'F. Recepción', value: fmtDate(oc.fecha_entrega_real) },
          ].map(({ label, value, warn }) => (
            <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-400 mb-0.5">{label}</p>
              <p className={clsx('text-sm font-semibold truncate', warn ? 'text-red-600' : 'text-gray-800')}>
                {value ?? '—'}
              </p>
            </div>
          ))}
        </div>

        {/* Flags */}
        {(oc.flag_vencida || oc.flag_2dias || oc.flag_retraso) && (
          <div className="flex flex-wrap gap-1.5">
            {oc.flag_vencida && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                <AlertCircle size={11} /> ETA Vencida
              </span>
            )}
            {oc.flag_2dias && !oc.flag_vencida && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-200">
                <Timer size={11} /> Vence en 2 días
              </span>
            )}
            {oc.flag_retraso && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700 border border-yellow-200">
                <AlertTriangle size={11} /> Recibida con retraso
              </span>
            )}
          </div>
        )}

        {/* Timeline */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Línea de tiempo</p>
          <Timeline oc={oc} />
        </div>

        {/* Recepcion historial */}
        <RecepcionHistorialSection ocId={oc.id} />

        {/* Notas */}
        {oc.notas && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Notas OC</p>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {oc.notas}
            </p>
          </div>
        )}

        {/* Materials */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Materiales del lote
          </p>
          <MaterialesLote ocId={oc.id} />
        </div>

        {/* Image gallery — only for EN_EL_TALLER */}
        {oc.estado_display === 'EN_EL_TALLER' && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon size={13} className="text-gray-400" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Imágenes</p>
            </div>
            <DynamicImageGrid ocId={oc.id} />
          </div>
        )}

        {/* Report buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={onOpenReporte}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <FileText size={13} /> Reporte Compras
          </button>
          <button
            onClick={onOpenReporte}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <FileText size={13} /> Reporte Producción
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────
function OcCard({ oc, selected, onClick }: { oc: OrdenCompra; selected: boolean; onClick: () => void }) {
  const enTaller = oc.estado_display === 'EN_EL_TALLER'

  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white rounded-xl border cursor-pointer transition-all duration-150 p-3 space-y-2',
        'hover:shadow-md hover:-translate-y-0.5',
        selected
          ? 'border-gold-400 shadow-md ring-2 ring-gold-300/50'
          : oc.flag_vencida
            ? 'border-red-200 hover:border-red-300 bg-red-50/30'
            : enTaller
              ? 'border-green-200 hover:border-green-300'
              : 'border-orange-200 hover:border-orange-300 bg-orange-50/20'
      )}
    >
      {/* OC # + flags */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-bold text-forest-700">{oc.numero}</span>
        <div className="flex items-center gap-1">
          {oc.flag_vencida && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="ETA vencida" />}
          {oc.flag_2dias && !oc.flag_vencida && <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" title="Vence en 2 días" />}
          {oc.flag_retraso && <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" title="Recibida con retraso" />}
        </div>
      </div>

      {/* Project + vendor */}
      <div>
        <p className="text-xs font-semibold text-gray-700 truncate">{oc.proyecto?.nombre ?? '—'}</p>
        <p className="text-xs text-gray-400 truncate">{oc.proveedor?.nombre ?? '—'}</p>
      </div>

      {/* Category */}
      {oc.categoria && (
        <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
          {oc.categoria}
        </span>
      )}

      {/* Amount + date */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-50">
        <span className="text-sm font-bold text-gray-800">{fmt(Number(oc.total))}</span>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Calendar size={10} />
          <span className="tabular-nums">{fmtDate(oc.fecha_emision)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OrdenesCompra() {
  const [search, setSearch]             = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [catFilter, setCatFilter]       = useState('')
  const [estadoFilter, setEstadoFilter] = useState('')
  const [fechaDesde, setFechaDesde]     = useState('')
  const [fechaHasta, setFechaHasta]     = useState('')
  const [selectedOc, setSelectedOc]     = useState<OrdenCompra | undefined>()
  const [formOpen, setFormOpen]         = useState(false)
  const [editing, setEditing]           = useState<OrdenCompra | undefined>()
  const [reporteOpen, setReporteOpen]   = useState(false)

  const qc = useQueryClient()

  const { data: kpisData } = useQuery({
    queryKey: ['oc-kpis'],
    queryFn: () => ordenesCompraService.getKpis(),
    staleTime: 15_000,
  })
  const kpis = kpisData?.data

  const { data: allData, isLoading } = useQuery({
    queryKey: ['ordenes-compra-kanban', search, vendorFilter, catFilter, estadoFilter, fechaDesde, fechaHasta],
    queryFn: () => ordenesCompraService.getAll({
      limit: 300,
      search:          search       || undefined,
      vendor:          vendorFilter || undefined,
      categoria:       catFilter    || undefined,
      estado_display:  estadoFilter || undefined,
      fecha_mto_desde: fechaDesde   || undefined,
      fecha_mto_hasta: fechaHasta   || undefined,
    }),
    staleTime: 15_000,
  })

  const allOcs = allData?.data ?? []

  const vendors = useMemo(
    () => [...new Set(allOcs.map((o) => o.proveedor?.nombre).filter(Boolean) as string[])].sort(),
    [allOcs]
  )

  const ordenados = allOcs.filter((o) => o.estado_display === 'ORDENADO')
  const enTaller  = allOcs.filter((o) => o.estado_display === 'EN_EL_TALLER')

  const clearFilters = () => {
    setSearch(''); setVendorFilter(''); setCatFilter(''); setEstadoFilter(''); setFechaDesde(''); setFechaHasta('')
  }
  const hasFilters = !!(search || vendorFilter || catFilter || estadoFilter || fechaDesde || fechaHasta)

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ordenesCompraService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ordenes-compra-kanban'] })
      qc.invalidateQueries({ queryKey: ['oc-kpis'] })
      setSelectedOc(undefined)
      toast.success('Orden eliminada')
    },
  })

  const openEdit  = (o: OrdenCompra) => { setEditing(o); setFormOpen(true) }
  const openNew   = () => { setEditing(undefined); setFormOpen(true) }
  const handleClose = () => { setFormOpen(false); setEditing(undefined) }

  const confirmDelete = (o: OrdenCompra) => {
    if (window.confirm(`¿Eliminar la orden "${o.numero}"?`)) deleteMutation.mutate(o.id)
  }

  const montoTotal = kpis
    ? parseFloat(kpis.monto_ordenado) + parseFloat(kpis.monto_en_taller)
    : 0
  const enTallerCount = kpis
    ? parseInt(kpis.total) - parseInt(kpis.pendientes_recepcion)
    : 0

  return (
    <div className="space-y-4">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="kpi-card">
          <div className="p-2.5 bg-forest-50 rounded-lg shrink-0"><Package size={20} className="text-forest-600" /></div>
          <div>
            <p className="kpi-label">Total OCs</p>
            <p className="kpi-value text-gray-900">{kpis ? parseInt(kpis.total) : '—'}</p>
          </div>
        </div>
        <div className="kpi-card">
          <div className="p-2.5 bg-gold-50 rounded-lg shrink-0"><DollarSign size={20} className="text-gold-600" /></div>
          <div className="min-w-0">
            <p className="kpi-label">Monto Total</p>
            <p className="kpi-value text-gold-700 text-[22px]">{kpis ? fmt(montoTotal) : '—'}</p>
          </div>
        </div>
        <div className="kpi-card">
          <div className="p-2.5 bg-orange-50 rounded-lg shrink-0"><ShoppingCart size={20} className="text-orange-500" /></div>
          <div>
            <p className="kpi-label">Pendientes</p>
            <p className="kpi-value text-orange-600">{kpis ? parseInt(kpis.pendientes_recepcion) : '—'}</p>
          </div>
        </div>
        <div className="kpi-card">
          <div className="p-2.5 bg-green-50 rounded-lg shrink-0"><Warehouse size={20} className="text-green-600" /></div>
          <div>
            <p className="kpi-label">En Taller</p>
            <p className="kpi-value text-green-700">{kpis ? enTallerCount : '—'}</p>
          </div>
        </div>
        <div className={clsx('kpi-card', kpis && parseInt(kpis.con_retraso) > 0 ? 'border-red-200' : '')}>
          <div className={clsx('p-2.5 rounded-lg shrink-0', kpis && parseInt(kpis.con_retraso) > 0 ? 'bg-red-50' : 'bg-gray-50')}>
            <AlertTriangle size={20} className={kpis && parseInt(kpis.con_retraso) > 0 ? 'text-red-500' : 'text-gray-400'} />
          </div>
          <div>
            <p className="kpi-label">Retrasadas</p>
            <p className={clsx('kpi-value', kpis && parseInt(kpis.con_retraso) > 0 ? 'text-red-600' : 'text-gray-800')}>
              {kpis ? parseInt(kpis.con_retraso) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Filter toolbar ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Buscar OC, proyecto, vendor…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9 w-48 text-sm"
              />
            </div>

            {/* Vendor */}
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className={clsx('input text-sm w-40', vendorFilter && 'border-forest-400 text-forest-700 bg-forest-50')}
            >
              <option value="">Todos vendors</option>
              {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>

            {/* Categoría */}
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className={clsx('input text-sm w-36', catFilter && 'border-gold-400 text-gold-700 bg-gold-50')}
            >
              <option value="">Categorías</option>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Estado chips */}
            <div className="flex items-center gap-1">
              {[
                { v: '',            label: 'Todos',     active: 'bg-forest-500 text-white border-forest-500' },
                { v: 'ORDENADO',    label: 'Ordenado',  active: 'bg-orange-500 text-white border-orange-500' },
                { v: 'EN_EL_TALLER',label: 'En Taller', active: 'bg-green-500 text-white border-green-500' },
              ].map(({ v, label, active }) => (
                <button
                  key={v}
                  onClick={() => setEstadoFilter(v)}
                  className={clsx(
                    'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border',
                    estadoFilter === v ? active : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Fecha MTO range */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 flex-shrink-0">MTO</span>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className={clsx('input text-xs w-32', fechaDesde && 'border-gold-400')}
                title="Fecha MTO desde"
              />
              <span className="text-gray-300 text-xs">—</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className={clsx('input text-xs w-32', fechaHasta && 'border-gold-400')}
                title="Fecha MTO hasta"
              />
            </div>

            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-red-500 underline transition-colors">
                Limpiar
              </button>
            )}
          </div>

          {/* Nueva Orden */}
          <button onClick={openNew} className="btn-primary">
            <Plus size={15} /> Nueva Orden
          </button>
        </div>
      </div>

      {/* ── Kanban ── */}
      <div className="flex gap-4 overflow-x-auto pb-1">

          {/* ORDENADO */}
          <div className="w-[320px] shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-orange-400" />
              <h3 className="text-sm font-bold text-gray-700">ORDENADO</h3>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                {isLoading ? '…' : ordenados.length}
              </span>
              {!isLoading && (
                <span className="text-xs text-gray-400 ml-auto tabular-nums">
                  {fmt(ordenados.reduce((s, o) => s + Number(o.total), 0))}
                </span>
              )}
            </div>
            <div className="space-y-2.5">
              {isLoading && Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-3 animate-pulse space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-24" />
                  <div className="h-3 bg-gray-100 rounded w-40" />
                  <div className="h-3 bg-gray-100 rounded w-32" />
                </div>
              ))}
              {!isLoading && ordenados.length === 0 && (
                <div className="bg-white rounded-xl border border-dashed border-gray-200 py-10 text-center">
                  <Clock size={24} className="mx-auto text-gray-200 mb-2" />
                  <p className="text-xs text-gray-300">Sin órdenes pendientes</p>
                </div>
              )}
              {!isLoading && ordenados.map((oc) => (
                <OcCard
                  key={oc.id}
                  oc={oc}
                  selected={selectedOc?.id === oc.id}
                  onClick={() => setSelectedOc(selectedOc?.id === oc.id ? undefined : oc)}
                />
              ))}
            </div>
          </div>

          {/* EN EL TALLER */}
          <div className="w-[320px] shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <h3 className="text-sm font-bold text-gray-700">EN EL TALLER</h3>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                {isLoading ? '…' : enTaller.length}
              </span>
              {!isLoading && (
                <span className="text-xs text-gray-400 ml-auto tabular-nums">
                  {fmt(enTaller.reduce((s, o) => s + Number(o.total), 0))}
                </span>
              )}
            </div>
            <div className="space-y-2.5">
              {isLoading && Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-3 animate-pulse space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-24" />
                  <div className="h-3 bg-gray-100 rounded w-40" />
                  <div className="h-3 bg-gray-100 rounded w-32" />
                </div>
              ))}
              {!isLoading && enTaller.length === 0 && (
                <div className="bg-white rounded-xl border border-dashed border-gray-200 py-10 text-center">
                  <Warehouse size={24} className="mx-auto text-gray-200 mb-2" />
                  <p className="text-xs text-gray-300">Sin materiales en taller</p>
                </div>
              )}
              {!isLoading && enTaller.map((oc) => (
                <OcCard
                  key={oc.id}
                  oc={oc}
                  selected={selectedOc?.id === oc.id}
                  onClick={() => setSelectedOc(selectedOc?.id === oc.id ? undefined : oc)}
                />
              ))}
            </div>
          </div>
        </div>

      {/* ── Detail drawer ── */}
      {selectedOc && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[1px]"
            onClick={() => setSelectedOc(undefined)}
          />
          <div className={clsx(
            'fixed z-50 shadow-2xl flex flex-col',
            'sm:right-0 sm:top-0 sm:h-screen sm:w-[480px]',
            'max-sm:left-0 max-sm:right-0 max-sm:bottom-0 max-sm:h-[92vh] max-sm:rounded-t-2xl',
          )}>
            <OcDetailPanel
              key={selectedOc.id}
              oc={selectedOc}
              onClose={() => setSelectedOc(undefined)}
              onEdit={openEdit}
              onDelete={confirmDelete}
              onOpenReporte={() => setReporteOpen(true)}
            />
          </div>
        </>
      )}

      <OrdenCompraForm open={formOpen} onClose={handleClose} orden={editing} />
      <ReporteModal open={reporteOpen} onClose={() => setReporteOpen(false)} />
    </div>
  )
}
