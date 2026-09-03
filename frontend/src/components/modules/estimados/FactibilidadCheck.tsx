import { useState } from 'react'
import { CalendarClock, Loader2, CheckCircle2, XCircle, AlertTriangle, ArrowRight, User } from 'lucide-react'
import { scheduleService, type FactibilidadResult } from '@/services/schedule'

// ─────────────────────────────────────────────────────────────────────────────
// Chequeo de factibilidad — Estimados ingresa una fecha y el sistema responde si
// se puede cumplir, o la fecha real más temprana + el cuello de botella.
// READ-ONLY (dry-run): no crea ni reserva nada. Provisional hasta calibrar duraciones.
// ─────────────────────────────────────────────────────────────────────────────

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmt = (iso: string | null) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}` }

export default function FactibilidadCheck({ onResult, fechaInicial, proyectoId }: { onResult?: (fecha: string, r: FactibilidadResult) => void; fechaInicial?: string; proyectoId?: number }) {
  const [fecha, setFecha] = useState(fechaInicial ?? '')
  const [busy, setBusy] = useState(false)
  const [r, setR] = useState<FactibilidadResult | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const verificar = async () => {
    if (!fecha) return
    setBusy(true); setErr(null); setR(null)
    try {
      const res = (await scheduleService.getFactibilidad(fecha, proyectoId)).data
      setR(res)
      onResult?.(fecha, res)
    } catch (e: any) { setErr(e?.response?.data?.message || 'No se pudo verificar') } finally { setBusy(false) }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
        <CalendarClock size={17} className="text-forest-600" />
        <h3 className="font-bold text-stone-800">Chequeo de factibilidad</h3>
        <span className="text-xs text-stone-400">¿podemos entregar para la fecha que pide el cliente?</span>
      </div>

      <div className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold">Fecha de entrega solicitada</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="mt-1 block rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-forest-300" />
          </div>
          <button onClick={verificar} disabled={busy || !fecha}
            className="inline-flex items-center gap-2 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2">
            {busy ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />} Verificar
          </button>
        </div>
        {err && <div className="mt-3 text-sm text-rose-600">{err}</div>}

        {r && (
          <div className="mt-4 space-y-3">
            {/* veredicto simple */}
            {r.factible ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3">
                <CheckCircle2 size={26} className="text-emerald-600 shrink-0" />
                <div className="font-bold text-emerald-800">Factible para el {fmt(r.fecha_pedida)}</div>
              </div>
            ) : (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <XCircle size={26} className="text-rose-600 shrink-0" />
                  <div>
                    <div className="font-bold text-rose-800">No factible para el {fmt(r.fecha_pedida)}</div>
                    <div className="text-xs text-rose-700/90 mt-0.5">
                      {r.motivo === 'cadena'
                        ? 'La cadena de tareas no entra en ese plazo, ni con un ingeniero libre hoy.'
                        : r.motivo === 'sin_ingenieros'
                          ? 'No hay ingenieros activos para asignar.'
                          : 'Los ingenieros están ocupados — el que se libera antes no llega a esa fecha.'}
                    </div>
                  </div>
                </div>
                <div className="ml-auto text-center bg-white rounded-lg border border-emerald-300 px-5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold">Fecha factible</div>
                  <div className="text-lg font-bold text-stone-900">{fmt(r.fecha_real_mas_temprana)}</div>
                </div>
              </div>
            )}

            {/* Ingeniero propuesto (un ingeniero por proyecto): el que se libera antes */}
            {r.ingeniero_propuesto && (
              <div className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5">
                <User size={16} className="text-forest-600 shrink-0" />
                <span className="text-sm text-stone-700">Ingeniero propuesto:</span>
                <span className="text-sm font-bold text-stone-900">{r.ingeniero_propuesto}</span>
                <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-forest-100 text-forest-700">
                  se libera el {fmt(r.disponible_desde)}
                </span>
              </div>
            )}

            {/* Ranking: quién se libera antes (la cola de cada ingeniero) */}
            {r.ranking.length > 0 && (
              <div className="rounded-xl border border-stone-200 overflow-hidden">
                <div className="px-3 py-2 bg-stone-50 border-b border-stone-100 text-[11px] uppercase tracking-wide text-stone-400 font-semibold">
                  Ingenieros — quién se libera antes
                </div>
                <div className="divide-y divide-stone-100">
                  {r.ranking.map((e, i) => (
                    <div key={e.nombre} className={`flex items-center gap-3 px-3 py-1.5 ${i === 0 ? 'bg-forest-50/40' : ''}`}>
                      <span className="text-sm text-stone-800 flex-1 truncate">{e.nombre}{i === 0 ? ' · propuesto' : ''}</span>
                      <span className="text-xs text-stone-500 w-28 text-right">se libera {fmt(e.disponible_desde)}</span>
                      <span className="text-[11px] text-stone-400 w-20 text-right">{e.n_pendientes} pend.</span>
                      <span className={`text-[11px] font-semibold w-16 text-center rounded-full px-1.5 py-0.5 ${e.entra ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {e.entra ? 'entra' : 'no entra'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 text-[11px] text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-600" />
              <span>Propuesta del sistema (un ingeniero por proyecto, una tarea a la vez). El PM ve el plan completo y ajusta fechas y duraciones antes de proponerlo.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
