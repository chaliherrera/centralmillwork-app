import { CalendarDays, Clock4, Coffee, Wrench, HelpCircle, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { kioskService } from '@/services/kiosk'
import { useKioskAuth } from '@/context/KioskAuthContext'

/**
 * Resumen del día del operario logueado: 4 buckets de la jornada.
 *
 * Los totales vienen calculados desde el backend (`data.totales`) — son
 * más precisos que sumar segmentos en el cliente porque consideran:
 *  - Segmentos abiertos (usan NOW() como fin implícito)
 *  - Diferencia entre items asignados vs "Otro trabajo"
 *  - Tiempo "sin asignar" = jornada − items − otro − pausas (capturado en
 *    silencio: análisis, agua, llamadas, baño rápido entre items, etc.)
 *
 * Sólo se muestra si el operario clockeó hoy.
 */
export default function ResumenDia() {
  const { status } = useKioskAuth()
  const tieneClockIn = !!status?.registro_activo

  const { data, isLoading } = useQuery({
    queryKey: ['kiosk', 'dia'],
    queryFn:  kioskService.dia,
    enabled:  tieneClockIn,
    refetchInterval: 60_000,   // refresca cada minuto
    staleTime: 30_000,
  })

  if (!tieneClockIn) return null

  const proyectos = data?.proyectos ?? []
  const pausas    = data?.pausas    ?? []
  const totales   = data?.totales

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-forest-100 flex items-center justify-center">
          <CalendarDays size={22} className="text-forest-700" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-forest-700">Tu día</h2>
          <p className="text-sm text-gray-500">
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {isLoading || !totales ? (
        <div className="py-4 flex justify-center">
          <Loader2 size={18} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* 4 buckets de la jornada */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Metric
              icon={<Clock4 size={16} className="text-emerald-600" />}
              label="En items"
              value={formatMin(totales.minutos_items)}
              color="text-emerald-700"
            />
            <Metric
              icon={<Wrench size={16} className="text-gold-600" />}
              label="Otro trabajo"
              value={formatMin(totales.minutos_otro_trabajo)}
              color="text-gold-700"
            />
            <Metric
              icon={<Coffee size={16} className="text-blue-600" />}
              label="En pausa"
              value={formatMin(totales.minutos_pausas)}
              color="text-blue-700"
            />
            <Metric
              icon={<HelpCircle size={16} className="text-gray-500" />}
              label="Sin asignar"
              value={formatMin(totales.minutos_sin_asignar)}
              color="text-gray-600"
              tip="Tiempo entre items: análisis, agua, llamadas, baño, etc. Capturado automáticamente."
            />
          </div>

          {/* Proyectos del día */}
          {proyectos.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Segmentos del día</div>
              <ul className="space-y-1.5">
                {proyectos.map((p) => {
                  const horas = p.total_horas != null
                    ? Number(p.total_horas)
                    : (Date.now() - new Date(p.hora_inicio).getTime()) / 3_600_000
                  const enCurso = !p.hora_fin
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50"
                    >
                      <span className="font-mono text-xs text-gray-500 w-12 shrink-0">
                        {new Date(p.hora_inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="font-semibold text-forest-700 truncate flex-1">
                        {p.proyecto_codigo} · <span className="font-normal uppercase text-xs text-gray-600">{p.estacion.replace('_', ' ')}</span>
                      </span>
                      <span className={enCurso ? 'text-gold-600 font-semibold' : 'text-gray-700'}>
                        {formatH(horas)}{enCurso && ' …'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Pausas */}
          {pausas.length > 0 && (
            <div className="border-t border-gray-100 pt-3 mt-3">
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                Pausas ({pausas.length})
              </div>
              <ul className="space-y-1 text-sm">
                {pausas.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-gray-600">
                    <Coffee size={12} className="text-blue-400" />
                    <span className="font-mono text-xs text-gray-500 w-12 shrink-0">
                      {new Date(p.hora_inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="flex-1">{p.motivo || 'Sin motivo'}</span>
                    <span className="text-xs">
                      {p.duracion_minutos != null
                        ? `${Math.round(Number(p.duracion_minutos))} min`
                        : 'en curso'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {proyectos.length === 0 && pausas.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-2">
              Todavía no registraste actividad hoy.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Metric({
  icon, label, value, color, tip,
}: { icon: React.ReactNode; label: string; value: string; color: string; tip?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5" title={tip}>
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-0.5">
        {icon}
        <span className="uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}

function formatH(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return mm === 0 ? `${hh}h` : `${hh}h ${mm}m`
}

function formatMin(m: number): string {
  if (m < 60) return `${Math.round(m)}m`
  return formatH(m / 60)
}
