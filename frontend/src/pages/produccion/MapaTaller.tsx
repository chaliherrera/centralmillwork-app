import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Users, AlertTriangle, Activity } from 'lucide-react'
import clsx from 'clsx'
import { produccionService } from '@/services/produccion'
import Timer from '@/components/kiosk/Timer'
import type { EstacionConStatus, EstacionPersonalRef } from '@/types/produccion'

// Layout: 4 columnas × 5 filas. Assembly se "abre" en una celda por carpintero
// en la columna 2 (posicion_x=2). El resto de las estaciones tienen posición fija
// definida en estaciones_config (ver migración 018).
const ASSEMBLY_COL_X = 2
const GRID_COLS = 4
const GRID_ROWS = 5

// Cada celda de la grilla es:
//  - una estación (`station`)
//  - un carpintero individual de Assembly (`carpenter` con su personal info)
//  - vacía (sin asignar)
type Celda =
  | { kind: 'station';   est: EstacionConStatus }
  | { kind: 'carpenter'; est: EstacionConStatus; persona: EstacionPersonalRef }

export default function MapaTaller() {
  const { data: estaciones = [], isLoading } = useQuery({
    queryKey: ['estaciones'],
    queryFn:  produccionService.estaciones,
    refetchInterval: 30_000,
  })

  const { data: kpis } = useQuery({
    queryKey: ['ordenes-produccion-kpis'],
    queryFn:  produccionService.ordenesKpis,
    refetchInterval: 30_000,
  })

  const matriz = useMemo(() => {
    const m: Record<string, Celda> = {}

    // 1. Estaciones con posición explícita (todas menos assembly)
    for (const e of estaciones) {
      if (e.nombre === 'assembly') continue
      if (e.posicion_x != null && e.posicion_y != null) {
        m[`${e.posicion_x},${e.posicion_y}`] = { kind: 'station', est: e }
      }
    }

    // 2. Assembly: una celda por carpintero en la columna 2.
    //    Orden estable por personal_id ascendente.
    const assembly = estaciones.find((e) => e.nombre === 'assembly')
    if (assembly) {
      const carpinteros = [...assembly.personal].sort((a, b) => a.personal_id - b.personal_id)
      carpinteros.forEach((p, idx) => {
        const y = idx + 1
        if (y <= GRID_ROWS) {
          m[`${ASSEMBLY_COL_X},${y}`] = { kind: 'carpenter', est: assembly, persona: p }
        }
      })
    }

    return m
  }, [estaciones])

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Órdenes activas"  value={kpis?.activas         ?? '—'} />
        <Kpi label="Completadas hoy"  value={kpis?.completadas_hoy ?? '—'} />
        <Kpi label="Pausadas"         value={kpis?.pausadas        ?? '—'} />
        <Kpi label="Vencidas"         value={kpis?.vencidas        ?? '—'} alert={(kpis?.vencidas ?? 0) > 0} />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3>Mapa del taller</h3>
          <div className="flex items-center gap-3 text-xs">
            <Legend color="bg-emerald-500" label="Activa" />
            <Legend color="bg-amber-400"   label="Sobrecargada" />
            <Legend color="bg-gray-200"    label="Sin órdenes" />
          </div>
        </div>

        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
            gridTemplateRows:    `repeat(${GRID_ROWS}, minmax(120px, 1fr))`,
          }}
        >
          {Array.from({ length: GRID_ROWS }).map((_, y) =>
            Array.from({ length: GRID_COLS }).map((_, x) => {
              const celda = matriz[`${x + 1},${y + 1}`]
              if (!celda) {
                return <div key={`${x}-${y}`} className="rounded-xl border-2 border-dashed border-gray-100" />
              }
              if (celda.kind === 'station')  return <EstacionCell  key={`${x}-${y}`} est={celda.est} />
              if (celda.kind === 'carpenter') return <CarpinteroCell key={`${x}-${y}`} est={celda.est} persona={celda.persona} />
              return null
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Celda: estación común (CNC, Pintura, etc.) ──────────────────────────────
function EstacionCell({ est }: { est: EstacionConStatus }) {
  const ordenesActivas = Number(est.ordenes_activas)
  const sobreCarga = est.capacidad_max != null && ordenesActivas > est.capacidad_max
  const vacia = ordenesActivas === 0

  const borderColor = sobreCarga ? 'border-amber-400 bg-amber-50'
    : vacia                       ? 'border-gray-200 bg-white'
                                  : 'border-emerald-300 bg-emerald-50'

  return (
    <Link
      to={`/produccion/ordenes?estacion=${est.nombre}`}
      className={clsx(
        'rounded-xl border-2 p-3 hover:shadow-md transition-all flex flex-col gap-2',
        borderColor
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-bold text-sm uppercase text-forest-700">
          {est.nombre.replace('_', ' ')}
        </div>
        {sobreCarga && <AlertTriangle size={14} className="text-amber-600 shrink-0" />}
      </div>

      <div className="flex items-baseline gap-1">
        <span className={clsx(
          'text-3xl font-bold tabular-nums',
          vacia ? 'text-gray-300' : sobreCarga ? 'text-amber-700' : 'text-emerald-700'
        )}>
          {ordenesActivas}
        </span>
        <span className="text-xs text-gray-500">
          / {est.capacidad_max ?? '∞'} órdenes
        </span>
      </div>

      <div className="flex items-center gap-1 mt-auto flex-wrap">
        <Users size={11} className="text-gray-400" />
        {est.personal.length === 0 ? (
          <span className="text-[11px] text-gray-400 italic">Sin personal</span>
        ) : (
          est.personal.map((p) => (
            <span
              key={p.personal_id}
              className={clsx(
                'inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold',
                p.es_estacion_principal
                  ? 'bg-forest-700 text-white'
                  : 'bg-gray-200 text-gray-700'
              )}
              title={p.nombre_completo}
            >
              {p.iniciales}
            </span>
          ))
        )}
      </div>

      {/* Items activos AHORA en esta estación (uno por operario que esté
          trabajando). En estaciones multi-persona como Pintura puede haber
          varios simultáneos. */}
      {est.personal.some((p) => p.item_activo) && (
        <div className="border-t border-gray-200/70 pt-2 mt-1 space-y-1">
          {est.personal.filter((p) => p.item_activo).map((p) => (
            <ItemActivoLine key={p.personal_id} persona={p} />
          ))}
        </div>
      )}
    </Link>
  )
}

// Línea compacta para mostrar el item que un operario tiene en curso.
// Re-tickea cada segundo a través del componente Timer compartido.
function ItemActivoLine({ persona }: { persona: EstacionPersonalRef }) {
  if (!persona.item_activo) return null
  const it = persona.item_activo
  return (
    <div className="flex items-center gap-1.5 text-[11px] leading-tight">
      <Activity size={10} className="text-emerald-600 shrink-0 animate-pulse" />
      <span className="font-bold text-forest-700">{persona.iniciales}</span>
      <span className="text-gray-600 truncate">{it.numero_orden}</span>
      <Timer
        startISO={it.hora_inicio}
        format="hm"
        className="ml-auto font-bold text-emerald-700 tabular-nums shrink-0"
      />
    </div>
  )
}

// ─── Celda: carpintero individual de Assembly ────────────────────────────────
// Muestra la carga REAL del carpintero (sus órdenes activas en assembly) con
// el mismo color coding que las estaciones convencionales:
//   gris    → sin trabajo
//   emerald → con carga normal (≤ capacidad)
//   amber   → sobrecarga (> capacidad personal)
// Si tiene órdenes de prioridad Alta, muestra un badge rojo con el conteo.
function CarpinteroCell({ est, persona }: { est: EstacionConStatus; persona: EstacionPersonalRef }) {
  const ordenesActivas = Number(persona.ordenes_activas ?? 0)
  const altaPrioridad  = Number(persona.ordenes_alta_prioridad ?? 0)
  const capacidad      = est.capacidad_max ?? 3
  const sobreCarga     = ordenesActivas > capacidad
  const vacia          = ordenesActivas === 0

  const borderColor = sobreCarga ? 'border-amber-400 bg-amber-50'
    : vacia                       ? 'border-gray-200 bg-white'
                                  : 'border-emerald-300 bg-emerald-50'

  return (
    <Link
      to={`/produccion/ordenes?estacion=assembly&personal_id=${persona.personal_id}`}
      className={clsx(
        'rounded-xl border-2 hover:shadow-md transition-all flex flex-col gap-2 p-3',
        borderColor
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">
          Assembly
        </div>
        <div className="flex items-center gap-1.5">
          {altaPrioridad > 0 && (
            <span
              className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold leading-none"
              title={`${altaPrioridad} de alta prioridad`}
            >
              !{altaPrioridad}
            </span>
          )}
          <div className="w-6 h-6 rounded-full bg-forest-700 text-white text-[10px] font-bold flex items-center justify-center">
            {persona.iniciales}
          </div>
        </div>
      </div>

      <div className="font-bold text-base text-forest-700 leading-tight">
        {persona.nombre_completo.split(' ')[0]}
      </div>

      <div className="flex items-baseline gap-1">
        <span className={clsx(
          'text-2xl font-bold tabular-nums',
          vacia ? 'text-gray-300' : sobreCarga ? 'text-amber-700' : 'text-emerald-700'
        )}>
          {ordenesActivas}
        </span>
        <span className="text-xs text-gray-500">
          / {capacidad}
        </span>
        {sobreCarga && <AlertTriangle size={12} className="text-amber-600 ml-1" />}
      </div>

      {/* Item activo del carpintero AHORA (timer en vivo) */}
      {persona.item_activo && (
        <div className="mt-auto border-t border-emerald-200/70 pt-1.5 flex items-center gap-1.5 text-[11px]">
          <Activity size={10} className="text-emerald-600 shrink-0 animate-pulse" />
          <span className="text-forest-700 font-semibold truncate">
            {persona.item_activo.numero_orden}
          </span>
          <Timer
            startISO={persona.item_activo.hora_inicio}
            format="hm"
            className="ml-auto font-bold text-emerald-700 tabular-nums"
          />
        </div>
      )}
    </Link>
  )
}

function Kpi({ label, value, alert }: { label: string; value: number | string; alert?: boolean }) {
  return (
    <div className="kpi-card">
      <div>
        <div className="kpi-label">{label}</div>
        <div className={clsx('kpi-value', alert ? 'text-red-700' : 'text-forest-700')}>{value}</div>
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-500">
      <span className={clsx('w-3 h-3 rounded-sm', color)} />
      {label}
    </span>
  )
}
