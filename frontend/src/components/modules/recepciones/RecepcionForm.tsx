import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import toast from 'react-hot-toast'
import Modal from '@/components/ui/Modal'
import { recepcionesService, type RecepcionPayload } from '@/services/recepciones'
import api from '@/services/api'

const itemSchema = z.object({
  item_orden_id:     z.number(),
  descripcion:       z.string(),
  unidad:            z.string(),
  cantidad_ordenada: z.number(),
  cantidad_recibida: z.coerce.number().min(0, 'Requerido'),
  observaciones:     z.string().optional(),
})

const schema = z.object({
  orden_compra_id:  z.coerce.number().positive('Selecciona una orden'),
  fecha_recepcion:  z.string().min(1, 'Requerido'),
  recibio:          z.string().min(1, 'Requerido'),
  notas:            z.string().optional(),
  items:            z.array(itemSchema),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  ordenId?: number
}

export default function RecepcionForm({ open, onClose, ordenId }: Props) {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)

  const { register, handleSubmit, watch, control, setValue, reset, formState: { errors } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        orden_compra_id: ordenId ?? 0,
        fecha_recepcion: today,
        recibio: '',
        items: [],
      },
    })

  const { fields, replace } = useFieldArray({ control, name: 'items' })
  const watchOrdenId = watch('orden_compra_id')

  // Cargar órdenes en estado enviada/confirmada/parcial
  const { data: ordenes } = useQuery({
    queryKey: ['ordenes-recepcionables'],
    queryFn: () => api.get('/ordenes-compra', {
      params: { limit: 200, estado: 'confirmada' },
    }).then((r) => r.data),
    enabled: open,
  })

  // Al cambiar la orden, cargar sus items
  const { data: ordenDetalle } = useQuery({
    queryKey: ['orden-detalle', watchOrdenId],
    queryFn: () => api.get(`/ordenes-compra/${watchOrdenId}`).then((r) => r.data),
    enabled: !!watchOrdenId && watchOrdenId > 0,
  })

  useEffect(() => {
    if (ordenDetalle?.data?.items) {
      replace(
        ordenDetalle.data.items.map((i: {
          id: number; descripcion: string; unidad: string; cantidad: number
        }) => ({
          item_orden_id:     i.id,
          descripcion:       i.descripcion,
          unidad:            i.unidad,
          cantidad_ordenada: i.cantidad,
          cantidad_recibida: i.cantidad,
          observaciones:     '',
        }))
      )
    }
  }, [ordenDetalle, replace])

  useEffect(() => {
    if (ordenId) setValue('orden_compra_id', ordenId)
  }, [ordenId, setValue])

  const mutation = useMutation({
    mutationFn: (data: FormValues) => {
      const payload: RecepcionPayload = {
        orden_compra_id: data.orden_compra_id,
        fecha_recepcion: data.fecha_recepcion,
        recibio:         data.recibio,
        notas:           data.notas,
        items:           data.items.map((i) => ({
          item_orden_id:     i.item_orden_id,
          cantidad_ordenada: i.cantidad_ordenada,
          cantidad_recibida: i.cantidad_recibida,
          observaciones:     i.observaciones,
        })),
      }
      return recepcionesService.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recepciones'] })
      qc.invalidateQueries({ queryKey: ['ordenes-compra'] })
      toast.success('Recepción registrada')
      reset()
      onClose()
    },
  })

  const handleClose = () => { reset(); onClose() }

  const watchItems = watch('items')

  return (
    <Modal open={open} onClose={handleClose} title="Registrar Recepción" size="xl">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Orden de Compra *</label>
            <select {...register('orden_compra_id')} className="input" disabled={!!ordenId}>
              <option value="">Seleccionar orden…</option>
              {ordenes?.data?.map((o: { id: number; numero: string; proveedor?: { nombre: string } }) => (
                <option key={o.id} value={o.id}>
                  {o.numero} — {o.proveedor?.nombre ?? ''}
                </option>
              ))}
            </select>
            {errors.orden_compra_id && (
              <p className="text-red-500 text-xs mt-1">{errors.orden_compra_id.message}</p>
            )}
          </div>
          <div>
            <label className="label">Fecha de Recepción *</label>
            <input type="date" {...register('fecha_recepcion')} className="input" />
            {errors.fecha_recepcion && (
              <p className="text-red-500 text-xs mt-1">{errors.fecha_recepcion.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="label">Recibió *</label>
          <input {...register('recibio')} className="input" placeholder="Nombre de quien recibe" />
          {errors.recibio && <p className="text-red-500 text-xs mt-1">{errors.recibio.message}</p>}
        </div>

        {/* Tabla de items */}
        {fields.length > 0 && (
          <div>
            <label className="label">Artículos de la Orden</label>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <th className="px-3 py-2 text-left">Descripción</th>
                    <th className="px-3 py-2 text-center w-20">Unidad</th>
                    <th className="px-3 py-2 text-right w-28">Ordenado</th>
                    <th className="px-3 py-2 text-right w-28">Recibido *</th>
                    <th className="px-3 py-2 text-right w-20">Dif.</th>
                    <th className="px-3 py-2 text-left w-40">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, idx) => {
                    const ordenado  = Number(watchItems?.[idx]?.cantidad_ordenada ?? 0)
                    const recibido  = Number(watchItems?.[idx]?.cantidad_recibida ?? 0)
                    const diferencia = recibido - ordenado
                    const diffColor  = diferencia < 0 ? 'text-red-600' : diferencia > 0 ? 'text-amber-600' : 'text-green-600'
                    return (
                      <tr key={field.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-xs text-gray-700">{field.descripcion}</td>
                        <td className="px-3 py-2 text-center text-xs text-gray-500">{field.unidad}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{ordenado}</td>
                        <td className="px-2 py-1.5">
                          <input type="number" step="0.001"
                            {...register(`items.${idx}.cantidad_recibida`)}
                            className="input text-xs py-1 text-right" />
                        </td>
                        <td className={`px-3 py-2 text-right text-xs font-medium tabular-nums ${diffColor}`}>
                          {diferencia > 0 ? `+${diferencia.toFixed(3)}` : diferencia.toFixed(3)}
                        </td>
                        <td className="px-2 py-1.5">
                          <input {...register(`items.${idx}.observaciones`)}
                            className="input text-xs py-1" placeholder="Notas…" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {watchOrdenId > 0 && fields.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            Cargando artículos de la orden…
          </p>
        )}

        <div>
          <label className="label">Notas Generales</label>
          <textarea {...register('notas')} rows={2} className="input resize-none"
            placeholder="Observaciones generales de la entrega…" />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={handleClose} className="btn-ghost">Cancelar</button>
          <button type="submit" disabled={mutation.isPending || fields.length === 0} className="btn-primary">
            {mutation.isPending ? 'Guardando…' : 'Registrar Recepción'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
