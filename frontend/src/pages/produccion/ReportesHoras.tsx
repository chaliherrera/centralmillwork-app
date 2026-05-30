import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Download, Users, User, Briefcase, RefreshCw, AlertCircle, ChevronRight, ChevronDown, CalendarRange } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { produccionService } from '@/services/produccion'
import { proyectosService } from '@/services/proyectos'

type Tab = 'activos' | 'semanal' | 'persona' | 'proyecto'

const TABS: { value: Tab; label: string; icon: typeof Users }[] = [
  { value: 'activos',  label: 'Activos ahora',  icon: Users },
  { value: 'semanal',  label: 'Semanal (todos)', icon: CalendarRange },
  { value: 'persona',  label: 'Por persona',    icon: User },
  { value: 'proyecto', label: 'Por proyecto',   icon: Briefcase },
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
      {tab === 'semanal'  && <TabSemanal />}
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
  const [expanded, setExpanded] = useState<Set<number>>(new Set())  // registro_id expandidos

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

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
    if (!data?.registros) return { brutas: 0, items: 0, otro: 0, pausas: 0, sinAsignar: 0 }
    let brutas = 0, items = 0, otro = 0, pausas = 0, sinAsignar = 0
    for (const r of data.registros) {
      brutas     += Number(r.horas_brutas ?? r.total_horas ?? 0)
      items      += Number(r.horas_items ?? 0)
      otro       += Number(r.horas_otro_trabajo ?? 0)
      pausas     += Number(r.horas_pausas ?? 0)
      sinAsignar += Number(r.horas_sin_asignar ?? 0)
    }
    return { brutas, items, otro, pausas, sinAsignar }
  }, [data])

  // Trabajo agrupado por proyecto + estación en el período.
  // Útil para responder "¿en qué proyectos trabajó esta persona esta semana?"
  // y para nómina por proyecto.
  type ProyAgg = {
    proyecto_id: number
    proyecto_codigo: string
    proyecto_nombre: string
    total: number
    porEstacion: Map<string, number>
  }
  const trabajoPorProyecto: ProyAgg[] = useMemo(() => {
    if (!data?.registros) return []
    const map = new Map<number, ProyAgg>()
    for (const r of data.registros) {
      for (const p of (r.proyectos ?? [])) {
        const horas = Number(p.horas ?? 0)
        if (horas === 0) continue
        let agg = map.get(p.proyecto_id)
        if (!agg) {
          agg = {
            proyecto_id:     p.proyecto_id,
            proyecto_codigo: p.proyecto_codigo,
            proyecto_nombre: p.proyecto_nombre,
            total:           0,
            porEstacion:     new Map(),
          }
          map.set(p.proyecto_id, agg)
        }
        agg.total += horas
        agg.porEstacion.set(p.estacion, (agg.porEstacion.get(p.estacion) ?? 0) + horas)
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
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
          {/* Totales — 5 buckets para análisis de productividad */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Total label="Brutas"      value={formatH(totales.brutas)} highlight />
            <Total label="En items"    value={formatH(totales.items)} />
            <Total label="Otro trabajo" value={formatH(totales.otro)} />
            <Total label="Pausas"      value={formatH(totales.pausas)} />
            <Total label="Sin asignar" value={formatH(totales.sinAsignar)} />
          </div>

          {/* Tabla diaria — click en cualquier fila la expande para ver proyectos */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-base">Detalle por día</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Click en una fila para ver qué proyectos trabajó ese día
                </p>
              </div>
              {data!.registros.length > 1 && (
                <button
                  onClick={() => {
                    if (expanded.size === data!.registros.length) setExpanded(new Set())
                    else setExpanded(new Set(data!.registros.map((r) => r.id)))
                  }}
                  className="text-xs text-forest-700 hover:text-gold-600"
                >
                  {expanded.size === data!.registros.length ? 'Contraer todo' : 'Expandir todo'}
                </button>
              )}
            </div>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="table-header w-8"></th>
                  <th className="table-header">Fecha</th>
                  <th className="table-header">Entrada</th>
                  <th className="table-header">Salida</th>
                  <th className="table-header text-right">Brutas</th>
                  <th className="table-header text-right">En items</th>
                  <th className="table-header text-right">Otro</th>
                  <th className="table-header text-right">Pausas</th>
                  <th className="table-header text-right">Sin asignar</th>
                </tr>
              </thead>
              <tbody>
                {data!.registros.length === 0 ? (
                  <tr><td colSpan={9} className="py-12 text-center text-gray-400 text-sm">Sin registros en el período</td></tr>
                ) : data!.registros.map((r) => {
                  const brutas = Number(r.horas_brutas ?? r.total_horas ?? 0)
                  const items  = Number(r.horas_items ?? 0)
                  const otro   = Number(r.horas_otro_trabajo ?? 0)
                  const pausas = Number(r.horas_pausas ?? 0)
                  const sinAs  = Number(r.horas_sin_asignar ?? 0)
                  const isOpen = expanded.has(r.id)
                  // Agrupar proyectos del día por (proyecto_id, proyecto_codigo, proyecto_nombre)
                  // y desglosar horas por estación.
                  type ProyDia = {
                    codigo: string
                    nombre: string
                    total: number
                    estaciones: Map<string, number>
                  }
                  const proyectosDia = new Map<number, ProyDia>()
                  for (const p of (r.proyectos ?? [])) {
                    const horas = Number(p.horas ?? 0)
                    if (horas === 0) continue
                    let pd = proyectosDia.get(p.proyecto_id)
                    if (!pd) {
                      pd = {
                        codigo: p.proyecto_codigo,
                        nombre: p.proyecto_nombre,
                        total: 0,
                        estaciones: new Map(),
                      }
                      proyectosDia.set(p.proyecto_id, pd)
                    }
                    pd.total += horas
                    pd.estaciones.set(p.estacion, (pd.estaciones.get(p.estacion) ?? 0) + horas)
                  }
                  const proyectosOrdenados = Array.from(proyectosDia.values()).sort((a, b) => b.total - a.total)

                  return (
                    <>
                      <tr
                        key={r.id}
                        className="table-row cursor-pointer"
                        onClick={() => toggleExpand(r.id)}
                      >
                        <td className="table-cell text-gray-400">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td className="table-cell font-medium">{r.fecha}</td>
                        <td className="table-cell text-sm">
                          {new Date(r.hora_entrada).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="table-cell text-sm">
                          {r.hora_salida
                            ? new Date(r.hora_salida).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                            : <span className="text-emerald-600 italic">en curso</span>}
                        </td>
                        <td className="table-cell text-right tabular-nums font-semibold">{brutas > 0 ? formatH(brutas) : '—'}</td>
                        <td className="table-cell text-right tabular-nums text-emerald-700">{formatH(items)}</td>
                        <td className="table-cell text-right tabular-nums text-gold-700">{formatH(otro)}</td>
                        <td className="table-cell text-right tabular-nums text-blue-700">{formatH(pausas)}</td>
                        <td className="table-cell text-right tabular-nums text-gray-600" title="Tiempo entre items: análisis, agua, llamadas, etc.">{formatH(sinAs)}</td>
                      </tr>
                      {isOpen && (
                        <tr key={`${r.id}-detail`} className="bg-gray-50/70">
                          <td></td>
                          <td colSpan={8} className="px-4 py-3">
                            {proyectosOrdenados.length === 0 ? (
                              <div className="text-xs text-gray-400 italic py-2">
                                Sin trabajo en items asignados este día
                                {otro > 0 && ' (solo Otro trabajo o pausas)'}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                                  Proyectos trabajados ({proyectosOrdenados.length})
                                </div>
                                <table className="w-full text-sm">
                                  <tbody>
                                    {proyectosOrdenados.map((p, i) => (
                                      <tr key={i} className="border-t border-gray-200/60">
                                        <td className="py-1.5 pr-3 w-1/3">
                                          <div className="font-semibold text-sm">{p.codigo}</div>
                                          <div className="text-xs text-gray-500">{p.nombre}</div>
                                        </td>
                                        <td className="py-1.5 pr-3">
                                          <div className="flex flex-wrap gap-1.5">
                                            {Array.from(p.estaciones.entries()).map(([est, h]) => (
                                              <span
                                                key={est}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-forest-50 text-forest-700 text-xs"
                                              >
                                                <span className="uppercase text-[10px]">{est.replace('_', ' ')}</span>
                                                <span className="font-semibold tabular-nums">{formatH(h)}</span>
                                              </span>
                                            ))}
                                          </div>
                                        </td>
                                        <td className="py-1.5 text-right tabular-nums font-bold text-emerald-700 w-20">{formatH(p.total)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Trabajo agrupado por proyecto en el período — */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-base">Trabajo por proyecto</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Cómo se repartió el tiempo de items entre proyectos en este período
                </p>
              </div>
              {trabajoPorProyecto.length > 0 && (
                <span className="text-xs text-gray-500">
                  {trabajoPorProyecto.length} proyecto{trabajoPorProyecto.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {trabajoPorProyecto.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">
                Sin trabajo en proyectos en este período
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="table-header">Proyecto</th>
                    <th className="table-header">Por estación</th>
                    <th className="table-header text-right">Total</th>
                    <th className="table-header text-right w-32">% del total</th>
                  </tr>
                </thead>
                <tbody>
                  {trabajoPorProyecto.map((p) => {
                    const pct = totales.items > 0 ? (p.total / totales.items) * 100 : 0
                    return (
                      <tr key={p.proyecto_id} className="table-row">
                        <td className="table-cell">
                          <div className="font-semibold text-sm">{p.proyecto_codigo}</div>
                          <div className="text-xs text-gray-500">{p.proyecto_nombre}</div>
                        </td>
                        <td className="table-cell text-xs">
                          <div className="flex flex-wrap gap-1.5">
                            {Array.from(p.porEstacion.entries()).map(([est, h]) => (
                              <span
                                key={est}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-forest-50 text-forest-700"
                              >
                                <span className="uppercase text-[10px]">{est.replace('_', ' ')}</span>
                                <span className="font-semibold tabular-nums">{formatH(h)}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="table-cell text-right tabular-nums font-bold text-emerald-700">{formatH(p.total)}</td>
                        <td className="table-cell text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500"
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            <span className="tabular-nums text-xs text-gray-600 w-10">{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200">
                    <td className="table-cell font-bold">Total en items</td>
                    <td className="table-cell"></td>
                    <td className="table-cell text-right tabular-nums font-bold text-emerald-800">{formatH(totales.items)}</td>
                    <td className="table-cell text-right text-xs text-gray-500">100%</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tab Semanal: grid Operarios × Días con proyectos por celda ─────────────
// Pensado para el reporte de viernes a fin de día: panorama de toda la semana
// del equipo completo, con detalle por proyecto en cada celda.
function TabSemanal() {
  // Default range: lunes a viernes de esta semana
  const [desde, setDesde] = useState(lunesEstaSemana())
  const [hasta, setHasta] = useState(viernesEstaSemana())
  const [exportando, setExportando] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['tt-semanal', desde, hasta],
    queryFn:  () => produccionService.reporteSemanal(desde, hasta),
  })

  function preset(tipo: 'esta_semana' | 'semana_pasada' | 'ultimos_7') {
    const now = new Date()
    if (tipo === 'esta_semana') {
      setDesde(lunesEstaSemana()); setHasta(viernesEstaSemana())
    } else if (tipo === 'semana_pasada') {
      const lun = new Date(now); lun.setDate(lun.getDate() - 7 - ((lun.getDay() + 6) % 7))
      const vie = new Date(lun); vie.setDate(vie.getDate() + 4)
      setDesde(lun.toISOString().slice(0, 10)); setHasta(vie.toISOString().slice(0, 10))
    } else if (tipo === 'ultimos_7') {
      const d = new Date(now); d.setDate(d.getDate() - 6)
      setDesde(d.toISOString().slice(0, 10)); setHasta(now.toISOString().slice(0, 10))
    }
  }

  async function exportar() {
    setExportando(true)
    try {
      const blob = await produccionService.exportarHoras({
        tipo: 'semanal',
        fecha_desde: desde,
        fecha_hasta: hasta,
      })
      downloadBlob(blob, `horas-semanal-${desde}_${hasta}.xlsx`)
      toast.success('Excel generado')
    } catch {
      toast.error('Error al generar el archivo')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Filtros + presets + exportar */}
      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input" />
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <button onClick={() => preset('esta_semana')}   className="btn-ghost text-xs">Esta semana</button>
          <button onClick={() => preset('semana_pasada')} className="btn-ghost text-xs">Semana pasada</button>
          <button onClick={() => preset('ultimos_7')}     className="btn-ghost text-xs">Últimos 7 días</button>
        </div>
        <button
          onClick={exportar}
          disabled={exportando || !data}
          className="btn-primary ml-auto"
          title="Genera 3 hojas: Resumen (grid), Detalle (1 fila por estación) y Totales por operario"
        >
          {exportando
            ? <><Loader2 size={14} className="animate-spin" /> Generando…</>
            : <><Download size={14} /> Exportar Excel</>}
        </button>
      </div>
      <div className="text-xs text-gray-500 px-1">
        Tip: click en una celda para ver el detalle del día. El Excel incluye 3 hojas: <strong>Resumen</strong> (grid), <strong>Detalle</strong> (1 fila por estación) y <strong>Totales</strong>.
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
      ) : !data ? (
        <div className="card text-center py-12 text-gray-500 text-sm">Sin datos</div>
      ) : (
        <SemanalGrid data={data} />
      )}
    </div>
  )
}

function SemanalGrid({ data }: { data: import('@/types/produccion').ReporteSemanalResp }) {
  // Filtra personas que no tengan actividad en TODO el rango (para no mostrar 13 filas vacías)
  const [mostrarVacios, setMostrarVacios] = useState(false)
  const personalConDatos = data.personal.filter((p) =>
    p.total_horas_items > 0 ||
    Object.values(p.dias).some((d) => d && d.horas_brutas > 0)
  )
  const personal = mostrarVacios ? data.personal : personalConDatos
  const dias = data.dias

  // Estado de celda expandida: 'personalId:fecha'
  const [expanded, setExpanded] = useState<string | null>(null)
  function celdaKey(pid: number, f: string) { return `${pid}:${f}` }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-base">Semana del {fmtDia(dias[0])} al {fmtDia(dias[dias.length - 1])}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {personalConDatos.length} de {data.personal.length} operarios con actividad
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={mostrarVacios} onChange={(e) => setMostrarVacios(e.target.checked)} className="w-3.5 h-3.5" />
          Mostrar operarios sin actividad
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-gray-50 z-10 px-3 py-2.5 text-xs uppercase tracking-wider font-semibold text-gray-500 border-b border-r border-gray-200">
                Operario
              </th>
              {dias.map((d) => {
                const dt = new Date(d + 'T00:00:00')
                const esHoy = d === new Date().toISOString().slice(0, 10)
                const esFinde = dt.getDay() === 0 || dt.getDay() === 6
                return (
                  <th
                    key={d}
                    className={clsx(
                      'px-2 py-2.5 text-center text-[11px] font-semibold border-b border-gray-200 min-w-[110px]',
                      esHoy ? 'bg-gold-50 text-forest-700' : esFinde ? 'bg-gray-100 text-gray-400' : 'text-gray-500'
                    )}
                  >
                    <div className="uppercase">{dt.toLocaleDateString('es-MX', { weekday: 'short' })}</div>
                    <div className="text-[10px] font-normal mt-0.5">{dt.getDate()}/{dt.getMonth() + 1}</div>
                  </th>
                )
              })}
              <th className="px-3 py-2.5 text-right text-xs uppercase tracking-wider font-semibold text-gray-700 border-b border-l border-gray-200 bg-emerald-50/50 min-w-[80px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {personal.length === 0 ? (
              <tr><td colSpan={dias.length + 2} className="py-12 text-center text-gray-400 text-sm">
                Nadie clockeó en este período
              </td></tr>
            ) : personal.map((p) => (
              <tr key={p.personal_id} className="border-b border-gray-100">
                <td className="sticky left-0 bg-white z-10 px-3 py-2 border-r border-gray-200">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-forest-100 text-forest-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                      {p.iniciales}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs truncate">{p.nombre_completo}</div>
                    </div>
                  </div>
                </td>
                {dias.map((d) => {
                  const dia = p.dias[d]
                  const dt = new Date(d + 'T00:00:00')
                  const esFinde = dt.getDay() === 0 || dt.getDay() === 6
                  const key = celdaKey(p.personal_id, d)
                  const isOpen = expanded === key
                  return (
                    <td
                      key={d}
                      className={clsx(
                        'px-2 py-1.5 align-top text-[11px] border-r border-gray-100',
                        esFinde && 'bg-gray-50/60',
                        dia && dia.proyectos.length > 0 && 'cursor-pointer hover:bg-emerald-50/50',
                        isOpen && 'bg-emerald-50'
                      )}
                      onClick={() => dia && dia.proyectos.length > 0 && setExpanded(isOpen ? null : key)}
                    >
                      {!dia ? (
                        <div className="text-center text-gray-300 italic">—</div>
                      ) : dia.proyectos.length === 0 ? (
                        <div className="text-center text-gray-400 italic">
                          {dia.horas_brutas > 0 ? `${formatH(dia.horas_brutas)}\nsin items` : '—'}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {/* Top 2 proyectos */}
                          {dia.proyectos.slice(0, 2).map((proy) => (
                            <div key={proy.proyecto_id ?? 'libre'} className="leading-tight">
                              <div className="font-mono text-[10px] text-forest-700 font-semibold truncate" title={proy.proyecto_nombre ?? ''}>
                                {proy.proyecto_codigo ?? 'Libre'}
                              </div>
                              <div className="tabular-nums font-bold text-emerald-700">{formatH(proy.total_horas)}</div>
                            </div>
                          ))}
                          {dia.proyectos.length > 2 && (
                            <div className="text-[10px] text-gray-500 italic">+{dia.proyectos.length - 2} más</div>
                          )}
                          {isOpen && (
                            <div className="mt-1 pt-1 border-t border-emerald-200/60 space-y-1">
                              {dia.proyectos.map((proy) => (
                                <div key={proy.proyecto_id ?? 'libre'} className="leading-tight">
                                  <div className="font-mono text-[10px] text-forest-700 font-semibold">{proy.proyecto_codigo ?? 'Libre'}</div>
                                  <div className="text-[10px] text-gray-600 truncate">{proy.proyecto_nombre ?? ''}</div>
                                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                                    {proy.estaciones.map((e) => (
                                      <span key={e.estacion} className="inline-block px-1 py-0.5 rounded bg-forest-700/10 text-forest-700 text-[9px] uppercase">
                                        {e.estacion.replace('_', ' ')} <span className="font-bold">{formatH(e.horas)}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                              <div className="pt-1 border-t border-emerald-200/40 text-[10px] flex justify-between">
                                <span className="text-gray-500">Items</span>
                                <span className="font-bold text-emerald-700">{formatH(dia.total_horas)}</span>
                              </div>
                              <div className="text-[10px] flex justify-between">
                                <span className="text-gray-500">Brutas</span>
                                <span className="font-semibold">{formatH(dia.horas_brutas)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700 border-l border-gray-200 bg-emerald-50/30">
                  {formatH(p.total_horas_items)}
                </td>
              </tr>
            ))}
          </tbody>
          {personal.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td className="sticky left-0 bg-gray-50 z-10 px-3 py-2 font-bold text-xs border-r border-gray-200">
                  Total día
                </td>
                {dias.map((d) => {
                  const totalDia = personal.reduce((acc, p) => acc + (p.dias[d]?.total_horas ?? 0), 0)
                  return (
                    <td key={d} className="px-2 py-2 text-center tabular-nums font-bold text-xs border-r border-gray-100">
                      {totalDia > 0 ? formatH(totalDia) : '—'}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right tabular-nums font-extrabold text-emerald-800 border-l border-gray-200 bg-emerald-100/40">
                  {formatH(personal.reduce((acc, p) => acc + p.total_horas_items, 0))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

function fmtDia(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function lunesEstaSemana(): string {
  const d = new Date()
  const diff = (d.getDay() + 6) % 7  // 0=lun, 6=dom
  d.setDate(d.getDate() - diff)
  return d.toISOString().slice(0, 10)
}
function viernesEstaSemana(): string {
  const d = new Date(lunesEstaSemana() + 'T00:00:00')
  d.setDate(d.getDate() + 4)
  return d.toISOString().slice(0, 10)
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
