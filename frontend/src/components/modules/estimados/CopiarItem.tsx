import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Copy, Search } from 'lucide-react'
import { itemsParaCopiar, copiarItem } from '@/services/estimados'

// ─────────────────────────────────────────────────────────────────────────────
// "Copiar ítem de otro proyecto" — el atajo que más tiempo ahorra.
//
// La mayoría de las cocinas se parecen a otra cocina. Hoy eso significa abrir un
// Excel de 5 MB, buscar la hoja, copiar un bloque, pegarlo y arreglar las
// referencias rotas. Acá: Ctrl+K, dos letras, Enter — y cae el ítem entero con
// sus doce componentes y sus cuentas, listo para ajustar medidas.
//
// Se abre con Ctrl+K desde cualquier parte de la pantalla de armado.
// ─────────────────────────────────────────────────────────────────────────────

interface ItemCopiable {
  id: number; nombre: string; unidades: number; codigo: string
  proyecto: string; draft: number; estado: string; componentes: number
}

export default function CopiarItem({ estimadoId, abierto, onCerrar, onCopiado }: {
  estimadoId: number
  abierto: boolean
  onCerrar: () => void
  onCopiado: () => Promise<void>
}) {
  const [q, setQ] = useState('')
  const [filas, setFilas] = useState<ItemCopiable[]>([])
  const [cursor, setCursor] = useState(0)
  const [copiando, setCopiando] = useState(false)
  const refInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!abierto) return
    setQ(''); setCursor(0)
    window.setTimeout(() => refInput.current?.focus(), 30)
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    let vivo = true
    const t = window.setTimeout(async () => {
      try {
        const r = await itemsParaCopiar(q || undefined)
        if (vivo) { setFilas(r.filter((x) => x.id !== -1)); setCursor(0) }
      } catch { /* la lista vacía ya dice lo suyo */ }
    }, q ? 180 : 0)   // un respiro al tipear, pero la primera carga es inmediata
    return () => { vivo = false; window.clearTimeout(t) }
  }, [q, abierto])

  const visibles = useMemo(() => filas.slice(0, 12), [filas])

  if (!abierto) return null

  const copiar = async (item: ItemCopiable) => {
    if (copiando) return
    setCopiando(true)
    try {
      await copiarItem(estimadoId, item.id)
      await onCopiado()
      toast.success(`"${item.nombre}" copiado con sus ${item.componentes} líneas`)
      onCerrar()
    } catch {
      toast.error('No pude copiar el ítem')
    } finally { setCopiando(false) }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-stone-900/30 pt-28"
      onMouseDown={onCerrar}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-stone-100 px-3 py-2">
          <Search size={16} className="text-stone-400" />
          <input
            ref={refInput}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, visibles.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); if (visibles[cursor]) void copiar(visibles[cursor]) }
              else if (e.key === 'Escape') { onCerrar() }
            }}
            placeholder="copiar un ítem de otro proyecto — escribí el nombre o el código…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400"
          />
          <kbd className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-400">Esc</kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto">
          {visibles.map((it, i) => (
            <li key={it.id}>
              <button
                disabled={copiando}
                onMouseEnter={() => setCursor(i)}
                onClick={() => void copiar(it)}
                className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm
                            ${i === cursor ? 'bg-forest-50' : ''} disabled:opacity-50`}
              >
                <Copy size={13} className="shrink-0 text-stone-300" />
                <span className="font-medium text-stone-900">{it.nombre}</span>
                {it.unidades !== 1 && (
                  <span className="text-xs text-forest-700">× {it.unidades}</span>
                )}
                <span className="truncate text-xs text-stone-400">
                  {it.codigo} · {it.proyecto} · draft {it.draft}
                </span>
                <span className="ml-auto whitespace-nowrap text-xs text-stone-500">
                  {it.componentes} línea{it.componentes === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
          {!visibles.length && (
            <li className="px-3 py-8 text-center text-sm text-stone-400">
              {q ? 'Ningún ítem con ese nombre.' : 'Todavía no hay ítems para copiar.'}
            </li>
          )}
        </ul>

        <p className="border-t border-stone-100 bg-stone-50 px-3 py-1.5 text-[11px] text-stone-400">
          Se copia el ítem entero: sus componentes, sus cantidades y las cuentas con las que se
          escribieron. Después ajustás las medidas.
        </p>
      </div>
    </div>
  )
}
