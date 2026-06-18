import { useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Beaker, Calendar, User as UserIcon, AlertTriangle, RefreshCw,
  Truck, X, ArrowRight, FileText, Upload, Trash2, Download, Paperclip,
  RotateCcw, CalendarDays, ChevronLeft, ChevronRight,
  ShoppingCart, Check,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { muestrasService } from '@/services/muestras'
import { proyectosService } from '@/services/proyectos'
import { useAuth } from '@/context/AuthContext'
import NuevaCompraNoMTOModal from '@/components/modules/ordenes_compra/NuevaCompraNoMTOModal'
import IniciarFabricacionModal from '@/components/modules/muestras/IniciarFabricacionModal'
import FotosAvanceSection from '@/components/produccion/FotosAvanceSection'
import type {
  MuestraConDetalle, MuestraEstado, MuestraTipo, MuestraPrioridad,
  CreateMuestraInput, TransicionInput, RegistrarEnvioInput,
  MuestraArchivo, MuestraDetalle,
} from '@/types/muestras'

// ─── Configuración de estados ────────────────────────────────────────────────
const ESTADO_META: Record<MuestraEstado, { label: string; col: string; bg: string; border: string; text: string }> = {
  SOLICITADA:     { label: 'Solicitadas',   col: 'bg-gray-50',    bg: 'bg-gray-100',     border: 'border-gray-300',    text: 'text-gray-700' },
  EN_FABRICACION: { label: 'En fabricación', col: 'bg-yellow-50',  bg: 'bg-yellow-100',   border: 'border-yellow-300',  text: 'text-yellow-800' },
  EN_QC:          { label: 'En QC',         col: 'bg-purple-50',  bg: 'bg-purple-100',   border: 'border-purple-300',  text: 'text-purple-800' },
  ENVIADA:        { label: 'Enviadas',      col: 'bg-blue-50',    bg: 'bg-blue-100',     border: 'border-blue-300',    text: 'text-blue-800' },
  APROBADA:       { label: 'Aprobadas',     col: 'bg-emerald-50', bg: 'bg-emerald-100',  border: 'border-emerald-300', text: 'text-emerald-800' },
  RECHAZADA:      { label: 'Rechazadas',    col: 'bg-red-50',     bg: 'bg-red-100',      border: 'border-red-300',     text: 'text-red-800' },
  ARCHIVADA:      { label: 'Archivadas',    col: 'bg-gray-100',   bg: 'bg-gray-200',     border: 'border-gray-400',    text: 'text-gray-600' },
}

const KANBAN_ORDER: MuestraEstado[] = ['SOLICITADA', 'EN_FABRICACION', 'EN_QC', 'ENVIADA', 'APROBADA', 'RECHAZADA']

const PRIORIDAD_META: Record<MuestraPrioridad, { label: string; color: string }> = {
  ALTA:  { label: 'Alta',  color: 'bg-red-100 text-red-700 border-red-200' },
  MEDIA: { label: 'Media', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  BAJA:  { label: 'Baja',  color: 'bg-gray-100 text-gray-600 border-gray-200' },
}

const TIPOS: MuestraTipo[] = ['PUERTA', 'ACABADO', 'HARDWARE', 'CABINET', 'OTRO']

export default function Muestras() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showArchivadas, setShowArchivadas] = useState(false)

  const canCreate = user?.rol === 'ADMIN' || user?.rol === 'ENGINEERING' || user?.rol === 'SHOP_MANAGER'

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['muestras', { incluir_archivadas: showArchivadas }],
    queryFn:  () => muestrasService.list({ incluir_archivadas: showArchivadas }),
    refetchInterval: 60_000,
  })

  const items = data?.items ?? []
  const resumen = data?.resumen

  // Agrupar por estado para el kanban
  const grouped = useMemo(() => {
    const g: Record<MuestraEstado, MuestraConDetalle[]> = {
      SOLICITADA: [], EN_FABRICACION: [], EN_QC: [], ENVIADA: [],
      APROBADA: [], RECHAZADA: [], ARCHIVADA: [],
    }
    items.forEach((m) => g[m.estado].push(m))
    return g
  }, [items])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Beaker size={20} className="text-gold-600" />
            Muestras
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gestión de muestras para clientes — del pedido a la aprobación final.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchivadas}
              onChange={(e) => setShowArchivadas(e.target.checked)}
              className="rounded text-gold-500 focus:ring-gold-500"
            />
            Ver archivadas
          </label>
          <button onClick={() => refetch()} disabled={isFetching} className="btn-ghost" title="Refrescar">
            <RefreshCw size={14} className={clsx(isFetching && 'animate-spin')} />
          </button>
          {canCreate && (
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus size={16} /> Nueva muestra
            </button>
          )}
        </div>
      </div>

      {/* KPIs — 6 estados + 1 KPI "rechazos historicos" calculado en el cliente */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          {KANBAN_ORDER.map((estado) => {
            const meta = ESTADO_META[estado]
            return (
              <div key={estado} className={clsx('kpi-card !h-auto !py-3 border', meta.border, meta.col)}>
                <div className="p-2 rounded-lg bg-white shrink-0">
                  <Beaker size={18} className={meta.text} />
                </div>
                <div>
                  <p className="kpi-label">{meta.label}</p>
                  <p className={clsx('kpi-value !text-2xl', meta.text)}>{resumen[estado] ?? 0}</p>
                </div>
              </div>
            )
          })}
          {/* Rechazos históricos = suma de (version_actual - 1) en muestras vivas
              Muestra el "esfuerzo perdido" en re-fabricaciones, no solo las que
              estan actualmente en RECHAZADA. */}
          {(() => {
            const total = items.reduce((s, m) => s + Math.max(0, (m.version_actual ?? 1) - 1), 0)
            return (
              <div className="kpi-card !h-auto !py-3 border border-red-200 bg-red-50/30" title="Total de rechazos a lo largo del histórico de todas las muestras">
                <div className="p-2 rounded-lg bg-white shrink-0">
                  <RotateCcw size={18} className="text-red-700" />
                </div>
                <div>
                  <p className="kpi-label">Rechazos totales</p>
                  <p className="kpi-value !text-2xl text-red-700">{total}</p>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Kanban */}
      {isLoading ? (
        <div className="p-12 text-center text-gray-400 text-sm">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Beaker size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500">No hay muestras todavía.</p>
          {canCreate && (
            <button onClick={() => setShowCreate(true)} className="btn-primary mt-4">
              <Plus size={16} /> Crear la primera muestra
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 overflow-x-auto">
          {KANBAN_ORDER.map((estado) => {
            const meta = ESTADO_META[estado]
            const cards = grouped[estado]
            return (
              <div key={estado} className={clsx('rounded-xl p-3 min-h-[400px] flex flex-col', meta.col)}>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className={clsx('text-xs font-semibold uppercase tracking-wider', meta.text)}>
                    {meta.label}
                  </h3>
                  <span className={clsx('text-xs font-bold px-1.5 py-0.5 rounded-full', meta.bg, meta.text)}>
                    {cards.length}
                  </span>
                </div>
                <div className="space-y-2 flex-1">
                  {cards.map((m) => (
                    <MuestraCard key={m.id} m={m} onClick={() => setSelectedId(m.id)} />
                  ))}
                  {cards.length === 0 && (
                    <p className="text-xs text-gray-400 italic text-center pt-4">vacío</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modales */}
      {showCreate && (
        <CrearMuestraModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['muestras'] })
            setShowCreate(false)
          }}
        />
      )}

      {selectedId && (
        <DetalleMuestraDrawer
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChange={() => qc.invalidateQueries({ queryKey: ['muestras'] })}
        />
      )}
    </div>
  )
}

// ─── Card del Kanban ─────────────────────────────────────────────────────────
function MuestraCard({ m, onClick }: { m: MuestraConDetalle; onClick: () => void }) {
  const vencida = m.fecha_compromiso && new Date(m.fecha_compromiso) < new Date()
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md hover:border-gold-300 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="font-mono text-[11px] font-bold text-gray-900">{m.codigo}</div>
        <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', PRIORIDAD_META[m.prioridad].color)}>
          {PRIORIDAD_META[m.prioridad].label}
        </span>
      </div>
      <p className="text-xs text-gray-700 line-clamp-2 mb-2">{m.descripcion}</p>
      <div className="text-[10px] text-gray-500 space-y-0.5">
        <div className="flex items-center gap-1 truncate">
          <span className="font-mono">{m.proyecto_codigo}</span>
        </div>
        {m.owner_nombre && (
          <div className="flex items-center gap-1 truncate">
            <UserIcon size={9} /> {m.owner_nombre}
          </div>
        )}
        {m.fecha_compromiso && (
          <div className={clsx('flex items-center gap-1', vencida && 'text-red-600 font-medium')}>
            <Calendar size={9} />
            {vencida && <AlertTriangle size={9} />}
            {new Date(m.fecha_compromiso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
          </div>
        )}
        {m.ocs_pendientes > 0 && (
          <div className="text-yellow-700">
            {m.ocs_pendientes} OC{m.ocs_pendientes > 1 ? 's' : ''} pendiente{m.ocs_pendientes > 1 ? 's' : ''}
          </div>
        )}
        {m.version_actual > 1 && (
          <div className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-purple-50 border border-purple-200">
            <span className="text-[10px] font-bold text-purple-700">V{m.version_actual}</span>
            <span className="text-[9px] text-purple-600">· V{m.version_actual - 1} rechazada</span>
          </div>
        )}
      </div>
    </button>
  )
}

// ─── Modal crear muestra ─────────────────────────────────────────────────────
function CrearMuestraModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [codigo, setCodigo] = useState('')
  const [proyectoId, setProyectoId] = useState<number | null>(null)
  const [descripcion, setDescripcion] = useState('')
  const [tipo, setTipo] = useState<MuestraTipo>('OTRO')
  const [prioridad, setPrioridad] = useState<MuestraPrioridad>('MEDIA')
  const [fechaCompromiso, setFechaCompromiso] = useState('')
  const [especificaciones, setEspecificaciones] = useState('')
  const [notas, setNotas] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: proyectosData } = useQuery({
    queryKey: ['proyectos-list-muestras'],
    queryFn: () => proyectosService.getAll({ limit: 200 }),
  })
  const proyectos = (proyectosData?.data ?? []).filter((p) => p.estado === 'activo')

  // Sugerir código SMP-YYYY-NNN con la cantidad actual + 1 (mejor que nada)
  const sugerirCodigo = () => {
    const year = new Date().getFullYear()
    setCodigo(`SMP-${year}-${String(Math.floor(Math.random() * 900) + 100)}`)
  }

  const mut = useMutation({
    mutationFn: async (body: CreateMuestraInput) => {
      // 1. Crear la muestra
      const result = await muestrasService.create(body)
      // 2. Si hay PDF, subirlo asociado a V1
      if (pdfFile && result.data?.id) {
        try {
          await muestrasService.uploadArchivo(result.data.id, pdfFile, 'sample_request', 1, pdfFile.name)
        } catch (err) {
          // No fallar todo si solo el archivo falla — avisar
          toast.error('Muestra creada pero el PDF no se pudo subir. Subilo desde el detalle.')
        }
      }
      return result
    },
    onSuccess: () => { toast.success('Muestra creada'); onSuccess() },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Error creando muestra'),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!codigo.trim()) return toast.error('Falta el código')
    if (!descripcion.trim()) return toast.error('Falta la descripción')
    // PDF Sample Request es OBLIGATORIO (decision Chali 2026-05-31)
    if (!pdfFile) {
      return toast.error('El PDF de Sample Request es obligatorio. Adjuntá el documento del cliente con los requerimientos.')
    }
    // proyecto_id es OPCIONAL ahora — INGENIERIA puede crear muestra huérfana
    // y linkearla a un proyecto después
    mut.mutate({
      codigo: codigo.trim().toUpperCase(),
      proyecto_id: proyectoId,  // puede ser null
      descripcion: descripcion.trim(),
      tipo,
      prioridad,
      fecha_compromiso: fechaCompromiso || null,
      especificaciones: especificaciones.trim() || null,
      notas: notas.trim() || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold">Nueva muestra</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Código *</label>
              <div className="flex gap-2">
                <input
                  type="text" value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                  required placeholder="SMP-2026-001" className="input flex-1"
                />
                <button type="button" onClick={sugerirCodigo} className="btn-ghost text-xs">Sugerir</button>
              </div>
            </div>
            <div>
              <label className="label">Proyecto <span className="text-xs text-gray-500 font-normal">(opcional — se puede linkear después)</span></label>
              <select
                value={proyectoId ?? ''}
                onChange={(e) => setProyectoId(e.target.value ? parseInt(e.target.value) : null)}
                className="input"
              >
                <option value="">— sin proyecto (linkear después) —</option>
                {proyectos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>)}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Si la muestra es para un proyecto nuevo todavía sin crear, dejá en blanco y la linkeás después desde el detalle.
              </p>
            </div>
          </div>

          <div>
            <label className="label">Descripción *</label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              required rows={2} className="input resize-none"
              placeholder="Ej: Puerta walnut matte 18x24 con herraje BLUM"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as MuestraTipo)} className="input">
                {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Prioridad</label>
              <select value={prioridad} onChange={(e) => setPrioridad(e.target.value as MuestraPrioridad)} className="input">
                <option value="ALTA">Alta</option>
                <option value="MEDIA">Media</option>
                <option value="BAJA">Baja</option>
              </select>
            </div>
            <div>
              <label className="label">Deadline</label>
              <input type="date" value={fechaCompromiso} onChange={(e) => setFechaCompromiso(e.target.value)} className="input" />
            </div>
          </div>

          <div>
            <label className="label">Especificaciones técnicas (V1)</label>
            <textarea
              value={especificaciones}
              onChange={(e) => setEspecificaciones(e.target.value)}
              rows={3} className="input resize-none"
              placeholder="Materiales, medidas, acabados, herrajes..."
            />
          </div>

          <div>
            <label className="label">Notas internas</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2} className="input resize-none"
              placeholder="Cualquier contexto adicional para el equipo"
            />
          </div>

          {/* PDF Sample Request — el documento que viene del cliente con los
              requerimientos. OBLIGATORIO (decision Chali 2026-05-31). */}
          <div>
            <label className="label flex items-center gap-1.5">
              <FileText size={14} />
              Sample Request (PDF del cliente) <span className="text-red-600">*</span>
              <span className="text-xs text-gray-500 font-normal">— obligatorio</span>
            </label>
            {pdfFile ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-gold-50 rounded-lg border border-gold-200">
                <FileText size={16} className="text-gold-700 shrink-0" />
                <span className="text-sm text-gray-700 truncate flex-1">{pdfFile.name}</span>
                <span className="text-xs text-gray-500">{(pdfFile.size / 1024).toFixed(0)} KB</span>
                <button
                  type="button"
                  onClick={() => { setPdfFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  className="p-1 hover:bg-gold-100 rounded text-gray-500"
                  title="Quitar"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gold-400 hover:bg-gold-50 hover:text-gold-700 transition-colors"
              >
                <Upload size={16} />
                Adjuntar PDF del sample request
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f && f.size > 20 * 1024 * 1024) {
                  toast.error('El archivo no puede pasar de 20 MB')
                  return
                }
                setPdfFile(f ?? null)
              }}
            />
          </div>

          <div className="flex gap-2 pt-3 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 justify-center">Cancelar</button>
            <button type="submit" disabled={mut.isPending} className="btn-primary flex-1 justify-center">
              {mut.isPending ? 'Creando…' : 'Crear muestra'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Drawer detalle de muestra ───────────────────────────────────────────────
function DetalleMuestraDrawer({ id, onClose, onChange }: { id: number; onClose: () => void; onChange: () => void }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [showEnvio, setShowEnvio] = useState(false)
  const [tab, setTab] = useState<'overview' | 'archivos' | 'ocs' | 'fotos' | 'envios' | 'timeline' | 'calendar'>('overview')

  // Muestras F2: state para el modal de crear OC asociada
  const [showCrearOC, setShowCrearOC] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['muestra', id],
    queryFn:  () => muestrasService.get(id),
  })

  // Muestras F2: status de OCs asociadas. Refresca cuando cambia detalle.
  const { data: ocsStatus, refetch: refetchOcsStatus } = useQuery({
    queryKey: ['muestra-ocs-status', id],
    queryFn:  () => muestrasService.ocsStatus(id),
    staleTime: 10_000,
  })

  // Muestras F2: mutación para marcar "sin compras necesarias"
  const sinCompras = useMutation({
    mutationFn: (motivo?: string) => muestrasService.marcarSinCompras(id, motivo),
    onSuccess: (res) => {
      toast.success(res.message)
      refetchOcsStatus()
      qc.invalidateQueries({ queryKey: ['muestra', id] })
      qc.invalidateQueries({ queryKey: ['tareas'] })  // se cerró tarea procurement + creó shop_manager
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'No se pudo marcar sin compras'),
  })

  const transicion = useMutation({
    mutationFn: (body: TransicionInput) => muestrasService.transicion(id, body),
    onSuccess: (res) => {
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['muestra', id] })
      onChange()
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Error en la transición'),
  })

  // F3: el modal "Iniciar fabricación" intercepta la transición SOLICITADA →
  // EN_FABRICACION para pre-llenar procesos según tipo. Sólo aplica desde
  // SOLICITADA (RECHAZADA → EN_FABRICACION sigue el flow viejo legacy).
  const [showIniciarFab, setShowIniciarFab] = useState(false)

  const m = data?.muestra
  // F8: OP de la versión actual (si existe) — usado para el tab Fotos
  const opIdActual = useMemo(() => {
    if (!m || !data?.versiones) return null
    const v = data.versiones.find((x) => x.version_numero === m.version_actual)
    return v?.op_id ?? null
  }, [m, data?.versiones])
  const canFlow = user?.rol === 'ADMIN' || user?.rol === 'SHOP_MANAGER'
  // F5: registrar envío + confirmar recepción es decisión de logística.
  // PROCUREMENT/ADMIN, NO SHOP_MANAGER.
  const canEnvio = user?.rol === 'ADMIN' || user?.rol === 'PROCUREMENT'
  // F6: aprobar / rechazar es decisión de ingeniería. ADMIN+ENGINEERING.
  const canApprove = user?.rol === 'ADMIN' || user?.rol === 'ENGINEERING'

  // Transiciones disponibles según estado actual + rol
  const transicionesDisponibles = useMemo<MuestraEstado[]>(() => {
    if (!m) return []
    const all: Record<MuestraEstado, MuestraEstado[]> = {
      SOLICITADA:     ['EN_FABRICACION', 'ARCHIVADA'],
      EN_FABRICACION: ['EN_QC', 'ARCHIVADA'],
      EN_QC:          ['ENVIADA', 'EN_FABRICACION', 'ARCHIVADA'],
      ENVIADA:        ['APROBADA', 'RECHAZADA', 'ARCHIVADA'],
      APROBADA:       ['ARCHIVADA'],
      RECHAZADA:      ['SOLICITADA', 'EN_FABRICACION', 'ARCHIVADA'],
      ARCHIVADA:      [],
    }
    const raw = all[m.estado] ?? []
    // F6: APROBADA / RECHAZADA solo si el rol puede aprobar.
    // Resto de transiciones requieren canFlow (ADMIN/SHOP_MANAGER).
    return raw.filter((dest) => {
      const isApprovalFlow = dest === 'APROBADA' || dest === 'RECHAZADA'
      if (isApprovalFlow) return canApprove
      return canFlow
    })
  }, [m, canFlow, canApprove])

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Cargando…</div>
        ) : !data || !m ? (
          <div className="p-12 text-center text-gray-400 text-sm">Muestra no encontrada</div>
        ) : (
          <>
            {/* Header */}
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-gray-500">{m.codigo}{m.version_actual > 1 && <span className="text-purple-700 ml-2">V{m.version_actual}</span>}</div>
                  <h2 className="text-lg font-semibold text-gray-900 mt-0.5">{m.descripcion}</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-semibold border', ESTADO_META[m.estado].bg, ESTADO_META[m.estado].text, ESTADO_META[m.estado].border)}>
                      {ESTADO_META[m.estado].label.replace(/s$/, '')}
                    </span>
                    <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', PRIORIDAD_META[m.prioridad].color)}>
                      {PRIORIDAD_META[m.prioridad].label}
                    </span>
                  </div>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Cerrar (Esc)">
                  <X size={18} />
                </button>
              </div>

              {/* Acciones de transición de estado */}
              {(canFlow || canApprove) && transicionesDisponibles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {transicionesDisponibles.map((dest) => {
                    const isReject = dest === 'RECHAZADA'
                    return (
                      <button
                        key={dest}
                        onClick={() => {
                          if (isReject) {
                            const razon = window.prompt('Razón del rechazo del cliente (qué pidió cambiar):')
                            if (!razon) return
                            transicion.mutate({ nuevo_estado: dest, razon_revision: razon })
                          } else if (dest === 'EN_FABRICACION' && m.estado === 'SOLICITADA') {
                            // F3: abrir modal con procesos pre-llenados en vez
                            // de transicionar directo. El endpoint del modal
                            // hace ambas cosas (crea OP con procesos +
                            // transición) en una sola transacción.
                            setShowIniciarFab(true)
                          } else {
                            transicion.mutate({ nuevo_estado: dest })
                          }
                        }}
                        disabled={transicion.isPending}
                        className={clsx(
                          'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors',
                          isReject
                            ? 'bg-red-50 text-red-700 hover:bg-red-100'
                            : dest === 'APROBADA'
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : dest === 'ARCHIVADA'
                                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                : 'bg-gold-50 text-gold-700 hover:bg-gold-100'
                        )}
                      >
                        <ArrowRight size={11} />
                        Pasar a {ESTADO_META[dest].label.replace(/s$/, '')}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* F5: botón Registrar envío visible para PROCUREMENT/ADMIN,
                  no para SHOP_MANAGER (cambio de responsabilidad). */}
              {canEnvio && (m.estado === 'EN_QC' || m.estado === 'ENVIADA') && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowEnvio(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
                  >
                    <Truck size={11} /> Registrar envío
                  </button>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-5 overflow-x-auto">
              {([
                ['overview', 'Overview'],
                ['archivos', `Archivos (${data.archivos?.length ?? 0})`],
                ['ocs',      `OCs (${data.ocs.length})`],
                // Tab Fotos solo si la muestra ya tiene una OP asociada (versión
                // actual con op_id). Aparece después de iniciar fabricación.
                ...(opIdActual ? [['fotos' as const, 'Fotos']] : []),
                ['envios',   `Envíos (${data.envios.length})`],
                ['timeline', 'Timeline'],
                ['calendar', 'Calendar'],
              ] as Array<[string, string]>).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key as any)}
                  className={clsx(
                    'px-3 py-2 text-sm border-b-2 transition-colors',
                    tab === key ? 'border-gold-500 text-gray-900 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Contenido tabs */}
            <div className="flex-1 overflow-y-auto p-5">
              {tab === 'overview' && (
                <div className="space-y-4">
                  {/* Banner si la muestra no tiene proyecto asignado */}
                  {!m.proyecto_id && (
                    <LinkearProyectoBanner muestraId={id} onLinked={() => qc.invalidateQueries({ queryKey: ['muestra', id] })} />
                  )}

                  {/* PDF actual destacado arriba si existe */}
                  {(() => {
                    const pdfActual = (data.archivos ?? [])
                      .filter((a) => a.tipo === 'sample_request' && a.version_numero === m.version_actual)
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                    if (!pdfActual) {
                      return (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
                          <FileText size={16} className="text-yellow-700 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-yellow-900">Sin PDF de sample request</div>
                            <div className="text-xs text-yellow-700 mt-0.5">
                              No hay un PDF de requerimientos para V{m.version_actual}. Subilo desde la pestaña Archivos.
                            </div>
                          </div>
                          <button onClick={() => setTab('archivos')} className="text-xs font-medium text-yellow-900 hover:underline shrink-0">
                            Ir →
                          </button>
                        </div>
                      )
                    }
                    return (
                      <a
                        href={pdfActual.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 px-3 py-2.5 bg-gold-50 border border-gold-200 rounded-lg hover:bg-gold-100 transition-colors"
                      >
                        <FileText size={18} className="text-gold-700 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gold-900 truncate">{pdfActual.nombre}</div>
                          <div className="text-xs text-gold-700">Sample Request V{m.version_actual} · {pdfActual.size_bytes ? `${(pdfActual.size_bytes / 1024).toFixed(0)} KB` : ''}</div>
                        </div>
                        <Download size={14} className="text-gold-700 shrink-0" />
                      </a>
                    )
                  })()}

                  <KV label="Proyecto" value={data.proyecto ? `${data.proyecto.codigo} — ${data.proyecto.nombre}` : '—'} />
                  <KV label="Cliente" value={data.proyecto?.cliente ?? '—'} />
                  <KV label="Tipo" value={m.tipo} />
                  <KV label="Owner" value={data.owner ? `${data.owner.nombre} (${data.owner.email})` : '—'} />
                  <KV label="Fecha solicitud" value={new Date(m.fecha_solicitud).toLocaleDateString('es-MX')} />
                  <KV label="Deadline" value={m.fecha_compromiso ? new Date(m.fecha_compromiso).toLocaleDateString('es-MX') : '—'} />
                  {m.fecha_aprobacion_cliente && (
                    <KV label="Aprobada por cliente" value={new Date(m.fecha_aprobacion_cliente).toLocaleDateString('es-MX')} />
                  )}
                  {m.notas && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Notas internas</div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{m.notas}</p>
                    </div>
                  )}
                  {data.versiones.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-2">
                        Historial de versiones
                        {data.versiones.length > 1 && (
                          <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-1.5 py-0.5">
                            <RotateCcw size={9} className="inline -mt-0.5" /> {data.versiones.length - 1} rechazo{data.versiones.length > 2 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {data.versiones.map((v) => {
                          const isCurrent = v.version_numero === m.version_actual
                          const wasRejected = v.razon_de_revision != null
                          return (
                            <div key={v.id} className={clsx(
                              'rounded-lg p-3 text-sm border',
                              isCurrent
                                ? 'bg-purple-50 border-purple-200'
                                : wasRejected
                                  ? 'bg-red-50/50 border-red-100'
                                  : 'bg-gray-50 border-gray-100'
                            )}>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className={clsx('font-semibold', isCurrent ? 'text-purple-700' : 'text-gray-700')}>
                                  V{v.version_numero}
                                </span>
                                {isCurrent && <span className="text-[10px] uppercase tracking-wider font-bold text-purple-600">Actual</span>}
                                {v.op_numero && <span className="text-xs text-gray-500">· OP: {v.op_numero} · {v.op_status}</span>}
                                {wasRejected && (
                                  <span className="text-[10px] uppercase tracking-wider font-bold text-red-700 bg-red-100 rounded-full px-1.5 py-0.5">
                                    Iniciada tras rechazo
                                  </span>
                                )}
                              </div>
                              {v.especificaciones && <p className="text-xs text-gray-700 whitespace-pre-wrap mt-1">{v.especificaciones}</p>}
                              {v.razon_de_revision && (
                                <div className="mt-2 px-2 py-1.5 bg-white rounded border border-red-100">
                                  <div className="text-[10px] uppercase font-semibold text-red-700">Razón del rechazo previo</div>
                                  <p className="text-xs text-red-900 mt-0.5">{v.razon_de_revision}</p>
                                </div>
                              )}
                              {v.comentarios_cliente && v.comentarios_cliente !== v.razon_de_revision && (
                                <p className="text-xs text-gray-600 mt-1 italic">"{v.comentarios_cliente}"</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'archivos' && (
                <ArchivosPanel
                  muestraId={id}
                  archivos={data.archivos ?? []}
                  currentVersion={m.version_actual}
                  canWrite={user?.rol === 'ADMIN' || user?.rol === 'ENGINEERING' || user?.rol === 'SHOP_MANAGER'}
                  onChange={() => qc.invalidateQueries({ queryKey: ['muestra', id] })}
                />
              )}

              {tab === 'ocs' && (
                <div className="space-y-3">
                  {/* F2: Header de progreso si hay OCs */}
                  {ocsStatus && ocsStatus.total > 0 && (
                    <div className={clsx(
                      'rounded-lg p-3 flex items-center justify-between',
                      ocsStatus.puede_fabricar
                        ? 'bg-emerald-50 border border-emerald-200'
                        : 'bg-amber-50 border border-amber-200'
                    )}>
                      <div className="flex items-center gap-2">
                        {ocsStatus.puede_fabricar
                          ? <Check size={16} className="text-emerald-700" />
                          : <ShoppingCart size={16} className="text-amber-700" />
                        }
                        <span className="text-sm font-semibold">
                          {ocsStatus.recibidas}/{ocsStatus.total} OCs recibidas
                        </span>
                      </div>
                      {ocsStatus.puede_fabricar && (
                        <span className="text-xs font-bold text-emerald-700 uppercase">
                          Listo para fabricar
                        </span>
                      )}
                    </div>
                  )}

                  {/* F2: Banner contextual cuando SOLICITADA sin OCs */}
                  {m.estado === 'SOLICITADA' && data.ocs.length === 0 && !ocsStatus?.sin_compras_marcado && (user?.rol === 'PROCUREMENT' || user?.rol === 'ADMIN') && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                      <div className="text-sm font-semibold text-blue-900">¿Materiales en stock?</div>
                      <p className="text-xs text-blue-700">
                        Si todo lo necesario para esta muestra ya está en el taller, marcala sin compras.
                        Si faltan materiales, creá las OCs directas asociadas.
                      </p>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => sinCompras.mutate(undefined)}
                          disabled={sinCompras.isPending}
                          className="text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                        >
                          {sinCompras.isPending ? 'Marcando…' : 'Sí, sin compras necesarias'}
                        </button>
                        <button
                          onClick={() => setShowCrearOC(true)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          No, crear OC asociada
                        </button>
                      </div>
                    </div>
                  )}

                  {/* F2: Indicación si ya se marcó "sin compras" */}
                  {ocsStatus?.sin_compras_marcado && data.ocs.length === 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm flex items-center gap-2">
                      <Check size={16} className="text-emerald-700" />
                      <span className="text-emerald-900 font-medium">Marcado como "sin compras necesarias" — materiales en stock</span>
                    </div>
                  )}

                  {/* Lista de OCs */}
                  {data.ocs.length === 0 ? (
                    !ocsStatus?.sin_compras_marcado && m.estado !== 'SOLICITADA' && (
                      <p className="text-sm text-gray-500 italic text-center py-8">
                        Sin OCs asociadas.
                      </p>
                    )
                  ) : (
                    data.ocs.map((oc) => (
                      <div key={oc.id} className="bg-gray-50 rounded-lg p-3 text-sm flex items-center justify-between">
                        <div>
                          <div className="font-mono text-xs font-bold">{oc.numero}</div>
                          <div className="text-xs text-gray-600">{oc.vendor_nombre} · {oc.origen}</div>
                        </div>
                        <div className="text-right">
                          <div className={clsx(
                            'text-xs font-semibold capitalize',
                            oc.estado === 'recibida' ? 'text-emerald-700' : 'text-amber-700'
                          )}>
                            {oc.estado}
                          </div>
                          <div className="text-xs text-gray-500">${Number(oc.total).toLocaleString('en-US')}</div>
                        </div>
                      </div>
                    ))
                  )}

                  {/* F2: Botón para crear OC asociada (cuando hay OCs ya pero faltan o cuando se quiere agregar más) */}
                  {(user?.rol === 'PROCUREMENT' || user?.rol === 'ADMIN') &&
                    (m.estado === 'SOLICITADA' || m.estado === 'EN_FABRICACION') &&
                    (data.ocs.length > 0 || ocsStatus?.sin_compras_marcado === false) && (
                    <button
                      onClick={() => setShowCrearOC(true)}
                      className="w-full text-sm font-medium px-3 py-2 rounded-md border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50 flex items-center justify-center gap-2"
                    >
                      <Plus size={14} />
                      Crear OC directa asociada
                    </button>
                  )}
                </div>
              )}

              {tab === 'fotos' && opIdActual && (
                <FotosAvanceSection ordenId={opIdActual} />
              )}

              {tab === 'envios' && (
                <div className="space-y-2">
                  {data.envios.length === 0 ? (
                    <p className="text-sm text-gray-500 italic text-center py-8">Sin envíos registrados.</p>
                  ) : (
                    data.envios.map((e) => (
                      <div key={e.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">{e.destinatario}</div>
                          <span className="text-xs text-gray-500">V{e.version_numero} · {new Date(e.fecha_envio).toLocaleDateString('es-MX')}</span>
                        </div>
                        {e.direccion && <div className="text-xs text-gray-600 mt-1">{e.direccion}</div>}
                        {e.tracking_carrier && (
                          <div className="text-xs text-gray-500 mt-1">
                            {e.tracking_carrier}{e.tracking_number && ` · ${e.tracking_number}`}
                          </div>
                        )}
                        {/* F5: foto del paquete/etiqueta si fue subida */}
                        {(e as any).foto_url && (
                          <a
                            href={(e as any).foto_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-2"
                            title="Ver foto en tamaño completo"
                          >
                            <img
                              src={(e as any).foto_url}
                              alt="Foto del paquete"
                              className="max-h-32 rounded border border-gray-200 hover:opacity-90 transition-opacity"
                            />
                          </a>
                        )}
                        {e.fecha_recepcion_confirmada ? (
                          <div className="text-xs text-emerald-700 font-medium mt-1">
                            ✓ Cliente confirmó recepción el {new Date(e.fecha_recepcion_confirmada).toLocaleDateString('es-MX')}
                          </div>
                        ) : canEnvio && (
                          <button
                            onClick={() => {
                              const today = new Date().toISOString().slice(0, 10)
                              muestrasService.confirmarRecepcion(id, e.id, today).then(() => {
                                toast.success('Recepción confirmada')
                                qc.invalidateQueries({ queryKey: ['muestra', id] })
                              })
                            }}
                            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Marcar como recibido por cliente
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'timeline' && (
                <div className="space-y-2">
                  {data.eventos.map((e) => (
                    <div key={e.id} className="flex items-start gap-2 text-sm">
                      <div className="w-2 h-2 rounded-full bg-gold-500 mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-500">
                          {new Date(e.timestamp).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                          {e.usuario_nombre && <span> · {e.usuario_nombre}</span>}
                          {e.version_numero > 1 && <span className="text-purple-700"> · V{e.version_numero}</span>}
                        </div>
                        <div className="text-gray-700">{e.detalle ?? <span className="capitalize">{e.tipo.replace('_', ' ')}</span>}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'calendar' && <CalendarMuestraTab data={data} />}
            </div>
          </>
        )}
      </div>

      {showEnvio && (
        <RegistrarEnvioModal
          onClose={() => setShowEnvio(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['muestra', id] })
            onChange()
            setShowEnvio(false)
          }}
          muestraId={id}
        />
      )}

      {/* Muestras F2: modal Crear OC pre-llenado con proyecto + muestra */}
      {showCrearOC && m && (
        <NuevaCompraNoMTOModal
          open={showCrearOC}
          onClose={() => {
            setShowCrearOC(false)
            // Refrescar OCs status + datos del drawer al cerrar
            refetchOcsStatus()
            qc.invalidateQueries({ queryKey: ['muestra', id] })
          }}
          defaultProyectoId={m.proyecto_id}
          defaultMuestraId={id}
        />
      )}

      {/* F3: modal "Iniciar fabricación" con procesos pre-llenados por tipo */}
      {showIniciarFab && m && (
        <IniciarFabricacionModal
          open={showIniciarFab}
          onClose={() => setShowIniciarFab(false)}
          muestraId={id}
          muestraCodigo={m.codigo}
          muestraTipo={m.tipo}
        />
      )}
    </div>
  )
}

// ─── Modal registrar envío ───────────────────────────────────────────────────
// F5: agrega input opcional de foto del paquete/etiqueta. Tras crear el envío
// hace una segunda llamada para subir la foto si existe — el endpoint nuevo
// /envios/:envioId/foto reemplaza la foto anterior si la hay.
function RegistrarEnvioModal({ muestraId, onClose, onSuccess }: { muestraId: number; onClose: () => void; onSuccess: () => void }) {
  const [destinatario, setDestinatario] = useState('')
  const [direccion, setDireccion] = useState('')
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')
  const [notas, setNotas] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const fotoPreview = useMemo(
    () => foto ? URL.createObjectURL(foto) : null,
    [foto]
  )

  const mut = useMutation({
    mutationFn: async (body: RegistrarEnvioInput) => {
      const res = await muestrasService.registrarEnvio(muestraId, body)
      // Si hay foto, segunda llamada para asociarla. Si falla, NO abortamos
      // — el envío ya quedó registrado.
      const envio = (res as any)?.data
      if (foto && envio?.id) {
        try {
          await muestrasService.uploadEnvioFoto(muestraId, envio.id, foto)
        } catch (err: any) {
          toast.error('Envío registrado, pero falló la subida de la foto: ' + (err?.response?.data?.message ?? 'error'))
        }
      }
      return res
    },
    onSuccess: () => { toast.success('Envío registrado'); onSuccess() },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Error registrando envío'),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!destinatario.trim()) return toast.error('Falta el destinatario')
    mut.mutate({
      destinatario: destinatario.trim(),
      direccion: direccion.trim() || undefined,
      tracking_carrier: carrier.trim() || undefined,
      tracking_number: tracking.trim() || undefined,
      notas: notas.trim() || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="text-lg font-semibold flex items-center gap-2"><Truck size={18} /> Registrar envío</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <label className="label">Destinatario *</label>
            <input type="text" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} required className="input" placeholder="Nombre del cliente o contacto" />
          </div>
          <div>
            <label className="label">Dirección</label>
            <textarea value={direccion} onChange={(e) => setDireccion(e.target.value)} rows={2} className="input resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Carrier</label>
              <input type="text" value={carrier} onChange={(e) => setCarrier(e.target.value)} className="input" placeholder="FedEx / UPS / Manual" />
            </div>
            <div>
              <label className="label">Tracking #</label>
              <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)} className="input" placeholder="Opcional" />
            </div>
          </div>
          <div>
            <label className="label">Notas</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="input resize-none" placeholder="Detalles adicionales" />
          </div>
          <div>
            <label className="label flex items-center gap-2">
              <Paperclip size={14} /> Foto del paquete / etiqueta (opcional)
            </label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
            {fotoPreview && (
              <div className="mt-2 relative inline-block">
                <img src={fotoPreview} alt="Preview" className="max-h-32 rounded border border-gray-200" />
                <button
                  type="button"
                  onClick={() => setFoto(null)}
                  className="absolute -top-2 -right-2 p-0.5 bg-white border border-gray-300 rounded-full shadow"
                  title="Quitar foto"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-3 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 justify-center">Cancelar</button>
            <button type="submit" disabled={mut.isPending} className="btn-primary flex-1 justify-center">
              {mut.isPending ? 'Guardando…' : 'Registrar envío'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function KV({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 uppercase mb-0.5">{label}</div>
      <div className="text-sm text-gray-900">{value}</div>
    </div>
  )
}

// ─── Banner para linkear muestra huérfana a un proyecto ──────────────────────
// Aparece en Overview cuando muestra.proyecto_id es NULL. Permite seleccionar
// un proyecto activo y vincularlo (PATCH). Necesario antes de poder pasar a
// EN_FABRICACION (la OP auto-creada requiere proyecto).
function LinkearProyectoBanner({ muestraId, onLinked }: { muestraId: number; onLinked: () => void }) {
  const [editing, setEditing] = useState(false)
  const [proyectoId, setProyectoId] = useState<number | null>(null)

  const { data: proyectosData } = useQuery({
    queryKey: ['proyectos-list-link-muestra'],
    queryFn: () => proyectosService.getAll({ limit: 200 }),
    enabled: editing,
  })
  const proyectos = (proyectosData?.data ?? []).filter((p) => p.estado === 'activo')

  const mut = useMutation({
    mutationFn: (pid: number) => muestrasService.update(muestraId, { proyecto_id: pid } as any),
    onSuccess: () => { toast.success('Proyecto vinculado'); onLinked(); setEditing(false) },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Error vinculando'),
  })

  if (!editing) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-medium text-amber-900">Sin proyecto asignado</div>
            <div className="text-xs text-amber-700 mt-0.5">
              Esta muestra no tiene proyecto. Para pasar a fabricación necesitás linkearla a un proyecto activo.
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="px-2.5 py-1 text-xs font-semibold rounded bg-amber-600 hover:bg-amber-700 text-white"
          >
            Linkear ahora
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-700" />
        <span className="text-sm font-medium text-amber-900">Linkear a proyecto activo</span>
      </div>
      <select
        value={proyectoId ?? ''}
        onChange={(e) => setProyectoId(e.target.value ? parseInt(e.target.value) : null)}
        className="input text-sm"
      >
        <option value="">— elegí proyecto —</option>
        {proyectos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>)}
      </select>
      <div className="flex gap-2">
        <button onClick={() => setEditing(false)} className="btn-ghost text-xs flex-1 justify-center">Cancelar</button>
        <button
          onClick={() => proyectoId && mut.mutate(proyectoId)}
          disabled={!proyectoId || mut.isPending}
          className="btn-primary text-xs flex-1 justify-center"
        >
          {mut.isPending ? 'Vinculando…' : 'Vincular'}
        </button>
      </div>
    </div>
  )
}

// ─── Tab Calendario de la muestra ────────────────────────────────────────────
// Mismo concepto que el calendar de ProyectoDetalle pero adaptado a un drawer
// más angosto, con eventos del ciclo de vida de UNA muestra: creación, cada
// transición de estado, envíos, recepción del cliente, aprobación, deadline.

type EventoCalendarMuestra = {
  fecha: string          // YYYY-MM-DD
  tipo: string           // 'creada' | 'qc_pass' | 'enviada' | 'aprobada' | 'rechazada' | 'deadline' | 'recepcion' | etc.
  label: string          // qué mostrar en el chip
  detalle: string        // tooltip
  version?: number
  color: string          // tailwind classes
}

function CalendarMuestraTab({ data }: { data: MuestraDetalle }) {
  const today = new Date()
  const [cursor, setCursor] = useState<{ year: number; month: number }>({
    year: today.getFullYear(),
    month: today.getMonth(),
  })

  // Consolidar eventos de distintas fuentes a una lista de calendario
  const eventos = useMemo<EventoCalendarMuestra[]>(() => {
    const out: EventoCalendarMuestra[] = []
    const m = data.muestra

    // 1. Eventos del timeline (transiciones, comentarios, etc.)
    for (const e of data.eventos) {
      const fecha = e.timestamp.slice(0, 10)
      const meta = getEventoCalMeta(e.tipo)
      out.push({
        fecha,
        tipo: e.tipo,
        label: meta.label,
        detalle: e.detalle ?? meta.label,
        version: e.version_numero,
        color: meta.color,
      })
    }

    // 2. Envíos físicos al cliente
    for (const env of data.envios) {
      out.push({
        fecha: env.fecha_envio,
        tipo: 'envio',
        label: `Envío V${env.version_numero}`,
        detalle: `Envío a ${env.destinatario}${env.tracking_carrier ? ` · ${env.tracking_carrier}` : ''}`,
        version: env.version_numero,
        color: 'bg-blue-100 text-blue-700',
      })
      // 3. Recepción confirmada por cliente
      if (env.fecha_recepcion_confirmada) {
        out.push({
          fecha: env.fecha_recepcion_confirmada,
          tipo: 'recepcion_cliente',
          label: `Recibido V${env.version_numero}`,
          detalle: `Cliente confirmó recepción del envío del ${env.fecha_envio}`,
          version: env.version_numero,
          color: 'bg-cyan-100 text-cyan-700',
        })
      }
    }

    // 4. Deadline (fecha_compromiso) — siempre visible
    if (m.fecha_compromiso) {
      out.push({
        fecha: m.fecha_compromiso,
        tipo: 'deadline',
        label: 'Deadline',
        detalle: `Fecha compromiso con el cliente`,
        color: 'bg-amber-100 text-amber-800 border border-amber-300',
      })
    }

    // 5. Aprobación del cliente (si existe)
    if (m.fecha_aprobacion_cliente) {
      out.push({
        fecha: m.fecha_aprobacion_cliente,
        tipo: 'aprobacion_cliente',
        label: 'Aprobada',
        detalle: 'Cliente aprobó oficialmente la muestra',
        color: 'bg-emerald-100 text-emerald-800',
      })
    }

    return out
  }, [data])

  // Agrupar por fecha YYYY-MM-DD
  const eventosPorDia = useMemo(() => {
    const map = new Map<string, EventoCalendarMuestra[]>()
    for (const ev of eventos) {
      if (!map.has(ev.fecha)) map.set(ev.fecha, [])
      map.get(ev.fecha)!.push(ev)
    }
    return map
  }, [eventos])

  // Detectar si hay actividad en otros meses (para guiar la navegación)
  const { eventosMesActual, eventosOtrosMeses, primerMes, ultimoMes } = useMemo(() => {
    const ymCursor = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
    let enMes = 0
    let fueraMes = 0
    const yms = new Set<string>()
    for (const ev of eventos) {
      const ym = ev.fecha.slice(0, 7)
      yms.add(ym)
      if (ym === ymCursor) enMes++; else fueraMes++
    }
    const sorted = [...yms].sort()
    return {
      eventosMesActual:  enMes,
      eventosOtrosMeses: fueraMes,
      primerMes: sorted[0] ?? null,
      ultimoMes: sorted[sorted.length - 1] ?? null,
    }
  }, [eventos, cursor])

  // Build grid de 42 celdas
  const grid = useMemo(() => buildMonthGridMuestra(cursor.year, cursor.month), [cursor])
  const monthName = new Date(cursor.year, cursor.month, 1).toLocaleString('es-MX', { month: 'long', year: 'numeric' })
  const todayISO  = today.toISOString().slice(0, 10)

  const prevMonth = () => setCursor((c) => c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 })
  const nextMonth = () => setCursor((c) => c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 })
  const goToday   = () => setCursor({ year: today.getFullYear(), month: today.getMonth() })
  const goToYm    = (ym: string) => {
    const [y, m] = ym.split('-')
    setCursor({ year: parseInt(y), month: parseInt(m) - 1 })
  }

  const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header con nav */}
      <div className="bg-gradient-to-r from-forest-700 to-forest-600 text-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays size={15} className="text-gold-300 shrink-0" />
            <h3 className="text-sm font-bold capitalize truncate">{monthName}</h3>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={prevMonth} className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors" title="Anterior">
              <ChevronLeft size={14} />
            </button>
            <button onClick={goToday} className="px-2.5 py-1 text-[11px] font-bold bg-gold-500 hover:bg-gold-600 text-white rounded transition-colors">
              Hoy
            </button>
            <button onClick={nextMonth} className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors" title="Siguiente">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Hint si hay eventos fuera del mes */}
      {(eventosOtrosMeses > 0) && (
        <div className="bg-forest-50/40 border-b border-gray-100 px-3 py-2 text-[11px] text-gray-600 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <strong className="text-forest-700">{eventosMesActual}</strong> este mes
            · <strong className="text-gray-700">{eventosOtrosMeses}</strong> en otros
          </div>
          <div className="flex items-center gap-1">
            {primerMes && primerMes !== `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}` && (
              <button onClick={() => goToYm(primerMes)} className="px-1.5 py-0.5 rounded text-forest-700 hover:bg-forest-100 font-medium">
                ← {primerMes.slice(5, 7)}/{primerMes.slice(2, 4)}
              </button>
            )}
            {ultimoMes && ultimoMes !== primerMes && ultimoMes !== `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}` && (
              <button onClick={() => goToYm(ultimoMes)} className="px-1.5 py-0.5 rounded text-forest-700 hover:bg-forest-100 font-medium">
                {ultimoMes.slice(5, 7)}/{ultimoMes.slice(2, 4)} →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="p-3">
        <div className="grid grid-cols-7 gap-1 mb-1.5">
          {DIAS.map((d) => (
            <div key={d} className="text-[9px] font-bold text-gray-400 uppercase tracking-wider text-center pb-0.5">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((cell, idx) => {
            const isCurrentMonth = cell.month === cursor.month
            const isToday        = cell.dateISO === todayISO
            const dayEvents      = eventosPorDia.get(cell.dateISO) ?? []
            return (
              <div
                key={idx}
                className={clsx(
                  'min-h-[72px] rounded p-1 flex flex-col gap-0.5 border',
                  isCurrentMonth ? 'bg-white border-gray-200' : 'bg-gray-50/60 border-gray-100',
                  isToday && '!bg-gold-50 !border-gold-400 ring-1 ring-gold-300',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={clsx(
                    'text-[10px] font-bold tabular-nums',
                    isToday ? 'text-gold-700' : isCurrentMonth ? 'text-gray-700' : 'text-gray-300'
                  )}>{cell.day}</span>
                  {isToday && <span className="text-[8px] font-bold bg-gold-500 text-white px-1 rounded">HOY</span>}
                </div>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {dayEvents.slice(0, 3).map((ev, i) => (
                    <span
                      key={i}
                      className={clsx('text-[8.5px] px-1 py-0.5 rounded font-medium truncate', ev.color)}
                      title={ev.detalle}
                    >
                      {ev.label}
                    </span>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[8px] text-gray-400 italic pl-1">+{dayEvents.length - 3}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Leyenda */}
      <div className="bg-gray-50/60 border-t border-gray-100 px-3 py-2">
        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Leyenda</p>
        <div className="flex flex-wrap gap-1 text-[9px]">
          <CalLegendChip color="bg-gray-100 text-gray-700" label="Creada" />
          <CalLegendChip color="bg-yellow-100 text-yellow-700" label="A fabricación" />
          <CalLegendChip color="bg-purple-100 text-purple-700" label="QC" />
          <CalLegendChip color="bg-blue-100 text-blue-700" label="Envío" />
          <CalLegendChip color="bg-cyan-100 text-cyan-700" label="Cliente recibió" />
          <CalLegendChip color="bg-emerald-100 text-emerald-700" label="Aprobada" />
          <CalLegendChip color="bg-red-100 text-red-700" label="Rechazada" />
          <CalLegendChip color="bg-amber-100 text-amber-800 border border-amber-300" label="Deadline" />
        </div>
      </div>
    </div>
  )
}

function CalLegendChip({ color, label }: { color: string; label: string }) {
  return <span className={clsx('inline-flex items-center px-1 py-0.5 rounded font-medium', color)}>{label}</span>
}

function getEventoCalMeta(tipo: string): { label: string; color: string } {
  switch (tipo) {
    case 'creada':         return { label: 'Creada',         color: 'bg-gray-100 text-gray-700' }
    case 'en_fabricacion': return { label: 'A fabricación',  color: 'bg-yellow-100 text-yellow-700' }
    case 'qc_pass':        return { label: 'QC',             color: 'bg-purple-100 text-purple-700' }
    case 'qc_fail':        return { label: 'QC fail',        color: 'bg-orange-100 text-orange-700' }
    case 'enviada':        return { label: 'Enviada',        color: 'bg-blue-100 text-blue-700' }
    case 'aprobada':       return { label: 'Aprobada',       color: 'bg-emerald-100 text-emerald-700' }
    case 'rechazada':      return { label: 'Rechazada',      color: 'bg-red-100 text-red-700' }
    case 'archivada':      return { label: 'Archivada',      color: 'bg-gray-200 text-gray-600' }
    case 'comentario':     return { label: 'Nota',           color: 'bg-gray-100 text-gray-600' }
    default:               return { label: tipo,             color: 'bg-gray-100 text-gray-600' }
  }
}

function buildMonthGridMuestra(year: number, month: number) {
  const firstOfMonth = new Date(year, month, 1)
  const firstDayWeekday = (firstOfMonth.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - firstDayWeekday)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    const y  = d.getFullYear()
    const m  = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return {
      day:     d.getDate(),
      month:   d.getMonth(),
      dateISO: `${y}-${m}-${dd}`,
    }
  })
}

// ─── Panel de archivos en el drawer ──────────────────────────────────────────
function ArchivosPanel({
  muestraId, archivos, currentVersion, canWrite, onChange,
}: {
  muestraId: number
  archivos: MuestraArchivo[]
  currentVersion: number
  canWrite: boolean
  onChange: () => void
}) {
  const [uploadTipo, setUploadTipo] = useState<string>('sample_request')
  const [uploadVersion, setUploadVersion] = useState<number>(currentVersion)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Agrupar archivos por versión, descendente
  const porVersion = useMemo(() => {
    const grupos: Record<number, MuestraArchivo[]> = {}
    archivos.forEach((a) => {
      if (!grupos[a.version_numero]) grupos[a.version_numero] = []
      grupos[a.version_numero].push(a)
    })
    return Object.entries(grupos)
      .map(([v, items]) => ({ version: parseInt(v), items }))
      .sort((a, b) => b.version - a.version)
  }, [archivos])

  const handleFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error('El archivo no puede pasar de 20 MB')
      return
    }
    setUploading(true)
    try {
      await muestrasService.uploadArchivo(muestraId, file, uploadTipo, uploadVersion, file.name)
      toast.success('Archivo subido')
      onChange()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error subiendo')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async (archivoId: number, nombre: string) => {
    if (!window.confirm(`¿Eliminar "${nombre}"?`)) return
    try {
      await muestrasService.deleteArchivo(muestraId, archivoId)
      toast.success('Eliminado')
      onChange()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error eliminando')
    }
  }

  const TIPOS_ARCHIVO = [
    { value: 'sample_request', label: 'Sample Request (PDF)', icon: FileText, color: 'text-gold-700 bg-gold-50' },
    { value: 'foto',           label: 'Foto',                  icon: Paperclip, color: 'text-blue-700 bg-blue-50' },
    { value: 'pdf',            label: 'PDF (otro)',            icon: FileText, color: 'text-purple-700 bg-purple-50' },
    { value: 'dwg',            label: 'DWG / Plano',           icon: FileText, color: 'text-emerald-700 bg-emerald-50' },
    { value: 'otro',           label: 'Otro',                  icon: Paperclip, color: 'text-gray-700 bg-gray-50' },
  ]

  return (
    <div className="space-y-4">
      {/* Uploader */}
      {canWrite && (
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="text-xs font-semibold text-gray-700 uppercase mb-2 flex items-center gap-1">
            <Upload size={12} /> Subir nuevo archivo
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-[11px] text-gray-600">Tipo</label>
              <select value={uploadTipo} onChange={(e) => setUploadTipo(e.target.value)} className="input text-sm py-1.5">
                {TIPOS_ARCHIVO.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-600">Versión</label>
              <select
                value={uploadVersion}
                onChange={(e) => setUploadVersion(parseInt(e.target.value))}
                className="input text-sm py-1.5"
              >
                {Array.from({ length: currentVersion }, (_, i) => currentVersion - i).map((v) => (
                  <option key={v} value={v}>V{v}{v === currentVersion ? ' (actual)' : ''}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gold-400 hover:bg-gold-50 hover:text-gold-700 transition-colors disabled:opacity-50"
          >
            <Upload size={14} />
            {uploading ? 'Subiendo…' : 'Elegir archivo'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.dwg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
          <p className="text-[10px] text-gray-500 mt-2">Máx 20 MB. PDF, imagen o DWG.</p>
        </div>
      )}

      {/* Lista agrupada por versión */}
      {porVersion.length === 0 ? (
        <p className="text-sm text-gray-500 italic text-center py-8">Sin archivos.</p>
      ) : (
        porVersion.map(({ version, items }) => (
          <div key={version}>
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-2">
              <span>Version {version}</span>
              {version === currentVersion && (
                <span className="text-[10px] font-bold text-purple-700">ACTUAL</span>
              )}
              <span className="text-gray-400 font-normal">({items.length} archivo{items.length !== 1 ? 's' : ''})</span>
            </div>
            <div className="space-y-1.5">
              {items.map((a) => {
                const tipoMeta = TIPOS_ARCHIVO.find((t) => t.value === a.tipo) ?? TIPOS_ARCHIVO[4]
                const Icon = tipoMeta.icon
                return (
                  <div key={a.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg p-2.5">
                    <div className={clsx('p-1.5 rounded shrink-0', tipoMeta.color)}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <a href={a.url} target="_blank" rel="noreferrer" className="text-sm text-gray-900 hover:text-gold-700 truncate block">
                        {a.nombre}
                      </a>
                      <div className="text-[10px] text-gray-500 flex items-center gap-2">
                        <span>{tipoMeta.label}</span>
                        {a.size_bytes && <span>· {(a.size_bytes / 1024).toFixed(0)} KB</span>}
                        {a.subido_por_nombre && <span>· {a.subido_por_nombre}</span>}
                        <span>· {new Date(a.created_at).toLocaleDateString('es-MX')}</span>
                      </div>
                    </div>
                    <a href={a.url} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-gray-100 rounded text-gray-500" title="Abrir">
                      <Download size={14} />
                    </a>
                    {canWrite && (
                      <button
                        onClick={() => handleDelete(a.id, a.nombre)}
                        className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
