import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Pencil, Trash2, CheckCircle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import DataTable, { Column } from '@/components/ui/DataTable'
import ProveedorForm from '@/components/modules/proveedores/ProveedorForm'
import { proveedoresService } from '@/services/proveedores'
import type { Proveedor } from '@/types'

export default function Proveedores() {
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing]   = useState<Proveedor | undefined>()

  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['proveedores', page, search],
    queryFn: () => proveedoresService.getAll({ page, limit: 20, search }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => proveedoresService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedores'] })
      toast.success('Proveedor eliminado')
    },
  })

  const openNew  = () => { setEditing(undefined); setFormOpen(true) }
  const openEdit = (p: Proveedor) => { setEditing(p); setFormOpen(true) }
  const handleClose = () => { setFormOpen(false); setEditing(undefined) }

  const confirmDelete = (p: Proveedor) => {
    if (window.confirm(`¿Eliminar el proveedor "${p.nombre}"?`)) {
      deleteMutation.mutate(p.id)
    }
  }

  const columns: Column<Proveedor>[] = [
    { key: 'nombre',   header: 'Razón Social',  sortable: true },
    { key: 'contacto', header: 'Contacto' },
    { key: 'email',    header: 'Email' },
    { key: 'telefono', header: 'Teléfono' },
    { key: 'rfc',      header: 'RFC',           className: 'font-mono text-xs' },
    {
      key: 'activo',
      header: 'Activo',
      className: 'text-center',
      render: (r) => r.activo
        ? <CheckCircle size={16} className="text-green-600 mx-auto" />
        : <XCircle size={16} className="text-red-400 mx-auto" />,
    },
    {
      key: 'id',
      header: '',
      className: 'w-20',
      render: (r) => (
        <div className="flex items-center gap-1">
          <button onClick={() => openEdit(r)}
            className="p-1.5 text-gray-400 hover:text-forest-600 hover:bg-gray-100 rounded transition-colors"
            title="Editar">
            <Pencil size={14} />
          </button>
          <button onClick={() => confirmDelete(r)}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            title="Eliminar">
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="max-w-[800px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar proveedores…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="input pl-9 w-64 text-sm"
          />
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus size={16} /> Nuevo Proveedor
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
        emptyMessage="No se encontraron proveedores"
      />

      <ProveedorForm open={formOpen} onClose={handleClose} proveedor={editing} />
    </div>
  )
}
