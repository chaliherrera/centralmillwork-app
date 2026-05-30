import { useState } from 'react'
import { Coffee, Loader2, Play, X, ChevronRight } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { kioskService } from '@/services/kiosk'
import { useKioskAuth } from '@/context/KioskAuthContext'
import Timer from './Timer'

const MOTIVOS = ['Descanso', 'Almuerzo', 'Reunión', 'Sanitario', 'Otro']

/**
 * Entry card compacta de pausa, paired con AsignacionesCard en KioskHome.
 *
 * - Sin clock-in: card visible pero deshabilitada.
 * - Clockeado sin pausa: muestra "Tomar break · Pausá el timer del proyecto".
 *   Click → modal con motivos.
 * - En pausa activa: muestra estado en azul + motivo + timer + chevron.
 *   Click → modal con botón "Terminar pausa".
 */
export default function PausaCard() {
  const { status, refresh } = useKioskAuth()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [motivo, setMotivo] = useState<string>('')

  const iniciar = useMutation({
    mutationFn: (m?: string) => kioskService.iniciarPausa(m),
    onSuccess: () => {
      toast.success('En pausa')
      refresh()
      qc.invalidateQueries({ queryKey: ['kiosk', 'dia'] })
      setShowModal(false)
      setMotivo('')
    },
  })

  const finalizar = useMutation({
    mutationFn: () => kioskService.finalizarPausa(),
    onSuccess: () => {
      toast.success('Pausa terminada — a darle')
      refresh()
      qc.invalidateQueries({ queryKey: ['kiosk', 'dia'] })
      setShowModal(false)
    },
  })

  const pausa        = status?.pausa_activa
  const tieneClockIn = !!status?.registro_activo
  const disabled     = !tieneClockIn

  const enPausa = !!pausa

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setShowModal(true)}
        disabled={disabled}
        className={clsx(
          'group relative rounded-2xl border-2 p-4 shadow-sm transition-all',
          'flex items-center gap-3 text-left w-full',
          disabled
            ? 'bg-white border-gray-100 opacity-60 cursor-not-allowed'
            : enPausa
              ? 'bg-blue-50 border-blue-300 hover:border-blue-400 hover:shadow-md active:scale-[0.98]'
              : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-md active:scale-[0.98]'
        )}
      >
        <div className={clsx(
          'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
          enPausa ? 'bg-blue-100' : 'bg-gray-100'
        )}>
          <Coffee size={22} className={enPausa ? 'text-blue-600' : 'text-gray-500'} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-forest-700">
            {enPausa ? 'En pausa' : 'Tomar break'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 truncate">
            {disabled ? (
              <span className="italic">Hacé clock-in primero</span>
            ) : enPausa ? (
              <span className="text-blue-700 font-medium">
                {pausa!.motivo || 'Sin motivo'} ·{' '}
                <Timer startISO={pausa!.hora_inicio} format="hm" className="tabular-nums" />
              </span>
            ) : (
              'Pausá el timer del proyecto'
            )}
          </div>
        </div>

        <ChevronRight
          size={20}
          className={clsx(
            'shrink-0 transition-transform group-hover:translate-x-0.5',
            disabled ? 'text-gray-300' : enPausa ? 'text-blue-400' : 'text-gray-400'
          )}
        />
      </button>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50"
          onClick={() => !iniciar.isPending && !finalizar.isPending && setShowModal(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-forest-700">
                {enPausa ? 'En pausa' : '¿Por qué pausa?'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-gray-100">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {enPausa ? (
              // Modo: terminar pausa
              <div className="space-y-4">
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 text-center">
                  <div className="text-sm text-blue-700">{pausa!.motivo || 'Sin motivo'}</div>
                  <Timer
                    startISO={pausa!.hora_inicio}
                    className="text-3xl font-bold text-blue-700 tabular-nums mt-1 block"
                  />
                  <div className="text-xs text-blue-600 mt-1">
                    Desde {new Date(pausa!.hora_inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <button
                  onClick={() => finalizar.mutate()}
                  disabled={finalizar.isPending}
                  className="w-full h-14 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {finalizar.isPending ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                  Terminar pausa
                </button>
              </div>
            ) : (
              // Modo: elegir motivo + iniciar
              <>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {MOTIVOS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMotivo(m)}
                      className={clsx(
                        'h-14 rounded-xl border-2 font-semibold transition-all',
                        motivo === m
                          ? 'border-blue-500 bg-blue-100 text-blue-900'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => iniciar.mutate(motivo || undefined)}
                  disabled={iniciar.isPending}
                  className="w-full h-14 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {iniciar.isPending ? <Loader2 size={18} className="animate-spin" /> : <Coffee size={18} />}
                  Iniciar pausa
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
