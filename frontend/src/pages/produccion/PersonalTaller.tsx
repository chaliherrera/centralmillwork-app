import { useState, FormEvent, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, KeyRound, KeySquare, Wrench, CheckCircle, XCircle, Loader2, Copy, Dice5 } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import { produccionService } from '@/services/produccion'
import type { PersonalTaller as PersonalTallerType, PersonalEstacionAsignacion } from '@/types/produccion'
import type { TipoPersonal } from '@/types/kiosk'

const TIPOS: { value: TipoPersonal; label: string; color: string }[] = [
  { value: 'operador',   label: 'Operador',    color: 'bg-blue-100 text-blue-800' },
  { value: 'carpintero', label: 'Carpintero',  color: 'bg-amber-100 text-amber-800' },
  { value: 'ayudante',   label: 'Ayudante',    color: 'bg-emerald-100 text-emerald-800' },
  { value: 'inspector',  label: 'Inspector',   color: 'bg-purple-100 text-purple-800' },
  { value: 'logistica',  label: 'Logística',   color: 'bg-gray-100 text-gray-800' },
]

const ESTACIONES = [
  'cnc', 'edge_banding', 'lamina', 'pintura',
  'final', 'assembly', 'registro', 'shipping',
]

function tipoLabel(t: TipoPersonal | null) {
  return TIPOS.find((x) => x.value === t)?.label ?? '—'
}
function tipoColor(t: TipoPersonal | null) {
  return TIPOS.find((x) => x.value === t)?.color ?? 'bg-gray-100 text-gray-700'
}

