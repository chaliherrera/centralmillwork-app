// ── Panel de detalle de instalación (#15): solo lectura para el PM ──
// Lee el avance ítem×ítem + punch list del módulo de campo (el instalador lo captura
// en el móvil). No edita nada: el dueño del dato sigue siendo Instalación.
// Extraído de IngenieriaPlan para poder reusarlo también en el Cronograma PM.
import { Wrench, X, Check, Loader2 } from 'lucide-react'
import type { InstalacionDetalle } from '@/services/ingenieria'

const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const d = (iso: string) => new Date(iso + 'T00:00:00')
const fmtD = (iso: string | null) => (iso ? `${d(iso).getDate()} ${MES[d(iso).getMonth()]}` : '—')
const shortProj = (p: string | null) => (p || '—').replace(/^\s*(\d{2}-\d{3})\s*/, '$1 · ')

export default function InstalacionPanel({ det, busy, proyecto, onClose }: { det: InstalacionDetalle | null; busy: boolean; proyecto: string; onClose: () => void }) {
  const items = det?.items ?? []
  const punch = det?.punch ?? []
  const inst = items.filter((i) => i.instalado).length
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-stone-100">
          <Wrench size={18} className="text-sky-600" />
          <div>
            <div className="font-bold text-stone-800 text-sm">Instalación · {shortProj(proyecto)}</div>
            <div className="text-[11px] text-stone-400">Avance del módulo de campo (solo lectura)</div>
          </div>
          <button onClick={onClose} className="ml-auto text-stone-400 hover:text-stone-700"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {busy ? <div className="py-14 text-center text-stone-400"><Loader2 className="animate-spin inline" size={22} /></div> : (
          <>
            {/* Muebles a instalar */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wide text-stone-500">Muebles</span>
                <span className="text-[11px] text-stone-400">{inst} de {items.length} instalados</span>
              </div>
              {items.length === 0 ? <div className="text-sm text-stone-400 italic">Todavía no hay muebles en producción.</div> : (
                <div className="space-y-1.5">
                  {items.map((it) => (
                    <div key={it.op_id} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${it.instalado ? 'border-emerald-200 bg-emerald-50/60' : 'border-stone-200 bg-white'}`}>
                      {it.instalado
                        ? <Check size={16} className="shrink-0 text-emerald-600" />
                        : <span className="shrink-0 w-4 h-4 rounded-full border-2 border-stone-300 inline-block" />}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-stone-800 truncate">{it.numero_orden} · ítem {it.numero_item}</div>
                        <div className="text-[11px] text-stone-400">
                          {it.instalado ? `Instalado ${fmtD(it.instalado_at)}` : it.op_status}
                          {it.nota ? ` · ${it.nota}` : ''}
                        </div>
                      </div>
                      {it.foto_url && <a href={it.foto_url} target="_blank" rel="noreferrer" className="ml-auto shrink-0"><img src={it.foto_url} alt="foto" className="w-11 h-11 rounded object-cover border border-stone-200" /></a>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Punch list */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wide text-stone-500">Punch list</span>
                {punch.length > 0 && <span className="text-[11px] text-stone-400">{punch.filter((p) => p.estado !== 'resuelto').length} abierto(s) · {punch.length} total</span>}
              </div>
              {punch.length === 0 ? <div className="text-sm text-stone-400 italic">Sin pendientes.</div> : (
                <div className="space-y-1.5">
                  {punch.map((p) => {
                    const resuelto = p.estado === 'resuelto'
                    return (
                      <div key={p.id} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${resuelto ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
                        <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${resuelto ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>{resuelto ? 'resuelto' : 'abierto'}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-stone-800 truncate">{p.descripcion}</div>
                          <div className="text-[11px] text-stone-400">{p.area ? `${p.area} · ` : ''}{fmtD(p.created_at)}</div>
                        </div>
                        <div className="ml-auto shrink-0 flex gap-1">
                          {p.foto_problema_url && <a href={p.foto_problema_url} target="_blank" rel="noreferrer"><img src={p.foto_problema_url} alt="problema" className="w-11 h-11 rounded object-cover border border-stone-200" /></a>}
                          {p.foto_resuelto_url && <a href={p.foto_resuelto_url} target="_blank" rel="noreferrer"><img src={p.foto_resuelto_url} alt="resuelto" className="w-11 h-11 rounded object-cover border border-emerald-300" /></a>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
          )}
        </div>
      </div>
    </div>
  )
}
