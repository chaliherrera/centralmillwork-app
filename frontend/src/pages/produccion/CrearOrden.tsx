import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowLeft, Loader2, MapPin, Plus, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { produccionService } from '@/services/produccion'
import { proyectosService } from '@/services/proyectos'
import MaterialesItem from '@/components/produccion/MaterialesItem'
import type { Prioridad, RutaCalculada } from '@/types/produccion'

const ESTACIONES_DISPONIBLES = [
  { value: 'cnc',           label: 'CNC',           desc: 'Maquinado' },
  { value: 'edge_banding',  label: 'Edge Banding',  desc: 'Maquinado' },
  { value: 'lamina',        label: 'Lámina',        desc: 'Acabado' },
  { value: 'pintura',       label: 'Pintura',       desc: 'Acabado' },
  { value: 'assembly',      label: 'Assembly',      desc: 'Ensamblaje' },
  { value: 'final',         label: 'Final QC',      desc: 'QC' },
  { value: 'registro',      label: 'Registro',      desc: 'Logística' },
  { value: 'shipping',      label: 'Shipping',      desc: 'Logística' },
]

const PRIORIDADES: Prioridad[] = ['Alta', 'Media', 'Baja']

export default function CrearOrden() {
  const nav = useNavigate()

  // Datos básicos
  const [numeroOrden, setNumeroOrden] = useState('')
  const [proyectoId, setProyectoId]   = useState<number | null>(null)
  const [numeroItem, setNumeroItem]   = useState('')
  const [cantidad, setCantidad]       = useState<number>(1)
  const [unidad, setUnidad]           = useState('Piezas')
  const [especificaciones, setEspecificaciones] = useState('')
  const [prioridad, setPrioridad]     = useState<Prioridad>('Media')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [tiempoEstimado, setTiempoEstimado] = useState<number | ''>('')
  const [notas, setNotas]             = useState('')

  // Procesos seleccionados + asignaciones por estación
  const [procesos, setProcesos]       = useState<string[]>([])
  const [asignaciones, setAsignaciones] = useState<Record<string, number | null>>({})

  const { data: proyectosData } = useQuery({
    queryKey: ['proyectos-list'],
    queryFn:  () => proyectosService.getAll({ limit: 200 }),
  })

  const { data: personal = [] } = useQuery({
    queryKey: ['personal-taller', 'activos'],
    queryFn:  () => produccionService.personal({ activo: true }),
  })

  // Personal candidato por estación (operario activo asignado a esa estación)
  function personalDeEstacion(estacion: string) {
    return personal.filter((p) =>
      p.estaciones.some((e) => e.estacion === estacion && e.activo)
    )
  }

  // Ruta preview: la calculamos cuando hay al menos un proceso seleccionado
  const procesosKey = procesos.join('|')
  const asignacionesKey = JSON.stringify(asignaciones)
  const { data: ruta } = useQuery<RutaCalculada>({
    queryKey: ['ruta-preview', procesosKey, asignacionesKey],
    queryFn:  () => produccionService.rutaPreview(procesos, asignaciones),
    enabled:  procesos.length > 0,
    staleTime: 30_000,
  })

  function toggleProceso(estacion: string) {
    setProcesos((prev) => prev.includes(estacion)
      ? prev.filter((e) => e !== estacion)
      : [...prev, estacion]
    )
    if (procesos.includes(estacion)) {
      // Si se desmarca, limpiar la asignación de esa estación
      setAsignaciones((prev) => {
        const n = { ...prev }
        delete n[estacion]
        return n
      })
    }
  }

  function setAsignacion(estacion: string, personalId: number | null) {
    setAsignaciones((prev) => ({ ...prev, [estacion]: personalId }))
  }

  const crear = useMutation({
    mutationFn: () => produccionService.crearOrden({
      numero_orden: numeroOrden.trim(),
      proyecto_id: proyectoId,
      numero_item: numeroItem.trim(),
      cantidad,
      unidad,
      especificaciones: especificaciones.trim() || undefined,
      prioridad,
      fecha_entrega: fechaEntrega || null,
      tiempo_estimado_horas: tiempoEstimado === '' ? null : Number(tiempoEstimado),
      notas: notas.trim() || undefined,
      procesos,
      asignaciones,
    }),
    onSuccess: (res) => {
      toast.success(res.message)
      nav(`/produccion/ordenes/${res.data.id}`)
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!numeroOrden.trim() || !numeroItem.trim() || procesos.length === 0) {
      toast.error('Completá número de orden, número de item y al menos un proceso')
      return
    }
    if (!/^\d+$/.test(numeroItem.trim())) {
      toast.error('El número de item debe ser solo dígitos (ej. 1, 12)')
      return
    }
    crear.mutate()
  }

  const proyectos = proyectosData?.data ?? []

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => nav('/produccion/ordenes')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={18} />
        </button>
        <h1>Nueva orden de producción</h1>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Columna principal — datos */}
        <div className="lg:col-span-2 space-y-4">
          {/* Datos básicos */}
          <div className="card space-y-4">
            <h3>Datos del item</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">N° de orden *</label>
                <input
                  type="text" value={numeroOrden}
                  onChange={(e) => setNumeroOrden(e.target.value.toUpperCase())}
                  required placeholder="OP-26-001" className="input w-full"
                />
              </div>
              <div>
                <label className="label">Proyecto</label>
                <select
                  value={proyectoId ?? ''}
                  onChange={(e) => setProyectoId(e.target.value ? parseInt(e.target.value) : null)}
                  className="input w-full"
                >
                  <option value="">— sin proyecto —</option>
                  {proyectos.map((p) => (
                    <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Número de item *</label>
              <input
                type="text" inputMode="numeric" value={numeroItem}
                onChange={(e) => setNumeroItem(e.target.value.replace(/[^\d]/g, ''))}
                required placeholder="Ej: 12" className="input w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Número de item del MTO. Para referencias adicionales usá Especificaciones.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Cantidad *</label>
                <input
                  type="number" value={cantidad} min={1}
                  onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                  required className="input w-full"
                />
              </div>
              <div>
                <label className="label">Unidad</label>
                <input
                  type="text" value={unidad} onChange={(e) => setUnidad(e.target.value)}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="label">Tiempo estimado (h)</label>
                <input
                  type="number" step="0.5" min={0} value={tiempoEstimado}
                  onChange={(e) => setTiempoEstimado(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input w-full" placeholder="—"
                />
              </div>
            </div>

            <div>
              <label className="label">Especificaciones</label>
              <textarea
                value={especificaciones} onChange={(e) => setEspecificaciones(e.target.value)}
                rows={2} className="input w-full" placeholder="Detalles técnicos…"
              />
            </div>
          </div>

          {/* Procesos */}
          <div className="card space-y-3">
            <h3>Procesos requeridos *</h3>
            <p className="text-sm text-gray-500">Tildá las estaciones que el item debe atravesar. El orden lo determina el flujo del taller.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {ESTACIONES_DISPONIBLES.map((est) => (
                <label
                  key={est.value}
                  className={clsx(
                    'flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-all',
                    procesos.includes(est.value)
                      ? 'border-gold-500 bg-gold-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={procesos.includes(est.value)}
                    onChange={() => toggleProceso(est.value)}
                    className="mt-0.5 rounded"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{est.label}</div>
                    <div className="text-xs text-gray-500">{est.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Asignaciones por estación seleccionada */}
          {procesos.length > 0 && (
            <div className="card space-y-3">
              <h3>Asignación de operarios (opcional)</h3>
              <p className="text-sm text-gray-500">
                Pre-asigná un operario por estación. Si dejás "automático", el SHOP_MANAGER puede asignar después.
              </p>
              <div className="space-y-2">
                {procesos.map((est) => {
                  const candidatos = personalDeEstacion(est)
                  return (
                    <div key={est} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                      <span className="font-medium uppercase text-sm w-32 text-gray-700">
                        {est.replace('_', ' ')}
                      </span>
                      <select
                        value={asignaciones[est] ?? ''}
                        onChange={(e) => setAsignacion(est, e.target.value ? parseInt(e.target.value) : null)}
                        className="input flex-1"
                      >
                        <option value="">— automático —</option>
                        {candidatos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre_completo} ({p.iniciales})
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Detalles finales */}
          <div className="card space-y-3">
            <h3>Prioridad y entrega</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Prioridad</label>
                <div className="flex gap-1">
                  {PRIORIDADES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPrioridad(p)}
                      className={clsx(
                        'flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors border',
                        prioridad === p
                          ? p === 'Alta' ? 'bg-red-100 text-red-800 border-red-300'
                          : p === 'Media' ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-gray-100 text-gray-700 border-gray-300'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className="label">Fecha de entrega</label>
                <input
                  type="date" value={fechaEntrega}
                  onChange={(e) => setFechaEntrega(e.target.value)}
                  className="input w-full"
                />
              </div>
            </div>
            <div>
              <label className="label">Notas</label>
              <textarea
                value={notas} onChange={(e) => setNotas(e.target.value)}
                rows={2} className="input w-full"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => nav('/produccion/ordenes')} className="btn-ghost">
              Cancelar
            </button>
            <button type="submit" disabled={crear.isPending} className="btn-primary">
              {crear.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Crear orden
            </button>
          </div>
        </div>

        {/* Columna lateral — materiales del item + preview de ruta */}
        <div className="space-y-4">
          {proyectoId && /^\d+$/.test(numeroItem.trim()) ? (
            <MaterialesItem proyectoId={proyectoId} numeroItem={numeroItem} />
          ) : (
            <div className="card">
              <h3 className="flex items-center gap-2"><Package size={16} /> Materiales del item</h3>
              <p className="text-sm text-gray-400 italic mt-2">
                Elegí un proyecto e ingresá el número de item para ver si sus materiales
                están listos antes de crear la orden.
              </p>
            </div>
          )}
          <RutaPreview ruta={ruta} procesos={procesos} />
        </div>
      </form>
    </div>
  )
}

function RutaPreview({ ruta, procesos }: { ruta: RutaCalculada | undefined; procesos: string[] }) {
  return (
    <div className="lg:sticky lg:top-4 self-start">
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-gold-600" />
          <h3 className="!text-base">Ruta del taller</h3>
        </div>

        {procesos.length === 0 ? (
          <p className="text-sm text-gray-500">Tildá procesos para ver la ruta.</p>
        ) : !ruta ? (
          <p className="text-sm text-gray-400">Calculando…</p>
        ) : (
          <>
            <ol className="space-y-2">
              {ruta.ruta.map((paso) => (
                <li key={paso.paso} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-forest-700 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {paso.paso}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm uppercase">
                      {paso.estacion.replace('_', ' ')}
                    </div>
                    <div className="text-xs text-gray-500">
                      {paso.personal_nombre || 'Sin asignar'}
                      {paso.distancia_desde_anterior > 0 && (
                        <> · {paso.distancia_desde_anterior.toFixed(1)}m del anterior</>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-gray-500 uppercase">Distancia</div>
                <div className="font-semibold">{ruta.distancia_total_metros.toFixed(1)} m</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase">Traslados</div>
                <div className="font-semibold">{Math.round(ruta.tiempo_traslados_segundos / 60)} min</div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 italic">
              Distancias estimadas — pueden ajustarse desde Estaciones.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
