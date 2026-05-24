import { Check, Circle, CircleDot, MoreHorizontal, Trash2, RotateCcw, Cpu } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Tarea } from '@/types'
import {
  AREA_META, PRIORITY_META, ESTADO_NEXT,
  shortSender, timeAgo, extractProjectCode,
} from '../constants'

interface Props {
  tarea: Tarea
  highlighted?: boolean
  focused?: boolean
  onStatusCycle: (next: Tarea['estado']) => void
  onDescartar: () => void
  onReactivar: () => void
  onProjectClick?: (code: string) => void
  onOpen: () => void
}

function GlassEstadoButton({ estado, onClick }: { estado: Tarea['estado']; onClick: () => void }) {
  const variant = {
    pendiente: {
      icon: <Circle size={13} strokeWidth={1.8} />,
      label: 'Pendiente',
      style: {
        background: 'rgba(255,255,250,0.08)',
        color: 'rgba(255,255,250,0.78)',
        border: '0.5px solid rgba(255,255,250,0.18)',
      },
    },
    en_progreso: {
      icon: <CircleDot size={13} strokeWidth={2} />,
      label: 'En curso',
      style: {
        background: 'linear-gradient(180deg, #DEA832, #9B7200)',
        color: '#14110c',
        boxShadow: 'inset 1px 1.5px 1px rgba(255,255,255,0.45), 0 0 12px rgba(222,168,50,0.4)',
        border: '0.5px solid rgba(222,168,50,0.5)',
      },
    },
    completada: {
      icon: <Check size={13} strokeWidth={3} />,
      label: 'Hecho',
      style: {
        background: 'linear-gradient(180deg, #5E6A52, #3A4234)',
        color: '#FFFFFA',
        boxShadow: 'inset 1px 1.5px 1px rgba(255,255,255,0.18), 0 0 12px rgba(94,106,82,0.4)',
        border: '0.5px solid rgba(94,106,82,0.5)',
      },
    },
    descartada: {
      icon: <Circle size={13} strokeWidth={1.5} />,
      label: 'Descartada',
      style: {
        background: 'rgba(255,255,250,0.04)',
        color: 'rgba(255,255,250,0.35)',
        border: '0.5px solid rgba(255,255,250,0.08)',
      },
    },
  }[estado]

  return (
    <button
      onClick={onClick}
      className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all"
      style={variant.style}
    >
      {variant.icon}
      <span>{variant.label}</span>
    </button>
  )
}

export default function GlassTaskRow({
  tarea, highlighted, focused, onStatusCycle, onDescartar, onReactivar, onProjectClick, onOpen,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const area = AREA_META[tarea.area]
  const prio = PRIORITY_META[tarea.priority]
  const code = extractProjectCode(tarea.subject)
  const isDone = tarea.estado === 'completada'
  const isDiscarded = tarea.estado === 'descartada'

  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focused])

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  const bgStyle: React.CSSProperties = focused
    ? {
        background: `${area.color}24`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px -10px ${area.color}80`,
        border: `0.5px solid ${area.color}80`,
      }
    : highlighted
    ? {
        background: `${area.color}1f`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 6px 18px -10px ${area.color}66`,
        border: `0.5px solid ${area.color}66`,
      }
    : {
        background: 'rgba(255,255,250,0.04)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        border: '0.5px solid rgba(255,255,250,0.10)',
      }

  return (
    <div
      ref={rowRef}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      className={`group relative pl-4 pr-3 py-2.5 rounded-xl transition-all cursor-pointer ${
        isDone || isDiscarded ? 'opacity-60' : ''
      }`}
      style={bgStyle}
    >
      {/* Borde izquierdo coloreado por área */}
      <span
        aria-hidden
        className="absolute left-0 top-2.5 bottom-2.5 w-[2.5px] rounded-r-full"
        style={{ background: area.color, boxShadow: `0 0 6px ${area.color}80` }}
      />

      <div className="flex items-center gap-3">
        <span onClick={stop}>
          <GlassEstadoButton estado={tarea.estado} onClick={() => onStatusCycle(ESTADO_NEXT[tarea.estado])} />
        </span>

        {/* Priority dot */}
        <span
          className="shrink-0 w-1.5 h-1.5 rounded-full"
          style={{ background: prio.dot, boxShadow: `0 0 6px ${prio.dot}` }}
          title={`Prioridad ${prio.label}`}
        />

        {/* Project code chip */}
        {code && (
          <button
            onClick={(e) => { e.stopPropagation(); onProjectClick?.(code) }}
            className="shrink-0 font-mono text-[11px] font-medium tracking-tight px-1.5 py-0.5 rounded transition-colors"
            style={{
              background: 'rgba(255,255,250,0.06)',
              border: '0.5px solid rgba(255,255,250,0.14)',
              color: 'rgba(255,255,250,0.78)',
            }}
            title="Filtrar por este proyecto"
          >
            {code}
          </button>
        )}

        {/* Area short label */}
        <span
          className="shrink-0 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: area.color, textShadow: `0 0 8px ${area.color}80` }}
        >
          {area.short}
        </span>

        {/* Origen sistema: badge sutil */}
        {tarea.origen === 'sistema' && (
          <span
            className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded"
            title="Generada por el sistema"
            style={{
              background: 'rgba(255,255,250,0.06)',
              border: '0.5px solid rgba(255,255,250,0.18)',
              color: 'rgba(255,255,250,0.78)',
            }}
          >
            <Cpu size={10} strokeWidth={2} />
            <span>SIS</span>
          </span>
        )}

        {/* Title */}
        <p
          className={`flex-1 text-sm font-medium truncate ${isDone ? 'line-through' : ''}`}
          style={{ color: '#FFFFFA' }}
        >
          {tarea.title}
        </p>

        {/* Meta */}
        <span className="shrink-0 text-xs tabular-nums" style={{ color: 'rgba(255,255,250,0.35)' }}>
          {shortSender(tarea.from_email)} · {timeAgo(tarea.created_at)}
        </span>

        {/* Actions */}
        <div className="relative shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
            style={{ color: 'rgba(255,255,250,0.55)' }}
            title="Más acciones"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }} />
              <div
                className="absolute right-0 top-full mt-1 z-20 rounded-lg py-1 min-w-[180px] text-sm"
                onClick={stop}
                style={{
                  background: 'rgba(20,18,14,0.85)',
                  backdropFilter: 'blur(24px) saturate(200%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(200%)',
                  border: '0.5px solid rgba(255,255,250,0.18)',
                  boxShadow: 'inset 1px 1.5px 1px rgba(255,255,255,0.18), 0 8px 22px -8px rgba(0,0,0,0.5)',
                  color: '#FFFFFA',
                }}
              >
                {!isDiscarded ? (
                  <button
                    onClick={() => { setMenuOpen(false); onDescartar() }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[rgba(255,255,250,0.06)] flex items-center gap-2"
                  >
                    <Trash2 size={14} /> Descartar tarea
                  </button>
                ) : (
                  <button
                    onClick={() => { setMenuOpen(false); onReactivar() }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[rgba(255,255,250,0.06)] flex items-center gap-2"
                  >
                    <RotateCcw size={14} /> Reactivar tarea
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      {tarea.description && !isDone && (
        <p className="ml-10 mt-0.5 text-xs truncate" style={{ color: 'rgba(255,255,250,0.55)' }}>
          {tarea.description}
        </p>
      )}
    </div>
  )
}
