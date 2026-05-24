import { Search, X } from 'lucide-react'
import type { TareaArea, TareaPriority, TareasFilters } from '@/types'
import { AREA_META, PRIORITY_META } from './constants'

interface Props {
  filters: TareasFilters
  onChange: (next: TareasFilters) => void
  showCompletadas: boolean
  onToggleCompletadas: () => void
  searchRef?: React.Ref<HTMLInputElement>
}

export default function FilterBar({ filters, onChange, showCompletadas, onToggleCompletadas, searchRef }: Props) {
  const setArea = (a: TareaArea | undefined) => onChange({ ...filters, area: a })
  const setPriority = (p: TareaPriority | undefined) => onChange({ ...filters, priority: p })
  const setSearch = (s: string) => onChange({ ...filters, search: s || undefined })
  const resetAll = () => onChange({})

  const areas = Object.entries(AREA_META) as [TareaArea, typeof AREA_META[TareaArea]][]
  const prios = Object.entries(PRIORITY_META) as [TareaPriority, typeof PRIORITY_META[TareaPriority]][]

  const noFilters = !filters.area && !filters.priority && !filters.search

  return (
    <div className="space-y-2.5">
      {/* Row 1 — Areas */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mr-1">Área</span>
        <button
          onClick={resetAll}
          title="Limpiar todos los filtros"
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            noFilters
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
          }`}
        >
          Todas
        </button>
        {areas.map(([key, meta]) => {
          const active = filters.area === key
          return (
            <button
              key={key}
              onClick={() => setArea(active ? undefined : key)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
              style={
                active
                  ? { background: meta.color, color: 'white', borderColor: meta.color }
                  : { background: 'white', color: meta.color, borderColor: meta.color + '33' }
              }
            >
              {meta.label}
            </button>
          )
        })}
      </div>

      {/* Row 2 — Priority + search + completadas */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mr-1">Prioridad</span>
        {prios.map(([key, meta]) => {
          const active = filters.priority === key
          return (
            <button
              key={key}
              onClick={() => setPriority(active ? undefined : key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active ? 'border-gray-900' : 'border-gray-200 hover:border-gray-300'
              }`}
              style={active ? { background: meta.bg, color: meta.color, borderColor: meta.dot } : undefined}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />
              {meta.label}
            </button>
          )
        })}

        <span className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Buscar tareas... ( / )"
            value={filters.search ?? ''}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg w-56 focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none"
          />
          {filters.search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
              aria-label="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Toggle completadas */}
        <button
          onClick={onToggleCompletadas}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            showCompletadas
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
        >
          {showCompletadas ? 'Ocultar hechas' : 'Mostrar hechas'}
        </button>
      </div>
    </div>
  )
}
