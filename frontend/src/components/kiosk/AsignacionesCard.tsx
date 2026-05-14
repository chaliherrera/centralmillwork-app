import { useQuery } from '@tanstack/react-query'
import { ListChecks, ChevronRight, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { kioskService } from '@/services/kiosk'
import { useKioskAuth } from '@/context/KioskAuthContext'

interface Props {
  onOpen: () => void
}

/**
 * Card compacta de entrada al panel de Asignaciones (siguiendo el patrón
 * de paired cards con TomarBreak). Muestra contador + indicador de
 * prioridad alta. Click → abre el slide-in panel.
 *
 * Se renderiza con apariencia "deshabilitada" si el operario no clockeó
 * todavía (no hay sesión activa donde recibir órdenes).
 */
export default function AsignacionesCard({ onOpen }: Props) {
  const { status } = useKioskAuth()
  const tieneClockIn = !!status?.registro_activo

  const { data = [] } = useQuery({
    queryKey: ['kiosk', 'mi-cola'],
    queryFn:  kioskService.miCola,
    enabled:  tieneClockIn,        // no llamamos al backend si no clockeó
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  })

  const total       = data.length
  const tuTurno     = data.filter((o) => o.es_estacion_activa).length
  const altaCount   = data.filter((o) => o.prioridad === 'Alta' && o.es_estacion_activa).length

  // Disabled si no clockeó (no hace nada al hacer click salvo mostrar tooltip)
  const disabled = !tieneClockIn

  return (
    <button
      type="button"
      onClick={() => !disabled && onOpen()}
      disabled={disabled}
      className={clsx(
        'group relative bg-white rounded-2xl border-2 p-4 shadow-sm transition-all',
        'flex items-center gap-3 text-left',
        disabled
          ? 'border-gray-100 opacity-60 cursor-not-allowed'
          : tuTurno > 0
            ? 'border-gold-300 hover:border-gold-400 hover:shadow-md active:scale-[0.98]'
            : 'border-gray-200 hover:border-forest-300 hover:shadow-md active:scale-[0.98]'
      )}
    >
      <div className={clsx(
        'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
        tuTurno > 0 ? 'bg-gold-100' : 'bg-gray-100'
      )}>
        <ListChecks size={22} className={tuTurno > 0 ? 'text-gold-700' : 'text-gray-500'} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-forest-700">Asignaciones</span>
          {altaCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold"
              title={`${altaCount} de alta prioridad`}
            >
              <AlertTriangle size={10} />
              {altaCount}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {disabled ? (
            <span className="italic">Hacé clock-in primero</span>
          ) : total === 0 ? (
            'Sin órdenes asignadas'
          ) : tuTurno > 0 ? (
            <span className="text-gold-700 font-medium">
              {tuTurno} pendiente{tuTurno > 1 ? 's' : ''} en tu estación
            </span>
          ) : (
            `${total} en cola`
          )}
        </div>
      </div>

      <ChevronRight
        size={20}
        className={clsx(
          'shrink-0 transition-transform group-hover:translate-x-0.5',
          disabled ? 'text-gray-300' : 'text-gray-400'
        )}
      />
    </button>
  )
}
