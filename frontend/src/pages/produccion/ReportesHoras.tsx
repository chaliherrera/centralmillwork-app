import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Download, Users, User, Briefcase, RefreshCw, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { produccionService } from '@/services/produccion'
import { proyectosService } from '@/services/proyectos'

type Tab = 'activos' | 'persona' | 'proyecto'

const TABS: { value: Tab; label: string; icon: typeof Users }[] = [
  { value: 'activos',  label: 'Activos ahora', icon: Users },
  { value: 'persona',  label: 'Por persona',   icon: User },
  { value: 'proyecto', label: 'Por proyecto',  icon: Briefcase },
]

// Default range: últimos 30 días
function defaultDesde() {
  const d = new Date()
  d.setDate(d.getDate() - 29)
  return d.toISOString().slice(0, 10)
}
function hoy() {
  return new Date().toISOString().slice(0, 10)
}

export default function ReportesHoras() {
  const [tab, setTab] = useState<Tab>('activos')

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1 border-b border-gray-100">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.value
                ? 'border-gold-500 text-forest-700'
                : 'border-transparent text-gray-500 hover:text-forest-700'
            )}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'activos'  && <TabActivos />}
      {tab === 'persona'  && <TabPorPersona />}
      {tab === 'proyecto' && <TabPorProyecto />}
    </div>
  )
}

