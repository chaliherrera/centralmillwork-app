import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Upload, ClipboardCheck, ArrowRight, Loader2, AlertTriangle, FileText } from 'lucide-react'
import { scheduleService, type TrabajoProyecto, type Semaforo } from '@/services/schedule'

// ─────────────────────────────────────────────────────────────────────────────
// "Mi trabajo" — la frontera del schedule filtrada a un área, en TODOS los
// proyectos. Reutilizable por cada escritorio (Ingeniería, Estimados, …).
// Cada hito trae su acción inline (subir planos/CNC o registrar).
// ─────────────────────────────────────────────────────────────────────────────

const ATRIB: Record<string, string> = {
  estimating: 'Estimación', engineering: 'Ingeniería', procurement: 'Compras',
  production: 'Producción', logistics: 'Logística', field: 'Field', finance: 'Finanzas', pm: 'PM',
  cliente: 'Cliente',
}
const SEM_DOT: Record<Semaforo, string> = {
  rojo: 'bg-rose-500', amarillo: 'bg-amber-400', verde: 'bg-emerald-500', gris: 'bg-stone-300',
}
const ACCION: Record<string, { tipo: 'submittal' | 'archivo' | 'registro' | 'pago'; label: string }> = {
  'E-06': { tipo: 'submittal', label: 'Subir planos' },
  'E-08': { tipo: 'submittal', label: 'Subir revisión' },
  'E-11': { tipo: 'archivo', label: 'Subir CNC' },
  'E-09': { tipo: 'registro', label: 'Liberar MTO' },
  'E-10': { tipo: 'registro', label: 'Release a producción' },
  'C-04': { tipo: 'pago', label: 'Registrar pago' },   // down payment
  'X-03': { tipo: 'pago', label: 'Registrar pago' },   // pago final
}
const accionDe = (codigo: string) => ACCION[codigo] ?? { tipo: 'registro' as const, label: 'Registrar' }

