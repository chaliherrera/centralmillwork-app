import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Loader2, Cpu } from 'lucide-react'
import toast from 'react-hot-toast'
import { ingenieriaService, type Ingeniero } from '@/services/ingenieria'

// ─────────────────────────────────────────────────────────────────────────────
// Gestión de ingenieros (recurso del PM). ing_ingenieros es la FUENTE DE VERDAD de
// quién está activo: la factibilidad y el generador solo proponen a los `activo`.
// Desactivar a alguien (ej. deja la empresa) lo saca de las propuestas SIN borrar
// su historial. hace_cnc = quién puede generar sus propios CNC.
// ─────────────────────────────────────────────────────────────────────────────

function Switch({ on, onClick, disabled, tono = 'forest' }: { on: boolean; onClick: () => void; disabled?: boolean; tono?: 'forest' | 'sky' }) {
  const onColor = tono === 'sky' ? 'bg-sky-500' : 'bg-forest-600'
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${on ? onColor : 'bg-stone-300'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function GestionIngenieros() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['ingenieros'],
    queryFn: () => ingenieriaService.getIngenieros().then((r) => r.data ?? []),
  })
  const upd = useMutation({
    mutationFn: ({ nombre, campos }: { nombre: string; campos: { activo?: boolean; hace_cnc?: boolean } }) =>
      ingenieriaService.updateIngeniero(nombre, campos),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ingenieros'] }),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo actualizar'),
  })

  const ingenieros = data ?? []
  const activos = ingenieros.filter((i) => i.activo).length

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100">
        <h2 className="font-bold text-stone-800 flex items-center gap-2"><Users size={17} /> Ingenieros</h2>
        <p className="text-xs text-stone-400">{activos} activo{activos === 1 ? '' : 's'} de {ingenieros.length}. Solo los activos entran en la factibilidad y las propuestas. Desactivar no borra el historial.</p>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-stone-400"><Loader2 className="animate-spin inline" size={20} /></div>
      ) : ingenieros.length === 0 ? (
        <div className="py-12 text-center text-stone-400 text-sm">No hay ingenieros cargados todavía.</div>
      ) : (
        <div className="divide-y divide-stone-100">
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 text-[11px] uppercase tracking-wide text-stone-400 font-semibold">
            <span>Ingeniero</span><span className="text-center">Activo</span><span className="text-center whitespace-nowrap">Hace CNC</span>
          </div>
          {ingenieros.map((i: Ingeniero) => (
            <div key={i.nombre} className={`grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2.5 items-center ${!i.activo ? 'opacity-60' : ''}`}>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-stone-800 truncate">{i.nombre}</div>
                <div className="text-[11px] text-stone-400">
                  {i.tareas_activas > 0 ? `${i.tareas_activas} tarea${i.tareas_activas === 1 ? '' : 's'} abierta${i.tareas_activas === 1 ? '' : 's'}` : 'sin tareas abiertas'}
                  {!i.activo && ' · inactivo'}
                </div>
              </div>
              <div className="flex flex-col items-center gap-0.5 w-16">
                <Switch on={i.activo} disabled={upd.isPending}
                  onClick={() => {
                    if (i.activo && i.tareas_activas > 0 && !confirm(`${i.nombre} tiene ${i.tareas_activas} tarea(s) abierta(s). Al desactivarlo no se le proponen proyectos nuevos, pero sus tareas actuales quedan. ¿Desactivar?`)) return
                    upd.mutate({ nombre: i.nombre, campos: { activo: !i.activo } })
                  }} />
              </div>
              <div className="flex flex-col items-center gap-0.5 w-16">
                <Switch on={i.hace_cnc} tono="sky" disabled={upd.isPending || !i.activo}
                  onClick={() => upd.mutate({ nombre: i.nombre, campos: { hace_cnc: !i.hace_cnc } })} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="px-4 py-2.5 border-t border-stone-100 flex items-center gap-1.5 text-[11px] text-stone-400">
        <Cpu size={12} className="text-sky-500" /> Hace CNC = puede generar sus propios archivos de CNC (con PYTHA). El resto se rutea a quien sí.
      </div>
    </div>
  )
}
