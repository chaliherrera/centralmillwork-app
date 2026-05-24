import { useQuery } from '@tanstack/react-query'
import { tareasService } from '@/services/tareas'
import { Loader2 } from 'lucide-react'

export default function Tareas() {
  const { data: tareasResp, isLoading } = useQuery({
    queryKey: ['tareas'],
    queryFn: () => tareasService.getAll(),
  })
  const { data: statsResp } = useQuery({
    queryKey: ['tareas-stats'],
    queryFn: () => tareasService.getStats(),
  })

  const tareas = tareasResp?.data ?? []
  const stats = statsResp?.data

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={28} className="animate-spin text-forest-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Tareas</h1>
        <p className="text-sm text-gray-500">
          {stats?.totals.activas ?? 0} activas · {stats?.totals.hoy ?? 0} hoy
        </p>
      </header>

      <div className="card">
        <p className="text-sm text-gray-600">
          {tareas.length} tareas cargadas. Vista funcional viene en el próximo commit.
        </p>
      </div>
    </div>
  )
}
