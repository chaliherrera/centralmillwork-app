import { CalendarDays, Clock4, Coffee, Briefcase, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { kioskService } from '@/services/kiosk'
import { useKioskAuth } from '@/context/KioskAuthContext'

/**
 * Resumen del día del operario logueado:
 * - Horas trabajadas (registro)
 * - Horas netas (sin pausas)
 * - Lista de proyectos del día con tiempo
 * - Pausas tomadas
 *
 * Se muestra solo si el operario clockeó hoy.
 */
export default function ResumenDia() {
  const { status } = useKioskAuth()
  const tieneClockIn = !!status?.registro_activo

  const { data, isLoading } = useQuery({
    queryKey: ['kiosk', 'dia'],
    queryFn:  kioskService.dia,
    enabled:  tieneClockIn,
    refetchInterval: 60_000,   // refresca por minuto mientras el operario está en pantalla
    staleTime: 30_000,
  })

  if (!tieneClockIn) return null

  const proyectos = data?.proyectos ?? []
  const pausas    = data?.pausas    ?? []

  // Totales calculados desde los segmentos (incluye los que están abiertos)
  const horasProyectos = proyectos.reduce((acc, p) => {
    if (p.total_horas != null) return acc + Number(p.total_horas)
    // Segmento abierto: calculamos desde hora_inicio hasta ahora
    const desde = new Date(p.hora_inicio).getTime()
    return acc + (Date.now() - desde) / 3_600_000
  }, 0)

  const minutosPausas = pausas.reduce((acc, p) => {
    if (p.duracion_minutos != null) return acc + Number(p.duracion_minutos)
    if (!p.hora_fin) {
      const desde = new Date(p.hora_inicio).getTime()
      return acc + (Date.now() - desde) / 60_000
    }
    return acc
  }, 0)

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

      {isLoading ? (
        <div className="py-4 flex justify-center">
          <Loader2 size={18} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* Métricas */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Metric
              icon={<Clock4 size={16} className="text-emerald-600" />}
              label="Trabajadas"
              value={formatH(horasProyectos)}
              color="text-emerald-700"
            />
            <Metric
              icon={<Coffee size={16} className="text-blue-600" />}
              label="En pausa"
              value={formatMin(minutosPausas)}
              color="text-blue-700"
            />
            <Metric
              icon={<Briefcase size={16} className="text-gold-600" />}
              label="Proyectos"
              value={String(new Set(proyectos.map((p) => p.proyecto_id)).size)}
              color="text-gold-700"
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
  icon, label, value, color,
}: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-0.5">
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
