import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Inbox } from 'lucide-react'
import type { Tarea } from '@/types'
import { groupByProject } from '../constants'
import GlassTaskRow from './GlassTaskRow'

interface Props {
  tareas: Tarea[]
  projectLens: string | null
  focusedId: number | null
  onProjectLens: (code: string | null) => void
  onStatusChange: (id: number, next: Tarea['estado']) => void
  onOpenTarea: (id: number) => void
}

export default function GlassInboxView({
  tareas, projectLens, focusedId, onProjectLens, onStatusChange, onOpenTarea,
}: Props) {
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
        <Inbox size={36} className="mb-4" strokeWidth={1.5} style={{ color: 'rgba(255,255,250,0.35)' }} />
        <p className="text-base font-medium" style={{ color: '#FFFFFA' }}>Tu inbox está despejado</p>
        <p className="text-sm mt-1.5 max-w-sm" style={{ color: 'rgba(255,255,250,0.55)' }}>
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
              className="flex items-center gap-2 cursor-pointer select-none py-1"
              onClick={() => toggleGroup(groupKey)}
            >
              {isCollapsed
                ? <ChevronRight size={16} style={{ color: 'rgba(255,255,250,0.55)' }} />
                : <ChevronDown size={16} style={{ color: 'rgba(255,255,250,0.55)' }} />}
              {group.code ? (
                <span className="font-mono text-sm font-semibold" style={{ color: '#FFFFFA' }}>{group.code}</span>
              ) : (
                <span className="text-sm font-semibold italic" style={{ color: 'rgba(255,255,250,0.55)' }}>Sin proyecto</span>
              )}
              <span className="text-xs" style={{ color: 'rgba(255,255,250,0.35)' }}>
                · {group.tareas.length} {group.tareas.length === 1 ? 'tarea' : 'tareas'}
              </span>
              {isLensActive && (
                <button
                  onClick={(e) => { e.stopPropagation(); onProjectLens(null) }}
                  className="ml-2 text-[11px] hover:underline"
                  style={{ color: '#DEA832' }}
                >
                  Quitar foco
                </button>
              )}
            </header>

            {!isCollapsed && (
              <div className="space-y-1 mt-1.5">
                {group.tareas.map((t) => (
                  <GlassTaskRow
                    key={t.id}
                    tarea={t}
                    highlighted={isLensActive}
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
