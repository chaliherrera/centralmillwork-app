import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Modal from '@/components/ui/Modal'
import { proyectosService } from '@/services/proyectos'
import type { Proyecto } from '@/types'

const schema = z.object({
  codigo:             z.string().min(1, 'Requerido').max(30),
  nombre:             z.string().min(1, 'Requerido').max(300),
  cliente:            z.string().min(1, 'Requerido').max(200),
  descripcion:        z.string().optional(),
  estado:             z.enum(['activo', 'completado']),
  fecha_inicio:       z.string().optional().transform((v) => v || undefined),
  fecha_fin_estimada: z.string().optional().transform((v) => v || undefined),
  presupuesto:        z.coerce.number().min(0),
  responsable:        z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  proyecto?: Proyecto
}

const estadoOpts: { value: 'activo' | 'completado'; label: string }[] = [
  { value: 'activo',     label: 'Activo' },
  { value: 'completado', label: 'Completado' },
]

export default function ProyectoForm({ open, onClose, proyecto }: Props) {
  const qc = useQueryClient()
  const isEdit = !!proyecto

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { estado: 'activo', presupuesto: 0 },
  })

  useEffect(() => {
    if (open) {
      reset(proyecto
        ? {
            codigo:             proyecto.codigo,
            nombre:             proyecto.nombre,
            cliente:            proyecto.cliente,
            descripcion:        proyecto.descripcion ?? '',
            estado:             (proyecto.estado === 'completado' ? 'completado' : 'activo'),
            fecha_inicio:       proyecto.fecha_inicio?.slice(0, 10) ?? '',
            fecha_fin_estimada: proyecto.fecha_fin_estimada?.slice(0, 10) ?? '',
            presupuesto:        proyecto.presupuesto,
            responsable:        proyecto.responsable ?? '',
          }
        : { codigo: '', nombre: '', cliente: '', descripcion: '', estado: 'activo', fecha_inicio: '', fecha_fin_estimada: '', presupuesto: 0, responsable: '' }
      )
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      isEdit
        ? proyectosService.update(proyecto!.id, data)
        : proyectosService.create(data as Omit<Proyecto, 'id' | 'created_at' | 'updated_at'>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proyectos'] })
      toast.success(isEdit ? 'Proyecto actualizado' : 'Proyecto creado')
      reset()
      onClose()
    },
  })

  const handleClose = () => { reset(); onClose() }

  return (
    <Modal open={open} onClose={handleClose} title={isEdit ? 'Editar Proyecto' : 'Nuevo Proyecto'} size="lg">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Código *</label>
            <input {...register('codigo')} className="input" placeholder="PRY-2026-001" />
            {errors.codigo && <p className="text-red-500 text-xs mt-1">{errors.codigo.message}</p>}
          </div>
          <div>
            <label className="label">Estado</label>
            <select {...register('estado')} className="input">
              {estadoOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Nombre del Proyecto *</label>
          <input {...register('nombre')} className="input" placeholder="Residencia García" />
          {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre.message}</p>}
        </div>

        <div>
          <label className="label">Cliente *</label>
          <input {...register('cliente')} className="input" placeholder="Familia García" />
          {errors.cliente && <p className="text-red-500 text-xs mt-1">{errors.cliente.message}</p>}
        </div>

        <div>
          <label className="label">Descripción</label>
          <textarea {...register('descripcion')} rows={2} className="input resize-none"
            placeholder="Closets, cocina integral…" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Fecha Inicio</label>
            <input type="date" {...register('fecha_inicio')} className="input" />
          </div>
          <div>
            <label className="label">Fecha Fin Estimada</label>
            <input type="date" {...register('fecha_fin_estimada')} className="input" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Presupuesto (USD)</label>
            <input type="number" step="0.01" {...register('presupuesto')} className="input" placeholder="0.00" />
            {errors.presupuesto && <p className="text-red-500 text-xs mt-1">{errors.presupuesto.message}</p>}
          </div>
          <div>
            <label className="label">Responsable</label>
            <input {...register('responsable')} className="input" placeholder="Nombre del responsable" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={handleClose} className="btn-ghost">Cancelar</button>
          <button type="submit" disabled={isSubmitting || mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar Cambios' : 'Crear Proyecto'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
