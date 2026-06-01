import { useMemo, useState } from 'react'
import { X, Clock } from 'lucide-react'
import clsx from 'clsx'
import type { EvolucionProceso, EvolucionEvento } from '@/types/produccion'

/**
 * Vista de calendario adaptativo para la evolución de una orden de producción.
 *
 * Reemplaza la "Línea de tiempo" cronológica vertical original. Muestra la
 * orden como un grid con:
 *  - Filas: cada estación de la ruta (en orden de secuencia)
 *  - Columnas: unidades de tiempo
 *
 * El modo del eje X se decide automáticamente según la duración total de la
 * orden:
 *  - < 8h    → modo HORAS (8 AM - 6 PM del día actual)
 *  - 1-30 d  → modo DÍAS (cada día = 1 columna, con tags de semana)
 *  - > 30 d  → modo SEMANAS (cada semana = 1 columna)
 *
 * Cada celda se pinta de gold si la estación estuvo activa durante esa unidad
 * de tiempo, con intensidad según el % del tiempo que estuvo ocupada. Hover
 * muestra tooltip con horas. En modo días/semanas, click sobre un día expande
 * el detalle horario en un drawer.
 *
 * Props:
 *  - procesos: lista de procesos de la orden (cada uno con fecha_inicio/fin)
 *  - eventos: timeline cronológica (para enriquecer tooltips e info auxiliar)
 *  - inicio: cuándo arrancó la orden (timestamp ISO de la creación o primer
 *    evento). Si null, usa `created_at` desde el primer proceso con fecha.
 *  - fin: cuándo terminó (null = en curso → usa NOW)
 */

type Modo = 'horas' | 'dias' | 'semanas'

interface Props {
  procesos: EvolucionProceso[]
  eventos: EvolucionEvento[]
  inicio: string | null
  fin: string | null
}

export default function EvolucionCalendar({ procesos, eventos, inicio, fin }: Props) {
  // ── Calcular rango temporal y modo ──────────────────────────────────────
  // Detectamos el inicio real mirando: prop `inicio`, sino primer fecha_inicio
  // de cualquier proceso, sino timestamp del primer evento.
  const inicioMs = useMemo(() => {
    if (inicio) return new Date(inicio).getTime()
    const procStarts = procesos.map((p) => p.fecha_inicio).filter(Boolean) as string[]
    if (procStarts.length) return Math.min(...procStarts.map((s) => new Date(s).getTime()))
    if (eventos.length) return new Date(eventos[0].timestamp).getTime()
    return Date.now()
  }, [inicio, procesos, eventos])

  const finMs = useMemo(() => {
    if (fin) return new Date(fin).getTime()
    // Si la orden está en curso, "fin" es ahora
    return Date.now()
  }, [fin])

  const duracionMs = Math.max(0, finMs - inicioMs)
  const modo: Modo =
    duracionMs < 8 * 60 * 60 * 1000        ? 'horas'
    : duracionMs < 30 * 24 * 60 * 60 * 1000 ? 'dias'
    :                                          'semanas'

  // ── Estado del drawer para "explorar día específico" ────────────────────
  const [drawerDate, setDrawerDate] = useState<string | null>(null)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <header className="bg-gradient-to-r from-forest-700 to-forest-600 text-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-gold-300" />
            <h3 className="text-sm font-bold">Línea de tiempo</h3>
            <span className="text-xs text-white/70">
              · {modo === 'horas' ? 'Vista por horas' : modo === 'dias' ? 'Vista por días' : 'Vista por semanas'}
            </span>
          </div>
          <div className="text-[11px] text-white/70 tabular-nums">
            Duración: {formatDuracion(duracionMs)}
          </div>
        </div>
      </header>

      <div className="p-3 overflow-x-auto">
        {modo === 'horas' && (
          <GridHoras procesos={procesos} inicioMs={inicioMs} finMs={finMs} />
        )}
        {modo === 'dias' && (
          <GridDias
            procesos={procesos}
            inicioMs={inicioMs}
            finMs={finMs}
            onSelectDay={setDrawerDate}
          />
        )}
        {modo === 'semanas' && (
          <GridSemanas
            procesos={procesos}
            inicioMs={inicioMs}
            finMs={finMs}
            onSelectDay={setDrawerDate}
          />
        )}
      </div>

      {/* Leyenda */}
      <div className="bg-gray-50/60 border-t border-gray-100 px-3 py-2 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-3 text-gray-600">
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-gold-400" /> Activa
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-gray-200" /> Inactiva / no trabajada
          </span>
          {modo !== 'horas' && (
            <span className="inline-flex items-center gap-1 text-blue-700">
              <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300" /> Click día → ver horas
            </span>
          )}
        </div>
        <div className="text-gray-400">
          Total estimado: {sumEstimado(procesos)} · Total real: {sumReal(procesos)}
        </div>
      </div>

      {/* Drawer detalle del día seleccionado */}
      {drawerDate && (
        <DayDetailDrawer
          fecha={drawerDate}
          procesos={procesos}
          eventos={eventos}
          onClose={() => setDrawerDate(null)}
        />
      )}
    </div>
  )
}

