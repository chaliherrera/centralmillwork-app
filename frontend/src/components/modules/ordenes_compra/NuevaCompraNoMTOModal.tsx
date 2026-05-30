import { useEffect } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, AlertTriangle, ShoppingCart, Wrench } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import { ordenesCompraService } from '@/services/ordenesCompra'
import { proyectosService } from '@/services/proyectos'
import { proveedoresService } from '@/services/proveedores'
import { useAuth } from '@/context/AuthContext'

// Categorías para compras vinculadas a proyectos (DIRECTA / URGENTE)
const CATEGORIAS_PROYECTO = ['MILLWORK', 'HARDWARE', 'PAINT', 'SOLID WOOD', 'EDGE BANDING', 'METAL', 'LAMINATE', 'GLASS', 'OTHER']

// Categorías para gastos OPERATIVOS del taller (sin proyecto)
const CATEGORIAS_OPERATIVAS = ['INSUMOS_TALLER', 'LIMPIEZA', 'OFICINA', 'ALIMENTACION', 'COMBUSTIBLE', 'MANTENIMIENTO', 'HERRAMIENTAS', 'OTROS']

const UNIDADES = ['EACH', 'SF', 'LF', 'SHT', 'GAL', 'LB', 'BOX', 'ROLL', 'SET', 'PR', 'pza', 'm²', 'm³', 'ml', 'kg', 'lt', 'par', 'jgo', 'cja']

const itemSchema = z.object({
  descripcion: z.string().min(1, 'Requerido').max(300),
  unidad:      z.string().min(1, 'Requerido'),
  qty:         z.coerce.number().positive('> 0'),
  unit_price:  z.coerce.number().positive('> 0'),
})

const schema = z.object({
  // Stored as string in the form; converted to number|null at submit time
  proyecto_id:            z.string().optional(),
  vendor:                 z.string().min(1, 'Requerido').max(200),
  origen:                 z.enum(['DIRECTA', 'URGENTE', 'OPERATIVA']),
  categoria:              z.string().optional(),
  fecha_entrega_estimada: z.string().optional(),
  notas:                  z.string().optional(),
  freight:                z.coerce.number().min(0, '≥ 0').optional(),
  items:                  z.array(itemSchema).min(1, 'Agregá al menos 1 ítem'),
})

type FormValues = z.infer<typeof schema>

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

interface Props {
  open: boolean
  onClose: () => void
  defaultProyectoId?: number | null
}

