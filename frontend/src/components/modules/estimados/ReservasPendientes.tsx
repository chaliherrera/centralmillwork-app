import { useEffect, useState } from 'react'
import { Lock, Loader2, Check, CalendarRange } from 'lucide-react'
import { ingenieriaService, type ReservaProyecto } from '@/services/ingenieria'

// ─────────────────────────────────────────────────────────────────────────────
// Aceptación del PM — escritorio del PM (paso 3 del flujo de Estimados).
// Estimados envió el proyecto: el PM ACEPTA la fecha comprometida, revisa el
// ingeniero propuesto y confirma la reserva (asigna el ingeniero real).
// ─────────────────────────────────────────────────────────────────────────────

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmt = (iso: string | null) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MES[d.getMonth()]}` }

export default function ReservasPendientes() {
  const [reservas, setReservas] = useState<ReservaProyecto[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const cargar = () => ingenieriaService.reservasPendientes()
    .then((r) => setReservas(r.data))
    .catch(() => {}).finally(() => setLoading(false))
  useEffect(() => { cargar() }, [])

  const confirmar = async (p: ReservaProyecto) => {
    setBusy(p.proyecto_id)
    // Opción B: aceptar genera el plan COMPLETO de ingeniería (el PM ajusta ingenieros
    // y poda tareas después en Plan Ingeniería).
    try {
      await ingenieriaService.confirmarReserva(p.proyecto_id)
      await cargar()
    } catch { /* toast */ } finally { setBusy(null) }
  }

  if (loading) return null
  if (!reservas.length) return null

  return (
    <div className="rounded-2xl border border-forest-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 bg-forest-50/40">
        <Lock size={16} className="text-forest-600" />
        <h2 className="font-bold text-stone-800">Aceptación del PM · reservas tentativas</h2>
        <span className="text-xs text-stone-400">al aceptar se genera el plan completo de ingeniería</span>
      </div>
      <div className="divide-y divide-stone-100">
        {reservas.map((p) => (
          <div key={p.proyecto_id} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-[12px] font-bold text-forest-700">{p.proyecto_codigo}</span>
              <span className="text-sm text-stone-600">{p.proyecto_nombre}</span>
              {p.fecha_objetivo && <span className="text-xs text-stone-400 inline-flex items-center gap-1"><CalendarRange size={12} /> entrega {fmt(p.fecha_objetivo)}</span>}
              <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">tentativa</span>
            </div>
            <div className="space-y-1.5">
              {p.tareas.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex-1 min-w-[160px] text-stone-700">{t.nombre.replace(' (reserva)', '')}</span>
                  <span className="text-xs text-stone-400 tabular-nums">{fmt(t.fecha_inicio)} → {fmt(t.fecha_fin)}</span>
                  <span className="text-[11px] text-stone-400">propuesto:</span>
                  <span className="text-xs font-medium text-stone-700">{t.asignado_nombre || 'sin asignar'}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3 justify-between">
              <span className="text-[11px] text-stone-400">Al aceptar se genera el plan completo (todas las tareas). Ajustá ingenieros y podá lo que no aplique en <b>Plan Ingeniería</b>.</span>
              <button onClick={() => confirmar(p)} disabled={busy === p.proyecto_id}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-semibold px-3.5 py-2">
                {busy === p.proyecto_id ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} Aceptar → generar plan
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
