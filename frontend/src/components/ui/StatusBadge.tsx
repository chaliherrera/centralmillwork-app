import clsx from 'clsx'

type Status =
  | 'cotizacion' | 'activo' | 'en_pausa' | 'completado' | 'cancelado' | 'cancelada'
  | 'borrador' | 'enviada' | 'confirmada' | 'parcial' | 'recibida'
  | 'pendiente' | 'aprobada' | 'rechazada'
  | 'completa' | 'con_diferencias'

const statusConfig: Record<Status, { label: string; class: string }> = {
  cotizacion:       { label: 'Cotización',       class: 'bg-gray-100  text-gray-600' },
  activo:           { label: 'Activo',            class: 'bg-green-100 text-green-700' },
  en_pausa:         { label: 'En Pausa',          class: 'bg-yellow-100 text-yellow-700' },
  completado:       { label: 'Completado',        class: 'bg-blue-100  text-blue-700' },
  cancelado:        { label: 'Cancelado',         class: 'bg-red-100   text-red-600' },
  cancelada:        { label: 'Cancelada',         class: 'bg-red-100   text-red-600' },
  borrador:         { label: 'Borrador',          class: 'bg-gray-100  text-gray-600' },
  enviada:          { label: 'Enviada',           class: 'bg-blue-100  text-blue-700' },
  confirmada:       { label: 'Confirmada',        class: 'bg-indigo-100 text-indigo-700' },
  parcial:          { label: 'Parcial',           class: 'bg-orange-100 text-orange-700' },
  recibida:         { label: 'Recibida',          class: 'bg-green-100 text-green-700' },
  pendiente:        { label: 'Pendiente',         class: 'bg-yellow-100 text-yellow-700' },
  aprobada:         { label: 'Aprobada',          class: 'bg-gold-100  text-gold-700' },
  rechazada:        { label: 'Rechazada',         class: 'bg-red-100   text-red-600' },
  completa:         { label: 'Completa',          class: 'bg-green-100 text-green-700' },
  con_diferencias:  { label: 'Con Diferencias',   class: 'bg-orange-100 text-orange-700' },
}

interface StatusBadgeProps {
  status: Status
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, class: 'bg-gray-100 text-gray-600' }
  return (
    <span className={clsx('badge-status', config.class)}>
      {config.label}
    </span>
  )
}
