import { useEffect } from 'react'
import {
  X, Mail, Calendar, Circle, CircleDot, Check,
  Trash2, RotateCcw, AtSign,
} from 'lucide-react'
import type { Tarea } from '@/types'
import {
  AREA_META, PRIORITY_META, ESTADO_META,
  extractProjectCode, timeAgo, shortSender,
} from '../constants'

interface Props {
  tarea: Tarea | null
  onClose: () => void
  onStatusChange: (next: Tarea['estado']) => void
  onDescartar: () => void
  onReactivar: () => void
}

const TEXT = '#FFFFFA'
const TEXT2 = 'rgba(255,255,250,0.78)'
const TEXT3 = 'rgba(255,255,250,0.55)'
const TEXT4 = 'rgba(255,255,250,0.35)'

export default function GlassTaskDrawer({ tarea, onClose, onStatusChange, onDescartar, onReactivar }: Props) {
  useEffect(() => {
    if (!tarea) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tarea, onClose])

  if (!tarea) return null

  const area = AREA_META[tarea.area]
  const prio = PRIORITY_META[tarea.priority]
  const estado = ESTADO_META[tarea.estado]
  const code = extractProjectCode(tarea.subject)
  const isDone = tarea.estado === 'completada'
  const isDiscarded = tarea.estado === 'descartada'
  const createdDate = new Date(tarea.created_at)
  const completedDate = tarea.completed_at ? new Date(tarea.completed_at) : null

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />

      <aside
        role="dialog"
        aria-label={`Tarea: ${tarea.title}`}
        className="fixed top-0 right-0 bottom-0 w-[540px] max-w-[90vw] z-50 flex flex-col"
        style={{
          background: 'rgba(20,18,14,0.62)',
          backdropFilter: 'blur(48px) saturate(200%)',
          WebkitBackdropFilter: 'blur(48px) saturate(200%)',
          borderLeft: '0.5px solid rgba(255,255,250,0.10)',
          boxShadow: '-24px 0 60px -20px rgba(0,0,0,0.5)',
          color: TEXT,
          animation: 'slideIn 200ms ease-out',
        }}
      >
        {/* Top: area accent + nav */}
        <div className="relative">
          <span
            aria-hidden
            className="absolute top-0 left-0 right-0 h-1"
            style={{ background: area.color, boxShadow: `0 0 12px ${area.color}` }}
          />
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '0.5px solid rgba(255,255,250,0.08)' }}>
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: area.color, textShadow: `0 0 8px ${area.color}80` }}
              >
                {area.short}
              </span>
              {code && (
                <span
                  className="font-mono text-xs font-medium px-1.5 py-0.5 rounded"
                  style={{
                    background: 'rgba(255,255,250,0.06)',
                    border: '0.5px solid rgba(255,255,250,0.14)',
                    color: TEXT2,
                  }}
                >
                  {code}
                </span>
              )}
              <span style={{ color: TEXT4 }}>·</span>
              <span className="text-xs" style={{ color: TEXT3 }}>{estado.label}</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md transition-colors"
              style={{ color: TEXT3 }}
              aria-label="Cerrar"
              title="Cerrar (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <h2 className={`text-xl font-semibold leading-snug ${isDone ? 'line-through' : ''}`} style={{ color: TEXT }}>
            {tarea.title}
          </h2>

          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: `${area.color}30`,
                color: TEXT,
                border: `0.5px solid ${area.color}70`,
                textShadow: `0 0 8px ${area.color}50`,
              }}
            >
              {area.label}
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: `${prio.dot}30`,
                color: TEXT,
                border: `0.5px solid ${prio.dot}70`,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: prio.dot, boxShadow: `0 0 6px ${prio.dot}` }} />
              Prioridad {prio.label.toLowerCase()}
            </span>
          </div>

          {/* Description */}
          {tarea.description && (
            <section>
              <h3 className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: TEXT4 }}>Resumen</h3>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: TEXT2 }}>{tarea.description}</p>
            </section>
          )}

          {/* Detalles */}
          <section className="space-y-1.5">
            <h3 className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: TEXT4 }}>Detalles</h3>
            <div className="flex items-center gap-2 text-sm" style={{ color: TEXT2 }}>
              <Calendar size={14} className="shrink-0" style={{ color: TEXT4 }} />
              <span>Creada {timeAgo(tarea.created_at)} ·</span>
              <span className="tabular-nums" style={{ color: TEXT3 }}>
                {createdDate.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' '}
                {createdDate.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {completedDate && (
              <div className="flex items-center gap-2 text-sm" style={{ color: TEXT2 }}>
                <Check size={14} className="shrink-0" style={{ color: '#5E6A52' }} />
                <span>Completada {timeAgo(tarea.completed_at!)}</span>
              </div>
            )}
          </section>

          {/* Email source */}
          <section>
            <h3 className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: TEXT4 }}>Origen</h3>
            <div
              className="rounded-lg p-3"
              style={{
                background: 'rgba(255,255,250,0.04)',
                border: '0.5px solid rgba(255,255,250,0.10)',
                boxShadow: 'inset 1px 1.5px 1px rgba(255,255,255,0.06)',
              }}
            >
              <div className="flex items-start gap-2.5 mb-2">
                <Mail size={14} className="shrink-0 mt-0.5" style={{ color: TEXT4 }} />
                <p className="text-sm font-medium leading-snug" style={{ color: TEXT }}>
                  {tarea.subject ?? '(sin subject)'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs ml-6" style={{ color: TEXT3 }}>
                <AtSign size={11} style={{ color: TEXT4 }} />
                <span>{tarea.from_email ?? 'desconocido'}</span>
                <span style={{ color: TEXT4 }}>·</span>
                <span>{shortSender(tarea.from_email)}</span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer: actions */}
        <footer
          className="px-5 py-3 flex items-center gap-2"
          style={{ borderTop: '0.5px solid rgba(255,255,250,0.08)', background: 'rgba(255,255,250,0.02)' }}
        >
          {!isDiscarded && (
            <>
              <ActionButton
                active={tarea.estado === 'pendiente'}
                onClick={() => onStatusChange('pendiente')}
                icon={<Circle size={13} strokeWidth={1.8} />}
                label="Pendiente"
              />
              <ActionButton
                active={tarea.estado === 'en_progreso'}
                onClick={() => onStatusChange('en_progreso')}
                icon={<CircleDot size={13} strokeWidth={2} />}
                label="En curso"
                activeStyle={{
                  background: 'linear-gradient(180deg, #DEA832, #9B7200)',
                  color: '#14110c',
                  border: '0.5px solid rgba(222,168,50,0.5)',
                  boxShadow: 'inset 1px 1.5px 1px rgba(255,255,255,0.45), 0 0 12px rgba(222,168,50,0.4)',
                }}
              />
              <ActionButton
                active={tarea.estado === 'completada'}
                onClick={() => onStatusChange('completada')}
                icon={<Check size={13} strokeWidth={2.5} />}
                label="Hecho"
                activeStyle={{
                  background: 'linear-gradient(180deg, #5E6A52, #3A4234)',
                  color: '#FFFFFA',
                  border: '0.5px solid rgba(94,106,82,0.5)',
                  boxShadow: 'inset 1px 1.5px 1px rgba(255,255,255,0.18), 0 0 12px rgba(94,106,82,0.4)',
                }}
              />
            </>
          )}

          <span className="flex-1" />

          {!isDiscarded ? (
            <button
              onClick={onDescartar}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ color: TEXT3, border: '0.5px solid transparent' }}
              title="Descartar tarea"
            >
              <Trash2 size={13} /> Descartar
            </button>
          ) : (
            <button
              onClick={onReactivar}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ color: TEXT2, border: '0.5px solid rgba(255,255,250,0.18)' }}
            >
              <RotateCcw size={13} /> Reactivar
            </button>
          )}
        </footer>

        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0.6; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>
      </aside>
    </>
  )
}

function ActionButton({
  active, onClick, icon, label, activeStyle,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  activeStyle?: React.CSSProperties
}) {
  const baseStyle: React.CSSProperties = active && activeStyle
    ? activeStyle
    : active
    ? {
        background: 'rgba(255,255,250,0.12)',
        color: '#FFFFFA',
        border: '0.5px solid rgba(255,255,250,0.24)',
        boxShadow: 'inset 1px 1.5px 1px rgba(255,255,255,0.18)',
      }
    : {
        background: 'rgba(255,255,250,0.04)',
        color: 'rgba(255,255,250,0.78)',
        border: '0.5px solid rgba(255,255,250,0.14)',
      }

  return (
    <button
      onClick={onClick}
      disabled={active}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
      style={baseStyle}
    >
      {icon} {label}
    </button>
  )
}