// ─── Helpers de tiempo / overlap ─────────────────────────────────────────────

/** % de overlap entre el intervalo de un proceso y una ventana de tiempo */
function overlapMs(procStart: number, procEnd: number, winStart: number, winEnd: number): number {
  const s = Math.max(procStart, winStart)
  const e = Math.min(procEnd, winEnd)
  return Math.max(0, e - s)
}

/** Devuelve los intervalos [start, end] (en ms) de cada proceso, usando NOW si end es null */
function intervalosProcesos(procesos: EvolucionProceso[]): { proc: EvolucionProceso; start: number; end: number }[] {
  const now = Date.now()
  return procesos
    .filter((p) => p.fecha_inicio)
    .map((p) => ({
      proc: p,
      start: new Date(p.fecha_inicio!).getTime(),
      end: p.fecha_fin ? new Date(p.fecha_fin!).getTime() : now,
    }))
}

function formatDuracion(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const min = ms / 60_000
  if (min < 60) return `${Math.round(min)}m`
  const h = min / 60
  if (h < 24) return `${h.toFixed(1)}h`
  const d = h / 24
  return `${d.toFixed(1)}d`
}

function sumEstimado(procesos: EvolucionProceso[]): string {
  const total = procesos.reduce((s, p) => s + (p.tiempo_estimado_minutos ?? 0), 0)
  if (total === 0) return '—'
  return total < 60 ? `${total}m` : `${(total / 60).toFixed(1)}h`
}

function sumReal(procesos: EvolucionProceso[]): string {
  const total = procesos.reduce((s, p) => s + p.tiempo_real_minutos, 0)
  if (total === 0) return '—'
  return total < 60 ? `${total}m` : `${(total / 60).toFixed(1)}h`
}

