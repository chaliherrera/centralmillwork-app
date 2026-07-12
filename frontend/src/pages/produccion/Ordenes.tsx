import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import clsx from 'clsx'
import DataTable, { Column } from '@/components/ui/DataTable'
import { produccionService } from '@/services/produccion'
import type { OrdenProduccion, StatusOrden, Prioridad } from '@/types/produccion'

const STATUS_FILTERS: { value: StatusOrden | 'todas'; label: string }[] = [
  { value: 'todas',     label: 'Todas' },
  { value: 'Pendiente', label: 'Pendientes' },
  { value: 'En Proceso', label: 'En Proceso' },
  { value: 'Pausada',   label: 'Pausadas' },
  { value: 'Completada', label: 'Completadas' },
]

const STATUS_BADGE: Record<StatusOrden, string> = {
  'Pendiente':  'bg-gray-100 text-gray-700 border-gray-200',
  'En Proceso': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Pausada':    'bg-amber-100 text-amber-800 border-amber-200',
  'Completada': 'bg-blue-100 text-blue-800 border-blue-200',
  'Cancelada':  'bg-red-100 text-red-700 border-red-200',
}

const PRIORIDAD_BADGE: Record<Prioridad, string> = {
  Alta:  'bg-red-100 text-red-800',
  Media: 'bg-amber-100 text-amber-800',
  Baja:  'bg-gray-100 text-gray-700',
}

export default function Ordenes() {
  const nav = useNavigate()
  const [page, setPage]       = useState(1)
  const [search, setSearch]   = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusOrden | 'todas'>('todas')

  const filters = useMemo(() => {
    const f: Record<string, unknown> = { page, limit: 20 }
    if (search.trim()) f.search = search.trim()
    if (statusFilter !== 'todas') f.status = statusFilter
    return f
  }, [page, search, statusFilter])

  const { data, isLoading } = useQuery({
    queryKey: ['ordenes-produccion', filters],
    queryFn:  () => produccionService.ordenes(filters),
  })

  const { data: kpis } = useQuery({
    queryKey: ['ordenes-produccion-kpis'],
    queryFn:  produccionService.ordenesKpis,
    refetchInterval: 60_000,
  })

  const columns: Column<OrdenProduccion>[] = [
    {
      key: 'numero_orden',
      header: 'N° Orden',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Link to={`/produccion/ordenes/${r.id}`} className="font-bold text-forest-700 hover:text-gold-600">
            {r.numero_orden}
          </Link>
          {r.tipo === 'MUESTRA' && (
            <span
              className="text-[9px] font-bold uppercase tracking-wider bg-gold-100 text-gold-700 px-1.5 py-0.5 rounded-full border border-gold-300"
              title="Esta OP fue auto-creada desde el módulo de Muestras"
            >
              Muestra
            </span>
          )}
        </div>
      ),
    },
    {
      // Nueva columna dedicada (2026-07-12): el número de OP dejó de embeber
      // el código del proyecto, ahora se muestra explícito acá.
      key: 'proyecto_codigo',
      header: 'Proyecto',
      render: (r) => r.proyecto_codigo ? (
        <div>
          <div className="font-mono text-xs font-semibold text-forest-700">{r.proyecto_codigo}</div>
          {r.proyecto_nombre && (
            <div className="text-xs text-gray-500 truncate max-w-[200px]" title={r.proyecto_nombre}>
              {r.proyecto_nombre}
            </div>
          )}
        </div>
      ) : (
        <span className="text-xs text-gray-400 italic">sin proyecto</span>
      ),
    },
    {
      key: 'numero_item',
      header: 'Item',
      render: (r) => (
        <div>
          <div className="font-medium text-gray-900">{r.numero_item}</div>
          <div className="text-xs text-gray-500">
            {r.cantidad} {r.unidad}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => (
        <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-medium border', STATUS_BADGE[r.status])}>
          {r.status}
        </span>
      ),
    },
    {
      key: 'estacion_actual',
      header: 'Estación',
      render: (r) => r.estacion_actual ? (
        <span className="px-2 py-0.5 rounded bg-gold-50 text-gold-800 text-xs font-medium uppercase">
          {r.estacion_actual.replace('_', ' ')}
        </span>
      ) : <span className="text-gray-400 text-xs">—</span>,
    },
    {
      key: 'personal_asignado_nombre',
      header: 'Asignado',
      render: (r) => r.personal_asignado_iniciales ? (
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-forest-100 text-forest-700 text-xs font-bold flex items-center justify-center">
            {r.personal_asignado_iniciales}
          </span>
          <span className="text-sm">{r.personal_asignado_nombre}</span>
        </div>
      ) : <span className="text-gray-400 text-xs">Sin asignar</span>,
    },
    {
      key: 'prioridad',
      header: 'Prioridad',
      render: (r) => (
        <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', PRIORIDAD_BADGE[r.prioridad])}>
          {r.prioridad}
        </span>
      ),
    },
    {
      key: 'fecha_entrega',
      header: 'Entrega',
      render: (r) => r.fecha_entrega
        ? new Date(r.fecha_entrega).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
        : <span className="text-gray-400 text-xs">—</span>,
    },
  ]

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Activas"          value={kpis?.activas         ?? '—'} color="emerald" />
        <KpiCard label="Completadas hoy"  value={kpis?.completadas_hoy ?? '—'} color="blue" />
        <KpiCard label="Pausadas"         value={kpis?.pausadas        ?? '—'} color="amber" />
        <KpiCard label="Alta prioridad"   value={kpis?.alta_prioridad  ?? '—'} color="red" />
        <KpiCard label="Vencidas"         value={kpis?.vencidas        ?? '—'} color="red" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); setPage(1) }}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                statusFilter === f.value
                  ? 'bg-forest-700 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              )}
            >
              {f.label}
            </button>
          ))}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Buscar por N° o item…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="input pl-9 w-56 text-sm"
            />
          </div>
        </div>
        <button onClick={() => nav('/produccion/ordenes/nueva')} className="btn-primary">
          <Plus size={16} /> Nueva orden
        </button>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        limit={20}
        onPageChange={setPage}
        onRowClick={(r) => nav(`/produccion/ordenes/${r.id}`)}
        emptyMessage="No se encontraron órdenes"
      />
    </div>
  )
}

function KpiCard({ label, value, color }: {
  label: string
  value: number | string
  color: 'emerald' | 'blue' | 'amber' | 'red'
}) {
  const colorMap = {
    emerald: 'text-emerald-700',
    blue: 'text-blue-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  }
  return (
    <div className="kpi-card">
      <div>
        <div className="kpi-label">{label}</div>
        <div className={clsx('kpi-value', colorMap[color])}>{value}</div>
      </div>
    </div>
  )
}
