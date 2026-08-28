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
  // Hoja de intake (solo se muestran con variant intake). Se guardan como texto en
  // el form y se limpian a número/undefined al enviar (toPayload).
  millwork_total:          z.string().optional(),
  stone_total:             z.string().optional(),
  items_qty:               z.string().optional(),
  intake_comments:         z.string().optional(),
  fecha_entrega_solicitada: z.string().optional().transform((v) => v || undefined),
})

// Convierte los campos de intake (texto del form) a número/undefined limpios.
const toPayload = (d: FormValues) => {
  const numOrU = (v?: string) => (v === undefined || v === '' ? undefined : Number(v))
  return {
    ...d,
    millwork_total: numOrU(d.millwork_total),
    stone_total:    numOrU(d.stone_total),
    items_qty:      numOrU(d.items_qty),
    intake_comments: d.intake_comments || undefined,
  }
}

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  proyecto?: Proyecto
  /** Oculta las fechas (no son determinantes en el alta desde Estimados). */
  hideDates?: boolean
  /** Muestra los campos de la hoja de intake (alta desde Estimados). */
  intake?: boolean
  /** Callback con el proyecto creado (para el wizard de Estimados). */
  onCreated?: (p: Proyecto) => void
}

const estadoOpts: { value: 'activo' | 'completado'; label: string }[] = [
  { value: 'activo',     label: 'Activo' },
  { value: 'completado', label: 'Completado' },
]

export default function ProyectoForm({ open, onClose, proyecto, hideDates, intake, onCreated }: Props) {
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
            millwork_total:     proyecto.millwork_total != null ? String(proyecto.millwork_total) : '',
            stone_total:        proyecto.stone_total != null ? String(proyecto.stone_total) : '',
            items_qty:          proyecto.items_qty != null ? String(proyecto.items_qty) : '',
            intake_comments:    proyecto.intake_comments ?? '',
            fecha_entrega_solicitada: proyecto.fecha_entrega_solicitada?.slice(0, 10) ?? '',
          }
        : { codigo: '', nombre: '', cliente: '', descripcion: '', estado: 'activo', fecha_inicio: '', fecha_fin_estimada: '', presupuesto: 0, responsable: '',
            millwork_total: '', stone_total: '', items_qty: '', intake_comments: '', fecha_entrega_solicitada: '' }
      )
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: (data: FormValues) => {
      const payload = toPayload(data) as any
      // Creado desde Estimados = nace como PROSPECTO (invisible para Compras/Producción
      // hasta que el cliente apruebe el schedule y pase a 'activo').
      if (!isEdit && intake) payload.estado = 'prospecto'
      return isEdit
        ? proyectosService.update(proyecto!.id, payload)
        : proyectosService.create(payload as Omit<Proyecto, 'id' | 'created_at' | 'updated_at'>)
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['proyectos'] })
      toast.success(isEdit ? 'Proyecto actualizado' : 'Proyecto creado')
      if (!isEdit && onCreated && res?.data) onCreated(res.data as Proyecto)
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
          {!intake ? (
            <div>
              <label className="label">Estado</label>
              <select {...register('estado')} className="input">
                {estadoOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ) : (
            <div className="flex flex-col justify-end">
              <span className="text-[11px] uppercase tracking-wider text-forest-600 font-semibold mb-1">Estado</span>
              <span className="inline-flex items-center gap-1.5 text-sm text-forest-700 bg-forest-50 border border-forest-200 rounded-lg px-3 py-2 font-medium">Prospecto</span>
            </div>
          )}
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

        {intake && (
          <div className="rounded-xl border border-forest-100 bg-forest-50/40 p-4 space-y-4">
            <div className="text-[11px] uppercase tracking-wider text-forest-700 font-semibold">Hoja de intake</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Cantidad de ítems</label>
                <input type="number" min="0" step="1" {...register('items_qty')} className="input" placeholder="Ej. 24" />
                <p className="text-[11px] text-stone-400 mt-1">Alimenta la duración de shop drawings (≈ 1 día por ítem).</p>
              </div>
              <div>
                <label className="label">Millwork Date (fecha que pide el cliente)</label>
                <input type="date" {...register('fecha_entrega_solicitada')} className="input" />
                <p className="text-[11px] text-stone-400 mt-1">Es la fecha objetivo que se evalúa en factibilidad.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Millwork Total (USD)</label>
                <input type="number" step="0.01" min="0" {...register('millwork_total')} className="input" placeholder="0.00" />
              </div>
              <div>
                <label className="label">Stone / Countertops (USD)</label>
                <input type="number" step="0.01" min="0" {...register('stone_total')} className="input" placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="label">Comentarios / lead times</label>
              <textarea {...register('intake_comments')} rows={2} className="input resize-none"
                placeholder="Ej. SP-001 3-4 sem · MT-02 Banker's mesh 9.5 sem · installation not included" />
            </div>
          </div>
        )}

        {!hideDates && (
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
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{intake ? 'Project Total (USD)' : 'Presupuesto (USD)'}</label>
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
