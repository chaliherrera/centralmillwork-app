import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FlaskConical, ArrowRight } from 'lucide-react'
import { muestrasService } from '@/services/muestras'

// Aviso para el escritorio de Compras: muestras SOLICITADAS que todavía esperan la
// decisión de compras (sin OC vinculada y sin marcar "sin compras"). Se oculta si no
// hay ninguna. Cada fila linkea al detalle de la muestra (?open=<id>) para actuar.
export default function MuestrasEsperandoCompras() {
  const { data } = useQuery({
    queryKey: ['muestras-esperando-compras'],
    queryFn: () => muestrasService.esperandoCompras(),
    refetchInterval: 20_000,
    refetchOnMount: 'always',
    staleTime: 0,
  })
  const muestras = data ?? []
  if (!muestras.length) return null
  return (
    <div className="rounded-2xl border border-amber-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 bg-amber-50/50">
        <FlaskConical size={16} className="text-amber-600" />
        <h2 className="font-bold text-stone-800">Muestras esperando compras</h2>
        <span className="text-xs text-stone-400 hidden sm:inline">Definí si requieren OC o marcalas “sin compras”</span>
        <span className="ml-auto text-[11px] font-bold rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">{muestras.length}</span>
      </div>
      <div className="divide-y divide-stone-100">
        {muestras.map((m) => (
          <Link key={m.id} to={`/muestras?open=${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-amber-50/40">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[12px] font-bold text-forest-700">{m.codigo}</span>
                {m.prioridad === 'ALTA' && <span className="text-[9px] font-bold uppercase rounded px-1 bg-rose-100 text-rose-700">alta</span>}
                {m.proyecto_codigo && <span className="text-xs text-stone-400">· {m.proyecto_codigo}</span>}
              </div>
              <div className="text-sm text-stone-600 truncate">{m.descripcion}</div>
            </div>
            <ArrowRight size={15} className="text-stone-400 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}
