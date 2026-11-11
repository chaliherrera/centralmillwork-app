import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ArrowLeft, Copy, FileDown, Send, AlertTriangle } from 'lucide-react'
import {
  type Estimado, type RecetaCatalogo,
  getEstimado, cargarCatalogo, duplicarEstimado, enviarEstimado, getPropuesta,
} from '@/services/estimados'
import { generarPropuestaPDF } from '@/utils/propuestaPdf'
import GrillaArmado from './GrillaArmado'
import CopiarItem from './CopiarItem'
import PanelParametros from './PanelParametros'

// ─────────────────────────────────────────────────────────────────────────────
// La pantalla de armado. Una sola vista, como la hoja del Excel:
//   · centro: la grilla de ítems y componentes
//   · derecha: los 7 renglones y el TOTAL, que se mueven mientras se tipea
//   · arriba: qué estimado es, y las dos acciones que importan
//
// Un estimado enviado se muestra igual pero sin campos: es un documento, no un
// formulario deshabilitado. La salida es duplicarlo, no desbloquearlo.
// ─────────────────────────────────────────────────────────────────────────────

const usd = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'bg-stone-100 text-stone-600' },
  enviado:  { texto: 'Enviado · precios congelados', clase: 'bg-amber-100 text-amber-800' },
  aceptado: { texto: 'Aceptado', clase: 'bg-emerald-100 text-emerald-800' },
  perdido:  { texto: 'Perdido', clase: 'bg-stone-200 text-stone-500' },
}

export default function ArmadoEstimado({ estimadoId, onVolver }: {
  estimadoId: number
  onVolver: () => void
}) {
  const [est, setEst] = useState<Estimado | null>(null)
  const [catalogo, setCatalogo] = useState<RecetaCatalogo[]>([])
  const [cargando, setCargando] = useState(true)
  const [copiarAbierto, setCopiarAbierto] = useState(false)

  const refrescar = useCallback(async () => {
    setEst(await getEstimado(estimadoId))
  }, [estimadoId])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        // El catálogo entero de una vez: filtrar después no tiene espera.
        const [e, c] = await Promise.all([getEstimado(estimadoId), cargarCatalogo()])
        if (!vivo) return
        setEst(e); setCatalogo(c)
      } catch { toast.error('No pude abrir el estimado') }
      finally { if (vivo) setCargando(false) }
    })()
    return () => { vivo = false }
  }, [estimadoId])

  // Ctrl+K trae un ítem entero de otro proyecto: el atajo que más tiempo ahorra.
  useEffect(() => {
    const onTecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (est?.estado === 'borrador') setCopiarAbierto(true)
      }
    }
    window.addEventListener('keydown', onTecla)
    return () => window.removeEventListener('keydown', onTecla)
  }, [est?.estado])

  if (cargando) return <p className="py-10 text-center text-sm text-stone-400">Abriendo…</p>
  if (!est) return <p className="py-10 text-center text-sm text-stone-400">No se encontró.</p>

  const editable = est.estado === 'borrador'
  const estado = ESTADOS[est.estado] ?? ESTADOS.borrador

  const descargarPDF = async () => {
    try { await generarPropuestaPDF(await getPropuesta(est.id)) }
    catch { toast.error('No pude generar el PDF') }
  }

  const duplicar = async () => {
    const nuevo = await duplicarEstimado(est.id)
    toast.success(`Draft ${nuevo.draft} listo`)
    window.location.hash = `#/estimados/${nuevo.id}`
    setEst(await getEstimado(nuevo.id))
  }

  const enviar = async () => {
    if (!window.confirm(
      `Vas a congelar el draft ${est.draft} por $ ${usd(est.calculo.total)}.\n` +
      'Después sólo se puede duplicar para armar el siguiente.')) return
    await enviarEstimado(est.id)
    await refrescar()
    toast.success('Enviado: precios congelados')
  }

  return (
    <div className="space-y-4">
      {/* banda de identidad + acciones */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onVolver} className="text-stone-400 hover:text-stone-700" title="Volver">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-stone-900">
            {est.codigo} · {est.nombre}
          </h1>
          <p className="text-xs text-stone-500">
            {est.gc ?? 'sin GC'} · Draft {est.draft}
            {est.estimador && ` · ${est.estimador}`}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${estado.clase}`}>
          {estado.texto}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={descargarPDF}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200
                             px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            <FileDown size={15} /> Propuesta PDF
          </button>
          {editable ? (
            <button onClick={enviar}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3 py-1.5
                               text-sm font-semibold text-white hover:bg-forest-700">
              <Send size={15} /> Enviar
            </button>
          ) : (
            <button onClick={duplicar}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3 py-1.5
                               text-sm font-semibold text-white hover:bg-forest-700">
              <Copy size={15} /> Nuevo draft ({est.draft + 1})
            </button>
          )}
        </div>
      </div>

      {/* Una perilla sin valor hace que el precio salga CORTO. Que se vea. */}
      {est.calculo.advertencias.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
          <div className="text-sm text-amber-900">
            <strong>Faltan datos y el precio sale corto:</strong>{' '}
            {est.calculo.advertencias.join(' · ')}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <GrillaArmado estimado={est} catalogo={catalogo} editable={editable} onCambio={refrescar} />
          <PanelParametros estimadoId={est.id} editable={editable} onCambio={refrescar} />
        </div>
        <PanelTotales est={est} />
      </div>

      <CopiarItem
        estimadoId={est.id}
        abierto={copiarAbierto}
        onCerrar={() => setCopiarAbierto(false)}
        onCopiado={refrescar}
      />
    </div>
  )
}

// ── el carril de la derecha: la plata, siempre a la vista ───────────────────

function PanelTotales({ est }: { est: Estimado }) {
  const c = est.calculo
  return (
    <aside className="w-full shrink-0 lg:w-80">
      <div className="sticky top-4 space-y-3">
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <table className="w-full text-sm">
            <tbody>
              {c.renglones.map((r) => (
                <tr key={r.n}>
                  <td className="py-0.5 pr-2 text-stone-600">{r.concepto}</td>
                  <td className="py-0.5 text-right font-mono tabular-nums text-stone-800">
                    {usd(r.monto)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-stone-200">
                <td className="pt-1.5 font-semibold text-stone-900">Total sin impuestos</td>
                <td className="pt-1.5 text-right font-mono font-semibold tabular-nums text-stone-900">
                  {usd(c.total)}
                </td>
              </tr>
              {c.salesTax > 0 && (
                <>
                  <tr>
                    <td className="py-0.5 text-stone-600">Sales tax</td>
                    <td className="py-0.5 text-right font-mono tabular-nums">{usd(c.salesTax)}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-stone-900">Total con impuestos</td>
                    <td className="text-right font-mono font-semibold tabular-nums">
                      {usd(c.totalConImpuestos)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Lo interno: no va en la propuesta, pero el estimador lo necesita. */}
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
          <div className="flex justify-between py-0.5">
            <span className="text-stone-500">Margen</span>
            <span className="font-mono tabular-nums text-stone-800">
              {(c.margen * 100).toFixed(1)} %
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-stone-500">Horas de taller</span>
            <span className="font-mono tabular-nums text-stone-800">
              {c.horasTaller.toFixed(1)} hr
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-stone-500">Presupuesto de taller</span>
            <span className="font-mono tabular-nums text-stone-800">{usd(c.presupuestoTaller)}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
