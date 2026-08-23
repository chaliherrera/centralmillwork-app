import { useEffect, useMemo, useState } from 'react'
import { ingenieriaService, type IngCarga } from '@/services/ingenieria'

// ─────────────────────────────────────────────────────────────────────────────
// Mapa de carga de Ingeniería — compacto. Rejilla ingeniero × semana: pintado =
// ocupado, claro = libre. Marca "hoy" y (opcional) la fecha de entrega evaluada.
// Se usa en el chequeo de factibilidad para ver POR QUÉ una fecha no entra.
// ─────────────────────────────────────────────────────────────────────────────

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export default function MapaCargaIngenieria({ marcarFecha }: { marcarFecha?: string }) {
  const [carga, setCarga] = useState<IngCarga | null>(null)
  useEffect(() => { ingenieriaService.getCarga().then((r) => setCarga(r.data)).catch(() => {}) }, [])

  const g = useMemo(() => {
    if (!carga || !carga.semanas.length) return null
    const semanas = carga.semanas
    const n = semanas.length
    const pos = (iso: string) => {
      const t = new Date(iso + 'T00:00:00').getTime()
      const t0 = new Date(semanas[0] + 'T00:00:00').getTime()
      const t1 = new Date(semanas[n - 1] + 'T00:00:00').getTime() + 7 * 86400000
      if (t < t0 || t > t1) return null
      return ((t - t0) / (t1 - t0)) * 100
    }
    const months: { label: string; startPct: number }[] = []
    semanas.forEach((w, i) => {
      const d = new Date(w + 'T00:00:00'); const label = `${MES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
      const last = months[months.length - 1]; if (!last || last.label !== label) months.push({ label, startPct: (i / n) * 100 })
    })
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const hoyPct = pos(hoy.toISOString().slice(0, 10))
    const marcaPct = marcarFecha ? pos(marcarFecha) : null
    return { semanas, n, months, hoyPct, marcaPct }
  }, [carga, marcarFecha])

  if (!carga || !g) return <div className="text-xs text-stone-400 py-3 text-center">Cargando carga de Ingeniería…</div>

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-stone-400 font-semibold mb-1.5">Carga de Ingeniería</div>
      <div className="overflow-x-auto"><div className="min-w-[520px]">
        {/* meses + marcadores */}
        <div className="flex items-stretch">
          <div className="w-28 shrink-0" />
          <div className="relative flex-1 h-4">
            {g.months.map((m, i) => <div key={i} className="absolute top-0 text-[9.5px] font-semibold text-forest-700" style={{ left: `${m.startPct}%` }}>{m.label}</div>)}
          </div>
        </div>
        {carga.ingenieros.map((e) => (
          <div key={e.nombre} className="flex items-center">
            <div className="w-28 shrink-0 pr-2 text-[11px] font-semibold text-stone-600 truncate">{e.nombre}</div>
            <div className="relative flex-1 flex gap-px py-0.5">
              {e.cargas.map((c, i) => (
                <div key={i} title={`${e.nombre} · semana ${i + 1}: ${c > 0 ? 'ocupado' : 'libre'}`}
                  className="flex-1 h-3.5 rounded-sm" style={{ background: c > 0 ? '#3b5137' : '#f0efec' }} />
              ))}
              {g.hoyPct !== null && <div className="absolute top-0 bottom-0 w-0.5 bg-rose-400" style={{ left: `${g.hoyPct}%` }} />}
              {g.marcaPct !== null && <div className="absolute -top-0.5 bottom-0 w-0.5 bg-forest-600" style={{ left: `${g.marcaPct}%` }} />}
            </div>
          </div>
        ))}
      </div></div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[10.5px] text-stone-500 items-center pl-28">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#3b5137' }} /> ocupado</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#f0efec' }} /> libre</span>
        <span className="inline-flex items-center gap-1"><span className="w-0.5 h-3 inline-block bg-rose-400" /> hoy</span>
        {marcarFecha && <span className="inline-flex items-center gap-1"><span className="w-0.5 h-3 inline-block bg-forest-600" /> entrega evaluada</span>}
      </div>
    </div>
  )
}
