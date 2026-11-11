import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Trash2, Plus } from 'lucide-react'
import {
  type Estimado, type ItemRow, type ComponenteRow, type RecetaCatalogo,
  agregarComponente, actualizarComponente, borrarComponente,
  crearItem, actualizarItem, borrarItem, volverALaRegla,
} from '@/services/estimados'
import { evaluarCantidad, ExpresionInvalida } from '@/utils/cantidad'
import TextosItem from './TextosItem'

// ─────────────────────────────────────────────────────────────────────────────
// La grilla donde se arma el estimado. Es LA pantalla: acá se va el 95% del
// tiempo, y tiene que ser más rápida que el Excel o no se usa.
//
// Tres reglas que la gobiernan:
//   · No hay botón "Guardar". Cada celda confirmada se guarda sola.
//   · No se sueltan las manos del teclado: dos Enter por componente.
//   · El precio se ve mientras se escribe, no después.
//
// Cada ítem termina en una fila FANTASMA, siempre lista. No hay botón "agregar
// componente": la fila ya está, con el cursor donde va.
// ─────────────────────────────────────────────────────────────────────────────

const usd = (n: number | null | undefined) =>
  n == null ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * ¿La cantidad queda fuera de lo que esta receta suele llevar?
 *
 * El error que esto atrapa: tipear una medida en pies cuadrados dentro de una
 * receta que se vende POR PLANCHA. Pasa fácil, la unidad está a la vista pero
 * nadie la mira, y sale una línea de decenas de miles sin que nada avise.
 *
 * No bloquea: avisa. Y sólo cuando hay historia suficiente para tener razón —
 * con una o dos veces de uso cualquier cantidad nueva parecería rara.
 */
function cantidadSospechosa(r: RecetaCatalogo | null, cant: number): string | null {
  if (!r?.uso || r.uso.veces < 2 || !(cant > 0)) return null
  const u = r.uso
  if (cant > u.max * 4) {
    return `suele ir entre ${u.min} y ${u.max} ${r.unidad ?? ''} — ¿estás usando la unidad correcta?`
  }
  if (cant < u.min / 4) {
    return `suele ir entre ${u.min} y ${u.max} ${r.unidad ?? ''} — parece muy poco`
  }
  return null
}

/** Busca por palabras sueltas: "plam lower" encuentra el nombre largo. */
function filtrar(catalogo: RecetaCatalogo[], q: string, usadas: Set<number>) {
  const palabras = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!palabras.length) {
    // Con la celda vacía no se muestran las 167: sólo las de este estimado.
    return catalogo.filter((r) => usadas.has(r.id)).slice(0, 8)
  }
  return catalogo
    .filter((r) => {
      const texto = `${r.descripcion} ${r.alias ?? ''}`.toLowerCase()
      return palabras.every((p) => texto.includes(p))
    })
    .filter((r) => r.precioUnidad !== null)   // sin margen no se puede cotizar
    .slice(0, 8)
}

interface Props {
  estimado: Estimado
  catalogo: RecetaCatalogo[]
  editable: boolean
  onCambio: () => Promise<void>
}

export default function GrillaArmado({ estimado, catalogo, editable, onCambio }: Props) {
  const usadas = useMemo(
    () => new Set(estimado.items.flatMap((i) => i.componentes.map((c) => c.recetaId))),
    [estimado])

  return (
    <div className="space-y-5">
      {estimado.items.map((item) => (
        <BloqueItem key={item.id} item={item} catalogo={catalogo}
                    inst={(estimado.calculo.instalacionPorItem ?? []).find((x) => x.itemN === item.n)}
                    porDia={estimado.calculo.dolaresPorDiaInstalacion ?? 0}
                    usadas={usadas} editable={editable} onCambio={onCambio} />
      ))}

      {editable && <AgregarItem estimadoId={estimado.id} onCambio={onCambio} />}
    </div>
  )
}

