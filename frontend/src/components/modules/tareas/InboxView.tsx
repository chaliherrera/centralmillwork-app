import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Inbox } from 'lucide-react'
import type { Tarea } from '@/types'
import { extractProjectCode } from './constants'
import TaskRow from './TaskRow'

interface Props {
  tareas: Tarea[]
  projectLens: string | null
  onProjectLens: (code: string | null) => void
  onStatusChange: (id: number, next: Tarea['estado']) => void
}

interface Group {
  code: string | null     // null = sin proyecto
  tareas: Tarea[]
}

function groupByProject(tareas: Tarea[]): Group[] {
  const map = new Map<string, Tarea[]>()
  const NO_PROJECT_KEY = '__none__'

  for (const t of tareas) {
    const code = extractProjectCode(t.subject)
    const key = code ?? NO_PROJECT_KEY
    const arr = map.get(key) ?? []
    arr.push(t)
    map.set(key, arr)
  }

  // Orden: códigos numéricos primero (más recientes XX más alto = más reciente), "Sin proyecto" al final
  const groups: Group[] = []
  const codes = Array.from(map.keys()).filter((k) => k !== NO_PROJECT_KEY).sort().reverse()
  for (const code of codes) {
    groups.push({ code, tareas: map.get(code)! })
  }
  if (map.has(NO_PROJECT_KEY)) {
    groups.push({ code: null, tareas: map.get(NO_PROJECT_KEY)! })
  }
  return groups
}

export default function InboxView({ tareas, projectLens, onProjectLens, onStatusChange }: Props) {
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
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Inbox size={32} className="text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-700">Sin tareas para mostrar</p>
        <p className="text-xs text-gray-500 mt-1">El agente postea cada 30 minutos. Ajustá los filtros o esperá.</p>
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
                    onStatusCycle={(next) => onStatusChange(t.id, next)}
                    onDescartar={() => onStatusChange(t.id, 'descartada')}
                    onReactivar={() => onStatusChange(t.id, 'pendiente')}
                    onProjectClick={(code) => onProjectLens(projectLens === code ? null : code)}
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
