import { useEffect } from 'react'
import {
  X, Mail, Calendar, Circle, CircleDot, Check,
  Trash2, RotateCcw, AtSign, Cpu,
} from 'lucide-react'
import type { Tarea } from '@/types'
import {
  AREA_META, PRIORITY_META, ESTADO_META,
  extractProjectCode, timeAgo, shortSender, ruleLabel,
} from './constants'

interface Props {
  tarea: Tarea | null
  onClose: () => void
  onStatusChange: (next: Tarea['estado']) => void
  onDescartar: () => void
  onReactivar: () => void
}

export default function TaskDrawer({ tarea, onClose, onStatusChange, onDescartar, onReactivar }: Props) {
  // ESC para cerrar
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
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label={`Tarea: ${tarea.title}`}
        className="fixed top-0 right-0 bottom-0 w-[480px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col animate-[slideIn_200ms_ease-out]"
        style={{ animation: 'slideIn 200ms ease-out' }}
      >
        {/* Top: close + area accent */}
        <div className="relative">
          <span
            aria-hidden
            className="absolute top-0 left-0 right-0 h-1"
            style={{ background: area.color }}
          />
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: area.color }}
              >
                {area.short}
              </span>
              {code && (
                <span className="font-mono text-xs font-medium text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                  {code}
                </span>
              )}
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">{estado.label}</span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-900 p-1 rounded-md hover:bg-gray-100 transition-colors"
              aria-label="Cerrar"
              title="Cerrar (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Title */}
          <h2 className={`text-xl font-semibold leading-snug text-gray-900 ${isDone ? 'line-through' : ''}`}>
            {tarea.title}
          </h2>

          {/* Badges row: area, priority */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: area.bg, color: area.color }}
            >
              {area.label}
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: prio.bg, color: prio.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: prio.dot }} />
              Prioridad {prio.label.toLowerCase()}
            </span>
          </div>

          {/* Description */}
          {tarea.description && (
            <section>
              <h3 className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1.5">Resumen</h3>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{tarea.description}</p>
            </section>
          )}

          {/* Meta */}
          <section className="space-y-1.5">
            <h3 className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1.5">Detalles</h3>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar size={14} className="text-gray-400 shrink-0" />
              <span>Creada {timeAgo(tarea.created_at)} ·</span>
              <span className="tabular-nums text-gray-500">
                {createdDate.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' '}
                {createdDate.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {completedDate && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Check size={14} className="text-forest-600 shrink-0" />
                <span>Completada {timeAgo(tarea.completed_at!)}</span>
              </div>
            )}
          </section>

          {/* Origen */}
          <section>
            <h3 className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1.5">Origen</h3>
            {tarea.origen === 'sistema' ? (
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="flex items-start gap-2.5 mb-2">
                  <Cpu size={14} className="text-gray-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 leading-snug">
                      Generada por el sistema · {ruleLabel(tarea.source_ref)}
                    </p>
                    {tarea.source_ref && (
                      <p className="text-xs text-gray-500 font-mono mt-1">{tarea.source_ref}</p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 ml-6 leading-relaxed">
                  Esta tarea se autocierra cuando la situación se resuelve (recepción, respuesta del proveedor, etc.).
                </p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="flex items-start gap-2.5 mb-2">
                  <Mail size={14} className="text-gray-400 shrink-0 mt-0.5" />
                  <p className="text-sm font-medium text-gray-900 leading-snug">
                    {tarea.subject ?? '(sin subject)'}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 ml-6">
                  <AtSign size={11} className="text-gray-400" />
                  <span>{tarea.from_email ?? 'desconocido'}</span>
                  <span className="text-gray-300">·</span>
                  <span>{shortSender(tarea.from_email)}</span>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Footer: acciones */}
        <footer className="border-t border-gray-100 px-5 py-3 flex items-center gap-2 bg-gray-50">
          {/* Status quick actions */}
          {!isDiscarded && (
            <>
              <button
                onClick={() => onStatusChange('pendiente')}
                disabled={tarea.estado === 'pendiente'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  tarea.estado === 'pendiente'
                    ? 'bg-white text-gray-700 border-gray-300 cursor-default'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-900'
                }`}
              >
                <Circle size={13} strokeWidth={1.8} /> Pendiente
              </button>
              <button
                onClick={() => onStatusChange('en_progreso')}
                disabled={tarea.estado === 'en_progreso'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  tarea.estado === 'en_progreso'
                    ? 'bg-gold-50 text-gold-600 border-gold-400 cursor-default'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gold-400 hover:text-gold-600'
                }`}
              >
                <CircleDot size={13} strokeWidth={2} /> En curso
              </button>
              <button
                onClick={() => onStatusChange('completada')}
                disabled={tarea.estado === 'completada'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  tarea.estado === 'completada'
                    ? 'bg-forest-600 text-white border-forest-600 cursor-default'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-forest-600 hover:bg-forest-600 hover:text-white'
                }`}
              >
                <Check size={13} strokeWidth={2.5} /> Hecho
              </button>
            </>
          )}

          <span className="flex-1" />

          {!isDiscarded ? (
            <button
              onClick={onDescartar}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-700 border border-transparent transition-colors"
              title="Descartar tarea"
            >
              <Trash2 size={13} /> Descartar
            </button>
          ) : (
            <button
              onClick={onReactivar}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 border border-gray-300 transition-colors"
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