// ── alta de ítem: un campo en línea, no una ventanita del navegador ─────────
// `window.prompt` lo bloquean los navegadores embebidos y rompe el teclado.

function AgregarItem({ estimadoId, onCambio }: {
  estimadoId: number; onCambio: () => Promise<void>
}) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [unidades, setUnidades] = useState('1')
  const [guardando, setGuardando] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (abierto) ref.current?.focus() }, [abierto])

  // Ctrl+Enter abre el alta desde cualquier parte de la grilla.
  useEffect(() => {
    const onTecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); setAbierto(true) }
    }
    window.addEventListener('keydown', onTecla)
    return () => window.removeEventListener('keydown', onTecla)
  }, [])

  const crear = async () => {
    if (!nombre.trim() || guardando) return
    setGuardando(true)
    try {
      await crearItem(estimadoId, { nombre: nombre.trim(), unidades: Number(unidades) || 1 })
      setNombre(''); setUnidades('1')
      await onCambio()
      ref.current?.focus()        // encadenar varios ítems sin soltar el teclado
    } catch { toast.error('No pude crear el ítem') }
    finally { setGuardando(false) }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed
                   border-stone-300 px-3 py-2 text-sm font-semibold text-stone-500
                   hover:border-forest-500 hover:text-forest-700"
      >
        <Plus size={15} /> Agregar ítem
        <kbd className="ml-1 rounded bg-stone-100 px-1 text-[10px] text-stone-400">Ctrl+Enter</kbd>
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white p-2">
      <input
        ref={ref}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void crear() }
          else if (e.key === 'Escape') { setAbierto(false); setNombre('') }
        }}
        placeholder='Nombre del ítem — "Kitchen Island"'
        className="flex-1 rounded border border-stone-200 px-2 py-1 text-sm"
      />
      <label className="flex items-center gap-1 text-xs text-stone-500">
        ×
        <input
          value={unidades}
          onChange={(e) => setUnidades(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void crear() } }}
          inputMode="numeric"
          className="w-14 rounded border border-stone-200 px-1 py-1 text-right tabular-nums"
        />
        unidades
      </label>
      <button onClick={() => void crear()} disabled={guardando}
              className="rounded bg-forest-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">
        Crear
      </button>
      <button onClick={() => { setAbierto(false); setNombre('') }}
              className="text-sm text-stone-500">Cancelar</button>
    </div>
  )
}

// ── un ítem con sus componentes ─────────────────────────────────────────────

