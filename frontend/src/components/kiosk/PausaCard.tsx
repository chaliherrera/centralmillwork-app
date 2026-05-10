import { useState } from 'react'
import { Coffee, Loader2, Play, X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { kioskService } from '@/services/kiosk'
import { useKioskAuth } from '@/context/KioskAuthContext'
import Timer from './Timer'

const MOTIVOS = ['Descanso', 'Almuerzo', 'Reunión', 'Sanitario', 'Otro']

export default function PausaCard() {
  const { status, refresh } = useKioskAuth()
  const qc = useQueryClient()
  const [showSelector, setShowSelector] = useState(false)
  const [motivo, setMotivo] = useState<string>('')

  const iniciar = useMutation({
    mutationFn: (m?: string) => kioskService.iniciarPausa(m),
    onSuccess: () => {
      toast.success('En pausa')
      refresh()
      qc.invalidateQueries({ queryKey: ['kiosk', 'dia'] })
      setShowSelector(false)
      setMotivo('')
    },
  })

  const finalizar = useMutation({
    mutationFn: () => kioskService.finalizarPausa(),
    onSuccess: () => {
      toast.success('Pausa terminada — a darle')
      refresh()
      qc.invalidateQueries({ queryKey: ['kiosk', 'dia'] })
    },
  })

  const pausa = status?.pausa_activa
  const tieneClockIn = !!status?.registro_activo

  if (!tieneClockIn) {
    return null  // No mostrar la card si no clockeó
  }

  if (pausa) {
    return (
      <div className="bg-blue-50 rounded-2xl border-2 border-blue-300 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
            <Coffee size={24} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-blue-900">En pausa</h2>
            <p className="text-sm text-blue-700">
              {pausa.motivo || 'Sin motivo'} · desde{' '}
              {new Date(pausa.hora_inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <Timer startISO={pausa.hora_inicio} className="text-xl font-bold text-blue-700 tabular-nums" />
        </div>
        <button
          onClick={() => finalizar.mutate()}
          disabled={finalizar.isPending}
          className="w-full h-14 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center justify-center gap-2"
        >
          {finalizar.isPending ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
          Terminar pausa
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowSelector(true)}
        className="w-full bg-white rounded-2xl border-2 border-gray-200 p-5 shadow-sm hover:border-blue-300 hover:bg-blue-50 transition-colors flex items-center gap-4"
      >
        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
          <Coffee size={24} className="text-gray-600" />
        </div>
        <div className="text-left flex-1">
          <div className="font-semibold text-forest-700">Tomar break</div>
          <div className="text-sm text-gray-500">Pausá el timer del proyecto</div>
        </div>
      </button>

      {showSelector && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50" onClick={() => setShowSelector(false)}>
          <div
            className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-forest-700">¿Por qué pausa?</h2>
              <button onClick={() => setShowSelector(false)} className="p-2 rounded-full hover:bg-gray-100">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
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
          </div>
        </div>
      )}
    </>
  )
}
