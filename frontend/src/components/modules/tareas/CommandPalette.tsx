import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ArrowRight, Filter, X, FolderOpen, Inbox } from 'lucide-react'
import type { Tarea, TareaArea, TareasFilters } from '@/types'
import { AREA_META, extractProjectCode } from './constants'

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

export default function CommandPalette({ open, onClose, tareas, onOpenTarea, onApplyFilter, onClearFilters }: Props) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // Construir comandos según query
  const commands: Command[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const result: Command[] = []

    // Tasks que matcheen
    const taskMatches = !q
      ? tareas.slice(0, 6)
      : tareas.filter((t) =>
          (t.title?.toLowerCase().includes(q) ||
           t.subject?.toLowerCase().includes(q) ||
           t.description?.toLowerCase().includes(q) ||
           extractProjectCode(t.subject)?.includes(q))
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

    // Filter actions
    if (q) {
      // Filtro por código de proyecto si matchea el patrón
      const codeMatch = q.match(/(\d{2}-\d{3})/)
      if (codeMatch) {
        result.push({ type: 'filter-project', code: codeMatch[1] })
      }

      // Filtros por área si el query matchea
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

  // Reset activeIdx cuando cambia el set
  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  // Auto-scroll del item activo
  useEffect(() => {
    const items = listRef.current?.querySelectorAll('[data-cmd-item]')
    const el = items?.[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const execute = (cmd: Command) => {
    onClose()
    if (cmd.type === 'task') {
      onOpenTarea(cmd.id)
    } else if (cmd.type === 'filter-area') {
      onApplyFilter({ area: cmd.area })
    } else if (cmd.type === 'filter-project') {
      onApplyFilter({ project_code: cmd.code })
    } else if (cmd.type === 'clear-filters') {
      onClearFilters()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, commands.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (commands[activeIdx]) execute(commands[activeIdx])
    }
  }

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-[60] flex items-start justify-center pt-[15vh] px-4"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-label="Command palette"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onKeyDown}
          className="w-full max-w-[600px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[70vh]"
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <Search size={16} className="text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar tarea, proyecto (ej 26-591), o acción..."
              className="flex-1 outline-none text-sm placeholder-gray-400"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-700">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Results */}
          <div ref={listRef} className="flex-1 overflow-y-auto py-1.5">
            {commands.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-gray-500">Sin resultados para "{query}"</p>
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
                    className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors ${
                      isActive ? 'bg-gray-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    {cmd.type === 'task' && (
                      <>
                        <span
                          className="w-1 h-6 rounded-full shrink-0"
                          style={{ background: cmd.areaColor }}
                        />
                        <Inbox size={14} className="text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{cmd.title}</p>
                          <p className="text-xs text-gray-500 truncate">{cmd.subtitle}</p>
                        </div>
                        <ArrowRight size={13} className={`shrink-0 ${isActive ? 'text-gray-700' : 'text-gray-300'}`} />
                      </>
                    )}
                    {cmd.type === 'filter-area' && (
                      <>
                        <Filter size={14} className="text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-700 flex-1">
                          Filtrar por área <span className="font-medium">{cmd.label}</span>
                        </span>
                        <ArrowRight size={13} className={`shrink-0 ${isActive ? 'text-gray-700' : 'text-gray-300'}`} />
                      </>
                    )}
                    {cmd.type === 'filter-project' && (
                      <>
                        <FolderOpen size={14} className="text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-700 flex-1">
                          Filtrar por proyecto <span className="font-mono font-medium">{cmd.code}</span>
                        </span>
                        <ArrowRight size={13} className={`shrink-0 ${isActive ? 'text-gray-700' : 'text-gray-300'}`} />
                      </>
                    )}
                    {cmd.type === 'clear-filters' && (
                      <>
                        <X size={14} className="text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-700 flex-1">Limpiar todos los filtros</span>
                        <ArrowRight size={13} className={`shrink-0 ${isActive ? 'text-gray-700' : 'text-gray-300'}`} />
                      </>
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* Footer hints */}
          <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-3 text-[11px] text-gray-500 bg-gray-50">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-gray-300 bg-white font-mono text-[10px]">↑↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-gray-300 bg-white font-mono text-[10px]">↵</kbd>
              ejecutar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-gray-300 bg-white font-mono text-[10px]">Esc</kbd>
              cerrar
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
