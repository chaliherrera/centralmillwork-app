import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  FileText, Plus, Trash2, Pencil, ArrowLeft, Check, Search, Loader2,
} from 'lucide-react'
import { informesService } from '@/services/informes'
import type { Informe, SeleccionProyecto } from '@/services/informes'
import { proyectosService } from '@/services/proyectos'
import type { Proyecto, User } from '@/types'
import { useAuth } from '@/context/AuthContext'
import MaterialesPorItemTab from '@/components/proyecto/MaterialesPorItemTab'

type Vista =
  | { modo: 'lista' }
  | { modo: 'armar'; base: Informe | null }
  | { modo: 'ver'; informe: Informe }

const puedeEditar = (user: User | null, inf: Informe) =>
  !!user && (user.rol === 'ADMIN' || user.id === inf.created_by)

export default function Informes() {
  const { user } = useAuth()
  const [vista, setVista] = useState<Vista>({ modo: 'lista' })

  if (vista.modo === 'ver')
    return <Consolidado informe={vista.informe}
      onVolver={() => setVista({ modo: 'lista' })}
      onEditar={() => setVista({ modo: 'armar', base: vista.informe })} />
  if (vista.modo === 'armar')
    return <Armador base={vista.base} onListo={() => setVista({ modo: 'lista' })}
      onCancelar={() => setVista({ modo: 'lista' })} />
  return <Lista user={user}
    onNuevo={() => setVista({ modo: 'armar', base: null })}
    onVer={(i) => setVista({ modo: 'ver', informe: i })}
    onEditar={(i) => setVista({ modo: 'armar', base: i })} />
}

