import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '@/components/ui/Modal'
import { ordenesCompraService, type OrdenCompraPayload } from '@/services/ordenesCompra'
import { proyectosService } from '@/services/proyectos'
import { proveedoresService } from '@/services/proveedores'
import { materialesService } from '@/services/materiales'
import type { OrdenCompra } from '@/types'

const itemSchema = z.object({
  material_id:    z.coerce.number().optional(),
  descripcion:    z.string().min(1, 'Requerido'),
  unidad:         z.string().min(1, 'Requerido'),
  cantidad:       z.coerce.number().positive('Mayor a 0'),
  precio_unitario: z.coerce.number().positive('Mayor a 0'),
})

const CATEGORIAS_OC = ['MILLWORK', 'HARDWARE', 'PAINT', 'SOLID WOOD', 'EDGE BANDING', 'METAL', 'LAMINATE', 'GLASS', 'OTHER']

const schema = z.object({
  proyecto_id:            z.coerce.number({ required_error: 'Selecciona un proyecto' }).positive('Requerido'),
  proveedor_id:           z.coerce.number({ required_error: 'Selecciona un proveedor' }).positive('Requerido'),
  estado:                 z.enum(['borrador', 'enviada', 'confirmada', 'parcial', 'recibida', 'cancelada', 'en_transito']),
  fecha_emision:          z.string().min(1, 'Requerido'),
  fecha_entrega_estimada: z.string().optional(),
  fecha_mto:              z.string().optional(),
  categoria:              z.string().optional(),
  notas:                  z.string().optional(),
  items:                  z.array(itemSchema).min(1, 'Agrega al menos un artículo'),
})

type FormValues = z.infer<typeof schema>

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)

interface Props {
  open: boolean
  onClose: () => void
  orden?: OrdenCompra
}

const UNIDADES = ['pza', 'm²', 'm³', 'ml', 'kg', 'lt', 'par', 'jgo', 'cja', 'rollo']

