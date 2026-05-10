import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ArrowRight, Pause, Play, Ban, Loader2, CheckCircle2, Clock, History,
  UserPlus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import { produccionService } from '@/services/produccion'
import type { StatusOrden, Prioridad, OrdenProceso } from '@/types/produccion'

const STATUS_BADGE: Record<StatusOrden, string> = {
  'Pendiente':  'bg-gray-100 text-gray-700 border-gray-200',
  'En Proceso': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Pausada':    'bg-amber-100 text-amber-800 border-amber-200',
  'Completada': 'bg-blue-100 text-blue-800 border-blue-200',
  'Cancelada':  'bg-red-100 text-red-700 border-red-200',
}

const PRIORIDAD_BADGE: Record<Prioridad, string> = {
  Alta:  'bg-red-100 text-red-800',
  Media: 'bg-amber-100 text-amber-800',
  Baja:  'bg-gray-100 text-gray-700',
}

export default function DetalleOrden() {
  const { id } = useParams<{ id: string }>()
  const ordenId = parseInt(id ?? '0')
  const nav = useNavigate()
  const qc  = useQueryClient()
  const [asignandoEst, setAsignandoEst] = useState<string | null>(null)

  const { data: orden, isLoading } = useQuery({
    queryKey: ['orden-produccion', ordenId],
    queryFn:  () => produccionService.orden(ordenId),
    enabled:  !!ordenId,
  })

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['orden-produccion', ordenId] })
    qc.invalidateQueries({ queryKey: ['ordenes-produccion'] })
    qc.invalidateQueries({ queryKey: ['ordenes-produccion-kpis'] })
  }

  const avanzar = useMutation({
    mutationFn: () => produccionService.avanzarOrden(ordenId),
    onSuccess: (res) => { toast.success(res.message); invalidate() },
  })

  const pausar = useMutation({
    mutationFn: (motivo?: string) => produccionService.pausarOrden(ordenId, motivo),
    onSuccess: () => { toast.success('Orden pausada'); invalidate() },
  })

  const reanudar = useMutation({
    mutationFn: () => produccionService.reanudarOrden(ordenId),
    onSuccess: () => { toast.success('Orden reanudada'); invalidate() },
  })

  const cancelar = useMutation({
    mutationFn: (motivo?: string) => produccionService.cancelarOrden(ordenId, motivo),
    onSuccess: () => { toast.success('Orden cancelada'); invalidate() },
  })

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  }
  if (!orden) {
    return <div className="text-center py-12 text-gray-500">Orden no encontrada</div>
  }

  const puedeOperar = orden.status === 'Pendiente' || orden.status === 'En Proceso' || orden.status === 'Pausada'

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/produccion/ordenes')} className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="!text-xl">{orden.numero_orden}</h1>
            <div className="text-sm text-gray-600">
              {orden.proyecto_codigo && <Link to={`/proyectos`} className="hover:text-gold-600">{orden.proyecto_codigo}</Link>}
              {orden.proyecto_codigo && <> · </>}
              {orden.item_nombre}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={clsx('inline-flex px-2.5 py-1 rounded-full text-xs font-medium border', STATUS_BADGE[orden.status])}>
            {orden.status}
          </span>
          <span className={clsx('inline-flex px-2.5 py-1 rounded-full text-xs font-medium', PRIORIDAD_BADGE[orden.prioridad])}>
            Prioridad {orden.prioridad}
          </span>
        </div>
      </div>

      {/* Acciones */}
      {puedeOperar && (
        <div className="card flex items-center justify-between gap-3">
          <div className="text-sm">
            <div className="text-gray-500">Estación actual</div>
            <div className="font-bold uppercase text-forest-700">
              {orden.estacion_actual?.replace('_', ' ') ?? '—'}
            </div>
            {orden.personal_asignado_nombre && (
              <div className="text-xs text-gray-500 mt-0.5">→ {orden.personal_asignado_nombre}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {orden.status === 'Pausada' ? (
              <button
                onClick={() => reanudar.mutate()}
                disabled={reanudar.isPending}
                className="btn-secondary"
              >
                {reanudar.isPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                Reanudar
              </button>
            ) : (
              <button
                onClick={() => {
                  const motivo = prompt('Motivo de la pausa (opcional):') ?? undefined
                  pausar.mutate(motivo)
                }}
                disabled={pausar.isPending}
                className="btn-ghost"
              >
                {pausar.isPending ? <Loader2 size={16} className="animate-spin" /> : <Pause size={16} />}
                Pausar
              </button>
            )}
            <button
              onClick={() => avanzar.mutate()}
              disabled={avanzar.isPending || orden.status !== 'En Proceso' && orden.status !== 'Pendiente'}
              className="btn-primary"
              title="Avanzar a la siguiente estación"
            >
              {avanzar.isPending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              Avanzar
            </button>
            <button
              onClick={() => {
                if (confirm('¿Cancelar esta orden? No se podrá deshacer.')) {
                  cancelar.mutate(prompt('Motivo (opcional):') ?? undefined)
                }
              }}
              disabled={cancelar.isPending}
              className="btn-ghost text-red-600 hover:bg-red-50"
            >
              <Ban size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Datos + procesos + historial */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Procesos */}
          <div className="card space-y-3">
            <h3 className="flex items-center gap-2"><Clock size={16} /> Procesos</h3>
            <div className="space-y-2">
              {orden.procesos.map((p) => (
                <ProcesoRow
                  key={p.id} proceso={p}
                  esActual={orden.estacion_actual === p.estacion}
                  ordenStatus={orden.status}
                  onAsignar={() => setAsignandoEst(p.estacion)}
                />
              ))}
            </div>
          </div>

          {/* Historial */}
          <div className="card space-y-3">
            <h3 className="flex items-center gap-2"><History size={16} /> Historial</h3>
            <ol className="relative space-y-3 ml-2 border-l-2 border-gray-100">
              {orden.historial.map((h) => (
                <li key={h.id} className="ml-4 pl-3">
                  <div className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-gold-500 border-2 border-white" />
                  <div className="text-sm">
                    <span className="font-semibold capitalize">{h.accion}</span>
                    {h.estacion_origen && h.estacion_destino && (
                      <> · {h.estacion_origen} → {h.estacion_destino}</>
                    )}
                    {!h.estacion_origen && h.estacion_destino && (
                      <> · {h.estacion_destino}</>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {new Date(h.timestamp).toLocaleString('es-MX')}
                    {h.usuario_nombre && <> · {h.usuario_nombre}</>}
                    {h.kiosk_personal_nombre && <> · 📱 {h.kiosk_personal_nombre}</>}
                    {h.dispositivo && <> ({h.dispositivo})</>}
                  </div>
                  {h.motivo && <div className="text-xs text-gray-600 mt-0.5">"{h.motivo}"</div>}
                </li>
              ))}
              {orden.historial.length === 0 && (
                <li className="text-sm text-gray-400 italic ml-4">Sin eventos todavía</li>
              )}
            </ol>
          </div>
        </div>

        {/* Lateral: datos + ruta */}
        <div className="space-y-4">
          <div className="card space-y-2 text-sm">
            <h3 className="!text-base">Detalles</h3>
            <Field label="Cantidad" value={`${orden.cantidad} ${orden.unidad}`} />
            <Field label="Tiempo estimado" value={orden.tiempo_estimado_horas ? `${orden.tiempo_estimado_horas}h` : '—'} />
            <Field label="Fecha entrega" value={orden.fecha_entrega ? new Date(orden.fecha_entrega).toLocaleDateString('es-MX') : '—'} />
            <Field label="Distancia ruta" value={orden.distancia_total_metros ? `${orden.distancia_total_metros}m` : '—'} />
            <Field label="Creada" value={new Date(orden.created_at).toLocaleString('es-MX')} />
            {orden.fecha_completada && (
              <Field label="Completada" value={new Date(orden.fecha_completada).toLocaleString('es-MX')} />
            )}
            {orden.especificaciones && (
              <div className="pt-2 border-t border-gray-100">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Especificaciones</div>
                <div className="text-gray-700 whitespace-pre-wrap">{orden.especificaciones}</div>
              </div>
            )}
            {orden.notas && (
              <div className="pt-2 border-t border-gray-100">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Notas</div>
                <div className="text-gray-700 whitespace-pre-wrap">{orden.notas}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de asignación */}
      {asignandoEst && (
        <AsignarModal
          ordenId={ordenId}
          estacion={asignandoEst}
          currentPersonalId={orden.procesos.find((p) => p.estacion === asignandoEst)?.operador_id ?? null}
          onClose={() => setAsignandoEst(null)}
          onSaved={invalidate}
        />
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="font-medium text-gray-900 text-right">{value}</span>
    </div>
  )
}

function ProcesoRow({
  proceso, esActual, ordenStatus, onAsignar,
}: {
  proceso: OrdenProceso
  esActual: boolean
  ordenStatus: StatusOrden
  onAsignar: () => void
}) {
  const minutosReales = proceso.tiempo_real_minutos
  const ordenTerminada = ordenStatus === 'Completada' || ordenStatus === 'Cancelada'
  return (
    <div className={clsx(
      'flex items-center gap-3 p-3 rounded-lg border',
      proceso.completado
        ? 'border-emerald-200 bg-emerald-50'
        : esActual
        ? 'border-gold-300 bg-gold-50'
        : 'border-gray-200 bg-white'
    )}>
      <div className={clsx(
        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
        proceso.completado
          ? 'bg-emerald-600 text-white'
          : esActual
          ? 'bg-gold-500 text-white'
          : 'bg-gray-200 text-gray-600'
      )}>
        {proceso.completado ? <CheckCircle2 size={14} /> : proceso.secuencia}
      </div>
      <div className="flex-1">
        <div className="font-semibold uppercase text-sm">{proceso.estacion.replace('_', ' ')}</div>
        <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
          {proceso.operador_iniciales ? (
            <span className="inline-flex items-center gap-1">
              <span className="w-5 h-5 rounded-full bg-forest-100 text-forest-700 text-[10px] font-bold flex items-center justify-center">
                {proceso.operador_iniciales}
              </span>
              {proceso.operador_nombre}
            </span>
          ) : (
            <span className="italic text-gray-400">Sin asignar</span>
          )}
          {proceso.fecha_inicio && (
            <span>· iniciado {new Date(proceso.fecha_inicio).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          )}
          {minutosReales != null && (
            <span>· {minutosReales} min</span>
          )}
        </div>
      </div>
      {!proceso.completado && !ordenTerminada && (
        <button
          onClick={onAsignar}
          className="p-1.5 text-gray-400 hover:text-forest-700 hover:bg-gray-100 rounded transition-colors"
          title="Asignar operario"
        >
          <UserPlus size={14} />
        </button>
      )}
    </div>
  )
}

function AsignarModal({
  ordenId, estacion, currentPersonalId, onClose, onSaved,
}: {
  ordenId: number
  estacion: string
  currentPersonalId: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const [selected, setSelected] = useState<number | null>(currentPersonalId)

  const { data: personal = [] } = useQuery({
    queryKey: ['personal-taller', 'estacion', estacion],
    queryFn:  () => produccionService.personal({ estacion, activo: true }),
  })

  const mut = useMutation({
    mutationFn: () => produccionService.asignarOperador(ordenId, { estacion, personal_id: selected }),
    onSuccess: () => { toast.success('Operario asignado'); onSaved(); onClose() },
  })

  return (
    <Modal open onClose={onClose} title={`Asignar a ${estacion.replace('_', ' ').toUpperCase()}`} size="md">
      <div className="space-y-3">
        <button
          onClick={() => setSelected(null)}
          className={clsx(
            'w-full p-3 rounded-lg border-2 text-left transition-all',
            selected === null ? 'border-forest-500 bg-forest-50' : 'border-gray-200 bg-white hover:bg-gray-50'
          )}
        >
          <div className="font-medium text-sm italic text-gray-600">Sin asignar</div>
          <div className="text-xs text-gray-500">Asignar después</div>
        </button>
        {personal.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No hay personal asignado a esta estación.</p>
        ) : personal.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            className={clsx(
              'w-full p-3 rounded-lg border-2 text-left transition-all flex items-center gap-3',
              selected === p.id ? 'border-gold-500 bg-gold-50' : 'border-gray-200 bg-white hover:bg-gray-50'
            )}
          >
            <span className="w-9 h-9 rounded-full bg-forest-100 text-forest-700 text-sm font-bold flex items-center justify-center">
              {p.iniciales}
            </span>
            <div className="flex-1">
              <div className="font-semibold text-sm">{p.nombre_completo}</div>
              <div className="text-xs text-gray-500">{p.tipo_personal}</div>
            </div>
          </button>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-primary">
            {mut.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  )
}
