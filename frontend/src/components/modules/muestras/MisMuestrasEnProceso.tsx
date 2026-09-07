import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FlaskConical, ArrowRight } from 'lucide-react'
import { muestrasService } from '@/services/muestras'

// Aviso para el escritorio del INGENIERO: sus muestras (owner) que están en proceso.
// Es informativo — el ingeniero monitorea sin depender de emails. En ENVIADA además
// le toca registrar la respuesta del cliente (aprobar/rechazar). Se oculta si no hay.
const ESTADO: Record<string, { label: string; cls: string; hint?: string }> = {
  EN_FABRICACION: { label: 'En fabricación',        cls: 'bg-amber-100 text-amber-700' },
  EN_QC:          { label: 'En control de calidad', cls: 'bg-purple-100 text-purple-700' },
  ENVIADA:        { label: 'Enviada al cliente',     cls: 'bg-blue-100 text-blue-700', hint: 'registrá su respuesta' },
}

export default function MisMuestrasEnProceso() {
  const { data } = useQuery({
    queryKey: ['mis-muestras-en-proceso'],
    queryFn: () => muestrasService.miasEnProceso(),
    refetchInterval: 20_000,
    refetchOnMount: 'always',
    staleTime: 0,
  })
  const muestras = data ?? []
  if (!muestras.length) return null
  return (
    <div className="rounded-2xl border border-forest-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 bg-forest-50/40">
        <FlaskConical size={16} className="text-forest-600" />
        <h2 className="font-bold text-stone-800">Tus muestras en proceso</h2>
        <span className="text-xs text-stone-400 hidden sm:inline">Seguí su avance; al llegar al cliente registrás su respuesta</span>
        <span className="ml-auto text-[11px] font-bold rounded-full bg-forest-100 text-forest-700 px-2 py-0.5">{muestras.length}</span>
      </div>
      <div className="divide-y divide-stone-100">
        {muestras.map((m) => {
          const e = ESTADO[m.estado] ?? { label: m.estado, cls: 'bg-stone-100 text-stone-600' }
          return (
            <Link key={m.id} to={`/muestras?open=${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-forest-50/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[12px] font-bold text-forest-700">{m.codigo}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 ${e.cls}`}>{e.label}</span>
                  {e.hint && <span className="text-[11px] text-blue-700 font-semibold">· {e.hint}</span>}
                  {m.proyecto_codigo && <span className="text-xs text-stone-400">· {m.proyecto_codigo}</span>}
                </div>
                <div className="text-sm text-stone-600 truncate">{m.descripcion}</div>
              </div>
              <ArrowRight size={15} className="text-stone-400 shrink-0" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
