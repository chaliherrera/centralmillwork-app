import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, UserCheck, UserX, Loader2, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import api from '@/services/api'
import Modal from '@/components/ui/Modal'
import type { User, UserRole } from '@/types'

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'ADMIN',              label: 'Admin' },
  { value: 'PROCUREMENT',        label: 'Compras' },
  { value: 'PRODUCTION',         label: 'Producción' },
  { value: 'PROJECT_MANAGEMENT', label: 'Gerencia de Proyecto' },
  { value: 'RECEPTION',          label: 'Recepción' },
]

const ROL_COLORS: Record<UserRole, string> = {
  ADMIN:              'bg-purple-100 text-purple-700',
  PROCUREMENT:        'bg-gold-100 text-gold-700',
  PRODUCTION:         'bg-green-100 text-green-700',
  PROJECT_MANAGEMENT: 'bg-blue-100 text-blue-700',
  RECEPTION:          'bg-gray-100 text-gray-700',
}

function rolLabel(rol: UserRole) {
  return ROLES.find((r) => r.value === rol)?.label ?? rol
}

interface FormState {
  nombre: string
  email: string
  password: string
  rol: UserRole
}

const EMPTY: FormState = { nombre: '', email: '', password: '', rol: 'PROCUREMENT' }

export default function Usuarios() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<User | null>(null)
  const [form, setForm]           = useState<FormState>(EMPTY)

  const { data, isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => api.get<{ data: User[] }>('/usuarios', { params: { limit: 200 } }).then((r) => r.data.data),
  })

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<FormState>) =>
      editing
        ? api.put(`/usuarios/${editing.id}`, payload).then((r) => r.data)
        : api.post('/usuarios', payload).then((r) => r.data),
    onSuccess: (res: any) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      closeModal()
    },
    onError: () => toast.error('Error al guardar usuario'),
  })

  const toggleMutation = useMutation({
    mutationFn: (u: User) => api.put(`/usuarios/${u.id}`, { activo: !u.activo }).then((r) => r.data),
    onSuccess: (res: any) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['usuarios'] })
    },
  })

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setModalOpen(true)
  }

  function openEdit(u: User) {
    setEditing(u)
    setForm({ nombre: u.nombre, email: u.email, password: '', rol: u.rol })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
  }

  function handleSave() {
    const payload: Partial<FormState> = {
      nombre: form.nombre,
      email:  form.email,
      rol:    form.rol,
    }
    if (!editing || form.password) payload.password = form.password
    saveMutation.mutate(payload)
  }

  const canSave = form.nombre && form.email && form.rol && (!editing || true) && (editing || form.password)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-forest-700 flex items-center gap-2">
            <ShieldCheck size={20} className="text-gold-500" />
            Usuarios del sistema
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">{data?.length ?? 0} usuario(s) registrado(s)</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nuevo usuario
        </button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Rol</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Estado</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data ?? []).map((u) => (
                <tr key={u.id} className={clsx('hover:bg-gray-50 transition-colors', !u.activo && 'opacity-50')}>
                  <td className="px-5 py-3 font-medium text-gray-800">{u.nombre}</td>
                  <td className="px-5 py-3 text-gray-600">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full', ROL_COLORS[u.rol])}>
                      {rolLabel(u.rol)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={clsx(
                      'text-xs font-medium px-2 py-0.5 rounded-full',
                      u.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    )}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        className="p-1.5 text-gray-400 hover:text-forest-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => toggleMutation.mutate(u)}
                        disabled={toggleMutation.isPending}
                        className={clsx(
                          'p-1.5 rounded-lg transition-colors',
                          u.activo
                            ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                            : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                        )}
                        title={u.activo ? 'Desactivar' : 'Activar'}
                      >
                        {u.activo ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Editar usuario' : 'Nuevo usuario'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Nombre completo</label>
            <input
              className="input w-full"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Nombre Apellido"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input w-full"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="usuario@centralmillwork.com"
            />
          </div>
          <div>
            <label className="label">
              {editing ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
            </label>
            <input
              type="password"
              className="input w-full"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={editing ? '••••••••' : 'Mínimo 8 caracteres'}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label">Rol</label>
            <select
              className="input w-full"
              value={form.rol}
              onChange={(e) => setForm({ ...form, rol: e.target.value as UserRole })}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button onClick={closeModal} className="btn-ghost">Cancelar</button>
            <button
              onClick={handleSave}
              disabled={!canSave || saveMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              {editing ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