export default function OrdenCompraForm({ open, onClose, orden }: Props) {
  const qc = useQueryClient()
  const isEdit = !!orden

  const { data: proyectos } = useQuery({
    queryKey: ['proyectos-select'],
    queryFn: () => proyectosService.getAll({ limit: 200 }),
    enabled: open,
  })
  const { data: proveedores } = useQuery({
    queryKey: ['proveedores-select'],
    queryFn: () => proveedoresService.getAll({ limit: 200 }),
    enabled: open,
  })
  const { data: materiales } = useQuery({
    queryKey: ['materiales-select'],
    queryFn: () => materialesService.getAll({ limit: 500 }),
    enabled: open,
  })

  const today = new Date().toISOString().slice(0, 10)

  const { register, handleSubmit, control, watch, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: orden
      ? {
          proyecto_id:            orden.proyecto_id,
          proveedor_id:           orden.proveedor_id,
          estado:                 orden.estado,
          fecha_emision:          orden.fecha_emision?.slice(0, 10) ?? today,
          fecha_entrega_estimada: orden.fecha_entrega_estimada?.slice(0, 10) ?? '',
          fecha_mto:              orden.fecha_mto?.slice(0, 10) ?? '',
          categoria:              orden.categoria ?? '',
          notas:                  orden.notas ?? '',
          items: orden.items?.map((i) => ({
            material_id:    i.material_id ?? undefined,
            descripcion:    i.descripcion,
            unidad:         i.unidad,
            cantidad:       i.cantidad,
            precio_unitario: i.precio_unitario,
          })) ?? [{ descripcion: '', unidad: '', cantidad: 0, precio_unitario: 0 }],
        }
      : {
          estado: 'borrador',
          fecha_emision: today,
          fecha_mto: '',
          categoria: '',
          items: [{ descripcion: '', unidad: '', cantidad: 0, precio_unitario: 0 }],
        },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchItems = watch('items')

  const subtotal = watchItems?.reduce((s, i) => s + (Number(i.cantidad) * Number(i.precio_unitario)), 0) ?? 0
  const iva = subtotal * 0.16
  const total = subtotal + iva

  const mutation = useMutation({
    mutationFn: (data: FormValues) => {
      const payload: OrdenCompraPayload = {
        proyecto_id:            data.proyecto_id,
        proveedor_id:           data.proveedor_id,
        estado:                 data.estado,
        fecha_emision:          data.fecha_emision,
        fecha_entrega_estimada: data.fecha_entrega_estimada,
        fecha_mto:              data.fecha_mto || undefined,
        categoria:              data.categoria,
        notas:                  data.notas,
        items:                  data.items,
      }
      return isEdit
        ? ordenesCompraService.update(orden!.id, payload)
        : ordenesCompraService.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ordenes-compra'] })
      toast.success(isEdit ? 'Orden actualizada' : 'Orden de compra creada')
      reset()
      onClose()
    },
  })

  const handleClose = () => { reset(); onClose() }

  const onMaterialChange = (idx: number, materialId: string, setValue: (path: `items.${number}.descripcion` | `items.${number}.unidad` | `items.${number}.precio_unitario`, val: string | number) => void) => {
    const mat = materiales?.data?.find((m) => m.id === parseInt(materialId))
    if (mat) {
      setValue(`items.${idx}.descripcion`, mat.descripcion)
      setValue(`items.${idx}.unidad`, mat.unidad)
      setValue(`items.${idx}.precio_unitario`, mat.unit_price ?? 0)
    }
  }

  return (
    <Modal open={open} onClose={handleClose}
      title={isEdit ? `Editar Orden ${orden?.numero}` : 'Nueva Orden de Compra'}
      size="xl">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5">

        {/* Encabezado */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Proyecto *</label>
            <select {...register('proyecto_id')} className="input">
              <option value="">Seleccionar proyecto…</option>
              {proyectos?.data?.map((p) => (
                <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
              ))}
            </select>
            {errors.proyecto_id && <p className="text-red-500 text-xs mt-1">{errors.proyecto_id.message}</p>}
          </div>
          <div>
            <label className="label">Proveedor *</label>
            <select {...register('proveedor_id')} className="input">
              <option value="">Seleccionar proveedor…</option>
              {proveedores?.data?.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </select>
            {errors.proveedor_id && <p className="text-red-500 text-xs mt-1">{errors.proveedor_id.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Estado</label>
            <select {...register('estado')} className="input">
              {(['borrador','enviada','confirmada','parcial','recibida','cancelada'] as const).map((e) => (
                <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Fecha Emisión (Fecha OC) *</label>
            <input type="date" {...register('fecha_emision')} className="input" />
            {errors.fecha_emision && <p className="text-red-500 text-xs mt-1">{errors.fecha_emision.message}</p>}
          </div>
          <div>
            <label className="label">ETA / Entrega Estimada</label>
            <input type="date" {...register('fecha_entrega_estimada')} className="input" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Fecha MTO</label>
            <input type="date" {...register('fecha_mto')} className="input" />
          </div>
          <div>
            <label className="label">Categoría</label>
            <select {...register('categoria')} className="input">
              <option value="">— Sin categoría —</option>
              {CATEGORIAS_OC.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Tabla de items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Artículos *</label>
            <button type="button" onClick={() => append({ descripcion: '', unidad: '', cantidad: 1, precio_unitario: 0 })}
              className="btn-outline py-1 text-xs">
              <Plus size={13} /> Agregar línea
            </button>
          </div>

          {errors.items?.root && (
            <p className="text-red-500 text-xs mb-2">{errors.items.root.message}</p>
          )}

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="px-3 py-2 text-left w-44">Material</th>
                  <th className="px-3 py-2 text-left">Descripción</th>
                  <th className="px-3 py-2 text-left w-24">Unidad</th>
                  <th className="px-3 py-2 text-right w-24">Cantidad</th>
                  <th className="px-3 py-2 text-right w-28">P. Unitario</th>
                  <th className="px-3 py-2 text-right w-28">Subtotal</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {fields.map((field, idx) => {
                  const cant = Number(watchItems?.[idx]?.cantidad ?? 0)
                  const pu   = Number(watchItems?.[idx]?.precio_unitario ?? 0)
                  return (
                    <tr key={field.id} className="border-t border-gray-100">
                      <td className="px-2 py-1.5">
                        <Controller
                          control={control}
                          name={`items.${idx}.material_id`}
                          render={({ field: f }) => (
                            <select
                              value={f.value ?? ''}
                              onChange={(e) => {
                                f.onChange(e.target.value ? parseInt(e.target.value) : undefined)
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                onMaterialChange(idx, e.target.value, (path, val) => (f as any).setValue?.(path, val))
                              }}
                              className="input text-xs py-1"
                            >
                              <option value="">— libre —</option>
                              {materiales?.data?.map((m) => (
                                <option key={m.id} value={m.id}>{m.codigo}</option>
                              ))}
                            </select>
                          )}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input {...register(`items.${idx}.descripcion`)}
                          className="input text-xs py-1"
                          placeholder="Descripción" />
                        {errors.items?.[idx]?.descripcion && (
                          <p className="text-red-500 text-xs">{errors.items[idx]?.descripcion?.message}</p>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <select {...register(`items.${idx}.unidad`)} className="input text-xs py-1">
                          <option value="">—</option>
                          {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" step="0.001" {...register(`items.${idx}.cantidad`)}
                          className="input text-xs py-1 text-right" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" step="0.01" {...register(`items.${idx}.precio_unitario`)}
                          className="input text-xs py-1 text-right" />
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">
                        {fmtCurrency(cant * pu)}
                      </td>
                      <td className="px-2 py-1.5">
                        {fields.length > 1 && (
                          <button type="button" onClick={() => remove(idx)}
                            className="p-1 text-gray-400 hover:text-red-500">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Totales */}
          <div className="flex justify-end mt-3 pr-10">
            <div className="space-y-1 text-sm min-w-48">
              <div className="flex justify-between gap-8 text-gray-600">
                <span>Subtotal</span>
                <span className="tabular-nums">{fmtCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between gap-8 text-gray-600">
                <span>IVA 16%</span>
                <span className="tabular-nums">{fmtCurrency(iva)}</span>
              </div>
              <div className="flex justify-between gap-8 font-semibold text-forest-700 border-t border-gray-200 pt-1">
                <span>Total</span>
                <span className="tabular-nums">{fmtCurrency(total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="label">Notas</label>
          <textarea {...register('notas')} rows={2} className="input resize-none"
            placeholder="Condiciones de pago, instrucciones de entrega…" />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={handleClose} className="btn-ghost">Cancelar</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar Cambios' : 'Crear Orden'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
