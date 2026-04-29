import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Modal from '@/components/ui/Modal'
import { materialesService } from '@/services/materiales'
import { proyectosService } from '@/services/proyectos'
import type { Material } from '@/types'

const schema = z.object({
  // Empty string from select "Sin proyecto" must become null, not 0
  proyecto_id:  z.preprocess(
    (v) => (v === '' || v === '0' || v === 0 ? null : Number(v)),
    z.number().positive().nullable()
  ),
  item:         z.string().optional(),
  codigo:       z.string().optional(),
  vendor_code:  z.string().optional(),
  vendor:       z.string().optional(),
  descripcion:  z.string().min(1, 'Requerido').max(400),
  color:        z.string().optional(),
  categoria:    z.string().optional(),
  manufacturer: z.string().optional(),
  unidad:       z.string().min(1, 'Requerido').max(20),
  size:         z.string().optional(),
  qty:          z.coerce.number().min(0),
  unit_price:   z.coerce.number().min(0),
  total_price:  z.coerce.number().min(0),
  estado_cotiz: z.enum(['COTIZADO', 'PENDIENTE', 'EN_STOCK']),
  cotizar:      z.enum(['SI', 'NO', 'EN_STOCK']),
  // Empty string must become null so PostgreSQL DATE / TEXT columns don't get ''
  notas:             z.string().optional().nullable().transform((v) => v || null),
  fecha_importacion: z.string().optional().nullable().transform((v) => v || null),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  material?: Material
  defaultProyectoId?: number
}

const UNIDADES = ['EACH', 'SF', 'LF', 'SHT', 'GAL', 'LB', 'BOX', 'ROLL', 'SET', 'PR']
const CATEGORIAS = ['MILLWORK', 'HARDWARE', 'PAINT', 'SOLID WOOD', 'EDGE BANDING', 'METAL', 'LAMINATE', 'GLASS', 'OTHER']

export default function MaterialForm({ open, onClose, material, defaultProyectoId }: Props) {
  const qc = useQueryClient()
  const isEdit = !!material

  const defaultValues: FormValues = material
    ? {
        proyecto_id:  material.proyecto_id,
        item:         material.item ?? '',
        codigo:       material.codigo ?? '',
        vendor_code:  material.vendor_code ?? '',
        vendor:       material.vendor ?? '',
        descripcion:  material.descripcion,
        color:        material.color ?? '',
        categoria:    material.categoria ?? '',
        manufacturer: material.manufacturer ?? '',
        unidad:       material.unidad ?? 'EACH',
        size:         material.size ?? '',
        qty:          Number(material.qty) || 0,
        unit_price:   Number(material.unit_price) || 0,
        total_price:  Number(material.total_price) || 0,
        estado_cotiz:      material.estado_cotiz ?? 'PENDIENTE',
        cotizar:           material.cotizar ?? 'SI',
        notas:             material.notas ?? '',
        fecha_importacion: material.fecha_importacion
          ? material.fecha_importacion.slice(0, 10)
          : '',
      }
    : {
        proyecto_id:       defaultProyectoId ?? null,
        item:              '',
        codigo:            '',
        vendor_code:       '',
        vendor:            '',
        descripcion:       '',
        color:             '',
        categoria:         '',
        manufacturer:      '',
        unidad:            'EACH',
        size:              '',
        qty:               0,
        unit_price:        0,
        total_price:       0,
        estado_cotiz:      'PENDIENTE',
        cotizar:           'SI',
        notas:             '',
        fecha_importacion: '',
      }

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues,
  })

  // Reset form to current material whenever the modal opens
  useEffect(() => {
    if (open) reset(defaultValues)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Auto-calculate total when qty or unit_price changes
  const qty = watch('qty')
  const unit_price = watch('unit_price')
  useEffect(() => {
    const total = Number(qty || 0) * Number(unit_price || 0)
    setValue('total_price', parseFloat(total.toFixed(2)))
  }, [qty, unit_price, setValue])

  const { data: proyectosData } = useQuery({
    queryKey: ['proyectos-select'],
    queryFn: () => proyectosService.getAll({ limit: 50 }),
    staleTime: 60_000,
  })

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      isEdit
        ? materialesService.update(material!.id, data)
        : materialesService.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materiales'] })
      qc.invalidateQueries({ queryKey: ['materiales-kpis'] })
      toast.success(isEdit ? 'Material actualizado' : 'Material creado')
      reset()
      onClose()
    },
  })

  const handleClose = () => { reset(); onClose() }

  return (
    <Modal open={open} onClose={handleClose} title={isEdit ? 'Editar Material MTO' : 'Nuevo Material MTO'} size="xl">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d as FormValues))} className="space-y-4">

        {/* Row 1: Project + Item + CM Code */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Proyecto</label>
            <select {...register('proyecto_id')} className="input">
              <option value="">Sin proyecto</option>
              {(proyectosData?.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Item #</label>
            <input {...register('item')} className="input" placeholder="18" />
          </div>
          <div>
            <label className="label">CM Code</label>
            <input {...register('codigo')} className="input" placeholder="PT-304" />
          </div>
        </div>

        {/* Row 2: Vendor Code + Vendor */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Vendor Code</label>
            <input {...register('vendor_code')} className="input" placeholder="BP969650170" />
          </div>
          <div>
            <label className="label">Vendor</label>
            <input {...register('vendor')} className="input" placeholder="RICHELIEU" />
          </div>
        </div>

        {/* Row 3: Description */}
        <div>
          <label className="label">Descripción *</label>
          <input {...register('descripcion')} className="input" placeholder='2 3/4" L-EDGE PULL' />
          {errors.descripcion && <p className="text-red-500 text-xs mt-1">{errors.descripcion.message}</p>}
        </div>

        {/* Row 4: Color + Manufacturer + Categoria + Size + Unidad */}
        <div className="grid grid-cols-5 gap-3">
          <div>
            <label className="label">Color / Finish</label>
            <input {...register('color')} className="input" placeholder="STAINLESS STEEL" />
          </div>
          <div>
            <label className="label">Manufacturer</label>
            <input {...register('manufacturer')} className="input" placeholder="BLUM" />
          </div>
          <div>
            <label className="label">Categoría</label>
            <select {...register('categoria')} className="input">
              <option value="">—</option>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Size</label>
            <input {...register('size')} className="input" placeholder='2 3/4"L' />
          </div>
          <div>
            <label className="label">Unidad *</label>
            <select {...register('unidad')} className="input">
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            {errors.unidad && <p className="text-red-500 text-xs mt-1">{errors.unidad.message}</p>}
          </div>
        </div>

        {/* Row 5: QTY + Unit Price + Total */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">QTY</label>
            <input type="number" step="0.001" {...register('qty')} className="input" />
          </div>
          <div>
            <label className="label">Unit Price</label>
            <input type="number" step="0.01" {...register('unit_price')} className="input" />
          </div>
          <div>
            <label className="label">Total Price</label>
            <input type="number" step="0.01" {...register('total_price')} className="input bg-gray-50" />
          </div>
        </div>

        {/* Row 6: Estado Cotiz + Cotizar S/N */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Estado Cotización</label>
            <select {...register('estado_cotiz')} className="input">
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="COTIZADO">COTIZADO</option>
              <option value="EN_STOCK">EN STOCK</option>
            </select>
          </div>
          <div>
            <label className="label">Cotizar S/N</label>
            <select {...register('cotizar')} className="input">
              <option value="SI">SI</option>
              <option value="NO">NO</option>
              <option value="EN_STOCK">EN STOCK</option>
            </select>
          </div>
        </div>

        {/* Fecha Importación + Notas */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Fecha Importación</label>
            <input type="date" {...register('fecha_importacion')} className="input" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea {...register('notas')} rows={2} className="input resize-none" placeholder="Notas del material…" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={handleClose} className="btn-ghost">Cancelar</button>
          <button type="submit" disabled={isSubmitting || mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar Cambios' : 'Crear Material'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
