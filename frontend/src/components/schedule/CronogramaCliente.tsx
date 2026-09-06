import { useRef, useState } from 'react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { toPng } from 'html-to-image'
import { Download, Loader2 } from 'lucide-react'
import type { PortalGanttTarea } from '@/services/portal'
import type { IngTareaPlan } from '@/services/ingenieria'

// Tareas del Gantt en las que participa el cliente (se resaltan en rojo). Debe coincidir
// con CLIENT_TASK_CLAVES del backend (portal.ts).
const CLIENT_TASK_CLAVES = new Set<string>(['po_execution', 'material_deposit', 'samples', 'client_review', 'approval'])

/** Arma los datos del cronograma del cliente desde el plan de ingeniería (para PM/Estimados). */
export function ganttDesdePlan(tareas: IngTareaPlan[]): PortalGanttTarea[] {
  return tareas
    .filter((t) => (t.early_start ?? t.fecha_inicio) && (t.early_finish ?? t.fecha_fin) && t.estado !== 'na')
    .map((t) => ({
      nombre: t.nombre,
      inicio: t.early_start ?? t.fecha_inicio,
      fin: t.early_finish ?? t.fecha_fin,
      estado: t.estado,
      es_cliente: CLIENT_TASK_CLAVES.has(t.tipo_clave ?? ''),
    }))
}

const MESG = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmt = (d: string | null) => { if (!d) return ''; const [y, m, day] = d.split('-'); return `${day}/${m}/${y.slice(2)}` }
// Formato compacto para el rango de cada tarea (día/mes, sin ceros a la izquierda).
const fmtc = (d: string | null) => { if (!d) return ''; const p = d.split('-'); return `${+p[2]}/${+p[1]}` }

/**
 * El "cronograma del proyecto" (Gantt completo = la propuesta) que ve el cliente:
 * todas las tareas sobre la línea de tiempo, con las del cliente en ROJO + nota de riesgo.
 * Botón "Descargar" captura a PNG (html-to-image) para adjuntar a un email manual.
 * Reusado en: portal del cliente, bandeja de Estimados, plan del PM.
 */
export default function CronogramaCliente({ nombre, fechaObjetivo, gantt }: { nombre: string; fechaObjetivo: string | null; gantt: PortalGanttTarea[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [descargando, setDescargando] = useState(false)

  async function descargar() {
    if (!ref.current) return
    setDescargando(true)
    try {
      const png = await toPng(ref.current, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true, skipFonts: true })
      const a = document.createElement('a')
      a.href = png; a.download = `cronograma-${nombre.replace(/[^\w-]+/g, '_')}.png`
      a.click()
    } catch { toast.error('No se pudo generar la imagen') } finally { setDescargando(false) }
  }

  const day = (d: string) => Math.floor(new Date(d + 'T00:00:00').getTime() / 86400000)
  const fechas = gantt.flatMap((t) => [t.inicio, t.fin]).filter(Boolean) as string[]
  if (fechaObjetivo) fechas.push(fechaObjetivo)
  const dMin = fechas.length ? Math.min(...fechas.map(day)) : 0
  const span = Math.max(1, (fechas.length ? Math.max(...fechas.map(day)) : 1) - dMin)
  const pct = (d: string | null) => (d ? ((day(d) - dMin) / span) * 100 : 0)
  const meses: { label: string; left: number }[] = []
  if (gantt.length) {
    for (let dd = dMin; dd <= dMin + span; dd++) {
      const date = new Date(dd * 86400000); if (date.getUTCDate() > 3) continue
      const label = `${MESG[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(2)}`
      if (!meses.some((m) => m.label === label)) meses.push({ label, left: ((dd - dMin) / span) * 100 })
    }
  }

  if (!gantt.length) return <div className="text-sm text-stone-400 italic py-6 text-center">Sin cronograma para mostrar.</div>

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Cronograma del proyecto</span>
        <button onClick={descargar} disabled={descargando}
          className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-forest-700 hover:text-forest-900 border border-forest-200 rounded-lg px-2.5 py-1">
          {descargando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Descargar
        </button>
      </div>
      <div ref={ref} className="rounded-2xl border border-card-border bg-white p-4" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div className="text-[13px] font-bold text-stone-800 mb-3">{nombre} · cronograma</div>
        <div className="overflow-x-auto"><div className="min-w-[560px]">
          <div className="flex items-stretch border-b border-stone-100 pb-1 mb-1">
            <div className="shrink-0" style={{ width: 184 }} />
            <div className="relative flex-1 h-4">
              {meses.map((m, i) => <div key={i} className="absolute top-0 text-[9px] font-semibold text-stone-400" style={{ left: `${m.left}%` }}>{m.label}</div>)}
            </div>
          </div>
          {gantt.map((t, i) => (
            <div key={i} className="flex items-center gap-2 py-[3px]">
              <div className="shrink-0 min-w-0" style={{ width: 184 }}>
                <div className={clsx('text-[11px] truncate flex items-center gap-1 leading-tight', t.es_cliente ? 'font-bold text-rose-700' : 'text-stone-600')}>
                  {t.es_cliente && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />}
                  {t.nombre}
                </div>
                <div className="text-[9.5px] text-stone-400 tabular-nums leading-tight mt-0.5">{fmtc(t.inicio)} → {fmtc(t.fin)}</div>
              </div>
              <div className="relative flex-1 h-6">
                <div className={clsx('absolute top-1/2 -translate-y-1/2 h-3 rounded', t.es_cliente ? 'bg-rose-500' : t.estado === 'hecha' ? 'bg-emerald-400' : 'bg-forest-400')}
                  style={{ left: `${pct(t.inicio)}%`, width: `${Math.max(1.2, pct(t.fin) - pct(t.inicio))}%` }} />
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3 mt-3 pt-2 border-t border-stone-100 text-[10px] text-stone-500">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> tus pasos</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-forest-400 inline-block" /> producción</span>
            {fechaObjetivo && <span className="ml-auto">Entrega: <b className="text-stone-700">{fmt(fechaObjetivo)}</b></span>}
          </div>
          <div className="mt-2.5 text-[10.5px] text-rose-800 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-2 leading-snug">
            Las tareas marcadas en <b>rojo</b> dependen de vos. El retraso en su cumplimiento pone en riesgo el cumplimiento de la fecha de entrega propuesta para el proyecto.
          </div>
        </div></div>
      </div>
    </div>
  )
}