function BloqueItem({ item, inst, porDia, catalogo, usadas, editable, onCambio }: {
  item: ItemRow
  inst?: { dias: number; sugerido: number; manual: boolean }
  /** El monto de la regla de la casa. Viene de la base, no del código. */
  porDia: number
  catalogo: RecetaCatalogo[]
  usadas: Set<number>; editable: boolean; onCambio: () => Promise<void>
}) {

  return (
    <section className="rounded-xl border border-stone-200 bg-white">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-t-xl border-b
                         border-stone-200 bg-stone-50 px-3 py-2">
        <span className="text-xs font-mono text-stone-400">#{item.n}</span>
        <h3 className="font-semibold text-stone-900">{item.nombre}</h3>
        {item.unidades !== 1 && (
          // ×unidades bien visible: si pasa desapercibido se multiplica sin querer.
          <span className="rounded bg-forest-600 px-1.5 py-0.5 text-xs font-bold text-white">
            × {item.unidades}
          </span>
        )}
        {item.ref_plano && (
          <span className="text-xs text-stone-400">Dwg: {item.ref_plano}</span>
        )}
        <span className="ml-auto font-mono font-semibold tabular-nums text-stone-900">
          $ {usd(item.resumen.precio)}
        </span>
        {editable && (
          <button
            onClick={async () => {
              if (!window.confirm(`¿Borrar el ítem "${item.nombre}" y sus ${item.componentes.length} líneas?`)) return
              await borrarItem(item.id); await onCambio()
            }}
            className="text-stone-300 hover:text-red-600" title="Borrar ítem"
          ><Trash2 size={14} /></button>
        )}
      </header>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-stone-400">
            <th className="px-3 py-1 font-semibold">Receta</th>
            <th className="w-44 px-2 py-1 font-semibold">Cantidad</th>
            <th className="w-24 px-2 py-1 text-right font-semibold">=</th>
            <th className="w-28 px-2 py-1 text-right font-semibold">$/u</th>
            <th className="w-28 px-2 py-1 text-right font-semibold">Precio</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {item.componentes.map((c) => (
            <FilaComponente key={c.id} comp={c} catalogo={catalogo}
                            editable={editable} onCambio={onCambio} />
          ))}
          {editable && (
            <FilaFantasma item={item} catalogo={catalogo} usadas={usadas} onCambio={onCambio} />
          )}
        </tbody>
      </table>

      <TextosItem item={item} editable={editable} onCambio={onCambio} />

      {editable && (
        <footer className="flex items-center gap-2 rounded-b-xl border-t border-stone-100 px-3 py-1.5
                           text-xs text-stone-500">
          <span>Instalación:</span>
          <input
            key={`${item.id}-${inst?.dias}`}
            type="number" step="0.5" min="0"
            defaultValue={inst?.dias ?? item.dias_instalacion}
            onBlur={async (e) => {
              const v = Number(e.target.value)
              if (Math.abs(v - (inst?.dias ?? 0)) < 0.001) return
              await actualizarItem(item.id, { diasInstalacion: v }); await onCambio()
            }}
            className={`w-16 rounded border px-1.5 py-0.5 text-right tabular-nums
                        ${inst?.manual ? 'border-amber-300 bg-amber-50' : 'border-stone-200'}`}
          />
          <span>días</span>
          {inst?.manual ? (
            <>
              <span className="text-amber-700">
                · lo pusiste a mano — la regla dice {inst.sugerido}
              </span>
              <button
                onClick={async () => { await volverALaRegla(item.id); await onCambio() }}
                className="underline hover:text-stone-800"
              >volver a la regla</button>
            </>
          ) : (
            <span className="text-stone-400">
              {porDia > 0
                ? `· sale de la regla de la casa: $ ${usd(porDia)} de producto por día`
                : '· falta cargar la regla de la casa, así que no propone días'}
            </span>
          )}
          <span className="ml-auto tabular-nums text-stone-400">
            {item.resumen.horas.toFixed(1)} hr de taller
          </span>
        </footer>
      )}
    </section>
  )
}

// ── una fila ya cargada ─────────────────────────────────────────────────────

function FilaComponente({ comp, catalogo, editable, onCambio }: {
  comp: ComponenteRow; catalogo: RecetaCatalogo[]
  editable: boolean; onCambio: () => Promise<void>
}) {
  const [guardando, setGuardando] = useState(false)
  const inicial = comp.cantidadExpr ?? String(comp.cantidadUnidad)

  return (
    <tr className={`border-t border-stone-100 ${guardando ? 'opacity-50' : ''}`}>
      <td className="px-3 py-1">
        <span className="text-stone-800">{comp.alias ?? comp.receta}</span>
        {comp.alias && <span className="ml-2 text-xs text-stone-400">{comp.receta}</span>}
        {comp.fuenteCosto === 'calculado' && (
          <span className="ml-2 rounded bg-emerald-50 px-1 text-[10px] text-emerald-700"
                title="El costo sale de sus materiales: se mueve solo">auto</span>
        )}
      </td>
      <td className="px-2 py-1">
        {editable ? (
          <CeldaCantidad
            valorInicial={inicial}
            receta={catalogo.find((r) => r.id === comp.recetaId)}
            onConfirmar={async (txt) => {
              setGuardando(true)
              try { await actualizarComponente(comp.id, { cantidad: txt }); await onCambio() }
              finally { setGuardando(false) }
            }}
          />
        ) : <span className="font-mono text-xs text-stone-500">{inicial}</span>}
      </td>
      <td className="px-2 py-1 text-right font-mono text-xs tabular-nums text-stone-500">
        {comp.cantidadUnidad} {comp.unidad}
      </td>
      <td className="px-2 py-1 text-right font-mono tabular-nums text-stone-500">
        {usd(comp.precioUnidad)}
      </td>
      <td className="px-2 py-1 text-right font-mono tabular-nums text-stone-900">
        {usd(comp.precio)}
      </td>
      <td className="pr-2 text-right">
        {editable && (
          <button
            onClick={async () => { await borrarComponente(comp.id); await onCambio() }}
            className="text-stone-200 hover:text-red-600" title="Borrar línea"
          ><Trash2 size={13} /></button>
        )}
      </td>
    </tr>
  )
}