// ─── Tab 1: Activos ahora ────────────────────────────────────────────────────
function TabActivos() {
  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['tt-activos'],
    queryFn:  produccionService.personalActivo,
    refetchInterval: 30_000,
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {data.length === 0 ? 'Nadie clockeado ahora mismo' : `${data.length} ${data.length === 1 ? 'persona' : 'personas'} trabajando`}
          <span className="ml-2 text-gray-400">· auto-refresh 30s</span>
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-ghost text-sm py-1.5"
        >
          <RefreshCw size={14} className={clsx(isFetching && 'animate-spin')} />
          Actualizar
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="table-header">Persona</th>
              <th className="table-header">Entrada</th>
              <th className="table-header">Tiempo</th>
              <th className="table-header">Proyecto</th>
              <th className="table-header">Estación</th>
              <th className="table-header">Estado</th>
              <th className="table-header">Dispositivo</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="py-8 text-center"><Loader2 size={18} className="animate-spin text-gray-400 mx-auto" /></td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-gray-400 text-sm">Sin actividad</td></tr>
            ) : data.map((p) => {
              const horasEnEntrada = (Date.now() - new Date(p.hora_entrada).getTime()) / 3_600_000
              const enPausa = !!p.pausa_id
              return (
                <tr key={p.personal_id} className="table-row">
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-forest-100 text-forest-700 text-xs font-bold flex items-center justify-center">
                        {p.iniciales}
                      </span>
                      <span className="font-medium">{p.nombre_completo}</span>
                    </div>
                  </td>
                  <td className="table-cell text-sm">
                    {new Date(p.hora_entrada).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="table-cell tabular-nums font-semibold">{formatH(horasEnEntrada)}</td>
                  <td className="table-cell">
                    {p.proyecto_codigo ? (
                      <div>
                        <div className="font-medium text-sm">{p.proyecto_codigo}</div>
                        <div className="text-xs text-gray-500 truncate">{p.proyecto_nombre}</div>
                      </div>
                    ) : <span className="text-gray-400 text-xs italic">sin proyecto</span>}
                  </td>
                  <td className="table-cell">
                    {p.estacion ? (
                      <span className="px-2 py-0.5 rounded bg-gold-50 text-gold-800 text-xs uppercase font-medium">
                        {p.estacion.replace('_', ' ')}
                      </span>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="table-cell">
                    {enPausa ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        En pausa
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        Activo
                      </span>
                    )}
                  </td>
                  <td className="table-cell text-xs text-gray-500">
                    {p.dispositivo_clockin ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Tab 2: Por persona ──────────────────────────────────────────────────────
function TabPorPersona() {
  const [personalId, setPersonalId] = useState<number | null>(null)
  const [fechaDesde, setFechaDesde] = useState(defaultDesde())
  const [fechaHasta, setFechaHasta] = useState(hoy())

  const { data: personal = [] } = useQuery({
    queryKey: ['personal-taller', 'todos-activos'],
    queryFn:  () => produccionService.personal({ activo: true }),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['tt-personal', personalId, fechaDesde, fechaHasta],
    queryFn:  () => produccionService.reportePersonal(personalId!, fechaDesde, fechaHasta),
    enabled:  !!personalId,
  })

  const totales = useMemo(() => {
    if (!data?.registros) return { brutas: 0, pausas: 0, netas: 0 }
    let brutas = 0, pausas = 0
    for (const r of data.registros) {
      brutas += Number(r.total_horas ?? 0)
      pausas += Number(r.horas_pausas ?? 0)
    }
    return { brutas, pausas, netas: brutas - pausas }
  }, [data])

  async function exportar() {
    if (!personalId) return
    try {
      const blob = await produccionService.exportarHoras({
        tipo: 'personal',
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        personal_id: personalId,
      })
      downloadBlob(blob, `horas-${data?.personal_id}-${fechaDesde}_${fechaHasta}.xlsx`)
    } catch {
      toast.error('Error al generar el archivo')
    }
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Persona</label>
          <select
            value={personalId ?? ''}
            onChange={(e) => setPersonalId(e.target.value ? parseInt(e.target.value) : null)}
            className="input w-full"
          >
            <option value="">— elegí persona —</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre_completo} ({p.iniciales})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Desde</label>
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="input" />
        </div>
        <button onClick={exportar} disabled={!personalId} className="btn-primary">
          <Download size={14} /> Exportar
        </button>
      </div>

      {!personalId ? (
        <div className="card text-center py-12 text-gray-500 text-sm flex flex-col items-center gap-2">
          <AlertCircle size={24} className="text-gray-300" />
          Elegí una persona para ver su reporte
        </div>
      ) : isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
      ) : (
        <>
          {/* Totales */}
          <div className="grid grid-cols-3 gap-3">
            <Total label="Horas brutas" value={formatH(totales.brutas)} />
            <Total label="Pausas"       value={formatH(totales.pausas)} />
            <Total label="Horas netas"  value={formatH(totales.netas)}  highlight />
          </div>

          {/* Tabla */}
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="table-header">Fecha</th>
                  <th className="table-header">Entrada</th>
                  <th className="table-header">Salida</th>
                  <th className="table-header text-right">Brutas</th>
                  <th className="table-header text-right">Pausas</th>
                  <th className="table-header text-right">Netas</th>
                  <th className="table-header">Proyectos</th>
                </tr>
              </thead>
              <tbody>
                {data!.registros.length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center text-gray-400 text-sm">Sin registros en el período</td></tr>
                ) : data!.registros.map((r) => {
                  const brutas = Number(r.total_horas ?? 0)
                  const pausas = Number(r.horas_pausas ?? 0)
                  return (
                    <tr key={r.id} className="table-row">
                      <td className="table-cell font-medium">{r.fecha}</td>
                      <td className="table-cell text-sm">
                        {new Date(r.hora_entrada).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="table-cell text-sm">
                        {r.hora_salida
                          ? new Date(r.hora_salida).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                          : <span className="text-emerald-600 italic">en curso</span>}
                      </td>
                      <td className="table-cell text-right tabular-nums">{r.total_horas != null ? formatH(brutas) : '—'}</td>
                      <td className="table-cell text-right tabular-nums">{formatH(pausas)}</td>
                      <td className="table-cell text-right tabular-nums font-semibold">
                        {r.total_horas != null ? formatH(brutas - pausas) : '—'}
                      </td>
                      <td className="table-cell text-xs">
                        {r.proyectos.length === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.proyectos.map((p, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-gray-100 rounded text-[11px]">
                                {p.proyecto_codigo} {formatH(Number(p.horas ?? 0))}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tab 3: Por proyecto ─────────────────────────────────────────────────────
function TabPorProyecto() {
  const [proyectoId, setProyectoId] = useState<number | null>(null)
  const [fechaDesde, setFechaDesde] = useState(defaultDesde())
  const [fechaHasta, setFechaHasta] = useState(hoy())

  const { data: proyectosData } = useQuery({
    queryKey: ['proyectos-list'],
    queryFn:  () => proyectosService.getAll({ limit: 200 }),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['tt-proyecto', proyectoId, fechaDesde, fechaHasta],
    queryFn:  () => produccionService.reportePorProyecto(proyectoId!, fechaDesde, fechaHasta),
    enabled:  !!proyectoId,
  })

  const totalHoras = useMemo(() => {
    if (!data?.asignaciones) return 0
    return data.asignaciones.reduce((acc, a) => acc + Number(a.horas ?? 0), 0)
  }, [data])

  async function exportar() {
    if (!proyectoId) return
    try {
      const blob = await produccionService.exportarHoras({
        tipo: 'proyecto',
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        proyecto_id: proyectoId,
      })
      downloadBlob(blob, `horas-proyecto-${proyectoId}-${fechaDesde}_${fechaHasta}.xlsx`)
    } catch {
      toast.error('Error al generar el archivo')
    }
  }

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Proyecto</label>
          <select
            value={proyectoId ?? ''}
            onChange={(e) => setProyectoId(e.target.value ? parseInt(e.target.value) : null)}
            className="input w-full"
          >
            <option value="">— elegí proyecto —</option>
            {(proyectosData?.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Desde</label>
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="input" />
        </div>
        <button onClick={exportar} disabled={!proyectoId} className="btn-primary">
          <Download size={14} /> Exportar
        </button>
      </div>

      {!proyectoId ? (
        <div className="card text-center py-12 text-gray-500 text-sm flex flex-col items-center gap-2">
          <AlertCircle size={24} className="text-gray-300" />
          Elegí un proyecto para ver el desglose
        </div>
      ) : isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Total label="Horas totales" value={formatH(totalHoras)} highlight />
            <Total label="Personas" value={String(new Set(data!.asignaciones.map((a) => a.personal_id)).size)} />
          </div>

          <div className="card p-0 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="table-header">Persona</th>
                  <th className="table-header">Estación</th>
                  <th className="table-header text-right">Horas</th>
                  <th className="table-header text-right">Segmentos</th>
                  <th className="table-header">Distribución</th>
                </tr>
              </thead>
              <tbody>
                {data!.asignaciones.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center text-gray-400 text-sm">Sin actividad en el período</td></tr>
                ) : data!.asignaciones.map((a, i) => {
                  const horas = Number(a.horas ?? 0)
                  const pct = totalHoras > 0 ? (horas / totalHoras) * 100 : 0
                  return (
                    <tr key={`${a.personal_id}-${a.estacion}-${i}`} className="table-row">
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-forest-100 text-forest-700 text-[10px] font-bold flex items-center justify-center">
                            {a.iniciales}
                          </span>
                          {a.nombre_completo}
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className="px-2 py-0.5 rounded bg-gold-50 text-gold-800 text-xs uppercase font-medium">
                          {a.estacion.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="table-cell text-right tabular-nums font-semibold">{formatH(horas)}</td>
                      <td className="table-cell text-right text-sm text-gray-500">{a.segmentos}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gold-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 w-10 text-right tabular-nums">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function Total({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={clsx(
      'kpi-card',
      highlight && 'border-gold-300 bg-gold-50'
    )}>
      <div>
        <div className="kpi-label">{label}</div>
        <div className={clsx('kpi-value tabular-nums', highlight ? 'text-gold-700' : 'text-forest-700')}>
          {value}
        </div>
      </div>
    </div>
  )
}

function formatH(h: number): string {
  if (h <= 0) return '0h'
  if (h < 1) return `${Math.round(h * 60)}m`
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return mm === 0 ? `${hh}h` : `${hh}h ${mm}m`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