export default function PersonalTaller() {
  const qc = useQueryClient()
  const [filtroActivo, setFiltroActivo] = useState<'todos' | 'activos' | 'inactivos'>('activos')
  const [editing, setEditing]     = useState<PersonalTallerType | null>(null)
  const [creating, setCreating]   = useState(false)
  const [pinTarget, setPinTarget] = useState<PersonalTallerType | null>(null)
  const [estTarget, setEstTarget] = useState<PersonalTallerType | null>(null)

  const filtros = filtroActivo === 'todos' ? undefined
    : { activo: filtroActivo === 'activos' }

  const { data: personal = [], isLoading } = useQuery({
    queryKey: ['personal-taller', filtroActivo],
    queryFn: () => produccionService.personal(filtros),
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {(['activos', 'inactivos', 'todos'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltroActivo(f)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                filtroActivo === f
                  ? 'bg-forest-700 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              )}
            >
              {f === 'activos' ? 'Activos' : f === 'inactivos' ? 'Inactivos' : 'Todos'}
            </button>
          ))}
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <Plus size={16} /> Nuevo personal
        </button>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="table-header">Iniciales</th>
                <th className="table-header">Nombre</th>
                <th className="table-header">Tipo</th>
                <th className="table-header">Estaciones</th>
                <th className="table-header text-center">PIN</th>
                <th className="table-header text-center">Activo</th>
                <th className="table-header w-32"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="table-cell" colSpan={7}>
                      <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                    </td>
                  </tr>
                ))
              ) : personal.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400 text-sm">Sin personal</td></tr>
              ) : (
                personal.map((p) => (
                  <tr key={p.id} className="table-row">
                    <td className="table-cell">
                      <div className="w-9 h-9 rounded-full bg-forest-100 text-forest-700 font-bold flex items-center justify-center text-sm">
                        {p.iniciales}
                      </div>
                    </td>
                    <td className="table-cell font-medium text-gray-900">{p.nombre_completo}</td>
                    <td className="table-cell">
                      <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', tipoColor(p.tipo_personal))}>
                        {tipoLabel(p.tipo_personal)}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex flex-wrap gap-1">
                        {p.estaciones.length === 0 ? (
                          <span className="text-gray-400 text-xs">—</span>
                        ) : p.estaciones.map((e) => (
                          <span
                            key={e.estacion}
                            className={clsx(
                              'px-1.5 py-0.5 rounded text-[11px] font-medium uppercase',
                              e.es_estacion_principal
                                ? 'bg-gold-100 text-gold-800'
                                : 'bg-gray-100 text-gray-600'
                            )}
                            title={e.es_estacion_principal ? 'Principal' : 'Secundaria'}
                          >
                            {e.estacion.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="table-cell text-center">
                      {p.tiene_pin
                        ? <CheckCircle size={16} className="text-emerald-600 mx-auto" />
                        : <XCircle    size={16} className="text-red-300 mx-auto" />}
                    </td>
                    <td className="table-cell text-center">
                      {p.activo
                        ? <CheckCircle size={16} className="text-emerald-600 mx-auto" />
                        : <XCircle    size={16} className="text-red-400 mx-auto" />}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setPinTarget(p)}
                          className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                          title="Asignar/regenerar PIN"
                        >
                          {p.tiene_pin ? <KeyRound size={14} /> : <KeySquare size={14} />}
                        </button>
                        <button
                          onClick={() => setEstTarget(p)}
                          className="p-1.5 text-gray-400 hover:text-forest-600 hover:bg-gray-100 rounded transition-colors"
                          title="Gestionar estaciones"
                        >
                          <Wrench size={14} />
                        </button>
                        <button
                          onClick={() => setEditing(p)}
                          className="p-1.5 text-gray-400 hover:text-forest-600 hover:bg-gray-100 rounded transition-colors"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modales */}
      {(creating || editing) && (
        <PersonalForm
          personal={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => qc.invalidateQueries({ queryKey: ['personal-taller'] })}
        />
      )}
      {pinTarget && (
        <PinModal
          personal={pinTarget}
          onClose={() => setPinTarget(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ['personal-taller'] })}
        />
      )}
      {estTarget && (
        <EstacionesModal
          personal={estTarget}
          onClose={() => setEstTarget(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['personal-taller'] })}
        />
      )}
    </div>
  )
}

// ─── Form: crear/editar persona (NO toca PIN ni estaciones) ──────────────────
function PersonalForm({ personal, onClose, onSaved }: {
  personal: PersonalTallerType | null
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre]     = useState(personal?.nombre ?? '')
  const [apellido, setApellido] = useState(personal?.apellido ?? '')
  const [iniciales, setIniciales] = useState(personal?.iniciales ?? '')
  const [tipo, setTipo]         = useState<TipoPersonal | ''>(personal?.tipo_personal ?? '')
  const [activo, setActivo]     = useState(personal?.activo ?? true)

  const isNew = !personal

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        nombre: nombre.trim(),
        apellido: apellido.trim() || undefined,
        iniciales: iniciales.trim().toUpperCase(),
        tipo_personal: (tipo || null) as TipoPersonal | null,
        activo,
      }
      if (isNew) return produccionService.crearPersonal(body)
      return produccionService.actualizarPersonal(personal!.id, body)
    },
    onSuccess: () => {
      toast.success(isNew ? 'Personal creado' : 'Personal actualizado')
      onSaved()
      onClose()
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim() || !iniciales.trim()) {
      toast.error('Nombre e iniciales son requeridos')
      return
    }
    mutation.mutate()
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Nuevo personal del taller' : `Editar ${personal!.nombre_completo}`} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nombre *</label>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required className="input w-full" />
          </div>
          <div>
            <label className="label">Apellido</label>
            <input type="text" value={apellido} onChange={(e) => setApellido(e.target.value)} className="input w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Iniciales *</label>
            <input
              type="text" value={iniciales} maxLength={5}
              onChange={(e) => setIniciales(e.target.value.toUpperCase())}
              required className="input w-full uppercase"
            />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoPersonal | '')} className="input w-full">
              <option value="">— sin tipo —</option>
              {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="rounded" />
          Activo
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
            {isNew ? 'Crear' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Modal: asignar / regenerar PIN ──────────────────────────────────────────
function PinModal({ personal, onClose, onChanged }: {
  personal: PersonalTallerType
  onClose: () => void
  onChanged: () => void
}) {
  const [pin, setPin]     = useState('')
  const [saved, setSaved] = useState<string | null>(null)  // PIN guardado, mostrado una sola vez

  const setPinMut = useMutation({
    mutationFn: () => produccionService.setPin(personal.id, pin),
    onSuccess: () => {
      setSaved(pin)
      toast.success('PIN guardado')
      onChanged()
    },
  })

  const clearPinMut = useMutation({
    mutationFn: () => produccionService.clearPin(personal.id),
    onSuccess: () => {
      toast.success('PIN eliminado')
      onChanged()
      onClose()
    },
  })

  function generarRandom() {
    setPin(String(Math.floor(Math.random() * 10000)).padStart(4, '0'))
  }

  function copiar() {
    if (saved) navigator.clipboard?.writeText(saved).then(() => toast.success('PIN copiado'))
  }

  return (
    <Modal open onClose={onClose} title={`PIN — ${personal.nombre_completo}`} size="sm">
      {saved ? (
        // Vista post-guardado: mostramos el PIN una vez para que se lo den al operario
        <div className="space-y-4">
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-5 text-center">
            <p className="text-xs uppercase tracking-wider text-emerald-700 font-semibold mb-2">PIN asignado</p>
            <div className="text-5xl font-bold text-forest-700 tracking-[0.4em] tabular-nums">{saved}</div>
            <p className="text-xs text-emerald-700 mt-3">Anotalo o copialo — no se volverá a mostrar.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={copiar} className="btn-ghost flex-1 justify-center">
              <Copy size={14} /> Copiar
            </button>
            <button onClick={onClose} className="btn-primary flex-1 justify-center">
              Listo
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {personal.tiene_pin
              ? 'Este operario ya tiene un PIN. Asignar uno nuevo lo reemplaza.'
              : 'Asigná un PIN de 4 dígitos. El operario lo usará para entrar al kiosko.'}
          </p>
          <div>
            <label className="label">PIN (4 dígitos)</label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className="input flex-1 text-center text-2xl tracking-[0.4em] tabular-nums font-bold"
              />
              <button
                type="button"
                onClick={generarRandom}
                className="btn-ghost"
                title="Generar PIN aleatorio"
              >
                <Dice5 size={16} />
              </button>
            </div>
          </div>
          <div className="flex justify-between gap-2">
            {personal.tiene_pin ? (
              <button
                onClick={() => {
                  if (confirm(`¿Eliminar el PIN de ${personal.nombre_completo}? El operario no podrá entrar al kiosko hasta que se le asigne uno nuevo.`)) {
                    clearPinMut.mutate()
                  }
                }}
                disabled={clearPinMut.isPending}
                className="btn-ghost text-red-600 hover:bg-red-50"
              >
                {clearPinMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Quitar PIN
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-ghost">Cancelar</button>
              <button
                onClick={() => setPinMut.mutate()}
                disabled={pin.length !== 4 || setPinMut.isPending}
                className="btn-primary"
              >
                {setPinMut.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                Guardar PIN
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Modal: gestionar estaciones del operario ────────────────────────────────
function EstacionesModal({ personal, onClose, onSaved }: {
  personal: PersonalTallerType
  onClose: () => void
  onSaved: () => void
}) {
  const [asignaciones, setAsignaciones] = useState<PersonalEstacionAsignacion[]>(personal.estaciones)

  // Reset cuando se abre con otra persona
  useEffect(() => { setAsignaciones(personal.estaciones) }, [personal.id])

  function toggle(estacion: string) {
    setAsignaciones((prev) => {
      const exists = prev.find((p) => p.estacion === estacion)
      if (exists) return prev.filter((p) => p.estacion !== estacion)
      return [...prev, { estacion, es_estacion_principal: false, capacidad_max: 3, activo: true }]
    })
  }

  function setPrincipal(estacion: string, principal: boolean) {
    setAsignaciones((prev) => prev.map((p) =>
      p.estacion === estacion ? { ...p, es_estacion_principal: principal } : p
    ))
  }

  function setCapacidad(estacion: string, capacidad: number) {
    setAsignaciones((prev) => prev.map((p) =>
      p.estacion === estacion ? { ...p, capacidad_max: capacidad } : p
    ))
  }

  const mutation = useMutation({
    mutationFn: () => produccionService.setEstaciones(personal.id, asignaciones),
    onSuccess: () => {
      toast.success('Asignaciones actualizadas')
      onSaved()
      onClose()
    },
  })

  return (
    <Modal open onClose={onClose} title={`Estaciones — ${personal.nombre_completo}`} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Tildá las estaciones donde {personal.nombre} puede trabajar. Marcá las principales para
          priorizarlas en el sugeridor de asignación.
        </p>
        <div className="space-y-2">
          {ESTACIONES.map((est) => {
            const asig = asignaciones.find((a) => a.estacion === est)
            const checked = !!asig
            return (
              <div
                key={est}
                className={clsx(
                  'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                  checked ? 'border-gold-300 bg-gold-50' : 'border-gray-200 bg-white'
                )}
              >
                <input
                  type="checkbox" checked={checked}
                  onChange={() => toggle(est)}
                  className="rounded w-4 h-4"
                />
                <span className="font-medium uppercase text-sm flex-1">
                  {est.replace('_', ' ')}
                </span>
                {asig && (
                  <>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600">
                      <input
                        type="checkbox" checked={asig.es_estacion_principal}
                        onChange={(e) => setPrincipal(est, e.target.checked)}
                        className="rounded"
                      />
                      Principal
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600">
                      Cap.
                      <input
                        type="number" min={1} max={20} value={asig.capacidad_max}
                        onChange={(e) => setCapacidad(est, parseInt(e.target.value) || 1)}
                        className="input w-14 text-center text-xs py-1"
                      />
                    </label>
                  </>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  )
}