// ─── Modo HORAS: orden corta (<8h), un día específico, columnas = horas ─────
function GridHoras({ procesos, inicioMs, finMs }: {
  procesos: EvolucionProceso[]
  inicioMs: number
  finMs: number
}) {
  // Ventana: desde la hora del inicio (truncada a hora) hasta hora del fin + 1
  const inicioDate = new Date(inicioMs)
  const inicioHora = inicioDate.getHours()
  const finDate = new Date(finMs)
  let finHora = finDate.getHours()
  if (finDate.getMinutes() > 0 || finMs > inicioMs) finHora++

  // Rango mínimo: 4 horas (para no quedar muy comprimido)
  const horas: number[] = []
  const inicio = Math.max(0, Math.min(inicioHora, 22))
  const fin = Math.min(23, Math.max(finHora, inicio + 4))
  for (let h = inicio; h <= fin; h++) horas.push(h)

  const intervalos = intervalosProcesos(procesos)
  const dayStartMs = new Date(inicioDate.getFullYear(), inicioDate.getMonth(), inicioDate.getDate()).getTime()
  const nowMs = Date.now()

  return (
    <table className="text-[10px] w-full" style={{ minWidth: 540 }}>
      <thead>
        <tr>
          <th className="text-left font-semibold text-gray-500 uppercase tracking-wider pb-2 pr-3 sticky left-0 bg-white" style={{ width: 90 }}>
            Estación
          </th>
          {horas.map((h) => (
            <th key={h} className="text-center text-gray-500 font-mono pb-2 px-0.5" style={{ width: 38 }}>
              {h}:00
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {procesos
          .filter((p) => p.requerido || p.fecha_inicio)
          .sort((a, b) => a.secuencia - b.secuencia)
          .map((p) => {
            const inter = intervalos.find((i) => i.proc.id === p.id)
            return (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="py-1.5 pr-3 sticky left-0 bg-white">
                  <div className="font-medium text-gray-900 capitalize text-[11px]">{p.estacion.replace('_', ' ')}</div>
                  <div className="text-[9px] text-gray-500">
                    {p.tiempo_real_minutos}m / {p.tiempo_estimado_minutos ?? '—'}m
                  </div>
                </td>
                {horas.map((h) => {
                  const winStart = dayStartMs + h * 3_600_000
                  const winEnd = winStart + 3_600_000
                  const ovr = inter ? overlapMs(inter.start, Math.min(inter.end, nowMs), winStart, winEnd) : 0
                  const pct = ovr / 3_600_000  // 0–1
                  // ANY activity > 0 shows. Para micro-actividades (<10 min/hora)
                  // forzamos opacity mínima del 50% para que se vea claramente,
                  // sino se confunden con celdas inactivas.
                  const hasActivity = ovr > 0
                  const minPct = Math.max(0.5, pct)  // floor visual
                  return (
                    <td key={h} className="p-0.5">
                      <div
                        className={clsx(
                          'h-7 rounded transition-colors',
                          hasActivity ? 'bg-gold-400' : 'bg-gray-100',
                        )}
                        style={hasActivity ? { opacity: minPct } : undefined}
                        title={hasActivity ? `${p.estacion}: activa ${Math.round(ovr / 60_000)}m de ${h}:00 a ${h + 1}:00` : undefined}
                      />
                    </td>
                  )
                })}
              </tr>
            )
          })}
      </tbody>
    </table>
  )
}

// ─── Modo DÍAS: orden mediana (1-30 días), columnas = días ──────────────────
function GridDias({ procesos, inicioMs, finMs, onSelectDay }: {
  procesos: EvolucionProceso[]
  inicioMs: number
  finMs: number
  onSelectDay: (fecha: string) => void
}) {
  // Construir lista de días desde inicio (00:00) hasta fin (23:59)
  const dias: number[] = []
  const startDay = startOfDayMs(inicioMs)
  const endDay = startOfDayMs(finMs)
  for (let d = startDay; d <= endDay; d += 86_400_000) dias.push(d)

  // Agrupar por semana ISO para los tags de header
  const intervalos = intervalosProcesos(procesos)
  const nowMs = Date.now()
  const todayStart = startOfDayMs(nowMs)

  return (
    <table className="text-[10px] w-full" style={{ minWidth: Math.max(540, 60 + dias.length * 26) }}>
      <thead>
        <tr>
          <th className="text-left font-semibold text-gray-500 uppercase tracking-wider pb-1 pr-3 sticky left-0 bg-white" style={{ width: 90 }}>
            Estación
          </th>
          {dias.map((d, i) => {
            const dt = new Date(d)
            const dow = ['D', 'L', 'M', 'X', 'J', 'V', 'S'][dt.getDay()]
            const day = dt.getDate()
            const isWeekend = dt.getDay() === 0 || dt.getDay() === 6
            const isToday = d === todayStart
            return (
              <th
                key={d}
                className={clsx(
                  'text-center font-mono pb-1 px-0.5',
                  isToday ? 'text-gold-700 font-bold' : isWeekend ? 'text-gray-400' : 'text-gray-600',
                  i % 7 === 0 && 'border-l border-gray-200'
                )}
                style={{ width: 24 }}
              >
                <div className="text-[8px]">{dow}</div>
                <div className="text-[10px]">{day}</div>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {procesos
          .filter((p) => p.requerido || p.fecha_inicio)
          .sort((a, b) => a.secuencia - b.secuencia)
          .map((p) => {
            const inter = intervalos.find((i) => i.proc.id === p.id)
            return (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="py-1.5 pr-3 sticky left-0 bg-white">
                  <div className="font-medium text-gray-900 capitalize text-[11px]">{p.estacion.replace('_', ' ')}</div>
                  <div className="text-[9px] text-gray-500">
                    {p.tiempo_real_minutos}m / {p.tiempo_estimado_minutos ?? '—'}m
                  </div>
                </td>
                {dias.map((d, i) => {
                  const winEnd = d + 86_400_000
                  const ovr = inter ? overlapMs(inter.start, Math.min(inter.end, nowMs), d, winEnd) : 0
                  const pct = ovr / (8 * 3_600_000)  // % de 8 horas de jornada
                  const isWeekend = (new Date(d).getDay() === 0 || new Date(d).getDay() === 6)
                  const hasActivity = ovr > 0  // ANY activity shows
                  // Floor visual del 50% para que micro-actividades sean claras
                  const minPct = Math.max(0.5, Math.min(1, pct))
                  return (
                    <td key={d} className={clsx('p-0.5', i % 7 === 0 && 'border-l border-gray-200')}>
                      <button
                        onClick={() => onSelectDay(toIsoDate(d))}
                        disabled={!hasActivity}
                        className={clsx(
                          'h-7 w-full rounded transition-colors',
                          hasActivity
                            ? 'bg-gold-400 hover:ring-2 hover:ring-blue-300 cursor-pointer'
                            : isWeekend ? 'bg-gray-50' : 'bg-gray-100'
                        )}
                        style={hasActivity ? { opacity: minPct } : undefined}
                        title={hasActivity ? `${p.estacion}: ${Math.round(ovr / 60_000)}m el ${toIsoDate(d)}` : undefined}
                      />
                    </td>
                  )
                })}
              </tr>
            )
          })}
      </tbody>
    </table>
  )
}

// ─── Modo SEMANAS: orden larga (>30 días), columnas = semanas ───────────────
function GridSemanas({ procesos, inicioMs, finMs, onSelectDay }: {
  procesos: EvolucionProceso[]
  inicioMs: number
  finMs: number
  onSelectDay: (fecha: string) => void
}) {
  // Construir lista de semanas (lunes)
  const semanas: number[] = []
  let cursor = startOfWeekMs(inicioMs)
  const end = startOfWeekMs(finMs)
  while (cursor <= end) {
    semanas.push(cursor)
    cursor += 7 * 86_400_000
  }

  const intervalos = intervalosProcesos(procesos)
  const nowMs = Date.now()

  return (
    <table className="text-[10px] w-full" style={{ minWidth: Math.max(540, 90 + semanas.length * 48) }}>
      <thead>
        <tr>
          <th className="text-left font-semibold text-gray-500 uppercase tracking-wider pb-1 pr-3 sticky left-0 bg-white" style={{ width: 90 }}>
            Estación
          </th>
          {semanas.map((w) => {
            const wd = new Date(w)
            return (
              <th key={w} className="text-center font-mono pb-1 px-0.5 text-gray-600" style={{ width: 44 }}>
                <div className="text-[8px] uppercase tracking-wider">Sem</div>
                <div className="text-[10px]">{wd.getDate()}/{wd.getMonth() + 1}</div>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {procesos
          .filter((p) => p.requerido || p.fecha_inicio)
          .sort((a, b) => a.secuencia - b.secuencia)
          .map((p) => {
            const inter = intervalos.find((i) => i.proc.id === p.id)
            return (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="py-1.5 pr-3 sticky left-0 bg-white">
                  <div className="font-medium text-gray-900 capitalize text-[11px]">{p.estacion.replace('_', ' ')}</div>
                  <div className="text-[9px] text-gray-500">
                    {p.tiempo_real_minutos}m
                  </div>
                </td>
                {semanas.map((w) => {
                  const wEnd = w + 7 * 86_400_000
                  const ovr = inter ? overlapMs(inter.start, Math.min(inter.end, nowMs), w, wEnd) : 0
                  const pct = ovr / (5 * 8 * 3_600_000)  // % de 40 horas semanales
                  const hasActivity = ovr > 0  // ANY activity shows
                  const minPct = Math.max(0.5, Math.min(1, pct))
                  return (
                    <td key={w} className="p-0.5">
                      <button
                        onClick={() => onSelectDay(toIsoDate(w))}
                        disabled={!hasActivity}
                        className={clsx(
                          'h-7 w-full rounded transition-colors',
                          hasActivity
                            ? 'bg-gold-400 hover:ring-2 hover:ring-blue-300 cursor-pointer'
                            : 'bg-gray-100'
                        )}
                        style={hasActivity ? { opacity: minPct } : undefined}
                        title={hasActivity ? `${p.estacion}: ${Math.round(ovr / 60_000)}m la semana de ${toIsoDate(w)}` : undefined}
                      />
                    </td>
                  )
                })}
              </tr>
            )
          })}
      </tbody>
    </table>
  )
}

// ─── Drawer: ver detalle horario de un día específico ───────────────────────
function DayDetailDrawer({
  fecha, procesos, eventos, onClose,
}: { fecha: string; procesos: EvolucionProceso[]; eventos: EvolucionEvento[]; onClose: () => void }) {
  // Eventos del día seleccionado
  const eventosDelDia = useMemo(() => {
    return eventos.filter((e) => e.timestamp.slice(0, 10) === fecha)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }, [eventos, fecha])

  // Procesos activos en ese día (para mini grid)
  const dayStartMs = new Date(fecha + 'T00:00:00').getTime()
  const dayEndMs = dayStartMs + 86_400_000

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
      <div
        className="w-full max-w-lg bg-white shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Detalle del día</h3>
            <p className="text-xs text-gray-500">{new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100" title="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Mini grid por horas del día */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Horas trabajadas</h4>
            <GridHoras procesos={procesos} inicioMs={dayStartMs} finMs={dayEndMs} />
          </div>

          {/* Lista de eventos del día */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Eventos ({eventosDelDia.length})
            </h4>
            {eventosDelDia.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Sin eventos registrados este día.</p>
            ) : (
              <div className="space-y-1.5">
                {eventosDelDia.map((e, i) => (
                  <div key={`${e.timestamp}-${i}`} className="flex items-start gap-2 text-sm">
                    <span className="font-mono text-xs text-gray-500 w-12 shrink-0">
                      {new Date(e.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-gray-700 capitalize">
                      {e.tipo.replace('_', ' ')}
                      {e.detalle.estacion_destino && (
                        <span className="text-gray-500"> → {e.detalle.estacion_destino}</span>
                      )}
                      {e.actor_iniciales && (
                        <span className="ml-2 text-xs text-gray-500">· {e.actor_iniciales}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers de fecha ────────────────────────────────────────────────────────

function startOfDayMs(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function startOfWeekMs(ms: number): number {
  const d = new Date(ms)
  const dow = (d.getDay() + 6) % 7  // Lun=0, Dom=6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow).getTime()
}

function toIsoDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
