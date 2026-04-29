import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import DataTable, { Column } from '@/components/ui/DataTable'
import StatusBadge from '@/components/ui/StatusBadge'
import type { SolicitudCotizacion } from '@/types'
import api from '@/services/api'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

const columns: Column<SolicitudCotizacion>[] = [
  { key: 'folio',     header: 'Folio',     sortable: true, className: 'font-mono text-xs' },
  { key: 'proyecto',  header: 'Proyecto',  render: (r) => r.proyecto?.nombre ?? '—' },
  { key: 'proveedor', header: 'Proveedor', render: (r) => r.proveedor?.nombre ?? '—' },
  { key: 'estado',    header: 'Estado',    render: (r) => <StatusBadge status={r.estado} /> },
  {
    key: 'fecha_solicitud',
    header: 'Solicitud',
    render: (r) => r.fecha_solicitud
      ? format(new Date(r.fecha_solicitud), 'dd MMM yyyy', { locale: es })
      : '—',
  },
  {
    key: 'monto_cotizado',
    header: 'Monto Cotizado',
    render: (r) => r.monto_cotizado ? fmt(r.monto_cotizado) : '—',
    className: 'text-right',
  },
]

export default function Cotizaciones() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['cotizaciones', page, search],
    queryFn: () =>
      api.get('/cotizaciones', { params: { page, limit: 20, search } }).then((r) => r.data),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar cotizaciones…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="input pl-9 w-64 text-sm"
          />
        </div>
        <button className="btn-primary">
          <Plus size={16} /> Solicitar Cotización
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
        emptyMessage="No se encontraron cotizaciones"
      />
    </div>
  )
}
