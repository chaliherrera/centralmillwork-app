import { useQuery } from '@tanstack/react-query'
import { ListChecks, ChevronRight, AlertTriangle, Clock } from 'lucide-react'
import clsx from 'clsx'
import { kioskService } from '@/services/kiosk'
import { useKioskAuth } from '@/context/KioskAuthContext'

interface Props {
  onOpen: () => void
}

/**
 * Card prominente de entrada al panel de Asignaciones. Es la principal pieza
 * de acción del kiosko después del ClockCard — ocupa toda la fila.
 *
 * Estados visuales:
 *  - Sin clock-in: deshabilitada con tooltip
 *  - Sin asignaciones: card discreta con mensaje
 *  - Con asignaciones EN TU ESTACIÓN: preview de la primera (proyecto, item,
 *    estación, prioridad) + contador del resto
 *  - Con asignaciones pero NO en tu estación: contador genérico de la cola
 *
 * Click → abre el slide-in panel con la lista completa y acciones.
 */
export default function AsignacionesCard({ onOpen }: Props) {
  const { status } = useKioskAuth()
  const tieneClockIn = !!status?.registro_activo

  const { data = [] } = useQuery({
    queryKey: ['kiosk', 'mi-cola'],
    queryFn:  kioskService.miCola,
    enabled:  tieneClockIn,
    staleTime: 1000 * 15,
    // Refetch agresivo para que asignaciones nuevas del SHOP_MANAGER aparezcan
    // sin tener que tocar nada. 20s es razonable: el SHOP_MANAGER asigna y a
    // los pocos segundos el operario lo ve sin F5.
    refetchInterval: 1000 * 20,
    refetchIntervalInBackground: true,
  })

  const enTuEstacion = data.filter((o) => o.es_estacion_activa)
  const tuTurno     = enTuEstacion.length
  const restoEnCola = data.length - tuTurno
  const altaCount   = enTuEstacion.filter((o) => o.prioridad === 'Alta').length
  // Asignación destacada: la primera de tu estación (si hay), priorizando Alta
  const destacada   = enTuEstacion.sort((a, b) =>
    a.prioridad === 'Alta' && b.prioridad !== 'Alta' ? -1 :
    b.prioridad === 'Alta' && a.prioridad !== 'Alta' ? 1  : 0
  )[0]

  const disabled = !tieneClockIn

  // ─── Sin clock-in ──────────────────────────────────────────────────────────
  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className="w-full bg-white rounded-2xl border-2 border-gray-100 p-5 shadow-sm
                   flex items-center gap-4 text-left opacity-60 cursor-not-allowed"
      >
        <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
          <ListChecks size={24} className="text-gray-400" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-forest-700">Asignaciones</div>
          <div className="text-sm text-gray-500 mt-0.5 italic">Hacé clock-in primero</div>
        </div>
      </button>
    )
  }

  // ─── Con asignaciones EN TU ESTACIÓN (caso destacado) ──────────────────────
  if (destacada) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="group w-full bg-white rounded-2xl border-2 border-gold-300 hover:border-gold-400
                   p-5 shadow-sm hover:shadow-md transition-all active:scale-[0.99] text-left"
      >
        <div className="flex items-center gap-4">
          {/* Ícono + indicador */}
          <div className="w-14 h-14 rounded-xl bg-gold-100 flex items-center justify-center shrink-0">
            <ListChecks size={24} className="text-gold-700" />
          </div>

          {/* Contenido */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-forest-700 text-base">Tu próxima tarea</span>
              {altaCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[11px] font-bold"
                  title={`${altaCount} de alta prioridad`}
                >
                  <AlertTriangle size={11} />
                  Alta
                </span>
              )}
            </div>

            {/* Preview de la tarea destacada */}
            <div className="font-mono text-[15px] font-bold text-gray-900 truncate">
              {destacada.proyecto_codigo ?? destacada.numero_orden}
              <span className="text-gray-500 font-medium ml-2">#{destacada.numero_item}</span>
            </div>
            <div className="text-xs text-gray-600 mt-0.5 truncate">
              <span className="uppercase tracking-wide">{destacada.mi_estacion.replace('_', ' ')}</span>
              {destacada.cantidad && (
                <span className="text-gray-400"> · {destacada.cantidad} {destacada.unidad}</span>
              )}
              {destacada.fecha_entrega && (
                <span className="text-gray-400 ml-2">
                  <Clock size={10} className="inline mb-0.5" /> {new Date(destacada.fecha_entrega).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>

            {/* Contador del resto */}
            {(tuTurno > 1 || restoEnCola > 0) && (
              <div className="text-[11px] text-gray-500 mt-1.5 flex gap-3">
                {tuTurno > 1 && <span>+ {tuTurno - 1} más en tu estación</span>}
                {restoEnCola > 0 && <span>{restoEnCola} en otras estaciones</span>}
              </div>
            )}
          </div>

          <ChevronRight size={22} className="shrink-0 text-gray-400 group-hover:text-gold-600 group-hover:translate-x-0.5 transition-all" />
        </div>
      </button>
    )
  }

  // ─── Sin asignaciones en tu estación (puede haber en otras) ────────────────
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full bg-white rounded-2xl border-2 border-gray-200 hover:border-forest-300
                 p-5 shadow-sm hover:shadow-md transition-all active:scale-[0.99] text-left"
    >
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
          <ListChecks size={24} className="text-gray-500" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-forest-700 text-base">Asignaciones</div>
          <div className="text-sm text-gray-500 mt-0.5">
            {data.length === 0
              ? 'Sin órdenes asignadas'
              : `${data.length} en cola (ninguna en tu estación)`}
          </div>
        </div>
        <ChevronRight size={22} className={clsx(
          'shrink-0 transition-all',
          data.length > 0 ? 'text-gray-400 group-hover:translate-x-0.5' : 'text-gray-300'
        )} />
      </div>
    </button>
  )
}
