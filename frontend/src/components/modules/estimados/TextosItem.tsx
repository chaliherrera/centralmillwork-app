import { useState } from 'react'
import toast from 'react-hot-toast'
import { type ItemRow, actualizarItem } from '@/services/estimados'

// ─────────────────────────────────────────────────────────────────────────────
// Las cinco líneas que el GC lee debajo de cada ítem en la propuesta.
//
// Van PLEGADAS: no hacen falta para costear y llenarlas al principio distrae.
// Se completan cuando el estimado ya cerró, justo antes de mandarlo.
//
// "Approx. Size" es la excepción: se GENERA desde los componentes, así que
// aparece en gris con lo que va a salir impreso. Sólo se escribe si se quiere
// decir otra cosa.
// ─────────────────────────────────────────────────────────────────────────────

const CAMPOS: { clave: keyof ItemRow; api: string; rotulo: string; placeholder: string }[] = [
  { clave: 'descripcion', api: 'descripcion', rotulo: 'Description',
    placeholder: 'P. Lam. Lower Cabinets; Quartz Countertop with 3/4" Plywood Subtop' },
  { clave: 'acabados', api: 'acabados', rotulo: 'Finishes',
    placeholder: 'Standard Plastic Laminate (Finish to be Specified by Designer)' },
  { clave: 'herrajes', api: 'herrajes', rotulo: 'Hardware',
    placeholder: 'Richelieu Functional Metal Pull-332' },
  { clave: 'exclusiones', api: 'exclusiones', rotulo: 'Exclusions',
    placeholder: 'Blocking, Baseboards, Specialty Paints & Stains, Electrical Installation…' },
]

export default function TextosItem({ item, editable, onCambio }: {
  item: ItemRow; editable: boolean; onCambio: () => Promise<void>
}) {
  const [abierto, setAbierto] = useState(false)
  const completos = CAMPOS.filter((c) => item[c.clave]).length
  const tamanosImpreso = item.tamanos ?? item.tamanosSugeridos

  const guardar = async (api: string, valor: string) => {
    const previo = (item as unknown as Record<string, string | null>)[api] ?? ''
    if (valor.trim() === previo) return
    try { await actualizarItem(item.id, { [api]: valor.trim() || null }); await onCambio() }
    catch { toast.error('No pude guardar el texto') }
  }

  return (
    <div className="border-t border-stone-100">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full px-3 py-1.5 text-left text-xs text-stone-400 hover:text-stone-700"
      >
        {abierto ? '▾' : '▸'} Texto para la propuesta
        <span className={completos === CAMPOS.length ? 'ml-2 text-emerald-700' : 'ml-2'}>
          {completos}/{CAMPOS.length} completos
        </span>
      </button>

      {abierto && (
        <div className="space-y-1.5 px-3 pb-2">
          {/* Approx. Size: lo que va a salir impreso, generado de los componentes. */}
          <div className="flex items-baseline gap-2">
            <span className="w-24 shrink-0 text-xs font-semibold text-stone-500">Approx. Size</span>
            <input
              disabled={!editable}
              defaultValue={item.tamanos ?? ''}
              onBlur={(e) => void guardar('tamanos', e.target.value)}
              placeholder={item.tamanosSugeridos ?? 'se arma solo con los componentes'}
              className="flex-1 rounded border border-transparent px-1 py-0.5 text-sm
                         placeholder:text-stone-400 placeholder:italic hover:border-stone-200
                         focus:border-forest-400 focus:bg-white disabled:bg-transparent"
            />
          </div>
          {!item.tamanos && tamanosImpreso && (
            <p className="pl-26 text-[11px] text-stone-400">
              Se imprime esto. Escribí arriba sólo si querés decir otra cosa.
            </p>
          )}

          {CAMPOS.map((c) => (
            <div key={c.api} className="flex items-baseline gap-2">
              <span className="w-24 shrink-0 text-xs font-semibold text-stone-500">{c.rotulo}</span>
              <textarea
                disabled={!editable}
                rows={1}
                defaultValue={(item[c.clave] as string | null) ?? ''}
                onBlur={(e) => void guardar(c.api, e.target.value)}
                placeholder={c.placeholder}
                className="flex-1 resize-y rounded border border-transparent px-1 py-0.5 text-sm
                           placeholder:text-stone-300 hover:border-stone-200 focus:border-forest-400
                           focus:bg-white disabled:bg-transparent"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
