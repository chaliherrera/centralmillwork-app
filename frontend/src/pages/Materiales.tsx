import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, Pencil, Trash2, Package,
  CheckCircle2, Clock, FolderOpen, Upload, Send, ShoppingCart,
  Building2, Tag,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import MaterialForm from '@/components/modules/materiales/MaterialForm'
import CapturaPrecios from '@/components/modules/materiales/CapturaPrecios'
import ImportarMTOModal from '@/components/modules/materiales/ImportarMTOModal'
import EnviarCotizacionesModal from '@/components/modules/materiales/EnviarCotizacionesModal'
import GenerarOCsModal from '@/components/modules/materiales/GenerarOCsModal'
import { materialesService } from '@/services/materiales'
import { proyectosService } from '@/services/proyectos'
import type { Material } from '@/types'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${m}/${day}/${y}`
}

export default function Materiales() {
  const [selectedProyectoId, setSelectedProyectoId] = useState<number | ''>('')
  const [importDateFilter, setImportDateFilter]     = useState('')
  const [vendorFilter, setVendorFilter]             = useState('')
  const [search, setSearch]                         = useState('')
  const [page, setPage]                             = useState(1)
  const [formOpen, setFormOpen]                     = useState(false)
  const [editing, setEditing]                       = useState<Material | undefined>()
  const [capturaOpen, setCapturaOpen]               = useState(false)
  const [importOpen, setImportOpen]                 = useState(false)
  const [enviarOpen, setEnviarOpen]                 = useState(false)
  const [generarOpen, setGenerarOpen]               = useState(false)

  const qc = useQueryClient()

  const { data: proyectosData } = useQuery({
    queryKey: ['proyectos-select'],
    queryFn: () => proyectosService.getAll({ limit: 100 }),
    staleTime: 60_000,
  })
  const proyectos = proyectosData?.data ?? []
  const selectedProyecto = proyectos.find((p) => p.id === selectedProyectoId)

  const { data: kpisData } = useQuery({
    queryKey: ['materiales-kpis', selectedProyectoId],
    queryFn: () => materialesService.getKpis(selectedProyectoId as number),
    enabled: !!selectedProyectoId,
    staleTime: 10_000,
  })
  const kpis = kpisData?.data

  const { data: importDatesData } = useQuery({
    queryKey: ['materiales-import-dates', selectedProyectoId],
    queryFn: () => materialesService.getImportDates(selectedProyectoId as number),
    enabled: !!selectedProyectoId,
    staleTime: 30_000,
  })
  const importDates = importDatesData?.data ?? []

  const { data: allItems } = useQuery({
    queryKey: ['materiales-all', selectedProyectoId],
    queryFn: () => materialesService.getAll({ limit: 500, proyecto_id: selectedProyectoId as number }),
    enabled: !!selectedProyectoId,
    staleTime: 10_000,
  })

  const vendors = useMemo(
    () => [...new Set((allItems?.data ?? []).map((m) => m.vendor).filter(Boolean))].sort(),
    [allItems]
  )

  const vendorPendienteCount = useMemo(() => {
    if (!vendorFilter) return 0
    return (allItems?.data ?? []).filter(
      (m) => m.vendor === vendorFilter && m.estado_cotiz === 'PENDIENTE' && m.cotizar === 'SI'
    ).length
  }, [allItems, vendorFilter])

  const { data, isLoading } = useQuery({
    queryKey: ['materiales', page, search, selectedProyectoId, vendorFilter, importDateFilter],
    queryFn: () =>
      materialesService.getAll({
        page, limit: 50, search,
        proyecto_id: selectedProyectoId || undefined,
        vendor: vendorFilter || undefined,
        fecha_importacion: importDateFilter || undefined,
      }),
    enabled: !!selectedProyectoId,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => materialesService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materiales'] })
      qc.invalidateQueries({ queryKey: ['materiales-kpis'] })
      qc.invalidateQueries({ queryKey: ['materiales-all'] })
      toast.success('Material eliminado')
    },
  })

  const cotizarMutation = useMutation({
    mutationFn: ({ id, cotizar, prev }: { id: number; cotizar: 'SI' | 'NO' | 'EN_STOCK'; prev: 'SI' | 'NO' | 'EN_STOCK' }) => {
      const extra: Record<string, string> = {}
      if (cotizar === 'EN_STOCK') extra.estado_cotiz = 'EN_STOCK'
      else if (prev === 'EN_STOCK') extra.estado_cotiz = 'PENDIENTE'
      return materialesService.update(id, { cotizar, ...extra })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materiales'] })
      qc.invalidateQueries({ queryKey: ['materiales-all'] })
    },
    onError: () => toast.error('Error al actualizar cotizar'),
  })

  const COTIZAR_CYCLE: Record<string, 'SI' | 'NO' | 'EN_STOCK'> = {
    SI: 'NO', NO: 'EN_STOCK', EN_STOCK: 'SI',
  }

  const openNew     = () => { setEditing(undefined); setFormOpen(true) }
  const openEdit    = (m: Material) => { setEditing(m); setFormOpen(true) }
  const handleClose = () => { setFormOpen(false); setEditing(undefined) }
  const confirmDelete = (m: Material) => {
    if (window.confirm(`¿Eliminar "${m.descripcion}"?`)) deleteMutation.mutate(m.id)
  }

  const clearFilters = () => { setVendorFilter(''); setImportDateFilter(''); setSearch(''); setPage(1) }
  const hasFilters   = !!(vendorFilter || importDateFilter || search)

  const materials = data?.data ?? []

  const LIMIT = 50
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-4">

      {/* ── Top bar: project card + KPIs ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Project card */}
        <div className="lg:col-span-2 kpi-card !h-auto py-4">
          <div className="p-3 bg-forest-50 rounded-xl flex-shrink-0">
            <FolderOpen size={22} className="text-forest-600" />
          </div>
          <div className="min-w-0 flex-1">
            {selectedProyecto ? (
              <>
                <p className="kpi-label">{selectedProyecto.codigo}</p>
                <p className="text-sm font-bold text-gray-800 truncate mt-0.5">{selectedProyecto.nombre}</p>
              </>
            ) : (
              <p className="text-sm text-gray-400">Sin proyecto seleccionado</p>
            )}
          </div>
          <select
            value={selectedProyectoId}
            onChange={(e) => {
              setSelectedProyectoId(e.target.value === '' ? '' : parseInt(e.target.value))
              setVendorFilter(''); setImportDateFilter(''); setSearch(''); setPage(1)
            }}
            className="input text-sm w-44 flex-shrink-0"
          >
            <option value="">— Proyecto —</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
            ))}
          </select>
        </div>

        {/* KPI: Proyectos activos */}
        <div className="kpi-card">
          <div className="p-2.5 bg-blue-50 rounded-lg shrink-0"><Building2 size={20} className="text-blue-600" /></div>
          <div>
            <p className="kpi-label">Proyectos Activos</p>
            <p className="kpi-value text-gray-900">{kpis ? parseInt(kpis.proyectos_activos) : '—'}</p>
          </div>
        </div>

        {/* KPI: Total materiales */}
        <div className="kpi-card">
          <div className="p-2.5 bg-forest-50 rounded-lg shrink-0"><Package size={20} className="text-forest-600" /></div>
          <div>
            <p className="kpi-label">Total Materiales</p>
            <p className="kpi-value text-gray-900">{kpis ? parseInt(kpis.total) : '—'}</p>
          </div>
        </div>

        {/* KPI: Cotizados */}
        <div className="kpi-card">
          <div className="p-2.5 bg-green-50 rounded-lg shrink-0"><CheckCircle2 size={20} className="text-green-600" /></div>
          <div>
            <p className="kpi-label">Cotizados</p>
            <p className="kpi-value text-green-700">{kpis ? parseInt(kpis.cotizados) : '—'}</p>
          </div>
        </div>

      </div>

      {/* ── Second KPI row (pendientes + totales) only when project selected ── */}
      {!!selectedProyectoId && kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="kpi-card">
            <div className="p-2.5 bg-yellow-50 rounded-lg shrink-0"><Clock size={20} className="text-yellow-600" /></div>
            <div>
              <p className="kpi-label">Pendientes</p>
              <p className="kpi-value text-yellow-700">{parseInt(kpis.pendientes)}</p>
            </div>
          </div>
          <div className="kpi-card">
            <div className="p-2.5 bg-gold-50 rounded-lg shrink-0"><FolderOpen size={20} className="text-gold-600" /></div>
            <div className="min-w-0">
              <p className="kpi-label">Total Proyecto</p>
              <p className="kpi-value text-gold-700 text-[22px]">{fmt(parseFloat(kpis.total_usd))}</p>
            </div>
          </div>
          <div className="kpi-card">
            <div className="p-2.5 bg-green-50 rounded-lg shrink-0"><CheckCircle2 size={20} className="text-green-600" /></div>
            <div className="min-w-0">
              <p className="kpi-label">Cotizado</p>
              <p className="kpi-value text-green-700 text-[22px]">{fmt(parseFloat(kpis.cotizado_usd))}</p>
            </div>
          </div>
          <div className="kpi-card flex-col !items-start justify-center gap-2 !h-[120px]">
            <p className="kpi-label">Avance cotización</p>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${parseFloat(kpis.total_usd) > 0 ? Math.min(100, (parseFloat(kpis.cotizado_usd) / parseFloat(kpis.total_usd)) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">{kpis.vendors} vendors · {parseFloat(kpis.total_usd) > 0 ? Math.round((parseFloat(kpis.cotizado_usd) / parseFloat(kpis.total_usd)) * 100) : 0}%</p>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!selectedProyectoId && (
        <div className="bg-white rounded-xl border border-gray-100 py-20 text-center">
          <Package size={48} className="mx-auto text-gray-200 mb-4" />
          <h3 className="text-gray-400 font-medium mb-1">Selecciona un proyecto</h3>
          <p className="text-gray-300 text-sm">Los materiales MTO se muestran por proyecto</p>
        </div>
      )}

      {/* ── Toolbar ── */}
      {!!selectedProyectoId && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  placeholder="Buscar descripción, código…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="input pl-9 w-52 text-sm"
                />
              </div>

              {/* Import date filter */}
              <select
                value={importDateFilter}
                onChange={(e) => { setImportDateFilter(e.target.value); setPage(1) }}
                className={clsx(
                  'input text-sm w-44',
                  importDateFilter && 'border-gold-400 text-gold-700 bg-gold-50'
                )}
              >
                <option value="">Todos los lotes</option>
                {importDates.map((d) => (
                  <option key={d} value={d}>{fmtDate(d)}</option>
                ))}
              </select>

              {/* Vendor filter */}
              <select
                value={vendorFilter}
                onChange={(e) => { setVendorFilter(e.target.value); setPage(1) }}
                className={clsx(
                  'input text-sm w-44',
                  vendorFilter && 'border-forest-400 text-forest-700 bg-forest-50'
                )}
              >
                <option value="">Todos los vendors</option>
                {vendors.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>

              {/* Capturar Precios — visible only when vendor is selected and has pending items */}
              {vendorFilter && vendorPendienteCount > 0 && (
                <button
                  onClick={() => setCapturaOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gold-500 hover:bg-gold-600 text-white font-medium rounded-lg transition-colors"
                >
                  <Tag size={14} />
                  Capturar Precios
                  <span className="bg-white/20 text-xs px-1.5 py-0.5 rounded-full font-bold">
                    {vendorPendienteCount}
                  </span>
                </button>
              )}

              {hasFilters && (
                <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-red-500 underline transition-colors">
                  Limpiar
                </button>
              )}
            </div>

            {/* Right: action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                <Upload size={15} /> Importar MTO
              </button>
              <button
                onClick={() => setEnviarOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                <Send size={15} /> Enviar Cotizaciones
              </button>
              <button
                onClick={() => setGenerarOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                <ShoppingCart size={15} /> Generar OCs
              </button>
              <button onClick={openNew} className="btn-primary">
                <Plus size={15} /> Agregar Material
              </button>
            </div>
          </div>

          {/* Results count */}
          {!isLoading && (
            <p className="text-xs text-gray-400">
              {total} materiales
              {importDateFilter && <> · lote: <strong>{fmtDate(importDateFilter)}</strong></>}
              {vendorFilter && <> · vendor: <strong>{vendorFilter}</strong></>}
            </p>
          )}

          {/* ── Responsive table ── */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Estado</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Cotizar</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">Item</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">CM Code</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell w-32">V.Code</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Vendor</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[200px]">Descripción</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell w-28">Color</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell w-28">Manuf.</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell w-28">Categ.</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell w-16">Unit</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell w-20">Size</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">QTY</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell w-28">Unit Price</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell w-28">Total</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell w-24">F.Import</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell w-36">Notas</th>
                    <th className="px-3 py-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50 animate-pulse">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-3 py-3">
                            <div className="h-3 bg-gray-100 rounded" />
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                  {!isLoading && materials.length === 0 && (
                    <tr>
                      <td colSpan={18} className="px-4 py-16 text-center text-gray-300 text-sm">
                        No se encontraron materiales para este proyecto
                      </td>
                    </tr>
                  )}
                  {!isLoading && materials.map((m) => (
                    <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors group">
                      <td className="px-3 py-3 text-center">
                        <span className={clsx(
                          'inline-block text-xs px-2 py-0.5 rounded-full font-medium',
                          m.estado_cotiz === 'COTIZADO'  && 'bg-green-100 text-green-700',
                          m.estado_cotiz === 'PENDIENTE' && 'bg-yellow-100 text-yellow-700',
                          m.estado_cotiz === 'EN_STOCK'  && 'bg-blue-100 text-blue-700',
                        )}>
                          {m.estado_cotiz === 'EN_STOCK' ? 'EN STOCK' : m.estado_cotiz}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => { const prev = m.cotizar ?? 'SI'; cotizarMutation.mutate({ id: m.id, cotizar: COTIZAR_CYCLE[prev], prev }) }}
                          disabled={cotizarMutation.isPending}
                          title="Clic para cambiar"
                          className={clsx(
                            'inline-block text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer select-none transition-opacity hover:opacity-75',
                            m.cotizar === 'SI'     && 'bg-green-100 text-green-700',
                            m.cotizar === 'NO'     && 'bg-gray-100 text-gray-500',
                            (m.cotizar === 'EN_STOCK' || !m.cotizar) && 'bg-blue-100 text-blue-700',
                          )}
                        >
                          {m.cotizar === 'EN_STOCK' ? 'EN STOCK' : (m.cotizar ?? 'SI')}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-400 font-mono text-center">{m.item || '—'}</td>
                      <td className="px-3 py-3">
                        {m.codigo
                          ? <span className="font-mono text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{m.codigo}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 font-mono hidden xl:table-cell">{m.vendor_code || '—'}</td>
                      <td className="px-3 py-3 text-xs font-medium text-gray-700">{m.vendor || '—'}</td>
                      <td className="px-3 py-3 text-xs font-medium text-gray-800">{m.descripcion}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 hidden xl:table-cell">{m.color || '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 hidden xl:table-cell">{m.manufacturer || '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 hidden xl:table-cell">{m.categoria || '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-600 text-center hidden xl:table-cell">{m.unidad}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 hidden xl:table-cell">{m.size || '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-700 text-right font-medium">{Number(m.qty)}</td>
                      <td className="px-3 py-3 text-xs text-gray-700 text-right hidden md:table-cell">{fmt(Number(m.unit_price))}</td>
                      <td className="px-3 py-3 text-xs font-semibold text-gray-800 text-right hidden md:table-cell">{fmt(Number(m.total_price))}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 text-center hidden md:table-cell">{fmtDate(m.fecha_importacion)}</td>
                      <td className="px-3 py-3 text-xs text-gray-400 hidden xl:table-cell" title={m.notas ?? undefined}>{m.notas || '—'}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEdit(m)}
                            className="p-1 text-gray-400 hover:text-forest-600 hover:bg-forest-50 rounded transition-colors"
                            title="Editar"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => confirmDelete(m)}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-400">{total} registros · página {page} de {totalPages}</p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <MaterialForm
        open={formOpen}
        onClose={handleClose}
        material={editing}
        defaultProyectoId={selectedProyectoId || undefined}
      />

      <CapturaPrecios
        open={capturaOpen}
        vendor={vendorFilter}
        proyectoId={selectedProyectoId as number}
        proyectoNombre={selectedProyecto?.nombre ?? ''}
        onClose={() => setCapturaOpen(false)}
      />

      <ImportarMTOModal
        open={importOpen}
        defaultProyectoId={selectedProyectoId || undefined}
        onClose={() => setImportOpen(false)}
      />

      <EnviarCotizacionesModal
        open={enviarOpen}
        onClose={() => setEnviarOpen(false)}
        proyectoId={selectedProyectoId as number}
        proyectoCodigo={selectedProyecto?.codigo ?? ''}
        allMaterials={allItems?.data ?? []}
      />
      <GenerarOCsModal
        open={generarOpen}
        onClose={() => setGenerarOpen(false)}
        proyectoId={selectedProyectoId as number}
        proyectoCodigo={selectedProyecto?.codigo ?? ''}
      />
    </div>
  )
}
