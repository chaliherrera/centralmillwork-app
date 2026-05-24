import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ArrowRight, Filter, X, FolderOpen, Inbox } from 'lucide-react'
import type { Tarea, TareaArea, TareasFilters } from '@/types'
import { AREA_META, extractProjectCode } from '../constants'

interface Props {
  open: boolean
  onClose: () => void
  tareas: Tarea[]
  onOpenTarea: (id: number) => void
  onApplyFilter: (filter: Partial<TareasFilters>) => void
  onClearFilters: () => void
}

type Command =
  | { type: 'task'; id: number; title: string; subtitle: string; areaColor: string }
  | { type: 'filter-area'; area: TareaArea; label: string }
  | { type: 'filter-project'; code: string }
  | { type: 'clear-filters' }

const TEXT = '#FFFFFA'
const TEXT2 = 'rgba(255,255,250,0.78)'
const TEXT3 = 'rgba(255,255,250,0.55)'
const TEXT4 = 'rgba(255,255,250,0.35)'

export default function GlassCommandPalette({
  open, onClose, tareas, onOpenTarea, onApplyFilter, onClearFilters,
}: Props) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const commands: Command[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const result: Command[] = []

    const taskMatches = !q
      ? tareas.slice(0, 6)
      : tareas.filter((t) =>
          t.title?.toLowerCase().includes(q) ||
          t.subject?.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          extractProjectCode(t.subject)?.includes(q)
        ).slice(0, 8)

    for (const t of taskMatches) {
      const code = extractProjectCode(t.subject)
      result.push({
        type: 'task',
        id: t.id,
        title: t.title,
        subtitle: `${code ? code + ' · ' : ''}${AREA_META[t.area].label}`,
        areaColor: AREA_META[t.area].color,
      })
    }

    if (q) {
      const codeMatch = q.match(/(\d{2}-\d{3})/)
      if (codeMatch) result.push({ type: 'filter-project', code: codeMatch[1] })

      for (const [key, meta] of Object.entries(AREA_META)) {
        if (meta.label.toLowerCase().includes(q) || key.toLowerCase().includes(q)) {
          result.push({ type: 'filter-area', area: key as TareaArea, label: meta.label })
        }
      }

      if ('limpiar filtros'.includes(q) || 'reset'.includes(q)) {
        result.push({ type: 'clear-filters' })
      }
    } else {
      result.push({ type: 'clear-filters' })
    }

    return result
  }, [query, tareas])

  useEffect(() => { setActiveIdx(0) }, [query])

  useEffect(() => {
    const items = listRef.current?.querySelectorAll('[data-cmd-item]')
    const el = items?.[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const execute = (cmd: Command) => {
    onClose()
    if (cmd.type === 'task') onOpenTarea(cmd.id)
    else if (cmd.type === 'filter-area') onApplyFilter({ area: cmd.area })
    else if (cmd.type === 'filter-project') onApplyFilter({ project_code: cmd.code })
    else if (cmd.type === 'clear-filters') onClearFilters()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, commands.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (commands[activeIdx]) execute(commands[activeIdx]) }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] px-4"
      style={{ background: 'rgba(20,18,14,0.4)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="w-full max-w-[640px] rounded-2xl overflow-hidden flex flex-col max-h-[70vh]"
        style={{
          background: 'rgba(40,32,22,0.55)',
          backdropFilter: 'blur(48px) saturate(220%)',
          WebkitBackdropFilter: 'blur(48px) saturate(220%)',
          border: '0.5px solid rgba(255,255,250,0.18)',
          boxShadow: 'inset 1px 1.5px 1px rgba(255,255,255,0.18), 0 30px 60px -20px rgba(0,0,0,0.6)',
        }}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '0.5px solid rgba(255,255,250,0.10)' }}>
          <Search size={16} style={{ color: TEXT3 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tarea, proyecto (ej 26-591), o acción..."
            className="flex-1 outline-none text-sm bg-transparent placeholder:text-[rgba(255,255,250,0.35)]"
            style={{ color: TEXT }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ color: TEXT3 }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1.5">
          {commands.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm" style={{ color: TEXT3 }}>Sin resultados para "{query}"</p>
            </div>
          ) : (
            commands.map((cmd, idx) => {
              const isActive = idx === activeIdx
              return (
                <button
                  key={`${cmd.type}-${'id' in cmd ? cmd.id : 'area' in cmd ? cmd.area : 'code' in cmd ? cmd.code : 'clear'}`}
                  data-cmd-item
                  onClick={() => execute(cmd)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className="w-full text-left px-4 py-2 flex items-center gap-3 transition-colors"
                  style={isActive ? {
                    background: 'rgba(255,255,250,0.06)',
                    borderLeft: '2px solid #DEA832',
                    paddingLeft: '14px',
                  } : undefined}
                >
                  {cmd.type === 'task' && (
                    <>
                      <span className="w-1 h-6 rounded-full shrink-0" style={{ background: cmd.areaColor, boxShadow: `0 0 8px ${cmd.areaColor}80` }} />
                      <Inbox size={14} className="shrink-0" style={{ color: TEXT3 }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color: TEXT }}>{cmd.title}</p>
                        <p className="text-xs truncate" style={{ color: TEXT3 }}>{cmd.subtitle}</p>
                      </div>
                      <ArrowRight size={13} className="shrink-0" style={{ color: isActive ? TEXT2 : TEXT4 }} />
                    </>
                  )}
                  {cmd.type === 'filter-area' && (
                    <>
                      <Filter size={14} className="shrink-0" style={{ color: TEXT3 }} />
                      <span className="text-sm flex-1" style={{ color: TEXT2 }}>
                        Filtrar por área <span className="font-medium" style={{ color: TEXT }}>{cmd.label}</span>
                      </span>
                      <ArrowRight size={13} className="shrink-0" style={{ color: isActive ? TEXT2 : TEXT4 }} />
                    </>
                  )}
                  {cmd.type === 'filter-project' && (
                    <>
                      <FolderOpen size={14} className="shrink-0" style={{ color: TEXT3 }} />
                      <span className="text-sm flex-1" style={{ color: TEXT2 }}>
                        Filtrar por proyecto <span className="font-mono font-medium" style={{ color: TEXT }}>{cmd.code}</span>
                      </span>
                      <ArrowRight size={13} className="shrink-0" style={{ color: isActive ? TEXT2 : TEXT4 }} />
                    </>
                  )}
                  {cmd.type === 'clear-filters' && (
                    <>
                      <X size={14} className="shrink-0" style={{ color: TEXT3 }} />
                      <span className="text-sm flex-1" style={{ color: TEXT2 }}>Limpiar todos los filtros</span>
                      <ArrowRight size={13} className="shrink-0" style={{ color: isActive ? TEXT2 : TEXT4 }} />
                    </>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div
          className="px-4 py-2 flex items-center gap-3 text-[11px]"
          style={{ borderTop: '0.5px solid rgba(255,255,250,0.10)', background: 'rgba(255,255,250,0.02)', color: TEXT3 }}
        >
          <Hint k="↑↓" label="navegar" />
          <Hint k="↵" label="ejecutar" />
          <Hint k="Esc" label="cerrar" />
        </div>
      </div>
    </div>
  )
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd
        className="px-1.5 py-0.5 rounded font-mono text-[10px]"
        style={{
          background: 'rgba(255,255,250,0.08)',
          border: '0.5px solid rgba(255,255,250,0.18)',
          color: 'rgba(255,255,250,0.78)',
        }}
      >
        {k}
      </kbd>
      {label}
    </span>
  )
}