// ─── Lista de informes guardados ─────────────────────────────────────────────
function Lista({ user, onNuevo, onVer, onEditar }: {
  user: User | null
  onNuevo: () => void; onVer: (i: Informe) => void; onEditar: (i: Informe) => void
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['informes'], queryFn: () => informesService.getAll() })
  const del = useMutation({
    mutationFn: (id: number) => informesService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['informes'] }),
  })
  const informes = data?.data ?? []

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <FileText size={20} className="text-forest-700" /> Informes
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Armá informes de materiales cruzando varios proyectos e ítems.</p>
        </div>
        <button onClick={onNuevo}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-forest-700 text-white text-sm font-medium hover:bg-forest-800">
          <Plus size={16} /> Nuevo informe
        </button>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-400 py-12">Cargando…</div>
      ) : informes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <FileText size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">Todavía no hay informes guardados.</p>
          <button onClick={onNuevo} className="mt-3 text-sm text-forest-700 font-medium hover:underline">Armá el primero →</button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {informes.map((inf) => {
            const nProy = inf.seleccion.length
            const nItems = inf.seleccion.reduce((s, x) => s + (x.items.length || 0), 0)
            return (
              <div key={inf.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2">
                <button onClick={() => onVer(inf)} className="text-left">
                  <h3 className="font-semibold text-gray-800 hover:text-forest-700">{inf.nombre}</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {nProy} proyecto{nProy !== 1 ? 's' : ''} · {nItems > 0 ? `${nItems} ítems elegidos` : 'todos los ítems'}
                    {inf.creado_por_nombre && <> · por {inf.creado_por_nombre}</>}
                  </p>
                </button>
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={() => onVer(inf)} className="text-xs font-medium text-forest-700 hover:underline">Abrir</button>
                  {puedeEditar(user, inf) && <>
                    <button onClick={() => onEditar(inf)} className="text-xs text-gray-500 hover:text-forest-700 inline-flex items-center gap-1"><Pencil size={12} /> Editar</button>
                    <button onClick={() => { if (confirm(`¿Borrar el informe "${inf.nombre}"?`)) del.mutate(inf.id) }}
                      className="text-xs text-gray-400 hover:text-red-600 inline-flex items-center gap-1 ml-auto"><Trash2 size={12} /> Borrar</button>
                  </>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Armador (selección de proyectos + ítems) ────────────────────────────────
function Armador({ base, onListo, onCancelar }: {
  base: Informe | null; onListo: () => void; onCancelar: () => void
}) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState(base?.nombre ?? '')
  const [busca, setBusca] = useState('')
  // Map proyecto_id -> items ([] = todos)
  const [sel, setSel] = useState<Map<number, string[]>>(
    () => new Map((base?.seleccion ?? []).map((s) => [s.proyecto_id, s.items]))
  )
  const [abierto, setAbierto] = useState<number | null>(null)   // proyecto con el picker de ítems abierto

  const { data: proyData } = useQuery({
    queryKey: ['informes-proyectos'],
    queryFn: () => proyectosService.getAll({ page: 1, limit: 300 }),
  })
  const proyectos = (proyData?.data ?? []) as Proyecto[]
  const filtrados = proyectos.filter((p) =>
    `${p.codigo} ${p.nombre}`.toLowerCase().includes(busca.toLowerCase()))

  const guardar = useMutation({
    mutationFn: () => {
      const seleccion: SeleccionProyecto[] = Array.from(sel.entries()).map(([proyecto_id, items]) => ({ proyecto_id, items }))
      const body = { nombre: nombre.trim(), seleccion }
      return base ? informesService.update(base.id, body) : informesService.create(body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['informes'] }); onListo() },
  })

  const toggleProy = (id: number) => setSel((prev) => {
    const next = new Map(prev)
    if (next.has(id)) next.delete(id); else next.set(id, [])
    return next
  })
  const setItems = (id: number, items: string[]) => setSel((prev) => new Map(prev).set(id, items))

  const puedeGuardar = nombre.trim().length > 0 && sel.size > 0 && !guardar.isPending

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <button onClick={onCancelar} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-forest-700">
        <ArrowLeft size={15} /> Volver a informes
      </button>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="text-lg font-bold text-gray-800">{base ? 'Editar informe' : 'Nuevo informe'}</h2>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Nombre del informe</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120}
            placeholder="Ej: Prioridades semana 10-nov"
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-forest-300" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-500">Proyectos e ítems ({sel.size} elegidos)</label>
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar proyecto…"
                className="text-xs pl-7 pr-2 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-forest-300 w-48" />
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
            {filtrados.map((p) => {
              const marcado = sel.has(p.id)
              const items = sel.get(p.id) ?? []
              return (
                <div key={p.id} className={clsx('px-3 py-2', marcado && 'bg-forest-50/40')}>
                  <div className="flex items-center gap-2.5">
                    <button onClick={() => toggleProy(p.id)}
                      className={clsx('w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                        marcado ? 'bg-forest-600 border-forest-600 text-white' : 'border-gray-300')}>
                      {marcado && <Check size={12} />}
                    </button>
                    <span className="font-mono text-xs font-semibold text-gray-500">{p.codigo}</span>
                    <span className="text-sm text-gray-700 truncate flex-1">{p.nombre}</span>
                    {marcado && (
                      <button onClick={() => setAbierto(abierto === p.id ? null : p.id)}
                        className="text-[11px] text-forest-700 font-medium hover:underline flex-shrink-0">
                        {items.length ? `${items.length} ítems` : 'todos los ítems'} · elegir
                      </button>
                    )}
                  </div>
                  {marcado && abierto === p.id && (
                    <ItemPicker proyectoId={p.id} seleccionados={items} onChange={(it) => setItems(p.id, it)} />
                  )}
                </div>
              )
            })}
            {filtrados.length === 0 && <div className="px-3 py-6 text-center text-xs text-gray-400">Sin proyectos</div>}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button disabled={!puedeGuardar} onClick={() => guardar.mutate()}
            className={clsx('inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
              puedeGuardar ? 'bg-forest-700 text-white hover:bg-forest-800' : 'bg-gray-200 text-gray-400 cursor-not-allowed')}>
            {guardar.isPending && <Loader2 size={15} className="animate-spin" />}
            {base ? 'Guardar cambios' : 'Crear informe'}
          </button>
          <button onClick={onCancelar} className="text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
          {guardar.isError && <span className="text-xs text-red-600">No se pudo guardar.</span>}
        </div>
      </div>
    </div>
  )
}

// Selector de ítems de un proyecto (lee los ítems reales del MTO)
function ItemPicker({ proyectoId, seleccionados, onChange }: {
  proyectoId: number; seleccionados: string[]; onChange: (items: string[]) => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['proyecto-detalle', proyectoId, 'items-readiness'],
    queryFn: () => proyectosService.getItemsReadiness(proyectoId),
    staleTime: 60_000,
  })
  const items = useMemo(() => (data?.data?.items ?? []).map((i) => i.item), [data])
  const set = new Set(seleccionados)
  const toggle = (it: string) => {
    const next = new Set(set); next.has(it) ? next.delete(it) : next.add(it)
    onChange(Array.from(next))
  }
  if (isLoading) return <div className="pl-7 pt-2 text-[11px] text-gray-400">Cargando ítems…</div>
  return (
    <div className="pl-7 pt-2 flex flex-wrap gap-1.5 items-center">
      <button onClick={() => onChange([])}
        className={clsx('text-[11px] px-2 py-0.5 rounded-full border',
          set.size === 0 ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-gray-500 border-gray-200')}>
        Todos
      </button>
      {items.map((it) => (
        <button key={it} onClick={() => toggle(it)}
          className={clsx('text-[11px] px-2 py-0.5 rounded-full border font-mono',
            set.has(it) ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-gray-600 border-gray-200 hover:border-forest-300')}>
          {it}
        </button>
      ))}
    </div>
  )
}

// ─── Vista consolidada (en vivo) ─────────────────────────────────────────────
function Consolidado({ informe, onVolver, onEditar }: {
  informe: Informe; onVolver: () => void; onEditar: () => void
}) {
  const { user } = useAuth()
  const { data: proyData } = useQuery({
    queryKey: ['informes-proyectos'],
    queryFn: () => proyectosService.getAll({ page: 1, limit: 300 }),
  })
  const byId = new Map((((proyData?.data ?? []) as Proyecto[]).map((p) => [p.id, p])))

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <button onClick={onVolver} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-forest-700">
        <ArrowLeft size={15} /> Volver a informes
      </button>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <FileText size={20} className="text-forest-700" /> {informe.nombre}
        </h1>
        {puedeEditar(user, informe) && (
          <button onClick={onEditar} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-forest-700">
            <Pencil size={14} /> Editar selección
          </button>
        )}
      </div>

      {informe.seleccion.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
          Este informe no tiene proyectos. <button onClick={onEditar} className="text-forest-700 hover:underline">Editá la selección</button>.
        </div>
      )}

      <div className="space-y-6">
        {informe.seleccion.map((s) => {
          const p = byId.get(s.proyecto_id)
          return (
            <div key={s.proyecto_id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <MaterialesPorItemTab
                proyectoId={s.proyecto_id}
                selectedItems={s.items}
                compact
                titulo={p ? { codigo: p.codigo, nombre: p.nombre } : undefined}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