// ── la fila fantasma: siempre lista, sin botón de por medio ─────────────────

function FilaFantasma({ item, catalogo, usadas, onCambio }: {
  item: ItemRow; catalogo: RecetaCatalogo[]; usadas: Set<number>
  onCambio: () => Promise<void>
}) {
  const [receta, setReceta] = useState<RecetaCatalogo | null>(null)
  const refCantidad = useRef<HTMLInputElement>(null)
  const refBuscador = useRef<HTMLInputElement>(null)
  // Cuenta las líneas guardadas desde esta fila: cada vez que sube, el foco
  // vuelve al buscador. Con un setTimeout no alcanza — React re-renderiza
  // después de onCambio() y se lleva puesto el foco.
  const [guardadas, setGuardadas] = useState(0)

  useEffect(() => { if (receta) refCantidad.current?.focus() }, [receta])
  useEffect(() => {
    if (!guardadas) return
    refBuscador.current?.focus()
  }, [guardadas, item.componentes.length])

  return (
    <tr className="border-t border-stone-100 bg-stone-50/40">
      <td className="px-3 py-1">
        <BuscadorReceta
          ref={refBuscador}
          catalogo={catalogo} usadas={usadas} elegida={receta}
          onElegir={setReceta}
        />
      </td>
      <td className="px-2 py-1">
        <CeldaCantidad
          ref={refCantidad}
          receta={receta}
          deshabilitada={!receta}
          limpiarAlConfirmar
          onConfirmar={async (txt) => {
            if (!receta) return
            await agregarComponente(item.id, { recetaId: receta.id, cantidad: txt })
            setReceta(null)
            await onCambio()
            // Volver al buscador: si el foco se pierde hay que hacer clic en cada
            // línea, y ahí se termina la promesa de "dos Enter y seguís".
            setGuardadas((n) => n + 1)
          }}
        />
      </td>
      <td colSpan={4} className="px-2 py-1 text-right text-xs text-stone-300">
        {receta
          ? `${receta.unidad ?? ''} · $ ${usd(receta.precioUnidad)}/u`
          : 'escribí dos palabras de la receta'}
      </td>
    </tr>
  )
}

// ── el buscador de recetas ──────────────────────────────────────────────────

