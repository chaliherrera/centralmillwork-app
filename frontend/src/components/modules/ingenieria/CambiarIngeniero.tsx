import { useState } from 'react'
import { UserCog, X, Loader2, ArrowRight, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { ingenieriaService, type ReasignarPreview } from '@/services/ingenieria'

const MES_D = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtDia(iso: string | null): string {
  if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MES_D[d.getMonth()]}`
}

// Cambiar el ingeniero propuesto del proyecto: elegir otro → preview (cómo queda la fecha
// con su disponibilidad, respetando la entrega fija) → confirmar → reasigna TODAS las
// tareas de ingeniería + recalcula. Reusado en la bandeja del PM (revisión del plan) y en
// la vista "Por proyecto". `ingenieros` es opcional: si no viene, trae los activos.
export default function CambiarIngeniero({ proyectoExt, propuesto, ingenieros, onDone, label = 'Cambiar ingeniero propuesto' }: {
  proyectoExt: string; propuesto?: string; ingenieros?: string[]; onDone: () => void; label?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [lista, setLista] = useState<string[]>(ingenieros ?? [])
  const [sel, setSel] = useState('')
  const [prev, setPrev] = useState<ReasignarPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const cerrar = () => { setAbierto(false); setSel(''); setPrev(null); setBusy(false) }
  const opciones = lista.filter((n) => n !== propuesto)

  const abrir = async () => {
    setAbierto(true)
    if (!ingenieros || !ingenieros.length) {
      try { const r = await ingenieriaService.getIngenieros(); setLista((r.data ?? []).filter((i) => i.activo).map((i) => i.nombre)) }
      catch { /* si falla, queda lo que vino por props (o vacío) */ }
    }
  }
  const pedirPreview = async (nombre: string) => {
    setSel(nombre); setPrev(null); if (!nombre) return
    setBusy(true)
    try { const r = await ingenieriaService.reasignarIngeniero(proyectoExt, nombre, true); setPrev(r.data) }
    catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo calcular') }
    finally { setBusy(false) }
  }
  const confirmar = async () => {
    if (!sel) return
    setBusy(true)
    try {
      await ingenieriaService.reasignarIngeniero(proyectoExt, sel, false)
      toast.success(`Ingeniero cambiado a ${sel}`)
      cerrar(); onDone()
    } catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo aplicar'); setBusy(false) }
  }

  if (!abierto) return (
    <button onClick={abrir}
      className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 hover:bg-stone-50 text-stone-700 text-[12.5px] font-semibold px-3 py-1.5">
      <UserCog size={14} /> {label}
    </button>
  )
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => !busy && cerrar()}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <UserCog size={18} className="text-forest-600" />
          <h3 className="font-semibold text-stone-800">Cambiar ingeniero propuesto</h3>
          <button onClick={cerrar} className="ml-auto text-stone-400 hover:text-stone-700"><X size={18} /></button>
        </div>
        <p className="text-[12.5px] text-stone-500 mb-3">
          Reasigna <b>todas</b> las tareas de ingeniería al nuevo y recalcula el plan según cuándo se libera.
          Actual: <b className="text-stone-700">{propuesto ?? '—'}</b>.
        </p>
        <select value={sel} onChange={(e) => pedirPreview(e.target.value)}
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800">
          <option value="">Elegí el nuevo ingeniero…</option>
          {opciones.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>

        {busy && !prev && <div className="text-center py-4 text-stone-400"><Loader2 className="animate-spin inline" size={18} /></div>}

        {prev && (
          <div className="mt-3 space-y-2">
            <div className={`rounded-xl border px-3 py-2.5 ${prev.entra ? 'border-emerald-200 bg-emerald-50/60' : 'border-rose-200 bg-rose-50/60'}`}>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-stone-500">Entrega interna:</span>
                <b className="text-stone-700">{fmtDia(prev.fin_actual)}</b>
                <ArrowRight size={14} className="text-stone-400" />
                <b className={prev.entra ? 'text-emerald-700' : 'text-rose-700'}>{fmtDia(prev.fin_nuevo)}</b>
              </div>
              <div className="text-[12px] text-stone-500 mt-1">
                {prev.ingeniero_nuevo} se libera el <b className="text-stone-700">{fmtDia(prev.disponible_desde)}</b> ·
                {' '}{prev.n_tareas} tarea{prev.n_tareas === 1 ? '' : 's'} de ingeniería se reasignan
              </div>
              <div className={`text-[12px] mt-1 font-semibold ${prev.entra ? 'text-emerald-700' : 'text-rose-700'}`}>
                {prev.entra
                  ? `Entra: quedan ${prev.holgura_dias} días de holgura hasta la entrega (${fmtDia(prev.entrega)}).`
                  : `⚠ No entra: se pasa ${Math.abs(prev.holgura_dias)} días de la entrega (${fmtDia(prev.entrega)}).`}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={cerrar} disabled={busy} className="px-3 py-2 text-sm font-medium text-stone-500 hover:text-stone-800">Cancelar</button>
              <button onClick={confirmar} disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-semibold">
                {busy ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} Confirmar cambio
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