export default function MiTrabajo({ area, emptyMsg }: { area: string; emptyMsg?: string }) {
  const [grupos, setGrupos] = useState<TrabajoProyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    setLoading(true); setError(null)
    scheduleService.getMiTrabajo(area)
      .then((r) => setGrupos(r.data ?? []))
      .catch((e: any) => setError(e?.response?.data?.message || 'No se pudo cargar el trabajo'))
      .finally(() => setLoading(false))
  }, [area])
  useEffect(() => { cargar() }, [cargar])

  const total = grupos.reduce((n, g) => n + g.hitos.length, 0)

  if (loading) return (
    <div className="py-10 text-center text-stone-400 text-sm flex items-center justify-center gap-2">
      <Loader2 className="animate-spin" size={16} /> Cargando…
    </div>
  )
  if (error) return <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>
  if (total === 0) return (
    <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-stone-500 text-sm">
      {emptyMsg ?? 'No hay nada pendiente ahora mismo. 🎉'}
    </div>
  )

  return (
    <div className="space-y-4">
      {grupos.map((g) => (
        <div key={g.proyecto_id} className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 bg-[#faf8f2]">
            <div>
              <div className="text-sm font-bold text-stone-900 font-mono tracking-tight">{g.proyecto_codigo}</div>
              <div className="text-[12px] text-stone-500">{g.proyecto_nombre}{g.fecha_objetivo ? ` · entrega ${g.fecha_objetivo}` : ''}</div>
            </div>
            <Link to={`/proyectos/${g.proyecto_id}`} className="text-xs font-semibold text-forest-700 hover:text-forest-800 inline-flex items-center gap-1">
              Ver schedule <ArrowRight size={13} />
            </Link>
          </div>
          <div className="divide-y divide-stone-50">
            {g.hitos.map((h) => (
              <HitoRow key={h.codigo} proyectoId={g.proyecto_id} h={h} onDone={cargar} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function HitoRow({ proyectoId, h, onDone }: {
  proyectoId: number
  h: TrabajoProyecto['hitos'][number]
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pagoOpen, setPagoOpen] = useState(false)
  const [importe, setImporte] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)
  const accion = accionDe(h.codigo)
  const [planosUrl, setPlanosUrl] = useState<string | null>(null)

  // Para los pasos de planos (E-06/E-08): traer el último submittal para poder
  // ver lo ya enviado antes de subir una revisión.
  useEffect(() => {
    if (accion.tipo !== 'submittal') return
    scheduleService.getSubmittals(proyectoId)
      .then((r) => setPlanosUrl(r.data.find((s) => s.url)?.url ?? null))
      .catch(() => {})
  }, [accion.tipo, proyectoId])

  const registrar = async () => {
    setBusy(true); setErr(null)
    try {
      await scheduleService.registrarHito(proyectoId, h.codigo, new Date().toISOString().slice(0, 10))
      onDone()
    } catch (e: any) { setErr(e?.response?.data?.message || 'No se pudo registrar'); setBusy(false) }
  }
  const registrarPago = async () => {
    const monto = Number(importe)
    if (!importe || Number.isNaN(monto) || monto < 0) { setErr('Ingresá un monto válido'); return }
    setBusy(true); setErr(null)
    try {
      await scheduleService.registrarHito(proyectoId, h.codigo, new Date().toISOString().slice(0, 10), undefined, monto)
      onDone()
    } catch (e: any) { setErr(e?.response?.data?.message || 'No se pudo registrar el pago'); setBusy(false) }
  }
  const subir = async (file: File) => {
    setBusy(true); setErr(null)
    try {
      if (accion.tipo === 'submittal') await scheduleService.uploadSubmittal(proyectoId, file)
      else await scheduleService.uploadArchivoHito(proyectoId, h.codigo, file)
      onDone()
    } catch (e: any) { setErr(e?.response?.data?.message || 'No se pudo subir el archivo'); setBusy(false) }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${SEM_DOT[h.semaforo]}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-stone-800">{h.nombre}</div>
        <div className="text-[11px] text-stone-400">
          <span className="font-mono">{h.codigo}</span>
          {h.fecha_planeada ? ` · límite ${h.fecha_planeada}` : ''}
          {h.estado === 'vencido' && h.atribucion_atraso && (
            <span className="text-rose-600 font-medium"> · <AlertTriangle size={10} className="inline -mt-0.5" /> atraso {ATRIB[h.atribucion_atraso] ?? h.atribucion_atraso}</span>
          )}
        </div>
        {err && <div className="text-[11px] text-rose-600 mt-1">{err}</div>}
      </div>
      {h.holgura_dias !== null && (
        <span className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 shrink-0 tabular-nums ${h.holgura_dias < 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {h.holgura_dias < 0 ? '' : '+'}{h.holgura_dias}d
        </span>
      )}
      {planosUrl && (
        <a href={planosUrl} target="_blank" rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-forest-700 hover:text-forest-900">
          <FileText size={12} /> Ver planos
        </a>
      )}
      {accion.tipo === 'pago' ? (
        pagoOpen ? (
          <div className="shrink-0 flex items-center gap-1.5">
            <span className="text-stone-400 text-sm">$</span>
            <input type="number" min="0" step="0.01" autoFocus value={importe}
              onChange={(e) => setImporte(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') registrarPago() }}
              placeholder="Monto"
              className="w-24 rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-forest-300" />
            <button onClick={registrarPago} disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-2">
              {busy ? <Loader2 className="animate-spin" size={13} /> : '✓'}
            </button>
          </div>
        ) : (
          <button onClick={() => setPagoOpen(true)} disabled={busy}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2">
            <ClipboardCheck size={13} /> {accion.label}
          </button>
        )
      ) : accion.tipo === 'registro' ? (
        <button onClick={registrar} disabled={busy}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2">
          {busy ? <Loader2 className="animate-spin" size={13} /> : <ClipboardCheck size={13} />} {accion.label}
        </button>
      ) : (
        <>
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f) }} />
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2">
            {busy ? <Loader2 className="animate-spin" size={13} /> : <Upload size={13} />} {accion.label}
          </button>
        </>
      )}
    </div>
  )
}
