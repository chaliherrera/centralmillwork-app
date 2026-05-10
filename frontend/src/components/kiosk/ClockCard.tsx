import { useState } from 'react'
import { Clock, LogIn, LogOut, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { kioskService } from '@/services/kiosk'
import { useKioskAuth } from '@/context/KioskAuthContext'
import Timer from './Timer'

export default function ClockCard() {
  const { status, refresh, logout } = useKioskAuth()
  const qc = useQueryClient()
  const [confirmOut, setConfirmOut] = useState(false)

  const clockIn = useMutation({
    mutationFn: () => kioskService.clockIn(),
    onSuccess: () => {
      toast.success('Clock-in registrado')
      refresh()
      qc.invalidateQueries({ queryKey: ['kiosk', 'dia'] })
    },
  })

  const clockOut = useMutation({
    mutationFn: () => kioskService.clockOut(),
    onSuccess: () => {
      toast.success('Clock-out registrado. ¡Hasta mañana!')
      // Logout del kiosko al terminar — la tablet vuelve al keypad
      setTimeout(() => logout(), 600)
    },
  })

  const registro = status?.registro_activo

  if (!registro) {
    // No clockeado todavía
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
            <Clock size={24} className="text-gray-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-forest-700">Sin clock-in</h2>
            <p className="text-sm text-gray-500">Marcá tu entrada para empezar el día</p>
          </div>
        </div>
        <button
          onClick={() => clockIn.mutate()}
          disabled={clockIn.isPending}
          className="w-full h-16 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800
                     text-white font-semibold text-lg flex items-center justify-center gap-3
                     transition-colors disabled:opacity-60"
        >
          {clockIn.isPending ? <Loader2 size={22} className="animate-spin" /> : <LogIn size={22} />}
          Clock In
        </button>
      </div>
    )
  }

  // Clockeado
  return (
    <div className="bg-white rounded-2xl border border-emerald-200 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
          <Clock size={24} className="text-emerald-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-forest-700">Trabajando</h2>
          <p className="text-sm text-gray-500">
            Entrada: {new Date(registro.hora_entrada).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Tiempo</div>
          <Timer startISO={registro.hora_entrada} className="text-2xl font-bold text-emerald-700 tabular-nums" />
        </div>
      </div>

      {!confirmOut ? (
        <button
          onClick={() => setConfirmOut(true)}
          disabled={clockOut.isPending}
          className="w-full h-14 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800
                     text-white font-semibold flex items-center justify-center gap-3 transition-colors"
        >
          <LogOut size={20} />
          Clock Out
        </button>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => setConfirmOut(false)}
            className="flex-1 h-14 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => clockOut.mutate()}
            disabled={clockOut.isPending}
            className="flex-1 h-14 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center justify-center gap-2"
          >
            {clockOut.isPending ? <Loader2 size={18} className="animate-spin" /> : null}
            Confirmar salida
          </button>
        </div>
      )}
    </div>
  )
}
