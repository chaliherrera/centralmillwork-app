import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { tareasService } from '@/services/tareas'
import type { Tarea, TareasFilters } from '@/types'
import { timeAgo } from '@/components/modules/tareas/constants'
import KpiStrip from '@/components/modules/tareas/KpiStrip'
import FilterBar from '@/components/modules/tareas/FilterBar'
import InboxView from '@/components/modules/tareas/InboxView'

export default function Tareas() {
  const qc = useQueryClient()
  const [filters, setFilters] = useState<TareasFilters>({})
  const [showCompletadas, setShowCompletadas] = useState(false)
  const [projectLens, setProjectLens] = useState<string | null>(null)

  // Estados visibles dependen del toggle "mostrar hechas"
  const queryFilters: TareasFilters = useMemo(() => ({
    ...filters,
    estado: showCompletadas
      ? ['pendiente', 'en_progreso', 'completada']
      : ['pendiente', 'en_progreso'],
  }), [filters, showCompletadas])

  const { data: tareasResp, isLoading } = useQuery({
    queryKey: ['tareas', queryFilters],
    queryFn: () => tareasService.getAll(queryFilters),
    refetchInterval: 60_000, // refresh cada minuto por si el agente postea
  })

  const { data: statsResp } = useQuery({
    queryKey: ['tareas-stats'],
    queryFn: () => tareasService.getStats(),
    refetchInterval: 60_000,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: Tarea['estado'] }) =>
      tareasService.update(id, { estado }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tareas'] })
      qc.invalidateQueries({ queryKey: ['tareas-stats'] })
    },
    onError: () => toast.error('No se pudo actualizar la tarea'),
  })

  const tareas = tareasResp?.data ?? []
  const stats = statsResp?.data

  // Última sync = la tarea más reciente (created_at)
  const lastSyncIso = useMemo(() => {
    if (!tareas.length) return null
    return tareas.reduce((max, t) => (t.created_at > max ? t.created_at : max), tareas[0].created_at)
  }, [tareas])

  // Filtro client-side por project lens
  const visibleTareas = useMemo(() => {
    if (!projectLens) return tareas
    return tareas.filter((t) => t.subject?.includes(projectLens))
  }, [tareas, projectLens])

  return (
    <div className="space-y-6 max-w-[1200px]">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Tareas</h1>
        {lastSyncIso && (
          <p className="text-xs text-gray-500">
            Última tarea: {timeAgo(lastSyncIso)}
          </p>
        )}
      </header>

      <KpiStrip stats={stats} />

      <FilterBar
        filters={filters}
        onChange={setFilters}
        showCompletadas={showCompletadas}
        onToggleCompletadas={() => setShowCompletadas((v) => !v)}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-forest-600" />
        </div>
      ) : (
        <InboxView
          tareas={visibleTareas}
          projectLens={projectLens}
          onProjectLens={setProjectLens}
          onStatusChange={(id, estado) => updateMut.mutate({ id, estado })}
        />
      )}
    </div>
  )
}
