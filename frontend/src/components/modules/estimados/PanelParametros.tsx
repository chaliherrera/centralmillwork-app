import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { type Perilla, getPerillas, setPerillas } from '@/services/estimados'

// ─────────────────────────────────────────────────────────────────────────────
// Los 7 calculadores: instalación, embalaje, flete, planos de taller,
// verificación en obra, material e impuestos.
//
// Son el 36% del precio y los decide el estimador en cada proyecto (decisión de
// Chali), así que NO van escondidos en un cajón: están siempre a la vista.
// Arriba, las perillas que cambian proyecto a proyecto —¿instalamos nosotros?,
// ¿es local?, cuántos viajes, cuántas millas—. Abajo, plegado, el resto, que es
// configuración de la casa y casi nunca se toca.
//
// Lo que se cambió respecto del default queda marcado: así se ve de un vistazo
// qué tiene de particular este proyecto.
// ─────────────────────────────────────────────────────────────────────────────

const TITULO_GRUPO: Record<string, string> = {
  instalacion: 'Instalación',
  embalaje: 'Embalaje',
  entrega: 'Entrega',
  documentos: 'Planos de taller',
  obra: 'Verificación en obra',
  material: 'Material',
  impuestos: 'Impuestos',
}

export default function PanelParametros({ estimadoId, editable, onCambio }: {
  estimadoId: number
  editable: boolean
  onCambio: () => Promise<void>
}) {
  const [perillas, setLista] = useState<Perilla[]>([])
  const [verTodas, setVerTodas] = useState(false)
  const [guardando, setGuardando] = useState<string | null>(null)

  const recargar = async () => {
    try { setLista(await getPerillas(estimadoId)) }
    catch { toast.error('No pude traer los parámetros') }
  }
  useEffect(() => { void recargar() }, [estimadoId])

  const guardar = async (p: Perilla, valor: string) => {
    if (valor === (p.valor ?? '')) return
    setGuardando(p.clave)
    try {
      await setPerillas(estimadoId, { [p.clave]: valor })
      await recargar()
      await onCambio()        // el total se mueve: casi todas tocan plata
    } catch {
      toast.error(`No pude guardar "${p.etiqueta}"`)
      await recargar()
    } finally { setGuardando(null) }
  }

  if (!perillas.length) return null

  const delProyecto = perillas.filter((p) => p.porProyecto)
  const deLaCasa = perillas.filter((p) => !p.porProyecto)
  const cambiadas = perillas.filter((p) => p.cambiado).length

  return (
    <section className="rounded-xl border border-stone-200 bg-white">
      <header className="flex items-baseline gap-2 rounded-t-xl border-b border-stone-200
                         bg-stone-50 px-3 py-2">
        <SlidersHorizontal size={15} className="self-center text-stone-400" />
        <h3 className="font-semibold text-stone-900">Calculadores</h3>
        <span className="text-xs text-stone-400">
          instalación, embalaje, flete, planos, obra e impuestos
        </span>
        {cambiadas > 0 && (
          <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
            {cambiadas} cambiad{cambiadas === 1 ? 'o' : 'os'} en este proyecto
          </span>
        )}
      </header>

      <div className="grid gap-x-6 gap-y-1 px-3 py-2 sm:grid-cols-2">
        {delProyecto.map((p) => (
          <Fila key={p.clave} p={p} editable={editable}
                guardando={guardando === p.clave} onGuardar={guardar} />
        ))}
      </div>

      <div className="border-t border-stone-100">
        <button
          onClick={() => setVerTodas((v) => !v)}
          className="w-full px-3 py-1.5 text-left text-xs font-semibold text-stone-500 hover:text-stone-800"
        >
          {verTodas ? '▾' : '▸'} Configuración de la casa ({deLaCasa.length}) — tarifas y márgenes
        </button>
        {verTodas && (
          <div className="px-3 pb-2">
            {/* Agrupadas por calculador: son veinte y sueltas no se entienden. */}
            {[...new Set(deLaCasa.map((p) => p.grupo))].map((g) => (
              <div key={g} className="mt-1.5 first:mt-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                  {TITULO_GRUPO[g] ?? g}
                </p>
                <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {deLaCasa.filter((p) => p.grupo === g).map((p) => (
                    <Fila key={p.clave} p={p} editable={editable}
                          guardando={guardando === p.clave} onGuardar={guardar} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function Fila({ p, editable, guardando, onGuardar }: {
  p: Perilla; editable: boolean; guardando: boolean
  onGuardar: (p: Perilla, valor: string) => Promise<void>
}) {
  // El porcentaje se guarda 0..1 pero se escribe como 45, que es como se habla.
  const aPantalla = (v: string | null) =>
    p.tipo === 'porcentaje' && v ? String(Math.round(Number(v) * 1000) / 10) : (v ?? '')
  const aGuardar = (v: string) =>
    p.tipo === 'porcentaje' ? String(Number(v) / 100) : v

  const [txt, setTxt] = useState(aPantalla(p.valor))
  useEffect(() => { setTxt(aPantalla(p.valor)) }, [p.valor])

  const faltante = p.requerido && !p.valor

  return (
    <div className={`flex items-baseline gap-2 py-0.5 ${guardando ? 'opacity-50' : ''}`}
         title={p.ayuda ?? undefined}>
      <label className="flex-1 truncate text-sm text-stone-600">
        {p.etiqueta}
        {p.cambiado && <span className="ml-1 text-amber-600" title="Cambiado en este proyecto">•</span>}
        {faltante && <span className="ml-1 text-red-600" title="Sin valor: el precio sale corto">!</span>}
      </label>

      {p.tipo === 'si_no' ? (
        <select
          disabled={!editable}
          value={(p.valor ?? 'NO').toUpperCase() === 'YES' ? 'YES' : 'NO'}
          onChange={(e) => void onGuardar(p, e.target.value)}
          className="w-20 rounded border border-stone-200 px-1 py-0.5 text-sm disabled:bg-transparent"
        >
          <option value="YES">Sí</option>
          <option value="NO">No</option>
        </select>
      ) : (
        <input
          disabled={!editable}
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onBlur={() => void onGuardar(p, aGuardar(txt))}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          inputMode="decimal"
          className="w-20 rounded border border-stone-200 px-1 py-0.5 text-right font-mono
                     text-sm tabular-nums disabled:border-transparent disabled:bg-transparent"
        />
      )}
      <span className="w-12 shrink-0 text-xs text-stone-400">{p.unidad ?? ''}</span>
      {p.cambiado && editable && (
        <button
          onClick={() => void onGuardar(p, p.valorDefault ?? '')}
          title={`Volver al valor de la casa${p.valorDefault ? ` (${p.valorDefault})` : ''}`}
          className="text-stone-300 hover:text-stone-700"
        ><RotateCcw size={12} /></button>
      )}
    </div>
  )
}
