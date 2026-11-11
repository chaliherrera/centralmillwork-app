import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Search } from 'lucide-react'
import { type EstimadoResumen, listEstimados, crearEstimado } from '@/services/estimados'
import ArmadoEstimado from './ArmadoEstimado'

// Lista de estimados. Se agrupa por código y se muestra el ÚLTIMO draft: si no,
// un proyecto con 9 drafts son 9 filas y en un mes la lista es ruido.

const usd = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ListaEstimados() {
  const [filas, setFilas] = useState<EstimadoResumen[]>([])
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState<number | null>(null)
  const [nuevo, setNuevo] = useState<{ codigo: string; nombre: string; gc: string } | null>(null)

  const recargar = async () => {
    try { setFilas(await listEstimados({ q: q || undefined })) }
    catch { toast.error('No pude traer los estimados') }
  }
  useEffect(() => { void recargar() }, [q])

  if (abierto) {
    return <ArmadoEstimado estimadoId={abierto} onVolver={() => { setAbierto(null); void recargar() }} />
  }

  // Un proyecto = una fila, con su draft más alto.
  const porCodigo = new Map<string, EstimadoResumen>()
  for (const f of filas) {
    const previo = porCodigo.get(f.codigo)
    if (!previo || f.draft > previo.draft) porCodigo.set(f.codigo, f)
  }
  const visibles = [...porCodigo.values()]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-2.5 text-stone-400" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="buscar por código, proyecto o GC…"
            className="w-72 rounded-lg border border-stone-200 py-1.5 pl-7 pr-2 text-sm"
          />
        </div>
        <button
          onClick={() => setNuevo({ codigo: '', nombre: '', gc: '' })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3 py-1.5
                     text-sm font-semibold text-white hover:bg-forest-700"
        ><Plus size={15} /> Nuevo</button>
      </div>

      {nuevo && (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!nuevo.codigo.trim() || !nuevo.nombre.trim()) return
            try {
              const est = await crearEstimado({
                codigo: nuevo.codigo.trim(), nombre: nuevo.nombre.trim(),
                gc: nuevo.gc.trim() || null,
              })
              setNuevo(null); setAbierto(est.id)
            } catch { toast.error('No pude crear el estimado') }
          }}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-white p-2"
        >
          <input autoFocus value={nuevo.codigo} onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })}
                 placeholder="26-622" className="w-28 rounded border border-stone-200 px-2 py-1 text-sm" />
          <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                 placeholder="Nombre del proyecto" className="flex-1 rounded border border-stone-200 px-2 py-1 text-sm" />
          <input value={nuevo.gc} onChange={(e) => setNuevo({ ...nuevo, gc: e.target.value })}
                 placeholder="General Contractor" className="w-56 rounded border border-stone-200 px-2 py-1 text-sm" />
          <button type="submit" className="rounded bg-forest-600 px-3 py-1 text-sm font-semibold text-white">
            Crear y abrir
          </button>
          <button type="button" onClick={() => setNuevo(null)} className="text-sm text-stone-500">Cancelar</button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th className="px-3 py-2 font-semibold">Código</th>
              <th className="px-3 py-2 font-semibold">Proyecto</th>
              <th className="px-3 py-2 font-semibold">GC</th>
              <th className="px-3 py-2 font-semibold">Draft</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.id} onClick={() => setAbierto(f.id)}
                  className="cursor-pointer border-t border-stone-100 hover:bg-forest-50/50">
                <td className="px-3 py-2 font-mono text-xs text-stone-500">{f.codigo}</td>
                <td className="px-3 py-2 font-medium text-stone-900">{f.nombre}</td>
                <td className="px-3 py-2 text-stone-600">{f.gc ?? '—'}</td>
                <td className="px-3 py-2 text-stone-500">#{f.draft}</td>
                <td className="px-3 py-2 text-stone-600">{f.estado}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-900">
                  {usd(f.total)}
                </td>
              </tr>
            ))}
            {!visibles.length && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-stone-400">
                {q ? 'Ningún estimado con esa búsqueda.' : 'Todavía no hay estimados.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
