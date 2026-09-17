import { useEffect, useMemo, useState } from 'react'
import { MonitorSmartphone, Share2, Info } from 'lucide-react'
import { proyectosService } from '@/services/proyectos'
import type { Proyecto } from '@/types'
import ClientPortal from './portal/ClientPortal'

// Consola de control del portal del cliente: previsualizar lo que ve el cliente
// en CUALQUIER proyecto (verificar look & feel + los pasos del journey), sin
// generar un link. La gestión de links (generar/revocar) vive en el Schedule del
// proyecto ("Compartir con cliente").
export default function PortalConsole() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')

  useEffect(() => {
    proyectosService.getAll({ limit: 200 } as any)
      .then((r) => setProyectos(r.data ?? []))
      .catch(() => { /* toast global */ })
  }, [])

  const sel = useMemo(() => proyectos.find((p) => p.id === selId) ?? null, [proyectos, selId])

  return (
    <div className="min-h-screen bg-app-bg">
      <div className="max-w-[1180px] mx-auto px-5 py-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-11 h-11 rounded-2xl bg-forest-50 flex items-center justify-center">
            <MonitorSmartphone className="text-forest-600" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-900">Consola del portal del cliente</h1>
            <p className="text-sm text-stone-500">Previsualizá lo que ve el cliente en cualquier proyecto. No manda nada.</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select value={selId ?? ''} onChange={(e) => setSelId(Number(e.target.value) || null)}
                  className="input max-w-md">
            <option value="">Elegí un proyecto…</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
            ))}
          </select>
          {sel && (
            <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1 text-sm">
              <button onClick={() => setDevice('desktop')}
                      className={`px-3 py-1.5 rounded-lg font-medium ${device === 'desktop' ? 'bg-forest-600 text-white' : 'text-stone-500'}`}>Escritorio</button>
              <button onClick={() => setDevice('mobile')}
                      className={`px-3 py-1.5 rounded-lg font-medium ${device === 'mobile' ? 'bg-forest-600 text-white' : 'text-stone-500'}`}>Celular</button>
            </div>
          )}
        </div>

        {sel && (
          <div className="mt-3 flex items-start gap-2 text-xs text-stone-500 bg-white border border-card-border rounded-xl px-3 py-2">
            <Info size={14} className="text-stone-400 shrink-0 mt-0.5" />
            <span>Vista previa de <b>{sel.codigo}</b>. Las acciones (aprobar/rechazar) están deshabilitadas — es solo para ver. Para compartir el link con el cliente, entrá al <b>Schedule</b> del proyecto → <Share2 size={11} className="inline" /> <b>Compartir con cliente</b>.</span>
          </div>
        )}

        {selId ? (
          <div className="mt-4 flex justify-center">
            <div className={`overflow-hidden rounded-2xl border border-card-border-strong shadow-sm bg-[#F6F4EE] ${device === 'mobile' ? 'w-[390px]' : 'w-full'}`}>
              <ClientPortal key={`${selId}-${device}`} previewProyectoId={selId} />
            </div>
          </div>
        ) : (
          <div className="mt-10 text-center text-stone-400">
            <MonitorSmartphone className="mx-auto mb-2 opacity-40" size={34} />
            <p className="text-sm">Elegí un proyecto para ver su portal.</p>
          </div>
        )}
      </div>
    </div>
  )
}
