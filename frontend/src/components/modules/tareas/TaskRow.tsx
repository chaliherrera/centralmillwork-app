import { Check, Circle, CircleDot, MoreHorizontal, Trash2, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { Tarea } from '@/types'
import { AREA_META, PRIORITY_META, ESTADO_NEXT, shortSender, timeAgo, extractProjectCode } from './constants'

interface Props {
  tarea: Tarea
  highlighted?: boolean    // project lens activo
  dimmed?: boolean         // project lens activo en otra
  onStatusCycle: (next: Tarea['estado']) => void
  onDescartar: () => void
  onReactivar: () => void
  onProjectClick?: (code: string) => void
}

function EstadoButton({ estado, onClick }: { estado: Tarea['estado']; onClick: () => void }) {
  const labels: Record<Tarea['estado'], string> = {
    pendiente:   'Pendiente · click para iniciar',
    en_progreso: 'En curso · click para completar',
    completada:  'Hecho · click para reabrir',
    descartada:  'Descartada',
  }
  return (
    <button
      onClick={onClick}
      title={labels[estado]}
      aria-label={labels[estado]}
      className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors text-gray-400 hover:text-gray-900"
    >
      {estado === 'pendiente'   && <Circle    size={18} strokeWidth={1.5} />}
      {estado === 'en_progreso' && <CircleDot size={18} strokeWidth={1.5} className="text-gold-500" />}
      {estado === 'completada'  && <Check     size={18} strokeWidth={2.5} className="text-forest-600" />}
      {estado === 'descartada'  && <Circle    size={18} strokeWidth={1.5} className="text-gray-300" />}
    </button>
  )
}

export default function TaskRow({ tarea, highlighted, dimmed, onStatusCycle, onDescartar, onReactivar, onProjectClick }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const area = AREA_META[tarea.area]
  const prio = PRIORITY_META[tarea.priority]
  const code = extractProjectCode(tarea.subject)
  const isDone = tarea.estado === 'completada'
  const isDiscarded = tarea.estado === 'descartada'

  return (
    <div
      className={`group relative pl-4 pr-3 py-2.5 rounded-lg border border-transparent transition-all ${
        highlighted
          ? 'bg-white shadow-sm border-gray-200'
          : dimmed
          ? 'opacity-40'
          : 'hover:bg-white hover:border-gray-200'
      } ${isDone || isDiscarded ? 'opacity-60' : ''}`}
    >
      {/* Borde izquierdo coloreado por área */}
      <span
        aria-hidden
        className="absolute left-0 top-2.5 bottom-2.5 w-[2.5px] rounded-r-full"
        style={{ background: area.color }}
      />

      <div className="flex items-center gap-3">
        <EstadoButton estado={tarea.estado} onClick={() => onStatusCycle(ESTADO_NEXT[tarea.estado])} />

        {/* Priority dot */}
        <span
          className="shrink-0 w-1.5 h-1.5 rounded-full"
          style={{ background: prio.dot }}
          title={`Prioridad ${prio.label}`}
        />

        {/* Project code chip */}
        {code && (
          <button
            onClick={() => onProjectClick?.(code)}
            className="shrink-0 font-mono text-[11px] font-medium tracking-tight px-1.5 py-0.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            title="Filtrar por este proyecto"
          >
            {code}
          </button>
        )}

        {/* Area short label */}
        <span
          className="shrink-0 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: area.color }}
        >
          {area.short}
        </span>

        {/* Title */}
        <p className={`flex-1 text-sm font-medium text-gray-900 truncate ${isDone ? 'line-through' : ''}`}>
          {tarea.title}
        </p>

        {/* Meta: sender + age */}
        <span className="shrink-0 text-xs text-gray-400 tabular-nums">
          {shortSender(tarea.from_email)} · {timeAgo(tarea.created_at)}
        </span>

        {/* Actions */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-900 p-1"
            title="Más acciones"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] text-sm">
                {!isDiscarded ? (
                  <button
                    onClick={() => { setMenuOpen(false); onDescartar() }}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
                  >
                    <Trash2 size={14} /> Descartar tarea
                  </button>
                ) : (
                  <button
                    onClick={() => { setMenuOpen(false); onReactivar() }}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
                  >
                    <RotateCcw size={14} /> Reactivar tarea
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Description (compacto, solo si hay y no está completada) */}
      {tarea.description && !isDone && (
        <p className="ml-10 mt-0.5 text-xs text-gray-500 truncate">{tarea.description}</p>
      )}
    </div>
  )
}
