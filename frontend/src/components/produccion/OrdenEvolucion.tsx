import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2, Activity, CheckCircle2, Circle, PauseCircle, PlayCircle,
  Plus, ArrowRight, UserCheck, Coffee, Flag, ChevronDown, ChevronUp,
} from 'lucide-react'
import clsx from 'clsx'
import { produccionService } from '@/services/produccion'
import { useAuth } from '@/context/AuthContext'
import type {
  EvolucionProceso, EvolucionEvento, EvolucionEventoTipo, OrdenEvolucionResp,
} from '@/types/produccion'

/**
 * Sección de "Evolución" para DetalleOrden.
 * Solo visible para ADMIN y SHOP_MANAGER.
 *
 * Tres bloques:
 *  1. Stepper horizontal con cada estación (tiempo real vs estimado, operador, estado)
 *  2. Resumen (KPIs: total transcurrido, real, estimado, progreso, ETA)
 *  3. Timeline cronológica de eventos (colapsable)
 */
export default function OrdenEvolucion({ ordenId }: { ordenId: number }) {
  const { user } = useAuth()
  const puedeVer = user && (user.rol === 'ADMIN' || user.rol === 'SHOP_MANAGER')

  const { data, isLoading } = useQuery({
    queryKey: ['orden-evolucion', ordenId],
    queryFn:  () => produccionService.ordenEvolucion(ordenId),
    enabled:  !!puedeVer,
    // Auto-refresh agresivo: el operario mueve la orden en el kiosko mientras
    // el SHOP_MANAGER mira esta pantalla en otra device. Sin refetch en
    // background, si la pestaña pierde foco (cambio de app en iPad, pantalla
    // dormida, etc.) la vista queda congelada y requería refresh manual.
    // 15s + background + on-focus garantiza que ver evolución se sienta vivo.
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  })

  if (!puedeVer) return null
  if (isLoading) {
    return (
      <div className="card flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="card p-0 overflow-hidden">
      <header className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <Activity size={18} className="text-forest-700" />
        <h2 className="text-base font-semibold text-forest-700">Evolución</h2>
      </header>

      <div className="p-5 space-y-5">
        <EvolucionStepper procesos={data.procesos} totalEstimadoHoras={data.orden.tiempo_estimado_horas} />
        <EvolucionResumen data={data} />
        <EvolucionTimelineColapsable eventos={data.eventos} />
      </div>
    </div>
  )
}

// ─── Wrapper colapsable de la línea de tiempo ────────────────────────────────
// La timeline es info densa de auditoría — la mantenemos cerrada por default
// para no saturar la vista. Botón abajo de los KPIs la despliega.
function EvolucionTimelineColapsable({ eventos }: { eventos: EvolucionEvento[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-gray-100 pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left px-3 py-2 rounded-md hover:bg-gray-50 transition-colors group"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700 group-hover:text-forest-700">
          <Activity size={14} className="text-gray-500 group-hover:text-forest-700" />
          Línea de tiempo
          <span className="text-xs font-normal text-gray-500">
            ({eventos.length} {eventos.length === 1 ? 'evento' : 'eventos'})
          </span>
        </span>
        {open
          ? <ChevronUp size={16} className="text-gray-500" />
          : <ChevronDown size={16} className="text-gray-500" />}
      </button>
      {open && (
        <div className="mt-3 px-1">
          <EvolucionTimeline eventos={eventos} />
        </div>
      )}
    </div>
  )
}

// ─── Stepper horizontal ──────────────────────────────────────────────────────
function EvolucionStepper({
  procesos, totalEstimadoHoras,
}: { procesos: EvolucionProceso[]; totalEstimadoHoras: number | null }) {
  // Distribuir tiempo estimado total entre estaciones requeridas si no hay estimado por estación
  const procesosRequeridos = procesos.filter((p) => p.requerido)
  const estimadoPorEstacion = useMemo(() => {
    if (!totalEstimadoHoras || totalEstimadoHoras <= 0 || procesosRequeridos.length === 0) return null
    return Math.round((totalEstimadoHoras * 60) / procesosRequeridos.length)
  }, [totalEstimadoHoras, procesosRequeridos.length])

  return (
    <div>
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {procesos.map((p, i) => (
          <div key={p.id} className="flex items-center shrink-0">
            <StepperCard
              proceso={p}
              estimadoFallback={estimadoPorEstacion}
            />
            {i < procesos.length - 1 && (
              <ArrowRight size={14} className="text-gray-300 mx-1 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function StepperCard({
  proceso, estimadoFallback,
}: { proceso: EvolucionProceso; estimadoFallback: number | null }) {
  const tiempoReal = Math.round(proceso.tiempo_real_minutos)
  const estimado = proceso.tiempo_estimado_minutos ?? estimadoFallback
  const variancia = estimado && tiempoReal > 0 ? ((tiempoReal - estimado) / estimado) * 100 : null

  const colorByEstado = {
    completado: { bg: 'bg-emerald-50',  border: 'border-emerald-200', accent: '#16A34A' },
    en_curso:   { bg: 'bg-blue-50',     border: 'border-blue-300',    accent: '#2563EB' },
    pausado:    { bg: 'bg-amber-50',    border: 'border-amber-200',   accent: '#D89412' },
    pendiente:  { bg: 'bg-gray-50',     border: 'border-gray-200',    accent: '#9C9384' },
  }[proceso.estado]

  const Icon = {
    completado: CheckCircle2,
    en_curso:   PlayCircle,
    pausado:    PauseCircle,
    pendiente:  Circle,
  }[proceso.estado]

  return (
    <div
      className={clsx(
        'rounded-lg border px-3 py-2 min-w-[150px]',
        colorByEstado.bg, colorByEstado.border,
        proceso.estado === 'en_curso' && 'ring-2 ring-blue-200'
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Icon size={14} style={{ color: colorByEstado.accent }} />
          <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-gray-600">
            {proceso.estacion.replace('_', ' ')}
          </span>
        </div>
        {!proceso.requerido && (
          <span className="text-[9px] text-gray-400 italic">opc</span>
        )}
      </div>

      {/* Tiempos */}
      <div className="text-xs tabular-nums">
        {proceso.estado === 'pendiente' ? (
          <span className="text-gray-400 italic">pendiente</span>
        ) : (
          <>
            <span className="font-bold" style={{ color: colorByEstado.accent }}>
              {formatMin(tiempoReal)}
            </span>
            {estimado && (
              <span className="text-gray-500"> / {formatMin(estimado)}</span>
            )}
          </>
        )}
      </div>

      {/* Comparación con estimado */}
      {variancia != null && proceso.estado !== 'pendiente' && (
        <div className="text-[10px] mt-0.5">
          {Math.abs(variancia) < 10 ? (
            <span className="text-emerald-700">✓ on time</span>
          ) : variancia > 0 ? (
            <span className="text-amber-700">⚠ +{variancia.toFixed(0)}%</span>
          ) : (
            <span className="text-emerald-700">✓ {variancia.toFixed(0)}%</span>
          )}
        </div>
      )}

      {/* Operador */}
      {proceso.operador_actual_iniciales ? (
        <div className="flex items-center gap-1 mt-1.5">
          <div
            className="w-5 h-5 rounded-full bg-forest-700 text-white text-[9px] font-bold flex items-center justify-center"
            title={proceso.operador_actual_nombre ?? ''}
          >
            {proceso.operador_actual_iniciales}
          </div>
          <span className="text-[10px] text-gray-600 truncate max-w-[80px]">
            {proceso.operador_actual_nombre?.split(' ')[0]}
          </span>
        </div>
      ) : (
        <div className="text-[10px] text-gray-400 italic mt-1.5">sin asignar</div>
      )}
    </div>
  )
}

// ─── Resumen ─────────────────────────────────────────────────────────────────
function EvolucionResumen({ data }: { data: OrdenEvolucionResp }) {
  const { orden, procesos } = data
  const procesosCompletados = procesos.filter((p) => p.completado).length
  const procesosTotal       = procesos.filter((p) => p.requerido).length
  const progreso            = procesosTotal > 0 ? Math.round((procesosCompletados / procesosTotal) * 100) : 0

  // Total transcurrido (fecha_inicio → ahora o fin)
  const inicioMs    = orden.fecha_inicio ? new Date(orden.fecha_inicio).getTime() : null
  const finMs       = orden.fecha_completada ? new Date(orden.fecha_completada).getTime() : Date.now()
  const transcurridoMs = inicioMs ? finMs - inicioMs : null

  // Tiempo real trabajado (sum de procesos)
  const trabajadoMin = procesos.reduce((acc, p) => acc + p.tiempo_real_minutos, 0)

  // Estimado total
  const estimadoMin = orden.tiempo_estimado_horas ? orden.tiempo_estimado_horas * 60 : null

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-50 rounded-lg p-3">
      <ResumenItem
        label="Transcurrido"
        value={transcurridoMs ? formatDuracion(transcurridoMs) : '—'}
        sub={inicioMs ? 'desde inicio' : 'no arrancada'}
      />
      <ResumenItem
        label="Real trabajado"
        value={formatMin(trabajadoMin)}
        sub={`${procesosCompletados}/${procesosTotal} estaciones`}
        accent="emerald"
      />
      <ResumenItem
        label="Estimado"
        value={estimadoMin ? formatMin(estimadoMin) : '—'}
        sub={estimadoMin ? 'total orden' : 'sin estimar'}
        accent={estimadoMin ? 'forest' : 'muted'}
      />
      <ResumenItem
        label="Progreso"
        value={`${progreso}%`}
        sub={orden.status}
        accent={progreso === 100 ? 'emerald' : 'gold'}
      />
    </div>
  )
}

function ResumenItem({
  label, value, sub, accent = 'default',
}: { label: string; value: string; sub?: string; accent?: 'emerald' | 'gold' | 'forest' | 'muted' | 'default' }) {
  const colorMap = {
    emerald: 'text-emerald-700',
    gold:    'text-gold-700',
    forest:  'text-forest-700',
    muted:   'text-gray-400',
    default: 'text-gray-900',
  }
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">{label}</div>
      <div className={clsx('text-lg font-bold tabular-nums leading-tight mt-0.5', colorMap[accent])}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

// ─── Timeline vertical ───────────────────────────────────────────────────────
function EvolucionTimeline({ eventos }: { eventos: EvolucionEvento[] }) {
  const [showAll, setShowAll] = useState(false)
  const visibles = showAll ? eventos : eventos.slice(-12)  // últimos 12 por default cuando se abre
  const ocultos  = eventos.length - visibles.length

  return (
    <div>
      {eventos.length === 0 ? (
        <p className="text-sm text-gray-400 italic py-4 text-center">Sin eventos registrados todavía</p>
      ) : (
        <>
          {ocultos > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="text-xs text-forest-700 hover:text-gold-600 mb-2 flex items-center gap-1"
            >
              <ChevronUp size={12} /> Ver {ocultos} eventos anteriores
            </button>
          )}
          {showAll && eventos.length > 12 && (
            <button
              onClick={() => setShowAll(false)}
              className="text-xs text-gray-500 hover:text-forest-700 mb-2 flex items-center gap-1"
            >
              <ChevronDown size={12} /> Mostrar solo los últimos 12
            </button>
          )}
          <div className="relative pl-5">
            <div className="absolute left-1.5 top-2 bottom-2 w-px bg-gray-200" />
            {visibles.map((ev, i) => (
              <TimelineEvento key={`${ev.timestamp}-${i}`} evento={ev} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TimelineEvento({ evento }: { evento: EvolucionEvento }) {
  const meta = eventoMeta(evento.tipo)
  const fecha = new Date(evento.timestamp)
  const fechaLabel = fecha.toLocaleString('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="relative pb-3">
      {/* Dot */}
      <div
        className="absolute left-[-18px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white"
        style={{ backgroundColor: meta.color }}
      />
      <div className="flex items-baseline gap-2 flex-wrap">
        <meta.Icon size={12} style={{ color: meta.color }} />
        <span className="text-xs font-mono text-gray-500">{fechaLabel}</span>
      </div>
      <div className="text-sm mt-0.5 leading-snug">
        {renderDescripcion(evento)}
      </div>
    </div>
  )
}

function eventoMeta(tipo: EvolucionEventoTipo) {
  const map = {
    creada:        { color: '#9C9384', Icon: Plus },
    asignada:      { color: '#9B7200', Icon: UserCheck },
    iniciado_item: { color: '#16A34A', Icon: PlayCircle },
    pausa:         { color: '#2563EB', Icon: Coffee },
    movida:        { color: '#A4842C', Icon: ArrowRight },
    completada:    { color: '#15803d', Icon: Flag },
  }
  return map[tipo] ?? { color: '#9C9384', Icon: Activity }
}

function renderDescripcion(ev: EvolucionEvento): React.ReactNode {
  const actor = (
    <span className="font-semibold text-forest-700">
      {ev.actor_iniciales ? `${ev.actor_iniciales} ` : ''}
      {ev.actor_usuario ?? ''}
    </span>
  )
  switch (ev.tipo) {
    case 'creada':
      return <>Orden creada {ev.actor_usuario && <>por {actor}</>}{ev.detalle.prioridad && <> · prioridad <strong>{ev.detalle.prioridad}</strong></>}</>
    case 'asignada':
      return <>Asignada a <strong>{ev.detalle.personal_destino ?? '—'}</strong> en <span className="font-mono uppercase text-xs">{ev.detalle.estacion_destino}</span></>
    case 'iniciado_item':
      return <>{actor} <strong>inició</strong> el item en <span className="font-mono uppercase text-xs">{ev.detalle.estacion_origen ?? ev.detalle.estacion_destino}</span></>
    case 'movida':
      return <>{actor} completó <span className="font-mono uppercase text-xs">{ev.detalle.estacion_origen}</span> → avanza a <span className="font-mono uppercase text-xs">{ev.detalle.estacion_destino}</span></>
    case 'completada':
      return <>{actor} <strong>completó</strong> la orden desde <span className="font-mono uppercase text-xs">{ev.detalle.estacion_origen}</span></>
    case 'pausa':
      const dur = ev.detalle.duracion_min
      return (
        <>
          {actor} pausó ({ev.detalle.motivo || 'sin motivo'})
          {dur != null
            ? <> durante <strong>{Math.round(dur)}m</strong></>
            : ev.detalle.hora_fin
              ? null
              : <> · <span className="text-amber-700 italic">en curso</span></>}
        </>
      )
    default:
      return <span className="text-gray-500 italic">{String(ev.tipo)}</span>
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatMin(min: number): string {
  if (!min || min < 1) return '0m'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatDuracion(ms: number): string {
  const totalMin = Math.floor(ms / 60_000)
  const dias = Math.floor(totalMin / (24 * 60))
  const horas = Math.floor((totalMin % (24 * 60)) / 60)
  const min = totalMin % 60
  if (dias > 0) return `${dias}d ${horas}h`
  if (horas > 0) return `${horas}h ${min}m`
  return `${min}m`
}
