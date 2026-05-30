import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Inbox } from 'lucide-react'
import type { Tarea } from '@/types'
import { groupByProject } from './constants'
import TaskRow from './TaskRow'

interface Props {
  tareas: Tarea[]
  projectLens: string | null
  focusedId: number | null
  onProjectLens: (code: string | null) => void
  onStatusChange: (id: number, next: Tarea['estado']) => void
  onOpenTarea: (id: number) => void
}

export default function InboxView({ tareas, projectLens, focusedId, onProjectLens, onStatusChange, onOpenTarea }: Props) {
  const groups = useMemo(() => groupByProject(tareas), [tareas])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!tareas.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Inbox size={36} className="text-gray-300 mb-4" strokeWidth={1.5} />
        <p className="text-base font-medium text-gray-700">Tu inbox está despejado</p>
        <p className="text-sm text-gray-500 mt-1.5 max-w-sm">
          Sin tareas que coincidan. Probá quitar filtros, o esperá: el agente sincroniza cada 30 minutos.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const groupKey = group.code ?? '__none__'
        const isCollapsed = collapsed.has(groupKey)
        const isLensActive = projectLens === group.code
        return (
          <section key={groupKey} className={projectLens && !isLensActive ? 'opacity-40' : ''}>
            <header
              className="flex items-center gap-2 cursor-pointer select-none py-1 group"
              onClick={() => toggleGroup(groupKey)}
            >
              {isCollapsed
                ? <ChevronRight size={16} className="text-gray-400 group-hover:text-gray-700" />
                : <ChevronDown size={16} className="text-gray-400 group-hover:text-gray-700" />}
              {group.code ? (
                <span className="font-mono text-sm font-semibold text-gray-700">{group.code}</span>
              ) : (
                <span className="text-sm font-semibold text-gray-500 italic">Sin proyecto</span>
              )}
              <span className="text-xs text-gray-400">· {group.tareas.length} {group.tareas.length === 1 ? 'tarea' : 'tareas'}</span>
              {isLensActive && (
                <button
                  onClick={(e) => { e.stopPropagation(); onProjectLens(null) }}
                  className="ml-2 text-[11px] text-forest-600 hover:underline"
                >
                  Quitar foco
                </button>
              )}
            </header>

            {!isCollapsed && (
              <div className="space-y-0.5 mt-1">
                {group.tareas.map((t) => (
                  <TaskRow
                    key={t.id}
                    tarea={t}
                    highlighted={isLensActive}
                    dimmed={false}
                    focused={focusedId === t.id}
                    onStatusCycle={(next) => onStatusChange(t.id, next)}
                    onDescartar={() => onStatusChange(t.id, 'descartada')}
                    onReactivar={() => onStatusChange(t.id, 'pendiente')}
                    onProjectClick={(code) => onProjectLens(projectLens === code ? null : code)}
                    onOpen={() => onOpenTarea(t.id)}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
