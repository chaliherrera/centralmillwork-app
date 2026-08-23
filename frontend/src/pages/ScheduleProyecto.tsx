import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Route, Loader2 } from 'lucide-react'
import ScheduleTab from '@/components/modules/schedule/ScheduleTab'
import { proyectosService } from '@/services/proyectos'
import type { Proyecto } from '@/types'

// Detalle del schedule de un proyecto — el journey map completo (reusa ScheduleTab),
// con su propio header y vuelta al índice. Accesible desde el nav "Schedule".
export default function ScheduleProyecto() {
  const { id } = useParams()
  const proyectoId = Number(id)
  const [proyecto, setProyecto] = useState<Proyecto | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!proyectoId) return
    proyectosService.getById(proyectoId)
      .then((r) => setProyecto(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [proyectoId])

  return (
    <div className="max-w-5xl mx-auto py-6 px-1">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link to="/schedule" className="w-9 h-9 rounded-xl border border-stone-200 bg-white flex items-center justify-center text-stone-500 hover:text-forest-700 hover:border-forest-200 transition-colors shrink-0">
          <ArrowLeft size={18} />
        </Link>
        <div className="w-10 h-10 rounded-2xl bg-forest-50 flex items-center justify-center shrink-0">
          <Route className="text-forest-600" size={20} />
        </div>
        <div className="min-w-0">
          {loading ? (
            <div className="h-5 w-40 bg-stone-100 rounded animate-pulse" />
          ) : proyecto ? (
            <>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] font-bold text-forest-700">{proyecto.codigo}</span>
                <span className="text-xs text-stone-400">Schedule</span>
              </div>
              <h1 className="text-lg font-bold text-stone-900 truncate">{proyecto.nombre}</h1>
            </>
          ) : (
            <h1 className="text-lg font-bold text-stone-900">Proyecto #{proyectoId}</h1>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-stone-400"><Loader2 className="animate-spin inline" size={24} /></div>
      ) : (
        <ScheduleTab proyectoId={proyectoId} />
      )}
    </div>
  )
}
