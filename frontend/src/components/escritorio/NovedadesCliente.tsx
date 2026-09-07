import { useQuery } from '@tanstack/react-query'
import { Handshake, Check, MessageSquareWarning, X } from 'lucide-react'
import { ingenieriaService, type NovedadCliente } from '@/services/ingenieria'

// Aviso para el escritorio del INGENIERO (y PM/admin): lo que el cliente decidió en el
// PORTAL — planos/plan/muestras aprobados o rechazados (#8). Es informativo: el ingeniero
// coteja por teléfono/email y gana la última decisión. Se oculta si no hay novedades.

// Qué se decidió, por código de hito del portal.
const QUE: Record<string, string> = {
  PLAN: 'Aprobación del plan', 'E-07': 'Shop drawings', 'E-05': 'Muestras', 'I-07': 'Sign-off final',
}
const DECISION: Record<string, { label: string; cls: string; icon: typeof Check }> = {
  aprobado:        { label: 'Aprobó',          cls: 'bg-emerald-100 text-emerald-700', icon: Check },
  con_comentarios: { label: 'Aprobó c/coment.', cls: 'bg-amber-100 text-amber-700',    icon: MessageSquareWarning },
  rechazado:       { label: 'Rechazó',          cls: 'bg-rose-100 text-rose-700',       icon: X },
}

function fechaCorta(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short' }) + ' ' +
         d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

export default function NovedadesCliente() {
  const { data } = useQuery({
    queryKey: ['novedades-cliente'],
    queryFn: () => ingenieriaService.novedadesCliente(),
    refetchInterval: 20_000,
    refetchOnMount: 'always',
    staleTime: 0,
  })
  const novedades: NovedadCliente[] = data?.data ?? []
  if (!novedades.length) return null
  return (
    <div className="rounded-2xl border border-blue-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 bg-blue-50/50">
        <Handshake size={16} className="text-blue-700" />
        <h2 className="font-bold text-stone-800">Novedades del cliente</h2>
        <span className="text-xs text-stone-400 hidden sm:inline">lo que decidió en el portal — cotejá y registrá</span>
        <span className="ml-auto text-[11px] font-bold rounded-full bg-blue-100 text-blue-700 px-2 py-0.5">{novedades.length}</span>
      </div>
      <div className="divide-y divide-stone-100">
        {novedades.map((n) => {
          const d = n.decision ? DECISION[n.decision] : null
          const Icon = d?.icon ?? Handshake
          const que = (n.hito_codigo && QUE[n.hito_codigo]) || n.descripcion || 'Decisión'
          return (
            <div key={n.id} className="flex items-start gap-3 px-4 py-3">
              <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 ${d?.cls ?? 'bg-stone-100 text-stone-600'}`}>
                <Icon size={11} /> {d?.label ?? '—'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-stone-800">{que}</span>
                  {n.proyecto_ext && <span className="font-mono text-[11px] text-blue-700">· {n.proyecto_ext}</span>}
                  {n.proyecto_nombre && <span className="text-xs text-stone-400 truncate">· {n.proyecto_nombre}</span>}
                </div>
                {n.comentario && <div className="text-[13px] text-stone-600 mt-0.5">"{n.comentario}"</div>}
                <div className="text-[11px] text-stone-400 mt-0.5">
                  {n.contacto ? `${n.contacto} · ` : ''}{fechaCorta(n.created_at)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