const BuscadorReceta = forwardRef<HTMLInputElement, {
  catalogo: RecetaCatalogo[]; usadas: Set<number>
  elegida: RecetaCatalogo | null
  onElegir: (r: RecetaCatalogo | null) => void
}>(function BuscadorReceta({ catalogo, usadas, elegida, onElegir }, ref) {
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [cursor, setCursor] = useState(0)
  const opciones = useMemo(() => filtrar(catalogo, q, usadas), [catalogo, q, usadas])

  useEffect(() => { setCursor(0) }, [q])

  if (elegida) {
    return (
      <button onClick={() => { onElegir(null); setQ(''); }}
              className="text-left text-stone-800 hover:text-forest-700">
        {elegida.alias ?? elegida.descripcion}
      </button>
    )
  }

  return (
    <div className="relative">
      <input
        ref={ref}
        value={q}
        onChange={(e) => { setQ(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => window.setTimeout(() => setAbierto(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, opciones.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
          else if (e.key === 'Enter') {
            // Enter SIEMPRE elige el resaltado. Si no, se aprieta dos veces en todos lados.
            e.preventDefault()
            const r = opciones[cursor]
            if (r) { onElegir(r); setQ(''); setAbierto(false) }
          } else if (e.key === 'Escape') { setAbierto(false) }
        }}
        placeholder="buscar receta…"
        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5
                   outline-none placeholder:text-stone-300 focus:border-forest-400 focus:bg-white"
      />
      {abierto && opciones.length > 0 && (
        <ul className="absolute left-0 top-full z-20 mt-0.5 w-[34rem] max-w-[80vw]
                       overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg">
          {!q.trim() && (
            <li className="px-2 pt-1 text-[10px] uppercase tracking-wide text-stone-400">
              En este estimado
            </li>
          )}
          {opciones.map((r, i) => (
            <li key={r.id}>
              <button
                onMouseDown={(e) => { e.preventDefault(); onElegir(r); setQ(''); setAbierto(false) }}
                onMouseEnter={() => setCursor(i)}
                className={`flex w-full items-baseline gap-2 px-2 py-1 text-left text-sm
                            ${i === cursor ? 'bg-forest-50' : ''}`}
              >
                <span className="truncate text-stone-800">{r.descripcion}</span>
                {r.alias && <span className="text-xs text-forest-700">{r.alias}</span>}
                <span className="ml-auto whitespace-nowrap font-mono text-xs tabular-nums text-stone-500">
                  {r.unidad} · $ {usd(r.precioUnidad)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})

// ── la celda de cantidad: se escribe la cuenta, se ve el resultado ──────────

const CeldaCantidad = forwardRef<HTMLInputElement, {
  valorInicial?: string
  deshabilitada?: boolean
  limpiarAlConfirmar?: boolean
  receta?: RecetaCatalogo | null
  onConfirmar: (texto: string) => Promise<void>
}>(function CeldaCantidad(
  { valorInicial = '', deshabilitada, limpiarAlConfirmar, receta, onConfirmar }, ref,
) {
  const [txt, setTxt] = useState(valorInicial)
  useEffect(() => { setTxt(valorInicial) }, [valorInicial])

  // Se evalúa en el navegador, tecla a tecla. El backend vuelve a evaluar al
  // guardar y su número es el que vale; esto es sólo la vista previa.
  let vista = ''
  let error = ''
  let aviso: string | null = null
  if (txt.trim()) {
    try {
      const v = evaluarCantidad(txt)
      vista = String(v)
      aviso = cantidadSospechosa(receta ?? null, v)
    } catch (e) { error = e instanceof ExpresionInvalida ? e.message : 'no entiendo la cuenta' }
  }

  return (
    <div className="relative">
      <input
        ref={ref}
        value={txt}
        disabled={deshabilitada}
        onChange={(e) => setTxt(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          if (!txt.trim() || error) { if (error) toast.error(error); return }
          await onConfirmar(txt)
          if (limpiarAlConfirmar) setTxt('')
        }}
        placeholder={deshabilitada ? '' : '(4.17*2*2)+(3.25*2)'}
        title="Escribí la cuenta como la pensás: se guarda junto con el resultado"
        className={`w-full rounded border bg-transparent px-1 py-0.5 font-mono text-xs outline-none
                    placeholder:text-stone-300 focus:bg-white
                    ${error ? 'border-red-300' : 'border-transparent focus:border-forest-400'}`}
      />
      {vista && vista !== txt.trim() && (
        <span className="pointer-events-none absolute right-1 top-1 font-mono text-[10px] text-forest-600">
          = {vista}
        </span>
      )}
      {aviso && (
        // Avisa, no bloquea: el estimador puede tener razón.
        <p className="absolute left-0 top-full z-10 w-72 rounded border border-amber-300
                      bg-amber-50 px-1.5 py-1 text-[11px] leading-snug text-amber-900 shadow">
          ⚠ {aviso}
        </p>
      )}
    </div>
  )
})
