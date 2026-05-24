import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Keyboard } from 'lucide-react'
import toast from 'react-hot-toast'
import { tareasService } from '@/services/tareas'
import type { Tarea, TareasFilters } from '@/types'
import { timeAgo, groupByProject, PRIORITY_NEXT } from '@/components/modules/tareas/constants'
import KpiStrip from '@/components/modules/tareas/KpiStrip'
import FilterBar from '@/components/modules/tareas/FilterBar'
import InboxView from '@/components/modules/tareas/InboxView'
import TaskDrawer from '@/components/modules/tareas/TaskDrawer'
import CommandPalette from '@/components/modules/tareas/CommandPalette'
import { useKeyboardShortcuts } from '@/components/modules/tareas/useKeyboardShortcuts'

export default function Tareas() {
  const qc = useQueryClient()
  const [filters, setFilters] = useState<TareasFilters>({})
  const [showCompletadas, setShowCompletadas] = useState(false)
  const [projectLens, setProjectLens] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [focusedId, setFocusedId] = useState<number | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

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
    refetchInterval: 60_000,
  })

  const { data: statsResp } = useQuery({
    queryKey: ['tareas-stats'],
    queryFn: () => tareasService.getStats(),
    refetchInterval: 60_000,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<Tarea> }) =>
      tareasService.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tareas'] })
      qc.invalidateQueries({ queryKey: ['tareas-stats'] })
    },
    onError: () => toast.error('No se pudo actualizar la tarea'),
  })

  const tareas = tareasResp?.data ?? []
  const stats = statsResp?.data
  const selectedTarea = useMemo(
    () => tareas.find((t) => t.id === selectedId) ?? null,
    [tareas, selectedId],
  )

  const lastSyncIso = useMemo(() => {
    if (!tareas.length) return null
    return tareas.reduce((max, t) => (t.created_at > max ? t.created_at : max), tareas[0].created_at)
  }, [tareas])

  // Filtro client-side por project lens
  const visibleTareas = useMemo(() => {
    if (!projectLens) return tareas
    return tareas.filter((t) => t.subject?.includes(projectLens))
  }, [tareas, projectLens])

  // Lista ordenada (post-grouping) — necesaria para navegar con j/k en el orden visible
  const orderedTareas = useMemo(
    () => groupByProject(visibleTareas).flatMap((g) => g.tareas),
    [visibleTareas],
  )

  const focusedIdx = focusedId == null ? -1 : orderedTareas.findIndex((t) => t.id === focusedId)
  const focusedTarea = focusedIdx >= 0 ? orderedTareas[focusedIdx] : null

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────
  useKeyboardShortcuts({
    onCommandPalette: () => setPaletteOpen(true),
    onSearchFocus: () => searchRef.current?.focus(),
    onNextRow: () => {
      if (!orderedTareas.length) return
      const next = focusedIdx < 0 ? 0 : Math.min(focusedIdx + 1, orderedTareas.length - 1)
      setFocusedId(orderedTareas[next].id)
    },
    onPrevRow: () => {
      if (!orderedTareas.length) return
      const prev = focusedIdx < 0 ? 0 : Math.max(focusedIdx - 1, 0)
      setFocusedId(orderedTareas[prev].id)
    },
    onOpenFocused: () => {
      if (focusedTarea) setSelectedId(focusedTarea.id)
    },
    onCompleteFocused: () => {
      if (focusedTarea && focusedTarea.estado !== 'completada') {
        updateMut.mutate({ id: focusedTarea.id, patch: { estado: 'completada' } })
      }
    },
    onPriorityCycle: () => {
      if (focusedTarea) {
        updateMut.mutate({
          id: focusedTarea.id,
          patch: { priority: PRIORITY_NEXT[focusedTarea.priority] },
        })
      }
    },
  })

  return (
    <div className="space-y-6 max-w-[1200px]">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">Tareas</h1>
        <div className="flex items-center gap-3">
          {lastSyncIso && (
            <p className="text-xs text-gray-500">
              Última tarea: {timeAgo(lastSyncIso)}
            </p>
          )}
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            title="Command palette (Ctrl+K)"
          >
            <Keyboard size={13} />
            <kbd className="font-mono">Ctrl K</kbd>
          </button>
        </div>
      </header>

      <KpiStrip stats={stats} />

      <FilterBar
        filters={filters}
        onChange={setFilters}
        showCompletadas={showCompletadas}
        onToggleCompletadas={() => setShowCompletadas((v) => !v)}
        searchRef={searchRef}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-forest-600" />
        </div>
      ) : (
        <InboxView
          tareas={visibleTareas}
          projectLens={projectLens}
          focusedId={focusedId}
          onProjectLens={setProjectLens}
          onStatusChange={(id, estado) => updateMut.mutate({ id, patch: { estado } })}
          onOpenTarea={setSelectedId}
        />
      )}

      <TaskDrawer
        tarea={selectedTarea}
        onClose={() => setSelectedId(null)}
        onStatusChange={(estado) => selectedTarea && updateMut.mutate({ id: selectedTarea.id, patch: { estado } })}
        onDescartar={() => selectedTarea && updateMut.mutate({ id: selectedTarea.id, patch: { estado: 'descartada' } })}
        onReactivar={() => selectedTarea && updateMut.mutate({ id: selectedTarea.id, patch: { estado: 'pendiente' } })}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        tareas={tareas}
        onOpenTarea={(id) => { setSelectedId(id); setFocusedId(id) }}
        onApplyFilter={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        onClearFilters={() => { setFilters({}); setProjectLens(null) }}
      />

      {/* Help hint hidden — solo aparece en focus accidental */}
      <div className="text-[11px] text-gray-400 pt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100">
        <span><kbd className="px-1 py-0.5 rounded bg-gray-100 font-mono text-[10px]">Ctrl K</kbd> command palette</span>
        <span><kbd className="px-1 py-0.5 rounded bg-gray-100 font-mono text-[10px]">/</kbd> buscar</span>
        <span><kbd className="px-1 py-0.5 rounded bg-gray-100 font-mono text-[10px]">j</kbd> <kbd className="px-1 py-0.5 rounded bg-gray-100 font-mono text-[10px]">k</kbd> navegar</span>
        <span><kbd className="px-1 py-0.5 rounded bg-gray-100 font-mono text-[10px]">↵</kbd> abrir</span>
        <span><kbd className="px-1 py-0.5 rounded bg-gray-100 font-mono text-[10px]">c</kbd> completar enfocada</span>
        <span><kbd className="px-1 py-0.5 rounded bg-gray-100 font-mono text-[10px]">p</kbd> cambiar prioridad</span>
        <span><kbd className="px-1 py-0.5 rounded bg-gray-100 font-mono text-[10px]">Esc</kbd> cerrar</span>
      </div>
    </div>
  )
}
