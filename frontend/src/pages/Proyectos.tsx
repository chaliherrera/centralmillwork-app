import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, Pencil, Trash2,
  FolderOpen, User, Calendar, LayoutGrid, List, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import StatusBadge from '@/components/ui/StatusBadge'
import ProyectoForm from '@/components/modules/proyectos/ProyectoForm'
import DataTable, { Column } from '@/components/ui/DataTable'
import { proyectosService } from '@/services/proyectos'
import type { Proyecto } from '@/types'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const ESTADO_LABELS: Record<string, string> = {
  activo: 'Activo', completado: 'Completado',
}

const ESTADO_DOT: Record<string, string> = {
  activo: 'bg-green-500', completado: 'bg-blue-500',
}

interface CardProps {
  p: Proyecto
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}

function ProyectoCard({ p, selected, onSelect, onEdit, onDelete }: CardProps) {
  const budget   = Number(p.presupuesto)
  const totalOC  = Number(p.total_ocs ?? 0)
  const realPct  = budget > 0 ? (totalOC / budget) * 100 : 0
  const barWidth = Math.min(100, realPct)
  const overBudget = realPct > 100
  const nearBudget = realPct >= 80 && !overBudget

  const barColor = overBudget
    ? 'from-red-500 to-red-400'
    : nearBudget
    ? 'from-yellow-500 to-yellow-400'
    : 'from-green-500 to-green-400'

  return (
    <div
      onClick={onSelect}
      className={clsx(
        'bg-white rounded-xl border shadow-sm hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden group cursor-pointer',
        selected ? 'border-forest-400 ring-2 ring-forest-400/30' : 'border-gray-100'
      )}
    >
      {/* Top accent */}
      <div className={clsx('h-1 bg-gradient-to-r', selected ? 'from-forest-500 to-forest-400' : 'from-gold-500 to-gold-400')} />

      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <StatusBadge status={p.estado} />
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              className="p-1.5 text-gray-400 hover:text-forest-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Editar"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Eliminar"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Project name */}
        <div>
          <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{p.nombre}</h3>
          <span className="font-mono text-xs text-gray-400 mt-0.5 block">{p.codigo}</span>
        </div>

        {/* Meta */}
        <div className="space-y-1.5 flex-1">
          {p.cliente && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <User size={12} className="shrink-0 text-gray-400" />
              <span className="truncate">{p.cliente}</span>
            </div>
          )}
          {p.responsable && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <FolderOpen size={12} className="shrink-0 text-gray-400" />
              <span className="truncate">{p.responsable}</span>
            </div>
          )}
          {p.fecha_inicio && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Calendar size={12} className="shrink-0 text-gray-400" />
              <span>{format(new Date(p.fecha_inicio), 'dd MMM yyyy', { locale: es })}</span>
              {p.fecha_fin_estimada && (
                <span className="text-gray-400">
                  → {format(new Date(p.fecha_fin_estimada), 'dd MMM yyyy', { locale: es })}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Budget progress: Total OCs / Budget */}
        <div className="pt-3 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1.5">
            <div
              className={clsx('bg-gradient-to-r h-1.5 rounded-full transition-all duration-500', barColor)}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            <span className={clsx('font-semibold', overBudget ? 'text-red-600' : nearBudget ? 'text-yellow-600' : 'text-green-700')}>
              {fmt(totalOC)}
            </span>
            {' ejecutado de '}
            <span className="font-medium text-gray-600">{fmt(budget)}</span>
            {' — '}
            <span className={clsx('font-bold', overBudget ? 'text-red-600' : nearBudget ? 'text-yellow-600' : 'text-green-700')}>
              {realPct.toFixed(0)}%
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Proyectos() {
  const [page, setPage]             = useState(1)
  const [search, setSearch]         = useState('')
  const [formOpen, setFormOpen]     = useState(false)
  const [editing, setEditing]       = useState<Proyecto | undefined>()
  const [viewMode, setViewMode]     = useState<'grid' | 'list'>('grid')
  const [estadoFilter, setEstadoFilter] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['proyectos', page, search],
    queryFn: () => proyectosService.getAll({ page, limit: 50, search }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => proyectosService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proyectos'] })
      setSelectedId(null)
      toast.success('Proyecto eliminado')
    },
  })

  const openNew     = () => { setEditing(undefined); setFormOpen(true) }
  const openEdit    = (p: Proyecto) => { setEditing(p); setFormOpen(true) }
  const handleClose = () => { setFormOpen(false); setEditing(undefined) }
  const confirmDelete = (p: Proyecto) => {
    if (window.confirm(`¿Eliminar el proyecto "${p.nombre}"?`)) deleteMutation.mutate(p.id)
  }
  const handleSelect = (id: number) => setSelectedId((prev) => (prev === id ? null : id))

  const allProyectos = data?.data ?? []
  const ocByProject: Record<number, number> = Object.fromEntries(
    allProyectos.map((p) => [p.id, Number(p.total_ocs ?? 0)])
  )
  const filtered = estadoFilter ? allProyectos.filter((p) => p.estado === estadoFilter) : allProyectos
  const selectedProyecto = selectedId ? allProyectos.find((p) => p.id === selectedId) : null

  // KPI computations — all Number() casts to handle DB numeric strings
  const activos = allProyectos.filter((p) => p.estado === 'activo').length
  const estadoCounts = Object.fromEntries(
    Object.keys(ESTADO_LABELS).map((e) => [e, allProyectos.filter((p) => p.estado === e).length])
  )

  // KPI 3: no selection → sum of OC totals for all active projects
  //         selection  → budget of selected project
  const kpi3Label = selectedProyecto ? selectedProyecto.codigo : 'Total OCs (activos)'
  const kpi3Value = selectedProyecto
    ? fmt(Number(selectedProyecto.presupuesto))
    : fmt(
        allProyectos
          .filter((p) => p.estado === 'activo')
          .reduce((s, p) => s + (ocByProject[p.id] ?? 0), 0)
      )

  const columns: Column<Proyecto>[] = [
    { key: 'codigo', header: 'Código', sortable: true, className: 'font-mono text-xs w-36' },
    { key: 'nombre', header: 'Proyecto', sortable: true },
    { key: 'cliente', header: 'Cliente / Owner' },
    { key: 'responsable', header: 'Responsable' },
    { key: 'estado', header: 'Estado', render: (r) => <StatusBadge status={r.estado} /> },
    {
      key: 'fecha_inicio', header: 'Inicio',
      render: (r) => r.fecha_inicio ? format(new Date(r.fecha_inicio), 'dd MMM yyyy', { locale: es }) : '—',
    },
    {
      key: 'presupuesto', header: 'Budget', className: 'text-right',
      render: (r) => <span className="font-semibold text-forest-700">{fmt(Number(r.presupuesto))}</span>,
    },
    {
      key: 'id', header: 'OCs', className: 'text-right',
      render: (r) => <span className="text-sm text-gray-600">{fmt(ocByProject[r.id] ?? 0)}</span>,
    },
    {
      key: 'id', header: '', className: 'w-20',
      render: (r) => (
        <div className="flex items-center gap-1">
          <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-forest-600 hover:bg-gray-100 rounded transition-colors"><Pencil size={14} /></button>
          <button onClick={() => confirmDelete(r)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 size={14} /></button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card">
          <div className="p-2.5 bg-forest-50 rounded-lg shrink-0">
            <FolderOpen size={20} className="text-forest-600" />
          </div>
          <div>
            <p className="kpi-label">Total proyectos</p>
            <p className="kpi-value text-gray-900">{allProyectos.length}</p>
          </div>
        </div>
        <div className="kpi-card">
          <div className="p-2.5 bg-green-50 rounded-lg shrink-0">
            <FolderOpen size={20} className="text-green-600" />
          </div>
          <div>
            <p className="kpi-label">Activos</p>
            <p className="kpi-value text-green-700">{activos}</p>
          </div>
        </div>
        <div
          className={clsx('kpi-card relative cursor-pointer', selectedProyecto ? 'border-forest-200' : '')}
          onClick={() => selectedProyecto && setSelectedId(null)}
        >
          <div className={clsx('p-2.5 rounded-lg shrink-0', selectedProyecto ? 'bg-forest-50' : 'bg-gold-50')}>
            <Calendar size={20} className={selectedProyecto ? 'text-forest-600' : 'text-gold-600'} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="kpi-label truncate pr-5">{kpi3Label}</p>
            <p className={clsx('kpi-value', selectedProyecto ? 'text-forest-700' : 'text-gold-700')}>{kpi3Value}</p>
          </div>
          {selectedProyecto && (
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedId(null) }}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
              title="Deseleccionar"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="kpi-card">
          <div className="p-2.5 bg-blue-50 rounded-lg shrink-0">
            <FolderOpen size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="kpi-label">Completados</p>
            <p className="kpi-value text-blue-700">{estadoCounts.completado ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Buscar proyectos…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="input pl-9 w-52 text-sm"
            />
          </div>

          {/* Estado pills */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setEstadoFilter('')}
              className={clsx(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
                estadoFilter === ''
                  ? 'bg-forest-500 text-white border-forest-500'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
              )}
            >
              Todos ({allProyectos.length})
            </button>
            {Object.entries(ESTADO_LABELS).map(([key, label]) =>
              (estadoCounts[key] ?? 0) > 0 ? (
                <button
                  key={key}
                  onClick={() => setEstadoFilter(estadoFilter === key ? '' : key)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
                    estadoFilter === key
                      ? 'bg-forest-500 text-white border-forest-500'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
                  )}
                >
                  <span className={clsx('w-1.5 h-1.5 rounded-full', ESTADO_DOT[key])} />
                  {label} ({estadoCounts[key]})
                </button>
              ) : null
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={clsx('p-1.5 rounded-md transition-colors', viewMode === 'grid' ? 'bg-white shadow-sm text-forest-600' : 'text-gray-400 hover:text-gray-600')}
              title="Vista tarjetas"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={clsx('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'bg-white shadow-sm text-forest-600' : 'text-gray-400 hover:text-gray-600')}
              title="Vista lista"
            >
              <List size={16} />
            </button>
          </div>
          <button onClick={openNew} className="btn-primary">
            <Plus size={16} /> Nuevo Proyecto
          </button>
        </div>
      </div>

      {/* Selection hint */}
      {!selectedId && viewMode === 'grid' && filtered.length > 0 && (
        <p className="text-xs text-gray-400">Haz click en una tarjeta para ver su budget en el KPI</p>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse h-52">
              <div className="h-4 bg-gray-200 rounded w-16 mb-3" />
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <FolderOpen size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">No se encontraron proyectos</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <ProyectoCard
              key={p.id}
              p={p}
              selected={selectedId === p.id}
              onSelect={() => handleSelect(p.id)}
              onEdit={() => openEdit(p)}
              onDelete={() => confirmDelete(p)}
            />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={false}
          total={data?.total}
          page={page}
          limit={50}
          onPageChange={setPage}
          emptyMessage="No se encontraron proyectos"
        />
      )}

      <ProyectoForm open={formOpen} onClose={handleClose} proyecto={editing} />
    </div>
  )
}
