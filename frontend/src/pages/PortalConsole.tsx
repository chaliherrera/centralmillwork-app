import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { MonitorSmartphone, Share2, Info, PlayCircle } from 'lucide-react'
import { proyectosService } from '@/services/proyectos'
import { scheduleService } from '@/services/schedule'
import type { Proyecto } from '@/types'
import ClientPortal from './portal/ClientPortal'
import PortalLinksManager from '@/components/portal/PortalLinksManager'

// Momentos del journey del cliente. accion=true → el cliente los APRUEBA en el
// portal (después de simular, abrís el portal en vivo y los aprobás/rechazás).
const SIM_MOMENTOS = [
  { codigo: 'PLAN', label: 'Aprobar el plan', accion: true },
  { codigo: 'C-03', label: 'Firma de contrato', accion: false },
  { codigo: 'C-04', label: 'Down payment', accion: false },
  { codigo: 'E-05', label: 'Aprobar muestras', accion: true },
  { codigo: 'E-07', label: 'Aprobar planos', accion: true },
  { codigo: 'I-07', label: 'Entrega (sign-off)', accion: true },
  { codigo: 'X-03', label: 'Pago final', accion: false },
]

function Simulador({ proyectoId, onCambio }: { proyectoId: number; onCambio: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  async function poner(codigo: string) {
    setBusy(codigo)
    try {
      await scheduleService.simularMomento(proyectoId, codigo)
      toast.success('Momento puesto pendiente en el portal')
      onCambio()
    } catch (e: any) { toast.error(e?.response?.data?.message ?? 'No se pudo simular') }
    finally { setBusy(null) }
  }
  return (
    <div className="rounded-2xl border border-card-border bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-card-border">
        <h3 className="font-semibold text-stone-800 text-[15px] flex items-center gap-2"><PlayCircle size={16} className="text-forest-600" /> Simular el recorrido</h3>
        <p className="text-[11px] text-stone-400 mt-0.5">Elegí una tarea y ponela pendiente en el portal. Marca las anteriores como hechas.</p>
      </div>
      <div className="divide-y divide-stone-100">
        {SIM_MOMENTOS.map((m) => (
          <div key={m.codigo} className="px-4 py-2.5 flex items-center gap-2">
            <span className="text-sm text-stone-700 flex-1">{m.label}</span>
            {m.accion
              ? <span className="text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 bg-forest-50 text-forest-600">aprueba el cliente</span>
              : <span className="text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 bg-stone-100 text-stone-400">estado</span>}
            <button onClick={() => poner(m.codigo)} disabled={busy === m.codigo}
                    className="inline-flex items-center gap-1 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1.5">Poner pendiente</button>
          </div>
        ))}
      </div>
      <p className="px-4 py-2.5 text-[11px] text-stone-400 border-t border-card-border">
        Después de simular, generá un link y usá <b>«Abrir portal en vivo»</b> para aprobar/rechazar como el cliente. Es una herramienta de test — cambia el estado del proyecto (usá proyectos de prueba).
      </p>
    </div>
  )
}

// Consola de control del portal del cliente: previsualizar lo que ve el cliente
// en CUALQUIER proyecto (verificar look & feel + los pasos del journey), sin
// generar un link. La gestión de links (generar/revocar) vive en el Schedule del
// proyecto ("Compartir con cliente").
export default function PortalConsole() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [refreshKey, setRefreshKey] = useState(0)   // se bumpa tras simular → re-monta el preview

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
            <p className="text-sm text-stone-500">Previsualizá el portal, generá links de prueba y abrilo en vivo — todo desde acá.</p>
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
          <div className="mt-4 space-y-3">
            <div className="grid lg:grid-cols-2 gap-4 items-start">
              <PortalLinksManager proyectoId={sel.id} />
              <Simulador proyectoId={sel.id} onCambio={() => setRefreshKey((k) => k + 1)} />
            </div>
            <div className="flex items-start gap-2 text-xs text-stone-500 bg-white border border-card-border rounded-xl px-3 py-2.5">
              <Info size={14} className="text-stone-400 shrink-0 mt-0.5" />
              <span>La <b>vista previa</b> de abajo es de solo lectura (look &amp; feel + los pasos). Para <b>probar de verdad</b>: simulá los hitos de estado acá arriba, o generá un link y usá <b>«Abrir portal en vivo»</b> para aprobar/rechazar como el cliente. Compartir con cliente también está en el <b>Schedule</b> del proyecto <Share2 size={11} className="inline" />.</span>
            </div>
          </div>
        )}

        {selId ? (
          <div className="mt-5">
            <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Vista previa (solo lectura)</div>
            <div className="flex justify-center">
              <div className={`overflow-hidden rounded-2xl border border-card-border-strong shadow-sm bg-[#F6F4EE] ${device === 'mobile' ? 'w-[390px]' : 'w-full'}`}>
                <ClientPortal key={`${selId}-${device}-${refreshKey}`} previewProyectoId={selId} />
              </div>
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