export default function NuevaCompraNoMTOModal({ open, onClose, defaultProyectoId }: Props) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.rol === 'ADMIN'

  const { data: proyectosData } = useQuery({
    queryKey: ['proyectos-select'],
    queryFn: () => proyectosService.getAll({ limit: 200 }),
    staleTime: 60_000,
  })
  const proyectos = proyectosData?.data ?? []

  const { data: proveedoresData } = useQuery({
    queryKey: ['proveedores-select'],
    queryFn: () => proveedoresService.getAll({ limit: 500 }),
    staleTime: 60_000,
  })
  const proveedores = proveedoresData?.data ?? []

  const defaultValues: FormValues = {
    proyecto_id:            defaultProyectoId ? String(defaultProyectoId) : '',
    vendor:                 '',
    origen:                 'DIRECTA',
    categoria:              '',
    fecha_entrega_estimada: '',
    notas:                  '',
    freight:                0,
    items: [{ descripcion: '', unidad: 'EACH', qty: 1, unit_price: 0 }],
  }

  const { register, handleSubmit, control, watch, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  // Reset form when modal opens (prevent stale data between opens)
  useEffect(() => {
    if (open) reset(defaultValues)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultProyectoId])

  // Live totals
  const watchItems   = watch('items')
  const watchOrigen  = watch('origen')
  const watchFreight = watch('freight')
  const subtotal = (watchItems ?? []).reduce(
    (s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
    0
  )
  const freightNum = Number(watchFreight) || 0
  const total = subtotal + freightNum

  const mutation = useMutation({
    mutationFn: (data: FormValues) => ordenesCompraService.crearNoMTO({
      // OPERATIVA fuerza proyecto_id=null y ETA=null (no aplican a gastos del taller)
      proyecto_id:            data.origen === 'OPERATIVA' ? null
                                : (data.proyecto_id && data.proyecto_id !== '' ? Number(data.proyecto_id) : null),
      vendor:                 data.vendor.trim(),
      origen:                 data.origen,
      fecha_entrega_estimada: data.origen === 'OPERATIVA' ? null : (data.fecha_entrega_estimada || null),
      categoria:              data.categoria || null,
      notas:                  data.notas || null,
      freight:                Number(data.freight) || 0,
      items:                  data.items.map((it) => ({
        descripcion: it.descripcion.trim(),
        unidad:      it.unidad,
        qty:         Number(it.qty),
        unit_price:  Number(it.unit_price),
      })),
    }),
    onSuccess: (res) => {
      toast.success(res.message ?? 'Compra creada')
      qc.invalidateQueries({ queryKey: ['ordenes-compra-kanban'], refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['oc-kpis'],               refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['oc-kpis-recepciones'],   refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['recepciones-ocs'],       refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['materiales'],            refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['materiales-all'],        refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['materiales-kpis'],       refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['proveedores-select'],    refetchType: 'all' })
      onClose()
      // Navegamos a la OC nueva para inspección inmediata.
      // OPERATIVA: ya queda como 'recibida' → aparece en EN EL TALLER del kanban.
      navigate(`/ordenes-compra?ocId=${res.data.id}`)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? 'Error al crear la compra')
    },
  })

  const handleClose = () => { reset(defaultValues); onClose() }

  const isOperativa = watchOrigen === 'OPERATIVA'
  const categorias  = isOperativa ? CATEGORIAS_OPERATIVAS : CATEGORIAS_PROYECTO
  const modalTitle  = isOperativa ? 'Registrar Gasto Operativo' : 'Nueva Compra SIN-MTO'

  return (
    <Modal open={open} onClose={handleClose} title={modalTitle} size="xl">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5">

        {/* Tipo de compra (radio) */}
        <div>
          <label className="label">Tipo de compra</label>
          <div className={clsx('grid gap-3', isAdmin ? 'grid-cols-3' : 'grid-cols-2')}>
            <label className={clsx(
              'flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors',
              watchOrigen === 'DIRECTA' ? 'border-cyan-400 bg-cyan-50' : 'border-gray-200 hover:border-gray-300'
            )}>
              <input type="radio" value="DIRECTA" {...register('origen')} className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <ShoppingCart size={16} className="text-cyan-600" />
                  <span className="text-sm font-semibold text-gray-800">DIRECTA</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Compra puntual fuera del MTO. Rutinaria.</p>
              </div>
            </label>
            <label className={clsx(
              'flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors',
              watchOrigen === 'URGENTE' ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'
            )}>
              <input type="radio" value="URGENTE" {...register('origen')} className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-600" />
                  <span className="text-sm font-semibold text-gray-800">URGENTE</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Crítica: rotura en obra, cliente parado, etc.</p>
              </div>
            </label>
            {/* OPERATIVA solo visible para ADMIN — control de gastos del taller */}
            {isAdmin && (
              <label className={clsx(
                'flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors',
                watchOrigen === 'OPERATIVA' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
              )}>
                <input type="radio" value="OPERATIVA" {...register('origen')} className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Wrench size={16} className="text-orange-600" />
                    <span className="text-sm font-semibold text-gray-800">OPERATIVA</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Gasto del taller (insumos, café, limpieza).</p>
                </div>
              </label>
            )}
          </div>
        </div>

        {/* Proyecto + Vendor — Proyecto oculto si es OPERATIVA */}
        <div className={clsx('grid gap-4', isOperativa ? 'grid-cols-1' : 'grid-cols-2')}>
          {!isOperativa && (
            <div>
              <label className="label">Proyecto</label>
              <select className="input w-full" {...register('proyecto_id')}>
                <option value="">— Sin proyecto —</option>
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label">Vendor *</label>
            <Controller
              control={control}
              name="vendor"
              render={({ field }) => (
                <>
                  <input
                    list="proveedores-list"
                    className="input w-full"
                    placeholder="Empezá a escribir..."
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                  <datalist id="proveedores-list">
                    {proveedores.map((p) => <option key={p.id} value={p.nombre} />)}
                  </datalist>
                </>
              )}
            />
            {errors.vendor && <p className="text-xs text-red-500 mt-1">{errors.vendor.message}</p>}
          </div>
        </div>

        {/* Categoría + ETA — ETA oculto si es OPERATIVA (gasto ya hecho, no se espera) */}
        <div className={clsx('grid gap-4', isOperativa ? 'grid-cols-1' : 'grid-cols-2')}>
          <div>
            <label className="label">Categoría {isOperativa && <span className="text-orange-600 text-xs">(gasto operativo)</span>}</label>
            <select className="input w-full" {...register('categoria')}>
              <option value="">— Sin categoría —</option>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {!isOperativa && (
            <div>
              <label className="label">ETA (fecha de entrega)</label>
              <input type="date" className="input w-full" {...register('fecha_entrega_estimada')} />
            </div>
          )}
        </div>

        {/* Notas */}
        <div>
          <label className="label">
            Notas
            {watchOrigen === 'URGENTE'   && <span className="text-red-500"> (recomendado para urgentes)</span>}
            {watchOrigen === 'OPERATIVA' && <span className="text-orange-600"> (qué se compró y para qué)</span>}
          </label>
          <textarea
            className="input w-full resize-none"
            rows={2}
            placeholder={isOperativa
              ? 'Ej: café y agua para el taller, semana del 15-mayo'
              : '¿Por qué fuera del MTO? — útil para auditoría'}
            {...register('notas')}
          />
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label !mb-0">Ítems a comprar *</label>
            <button
              type="button"
              onClick={() => append({ descripcion: '', unidad: 'EACH', qty: 1, unit_price: 0 })}
              className="text-xs text-forest-700 hover:text-gold-500 flex items-center gap-1"
            >
              <Plus size={14} /> Agregar línea
            </button>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-500 uppercase">
                  <th className="px-2 py-2 w-8">#</th>
                  <th className="px-2 py-2">Descripción</th>
                  <th className="px-2 py-2 w-24">Unidad</th>
                  <th className="px-2 py-2 w-20 text-right">Qty</th>
                  <th className="px-2 py-2 w-24 text-right">P. Unit</th>
                  <th className="px-2 py-2 w-24 text-right">Total</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, idx) => {
                  const itQty   = Number(watchItems?.[idx]?.qty) || 0
                  const itPrice = Number(watchItems?.[idx]?.unit_price) || 0
                  const itTotal = itQty * itPrice
                  return (
                    <tr key={field.id} className="border-t border-gray-100">
                      <td className="px-2 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-2 py-2">
                        <input className="input w-full !py-1" {...register(`items.${idx}.descripcion`)} placeholder="Descripción del material" />
                        {errors.items?.[idx]?.descripcion && <p className="text-xs text-red-500 mt-0.5">{errors.items[idx]?.descripcion?.message}</p>}
                      </td>
                      <td className="px-2 py-2">
                        <select className="input w-full !py-1" {...register(`items.${idx}.unidad`)}>
                          {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.01" min="0" className="input w-full !py-1 text-right" {...register(`items.${idx}.qty`)} />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.01" min="0" className="input w-full !py-1 text-right" {...register(`items.${idx}.unit_price`)} />
                      </td>
                      <td className="px-2 py-2 text-right text-gray-700 tabular-nums font-medium">
                        {fmt(itTotal)}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => fields.length > 1 && remove(idx)}
                          disabled={fields.length === 1}
                          className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30"
                          title="Eliminar línea"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {errors.items?.message && <p className="text-xs text-red-500 mt-1">{errors.items.message as string}</p>}
        </div>

        {/* Totales */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex justify-end">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 w-72 items-center text-sm tabular-nums">
              <span className="text-gray-500">Subtotal:</span>
              <span className="text-right">{fmt(subtotal)}</span>

              <label htmlFor="freight-input" className="text-gray-500 flex items-center gap-1">
                Freight:
              </label>
              <div className="flex items-center justify-end">
                <span className="text-gray-400 mr-1">$</span>
                <input
                  id="freight-input"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input !py-1 w-28 text-right"
                  placeholder="0.00"
                  {...register('freight')}
                />
              </div>
              {errors.freight && <span className="col-span-2 text-xs text-red-500 text-right">{errors.freight.message}</span>}

              <span className="font-semibold text-forest-700 border-t border-gray-200 pt-2">TOTAL:</span>
              <span className="text-right font-semibold text-forest-700 border-t border-gray-200 pt-2">{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={handleClose} className="btn-ghost">Cancelar</button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className={clsx(
              'px-4 py-2 rounded-lg text-white font-medium transition-colors',
              watchOrigen === 'URGENTE'   && 'bg-red-500 hover:bg-red-600',
              watchOrigen === 'DIRECTA'   && 'bg-gold-500 hover:bg-gold-600',
              watchOrigen === 'OPERATIVA' && 'bg-orange-600 hover:bg-orange-700',
              mutation.isPending && 'opacity-50 cursor-not-allowed'
            )}
          >
            {mutation.isPending
              ? 'Guardando…'
              : watchOrigen === 'URGENTE'   ? 'Crear OC Urgente'
              : watchOrigen === 'DIRECTA'   ? 'Crear OC Directa'
              :                                'Registrar Gasto Operativo'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
