import { Search, X } from 'lucide-react'
import type { TareaArea, TareaPriority, TareasFilters } from '@/types'
import { AREA_META, PRIORITY_META } from '../constants'

interface Props {
  filters: TareasFilters
  onChange: (next: TareasFilters) => void
  showCompletadas: boolean
  onToggleCompletadas: () => void
  searchRef?: React.Ref<HTMLInputElement>
}

const baseChip = 'px-3 py-1.5 rounded-full text-xs font-medium transition-all'

export default function GlassFilterBar({ filters, onChange, showCompletadas, onToggleCompletadas, searchRef }: Props) {
  const setArea = (a: TareaArea | undefined) => onChange({ ...filters, area: a })
  const setPriority = (p: TareaPriority | undefined) => onChange({ ...filters, priority: p })
  const setSearch = (s: string) => onChange({ ...filters, search: s || undefined })
  const resetAll = () => onChange({})

  const areas = Object.entries(AREA_META) as [TareaArea, typeof AREA_META[TareaArea]][]
  const prios = Object.entries(PRIORITY_META) as [TareaPriority, typeof PRIORITY_META[TareaPriority]][]
  const noFilters = !filters.area && !filters.priority && !filters.search

  return (
    <div className="space-y-2.5" style={{ color: '#FFFFFA' }}>
      {/* Row 1 — Areas */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold mr-1" style={{ color: 'rgba(255,255,250,0.55)' }}>Área</span>
        <button
          onClick={resetAll}
          className={baseChip}
          style={
            noFilters
              ? { background: '#DEA832', color: '#14110c' }
              : { background: 'rgba(255,255,250,0.06)', color: 'rgba(255,255,250,0.78)', border: '0.5px solid rgba(255,255,250,0.18)' }
          }
        >
          Todas
        </button>
        {areas.map(([key, meta]) => {
          const active = filters.area === key
          return (
            <button
              key={key}
              onClick={() => setArea(active ? undefined : key)}
              className={baseChip}
              style={
                active
                  ? {
                      background: `linear-gradient(180deg, ${meta.color}, ${meta.color}cc)`,
                      color: '#FFFFFA',
                      border: `0.5px solid ${meta.color}`,
                      boxShadow: `inset 1px 1.5px 1px rgba(255,255,255,0.18), 0 4px 12px -4px ${meta.color}80`,
                    }
                  : {
                      background: `${meta.color}22`,
                      color: `${meta.color}`,
                      border: `0.5px solid ${meta.color}55`,
                      // text glow para legibilidad sobre fondo oscuro
                      textShadow: `0 0 8px ${meta.color}80`,
                    }
              }
            >
              {meta.label}
            </button>
          )
        })}
      </div>

      {/* Row 2 — Priority + search + completadas */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold mr-1" style={{ color: 'rgba(255,255,250,0.55)' }}>Prioridad</span>
        {prios.map(([key, meta]) => {
          const active = filters.priority === key
          return (
            <button
              key={key}
              onClick={() => setPriority(active ? undefined : key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all`}
              style={
                active
                  ? {
                      background: `linear-gradient(180deg, ${meta.dot}40, ${meta.dot}20)`,
                      color: '#FFFFFA',
                      border: `0.5px solid ${meta.dot}`,
                      boxShadow: `inset 1px 1.5px 1px rgba(255,255,255,0.18), 0 4px 12px -4px ${meta.dot}60`,
                    }
                  : {
                      background: 'rgba(255,255,250,0.04)',
                      color: 'rgba(255,255,250,0.78)',
                      border: '0.5px solid rgba(255,255,250,0.14)',
                    }
              }
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot, boxShadow: `0 0 6px ${meta.dot}` }} />
              {meta.label}
            </button>
          )
        })}

        <span className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,250,0.55)' }} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Buscar tareas... ( / )"
            value={filters.search ?? ''}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-7 py-1.5 text-sm rounded-lg w-56 outline-none placeholder:text-[rgba(255,255,250,0.4)]"
            style={{
              background: 'rgba(255,255,250,0.06)',
              border: '0.5px solid rgba(255,255,250,0.14)',
              color: '#FFFFFA',
            }}
          />
          {filters.search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 hover:opacity-100"
              style={{ color: 'rgba(255,255,250,0.55)' }}
              aria-label="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Toggle completadas */}
        <button
          onClick={onToggleCompletadas}
          className={baseChip}
          style={
            showCompletadas
              ? { background: '#DEA832', color: '#14110c' }
              : { background: 'rgba(255,255,250,0.06)', color: 'rgba(255,255,250,0.78)', border: '0.5px solid rgba(255,255,250,0.14)' }
          }
        >
          {showCompletadas ? 'Ocultar hechas' : 'Mostrar hechas'}
        </button>
      </div>
    </div>
  )
}
