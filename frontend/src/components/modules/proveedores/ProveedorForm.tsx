import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Modal from '@/components/ui/Modal'
import { proveedoresService } from '@/services/proveedores'
import type { Proveedor } from '@/types'

const schema = z.object({
  nombre:    z.string().min(1, 'Requerido').max(200),
  contacto:  z.string().optional(),
  email:     z.string().email('Email inválido').or(z.literal('')).optional(),
  telefono:  z.string().optional(),
  rfc:       z.string().max(20).optional(),
  direccion: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  proveedor?: Proveedor
}

export default function ProveedorForm({ open, onClose, proveedor }: Props) {
  const qc = useQueryClient()
  const isEdit = !!proveedor

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (open) {
      reset(proveedor
        ? {
            nombre:    proveedor.nombre,
            contacto:  proveedor.contacto ?? '',
            email:     proveedor.email ?? '',
            telefono:  proveedor.telefono ?? '',
            rfc:       proveedor.rfc ?? '',
            direccion: proveedor.direccion ?? '',
          }
        : { nombre: '', contacto: '', email: '', telefono: '', rfc: '', direccion: '' }
      )
    }
  }, [open, proveedor, reset])

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      isEdit
        ? proveedoresService.update(proveedor!.id, data)
        : proveedoresService.create(data as Omit<Proveedor, 'id' | 'activo' | 'created_at' | 'updated_at'>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedores'] })
      toast.success(isEdit ? 'Proveedor actualizado' : 'Proveedor creado')
      onClose()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Error al guardar el proveedor')
    },
  })

  const handleClose = () => { onClose() }

  return (
    <Modal open={open} onClose={handleClose} title={isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor'}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">

        <div>
          <label className="label">Razón Social *</label>
          <input {...register('nombre')} className="input" placeholder="Maderas del Norte S.A." />
          {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Contacto</label>
            <input {...register('contacto')} className="input" placeholder="Nombre del contacto" />
          </div>
          <div>
            <label className="label">RFC</label>
            <input {...register('rfc')} className="input placeholder:uppercase" placeholder="ABC010101AAA" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Email</label>
            <input type="email" {...register('email')} className="input" placeholder="ventas@proveedor.mx" />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input {...register('telefono')} className="input" placeholder="81-1234-5678" />
          </div>
        </div>

        <div>
          <label className="label">Dirección</label>
          <textarea {...register('direccion')} rows={2} className="input resize-none"
            placeholder="Calle, colonia, ciudad…" />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={handleClose} className="btn-ghost">Cancelar</button>
          <button type="submit" disabled={isSubmitting || mutation.isPending} className="btn-primary">
            {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar Cambios' : 'Crear Proveedor'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
