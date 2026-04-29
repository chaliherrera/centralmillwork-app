import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

export interface Column<T> {
  key: keyof T | string
  header: string
  render?: (row: T) => React.ReactNode
  sortable?: boolean
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  isLoading?: boolean
  total?: number
  page?: number
  limit?: number
  onPageChange?: (page: number) => void
  sortKey?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (key: string) => void
  onRowClick?: (row: T) => void
  activeRowId?: number
  emptyMessage?: string
}

export default function DataTable<T extends { id: number }>({
  columns,
  data,
  isLoading,
  total = 0,
  page = 1,
  limit = 20,
  onPageChange,
  sortKey,
  sortOrder,
  onSort,
  onRowClick,
  activeRowId,
  emptyMessage = 'No hay registros',
}: DataTableProps<T>) {
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={clsx('table-header', col.sortable && 'cursor-pointer select-none hover:bg-gray-100', col.className)}
                  onClick={() => col.sortable && onSort?.(String(col.key))}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <span className="text-gray-400">
                        {sortKey === String(col.key)
                          ? sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                          : <ChevronsUpDown size={14} />}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {columns.map((col) => (
                    <td key={String(col.key)} className="table-cell">
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-gray-400 text-sm">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row.id}
                  className={clsx(
                    'table-row',
                    onRowClick && 'cursor-pointer',
                    row.id === activeRowId && 'bg-gold-50 border-l-2 border-l-gold-500'
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td key={String(col.key)} className={clsx('table-cell', col.className)}>
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[String(col.key)] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > limit && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            Mostrando {(page - 1) * limit + 1}–{Math.min(page * limit, total)} de {total} registros
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange?.(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => onPageChange?.(p)}
                className={clsx(
                  'w-8 h-8 rounded text-sm font-medium',
                  p === page ? 'bg-gold-500 text-white' : 'hover:bg-gray-100 text-gray-700'
                )}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => onPageChange?.(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
