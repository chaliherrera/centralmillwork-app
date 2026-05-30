import { useState } from 'react'
import { Clock, LogIn, LogOut, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { kioskService } from '@/services/kiosk'
import { useKioskAuth } from '@/context/KioskAuthContext'
import Timer, { useNow } from './Timer'

/**
 * Card principal de estado del operario:
 *   - Sin clock-in: gris, CTA prominente verde "Clock In"
 *   - Clockeado: emerald, icon de reloj con ring circular animado,
 *     "TIEMPO ACTIVO" en grande tabular-nums, CTA rojo "Clock Out"
 *
 * El ring circular alrededor del icono se completa progresivamente
 * dentro de cada hora — visual feedback de que el sistema está vivo
 * y midiendo. Es decorativo, no semánticamente significativo.
 */
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
      setTimeout(() => logout(), 600)
    },
  })

  const registro = status?.registro_activo

  if (!registro) {
    // ─── Sin clock-in ────────────────────────────────────────────────────────
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center shrink-0">
            <Clock size={28} className="text-gray-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-forest-700 leading-tight">Sin clock-in</h2>
            <p className="text-sm text-gray-500 mt-1">Marcá tu entrada para empezar el día</p>
          </div>
        </div>
        <button
          onClick={() => clockIn.mutate()}
          disabled={clockIn.isPending}
          className="w-full h-16 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800
                     text-white font-semibold text-lg flex items-center justify-center gap-3
                     transition-colors disabled:opacity-60 shadow-sm"
        >
          {clockIn.isPending ? <Loader2 size={22} className="animate-spin" /> : <LogIn size={22} />}
          Clock In
        </button>
      </div>
    )
  }

  // ─── Clockeado ──────────────────────────────────────────────────────────────
  return (
    <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl border-2 border-emerald-200 p-6 shadow-sm">
      <div className="flex items-center gap-4 mb-5">
        <ClockRing startISO={registro.hora_entrada} />

        <div className="flex-1 min-w-0">
          <div className="text-emerald-700 font-bold text-xl leading-tight">Trabajando</div>
          <div className="text-sm text-gray-600 mt-0.5">
            Entrada: {new Date(registro.hora_entrada).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-[11px] uppercase tracking-widest text-emerald-700/70 font-semibold mt-2">
            Tiempo activo
          </div>
          <Timer
            startISO={registro.hora_entrada}
            className="text-3xl md:text-4xl font-bold text-emerald-800 tabular-nums leading-none"
          />
        </div>
      </div>

      {!confirmOut ? (
        <button
          onClick={() => setConfirmOut(true)}
          disabled={clockOut.isPending}
          className="w-full h-14 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800
                     text-white font-semibold flex items-center justify-center gap-3 transition-colors shadow-sm"
        >
          <LogOut size={20} />
          Clock Out
        </button>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => setConfirmOut(false)}
            className="flex-1 h-14 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50"
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

/**
 * Ring circular animado alrededor del icono de reloj.
 * Muestra el progreso dentro de la hora actual de la jornada — es decorativo,
 * pero da feedback visual de que el contador está vivo.
 */
function ClockRing({ startISO }: { startISO: string }) {
  const now = useNow(1000)
  const elapsedSec = Math.max(0, Math.floor((now - new Date(startISO).getTime()) / 1000))
  // Progress dentro de cada hora: 0 a 1 cada 3600s
  const progress = (elapsedSec % 3600) / 3600

  // Circle math: radio 28, circunferencia 175.93
  const R = 28
  const C = 2 * Math.PI * R
  const dashOffset = C * (1 - progress)

  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
        {/* Track */}
        <circle cx="32" cy="32" r={R} stroke="#d1fae5" strokeWidth="4" fill="white" />
        {/* Progress */}
        <circle
          cx="32" cy="32" r={R}
          stroke="#059669" strokeWidth="4" fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={dashOffset}
          className="transition-all duration-500"
        />
      </svg>
      <Clock size={22} className="absolute inset-0 m-auto text-emerald-700" />
    </div>
  )
}
