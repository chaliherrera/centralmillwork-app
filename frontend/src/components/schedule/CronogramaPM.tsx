// ─────────────────────────────────────────────────────────────────────────────
// Cronograma de proyecto (vista PM / Dirección de Proyectos) — rediseño Apple-native.
// Handoff: design_handoff_cronograma_pm. Reconstruido sobre el modelo de datos real
// (CPM holgura.ts → IngPlan / IngTareaPlan). ESTA ETAPA (A): layout + cabecera de
// resumen + lista + Gantt de SOLO LECTURA. La edición (inspector) y el drag llegan
// en etapas B/C. El % de avance es SIEMPRE el real calculado (nunca tecleado).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react'
import { Search, Plus, Loader2, Trash2, Pin, PinOff, MoreHorizontal, Flag, CalendarClock, X, Package, FlaskConical, Wrench, Wallet, ChevronDown, Printer, Lock, LockOpen, Wand2, Send, ClipboardList, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { ingenieriaService, type IngProyecto, type IngTarea, type IngPlan, type IngTareaPlan, type InstalacionDetalle } from '@/services/ingenieria'
import CronogramaCliente, { ganttDesdePlan } from '@/components/schedule/CronogramaCliente'
import CambiarIngeniero from '@/components/modules/ingenieria/CambiarIngeniero'
import InstalacionPanel from '@/components/modules/ingenieria/InstalacionPanel'

const shortProj = (p: string | null) => (p || '—').replace(/^\s*(\d{2}-\d{3})\s*/, '$1 · ')

// ── Helpers de fecha (día-a-día, en px) ──
const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const MES3 = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DAY = 86400000
const d = (iso: string) => new Date(iso + 'T00:00:00')
const diffDays = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY)
const addDaysIso = (iso: string, n: number) => { const x = d(iso); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }
const mondayOf = (dt: Date) => { const x = new Date(dt); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); x.setHours(0, 0, 0, 0); return x }
const fmtD = (iso: string | null) => (iso ? `${d(iso).getDate()} ${MES3[d(iso).getMonth()]}` : '—')
const usd = (n: number | null | undefined) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US'))
const isWeekend = (dt: Date) => { const w = dt.getDay(); return w === 0 || w === 6 }

// ── Estado de la tarea → colores del diseño (punto / pista / relleno) ──
type EstKey = 'pend' | 'prog' | 'done' | 'block'
function estadoInfo(estado: string): { key: EstKey; dot: string; track: string; fill: string; label: string } {
  switch (estado) {
    case 'hecha': return { key: 'done', dot: '#30a46c', track: '#d6efe1', fill: '#30a46c', label: 'Hecha' }
    case 'en_curso': return { key: 'prog', dot: '#0a6cdf', track: '#d9e7fa', fill: '#0a6cdf', label: 'En curso' }
    case 'bloqueada': return { key: 'block', dot: '#e8860c', track: '#fbe6c8', fill: '#e8860c', label: 'Bloqueada' }
    case 'na': return { key: 'pend', dot: '#c7c7cc', track: '#ececf0', fill: '#d4d4d8', label: 'N/A' }
    default: return { key: 'pend', dot: '#aeaeb2', track: '#ececf0', fill: '#c7c7cc', label: 'Pendiente' }
  }
}
// Avatares: 4 pares (fondo / texto), estables por nombre
const AVA: [string, string][] = [['#e2edfb', '#0a5cc2'], ['#dcf1e5', '#1a7f4b'], ['#f3e6fa', '#8a3fb0'], ['#fcebd3', '#a65f00']]
const iniciales = (nombre: string) => nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
const hashIdx = (s: string, n: number) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % n }

// Zoom: px por día (Semana / Mes / Trimestre)
const PX: Record<'semana' | 'mes' | 'trimestre', number> = { semana: 40, mes: 15, trimestre: 5 }

type Props = {
  proyectos: IngProyecto[]
  all: IngTarea[]
  plan: IngPlan | null
  planLoading: boolean
  sel: string
  setSel: (s: string) => void
  onEdit: (t: IngTarea | 'new') => void
  onRefresh: () => void
}

export default function CronogramaPM({ proyectos, all, plan, planLoading, sel, setSel, onRefresh }: Props) {
  const [zoom, setZoom] = useState<'semana' | 'mes' | 'trimestre'>('mes')
  const [query, setQuery] = useState('')
  const [criticalOnly, setCriticalOnly] = useState(false)
  const [showSlack, setShowSlack] = useState(false)
  const [selId, setSelId] = useState<number | null>(null)          // selección (resalta; inspector = etapa B)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [menuOpen, setMenuOpen] = useState(false)                  // menú "···" (acciones del proyecto)
  const [cronoOpen, setCronoOpen] = useState(false)                // modal cronograma cliente
  const [baseBusy, setBaseBusy] = useState(false)
  const [modOpen, setModOpen] = useState(false)                    // fila de módulos (Compras/Muestras/...) desplegada
  const [depBusy, setDepBusy] = useState(false)                    // gate del depósito (abrir/cerrar)
  const [instOpen, setInstOpen] = useState(false)                  // modal detalle de instalación
  const [instDet, setInstDet] = useState<InstalacionDetalle | null>(null)
  const [instBusy, setInstBusy] = useState(false)
  const [actBusy, setActBusy] = useState(false)                    // acciones del Scheduler (proponer/generar/enviar)
  const [takeoffOpen, setTakeoffOpen] = useState(false)            // modal "Ver take off"
  const [ingenierosActivos, setIngenierosActivos] = useState<string[]>([])  // TODOS los ingenieros activos (no solo los del plan)
  // Drag de BARRA (mover la fecha de inicio = fijar, restricción MSP)
  const [barDrag, setBarDrag] = useState<{ id: number; startX: number; origStart: string; deltaDays: number; movable: boolean } | null>(null)
  const barDragRef = useRef(barDrag); barDragRef.current = barDrag
  const [barDragBusy, setBarDragBusy] = useState(false)
  // Drag de FILA (reordenar la lista, no toca fechas)
  const [rowDrag, setRowDrag] = useState<number | null>(null)
  const [dropId, setDropId] = useState<{ id: number; after: boolean } | null>(null)
  const [rowBusy, setRowBusy] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [gridH, setGridH] = useState(520)
  // Mide el alto disponible del Gantt para calcular el alto de fila adaptativo.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver((ents) => { const h = ents[0]?.contentRect.height; if (h) setGridH(h) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const tareas = plan?.tareas ?? []
  const buscando = query.trim().length > 0
  const q = query.trim().toLowerCase()

  // ── Agrupar por fase, respetar orden_visual; filtrar por búsqueda ──
  const fases = useMemo(() => {
    const m = new Map<string, IngTareaPlan[]>()
    for (const t of tareas) { const k = t.fase || '— Sin fase —'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(t) }
    for (const arr of m.values()) arr.sort((a, b) => (a.orden_visual ?? 1e9) - (b.orden_visual ?? 1e9) || (a.fila - b.fila))
    let out = [...m.entries()].map(([nombre, ts]) => ({ nombre, tareas: ts }))
    if (buscando) out = out.map((f) => ({ ...f, tareas: f.tareas.filter((t) => t.nombre.toLowerCase().includes(q)) })).filter((f) => f.tareas.length > 0)
    return out
  }, [tareas, buscando, q])

  const nFases = fases.length
  const nTareas = fases.reduce((a, f) => a + f.tareas.length, 0)

  // ── Alto de fila adaptativo: 15–18 tareas sin scroll vertical ──
  const PH_H = 30
  const RH = useMemo(() => {
    if (nTareas === 0) return 40
    const disp = Math.floor((gridH - 44 - nFases * PH_H - 2) / nTareas)
    return Math.max(28, Math.min(disp, 48))
  }, [gridH, nFases, nTareas])
  const barH = Math.round(RH * 0.58)
  const dosLineas = RH >= 46

  // ── Geometría temporal (día a día, en px) ──
  const px = PX[zoom]
  const geo = useMemo(() => {
    const fechas: string[] = []
    for (const t of tareas) { for (const f of [t.early_start, t.early_finish, t.fecha_inicio, t.fecha_fin]) if (f) fechas.push(f) }
    if (plan?.fecha_inicio) fechas.push(plan.fecha_inicio)
    if (plan?.fecha_entrega) fechas.push(plan.fecha_entrega)
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    if (!fechas.length) return null
    let min = d(fechas[0]), max = d(fechas[0])
    for (const f of fechas) { const dd = d(f); if (dd < min) min = dd; if (dd > max) max = dd }
    if (hoy < min) min = hoy; if (hoy > max) max = hoy
    const day0 = mondayOf(new Date(min.getTime() - 3 * DAY))
    const totalDays = diffDays(max, day0) + 7
    const x = (iso: string) => diffDays(d(iso), day0) * px
    const width = totalDays * px
    return { day0, totalDays, x, width, hoy }
  }, [tareas, plan, px])

  // ── Mapa id → barra (x, w, yCenter) para conectores de dependencias ──
  const rows = useMemo(() => {
    const r: Array<{ type: 'phase'; nombre: string; count: number; y: number } | { type: 'task'; t: IngTareaPlan; y: number }> = []
    let y = 0
    for (const f of fases) {
      r.push({ type: 'phase', nombre: f.nombre, count: f.tareas.length, y })
      y += PH_H
      if (collapsed[f.nombre] && !buscando) continue
      for (const t of f.tareas) { r.push({ type: 'task', t, y }); y += RH }
    }
    return { rows: r, bodyH: y }
  }, [fases, collapsed, buscando, RH])

  const barDe = (t: IngTareaPlan) => {
    if (!geo) return null
    const s = t.early_start || t.fecha_inicio, e = t.early_finish || t.fecha_fin
    if (!s || !e) return null
    const x = geo.x(s)
    const hito = s === e
    const w = hito ? barH : Math.max(geo.x(e) + px - x, 6)   // +1 día inclusivo
    return { x, w, hito }
  }
  const yDe = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of rows.rows) if (r.type === 'task') m.set(r.t.id, r.y)
    return m
  }, [rows])

  // ── Resumen de cabecera ──
  const resumen = useMemo(() => {
    const total = tareas.length
    const hechas = tareas.filter((t) => t.estado === 'hecha').length
    let num = 0, den = 0
    for (const t of tareas) { const w = Math.max(t.dur_dias || 0, 1); den += w; num += (t.avance_pct ?? 0) * w }
    const avance = den > 0 ? num / den : 0
    const holg = plan?.holgura_proyecto ?? 0
    const riesgo = plan?.en_riesgo ?? false
    const nivel: 'ok' | 'ajustado' | 'tarde' = holg < 0 || riesgo ? 'tarde' : holg <= 2 ? 'ajustado' : 'ok'
    // "Sincronizado con Excel": tareas cuya fecha calculada coincide con la del Excel
    const con = tareas.filter((t) => t.early_finish && t.fecha_fin)
    const sync = { match: con.filter((t) => t.early_finish === t.fecha_fin).length, total: con.length }
    return { total, hechas, avance, holg, nivel, sync }
  }, [tareas, plan])

  // Framing del nuevo flujo: la "entrega estimada" = fin del plan (lo que el Scheduler
  // puede prometer). La fecha del cliente es solo referencia. Si la estimada cae después
  // de lo pedido NO es un "atraso" (nada arrancó): es simplemente la estimación honesta.
  const pill = { ok: { bg: '#dcf1e5', fg: '#1a7f4b', t: 'Entra en fecha' }, ajustado: { bg: '#fdf0dc', fg: '#a65f00', t: 'Justo' }, tarde: { bg: '#fdf0dc', fg: '#a65f00', t: 'Después de lo pedido' } }[resumen.nivel]
  const holgColor = resumen.nivel === 'ok' ? '#1a7f4b' : '#c46a00'

  // ── Dependencias del seleccionado (predecesoras → sel → sucesoras) ──
  const depsSel = useMemo(() => {
    if (selId == null || !plan) return []
    return plan.aristas.filter((a) => a.tarea_id === selId || a.depende_de_id === selId)
  }, [selId, plan])

  // ── Tarea seleccionada + sus predecesoras (para el inspector) ──
  const selTarea = useMemo(() => tareas.find((t) => t.id === selId) ?? null, [tareas, selId])
  const predecesoras = useMemo(() => {
    if (selId == null || !plan) return [] as { t: IngTareaPlan; tipo: string }[]
    return plan.aristas.filter((a) => a.tarea_id === selId)
      .map((a) => ({ t: tareas.find((x) => x.id === a.depende_de_id), tipo: a.tipo }))
      .filter((x): x is { t: IngTareaPlan; tipo: string } => !!x.t)
  }, [selId, plan, tareas])

  // Orden visible de tareas (para navegar con ↑/↓)
  const visibleIds = useMemo(() => rows.rows.filter((r) => r.type === 'task').map((r) => (r as any).t.id as number), [rows])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return
      if (e.key === 'Escape') { setSelId(null); return }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && selId != null) {
        const i = visibleIds.indexOf(selId)
        if (i === -1) return
        const j = e.key === 'ArrowDown' ? Math.min(visibleIds.length - 1, i + 1) : Math.max(0, i - 1)
        e.preventDefault(); setSelId(visibleIds[j])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selId, visibleIds])

  // TODOS los ingenieros activos (para ELEGIR, aunque el plan no tenga ninguno asignado aún).
  useEffect(() => {
    ingenieriaService.getIngenieros()
      .then((r) => setIngenierosActivos((r.data ?? []).filter((i) => i.activo).map((i) => i.nombre).sort((a, b) => a.localeCompare(b))))
      .catch(() => {})
  }, [])
  // Lista para los selectores: los activos; si por algo falla, cae a los que ya están en el plan.
  const todosIng = useMemo(() => {
    const delPlan = [...new Set(all.map((t) => t.asignado_nombre).filter(Boolean) as string[])]
    const union = [...new Set([...ingenierosActivos, ...delPlan])]
    return union.sort((a, b) => a.localeCompare(b))
  }, [all, ingenierosActivos])
  // Ingeniero del proyecto = el más asignado del plan (null si todavía no se eligió).
  const propuesto = useMemo(() => {
    const f = new Map<string, number>()
    for (const t of tareas) if (t.asignado_nombre) f.set(t.asignado_nombre, (f.get(t.asignado_nombre) ?? 0) + 1)
    return [...f.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  }, [tareas])

  // ── Acciones del Scheduler (proceso simplificado), todas desde "por proyecto" ──
  const accionScheduler = async (fn: () => Promise<unknown>, ok: string) => {
    if (actBusy || !plan?.proyecto_id) return
    setActBusy(true)
    try { await fn(); toast.success(ok); onRefresh() }
    catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo completar') }
    finally { setActBusy(false) }
  }
  const proponerFechas = () => accionScheduler(() => ingenieriaService.proponerFechas(plan!.proyecto_id!), 'Fechas propuestas — ajustá lo que haga falta')
  const generarPropuesto = () => accionScheduler(() => ingenieriaService.generarPropuesto(plan!.proyecto_id!), 'Plan propuesto generado')
  const enviarEstimados = () => accionScheduler(() => ingenieriaService.enviarEstimados(plan!.proyecto_id!), 'Enviado a Estimados')

  async function guardarLineaBase() {
    if (!sel) return
    setBaseBusy(true)
    try { const r = await ingenieriaService.guardarBaseline(sel); toast.success(`Línea base guardada (${r.data.n} tareas)`); await onRefresh() }
    catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo guardar la línea base') }
    finally { setBaseBusy(false); setMenuOpen(false) }
  }

  // Nueva tarea SIN modal viejo: crea una tarea en blanco, refresca y la selecciona
  // para editarla en el panel lateral (nombre, predecesoras, etc.) — todo en la interfaz nueva.
  const [nuevaBusy, setNuevaBusy] = useState(false)
  async function crearTareaNueva() {
    if (!sel || nuevaBusy) return
    setNuevaBusy(true)
    try {
      const r = await ingenieriaService.crearTarea({ proyecto_ext: sel, nombre: 'Nueva tarea', allocation_pct: 1, dur_dias: 1, estado: 'pendiente' })
      await onRefresh()
      setSelId(r.data.id)   // abre el inspector en la tarea nueva
    } catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo crear la tarea') }
    finally { setNuevaBusy(false) }
  }

  // Acción del gate del depósito: el PM lo abre/cierra a mano (la confirmación de
  // Finanzas se lee sola). Solo cuando Finanzas todavía no lo confirmó.
  async function toggleDeposito(abrir: boolean) {
    if (!sel) return
    setDepBusy(true)
    try { await ingenieriaService.overrideDeposito(sel, abrir); await onRefresh() }
    catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo cambiar el gate') }
    finally { setDepBusy(false) }
  }
  // Detalle de instalación (ítem×ítem + punch) — solo lectura, del módulo de campo.
  async function abrirInstalacion() {
    if (!sel) return
    setInstOpen(true); setInstBusy(true); setInstDet(null)
    try { setInstDet((await ingenieriaService.instalacionDetalle(sel)).data) }
    catch { setInstDet({ items: [], punch: [] }) } finally { setInstBusy(false) }
  }

  // Drag de barra: mientras arrastro, mido el desfase en días; al soltar, fijo el
  // inicio (fijarFecha). Si no me moví (deltaDays 0) fue un click → selecciono.
  useEffect(() => {
    if (!barDrag) return
    const onMove = (e: PointerEvent) => setBarDrag((dr) => dr && dr.movable ? { ...dr, deltaDays: Math.round((e.clientX - dr.startX) / px) } : dr)
    const onUp = async () => {
      const dr = barDragRef.current; setBarDrag(null)
      if (!dr) return
      if (!dr.movable || dr.deltaDays === 0) { setSelId(dr.id); return }
      setBarDragBusy(true)
      try { await ingenieriaService.fijarFecha(dr.id, 'inicio', addDaysIso(dr.origStart, dr.deltaDays)); await onRefresh() }
      catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo mover la fecha') }
      finally { setBarDragBusy(false) }
    }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [barDrag?.id, px])  // eslint-disable-line react-hooks/exhaustive-deps

  // Soltar una FILA: reordena orden_visual de todas las tareas del proyecto (no toca fechas).
  async function soltarFila() {
    const dragId = rowDrag, target = dropId
    setRowDrag(null); setDropId(null)
    if (dragId == null || !target || rowBusy || dragId === target.id) return
    const orden = [...tareas].sort((a, b) => (a.orden_visual ?? 1e9) - (b.orden_visual ?? 1e9) || a.fila - b.fila).map((t) => t.id)
    const from = orden.indexOf(dragId); if (from === -1) return
    orden.splice(from, 1)
    let to = orden.indexOf(target.id); if (to === -1) return
    if (target.after) to += 1
    orden.splice(to, 0, dragId)
    setRowBusy(true)
    try { await ingenieriaService.reordenarVisual(sel, orden); await onRefresh() }
    catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo reordenar') }
    finally { setRowBusy(false) }
  }

  // Imprimir / exportar a PDF (Tabloid 11x17 landscape). El navegador abre el
  // diálogo; el usuario elige "Guardar como PDF". Despliega todas las tareas y
  // oculta la interfaz interactiva (toolbar, inspector, menú) vía @media print.
  function imprimir() {
    setMenuOpen(false); setSelId(null); setModOpen(true)
    document.body.classList.add('cpm-printing')
    const cleanup = () => { document.body.classList.remove('cpm-printing'); window.removeEventListener('afterprint', cleanup) }
    window.addEventListener('afterprint', cleanup)
    setTimeout(() => window.print(), 120)
  }

  // Scroll a "hoy" al montar / cambiar zoom
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !geo || geo.hoy < geo.day0) return
    const hoyX = diffDays(geo.hoy, geo.day0) * px
    el.scrollLeft = Math.max(0, hoyX - el.clientWidth * 0.55 + 236)
  }, [zoom, geo?.width])  // eslint-disable-line react-hooks/exhaustive-deps

  // Meses y marcas de día para el encabezado de tiempo
  const headerMarks = useMemo(() => {
    if (!geo) return { months: [] as { label: string; x: number; w: number }[], ticks: [] as { x: number; weekend: boolean }[] }
    const months: { label: string; x: number; w: number }[] = []
    const ticks: { x: number; weekend: boolean }[] = []
    let curMonth = -1, monthStartX = 0, monthLabel = ''
    for (let i = 0; i <= geo.totalDays; i++) {
      const dt = new Date(geo.day0.getTime() + i * DAY)
      const x = i * px
      if (dt.getMonth() !== curMonth) {
        if (curMonth !== -1) months.push({ label: monthLabel, x: monthStartX, w: x - monthStartX })
        curMonth = dt.getMonth(); monthStartX = x; monthLabel = `${MES[curMonth]} ${dt.getFullYear()}`
      }
      // marcas de día según zoom
      if (zoom === 'semana') ticks.push({ x, weekend: isWeekend(dt) })
      else if (zoom === 'mes') { if (dt.getDay() === 1) ticks.push({ x, weekend: false }) }
      else { if (dt.getDate() === 1) ticks.push({ x, weekend: false }) }
    }
    months.push({ label: monthLabel, x: monthStartX, w: geo.totalDays * px - monthStartX })
    return { months, ticks }
  }, [geo, zoom, px])

  const hoyX = geo && geo.hoy >= geo.day0 ? diffDays(geo.hoy, geo.day0) * px : null
  const entregaX = geo && plan?.fecha_entrega ? geo.x(plan.fecha_entrega) : null

  const TASKCOL = 236

  return (
    <div className="cpm-root">
      <style>{CSS}</style>

      {/* ───────── Cabecera ───────── */}
      <div className="cpm-head">
        <div className="cpm-head-left">
          <div className="cpm-title-row">
            {/* selector de proyecto, con aspecto de título */}
            <select className="cpm-proj" value={sel} onChange={(e) => { setSel(e.target.value); setSelId(null) }}>
              {proyectos.map((pr) => <option key={pr.proyecto_ext} value={pr.proyecto_ext}>{pr.proyecto_ext}</option>)}
            </select>
            {/* menú de acciones del proyecto (···) */}
            <div className="cpm-menu-wrap">
              <button className="cpm-menu-btn" onClick={() => setMenuOpen((v) => !v)} title="Más acciones"><MoreHorizontal size={18} /></button>
              {menuOpen && <>
                <div className="cpm-menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="cpm-menu">
                  <button className="cpm-menu-item" disabled={!plan} onClick={imprimir}><Printer size={15} /> Imprimir / PDF (Tabloid)</button>
                  <button className="cpm-menu-item" disabled={baseBusy || !plan} onClick={guardarLineaBase}><Flag size={15} /> {baseBusy ? 'Guardando…' : 'Guardar línea base'}</button>
                  <button className="cpm-menu-item" disabled={!plan} onClick={() => { setCronoOpen(true); setMenuOpen(false) }}><CalendarClock size={15} /> Cronograma del cliente</button>
                  <div className="cpm-menu-cambiar"><CambiarIngeniero proyectoExt={sel} propuesto={propuesto} ingenieros={todosIng} onDone={() => { onRefresh(); setMenuOpen(false) }} label="Cambiar ingeniero" /></div>
                </div>
              </>}
            </div>
          </div>
          <div className="cpm-meta">
            <span>{sel}</span>
            <span className="cpm-dot-sep">•</span>
            <span>{resumen.hechas} de {resumen.total} tareas completadas</span>
            {resumen.sync.total > 0 && <>
              <span className="cpm-dot-sep">•</span>
              <span className="cpm-sync"><i className="cpm-greendot" /> Sincronizado con Excel · {resumen.sync.match}/{resumen.sync.total}</span>
            </>}
          </div>
        </div>

        {/* tarjeta de resumen — los totales (Entrega estimada/Termina/Holgura) recién se
            muestran cuando el Scheduler "Genera el plan propuesto"; antes es un borrador. */}
        {plan && (plan.propuesta_generada ? (
          <div className="cpm-summary">
            <div className="cpm-cell"><span className="cpm-cell-l">Entrega estimada</span><span className="cpm-cell-v">{fmtD(plan.fin_proyectado)}</span></div>
            <div className="cpm-cell"><span className="cpm-cell-l">Pedida por el cliente</span><span className="cpm-cell-v" style={{ color: '#8a8780' }}>{fmtD(plan.fecha_entrega)}</span></div>
            <div className="cpm-cell"><span className="cpm-cell-l">vs. lo pedido</span><span className="cpm-cell-v" style={{ color: holgColor }}>{resumen.holg >= 0 ? `${resumen.holg} d antes` : `${Math.abs(resumen.holg)} d después`}</span></div>
            <div className="cpm-cell">
              <span className="cpm-cell-l">Avance · {Math.round(resumen.avance * 100)}%</span>
              <span className="cpm-prog"><i style={{ width: `${Math.round(resumen.avance * 100)}%` }} /></span>
            </div>
            <div className="cpm-cell cpm-cell-pill"><span className="cpm-statuspill" style={{ background: pill.bg, color: pill.fg }}>{pill.t}</span></div>
          </div>
        ) : (
          <div className="cpm-summary">
            <div className="cpm-cell"><span className="cpm-cell-l">Entrega estimada</span><span className="cpm-cell-v" style={{ color: '#aeaeb2' }}>—</span></div>
            <div className="cpm-cell"><span className="cpm-cell-l">Pedida por el cliente</span><span className="cpm-cell-v" style={{ color: '#8a8780' }}>{fmtD(plan.fecha_entrega)}</span></div>
            <div className="cpm-cell"><span className="cpm-cell-l">vs. lo pedido</span><span className="cpm-cell-v" style={{ color: '#aeaeb2' }}>—</span></div>
          </div>
        ))}
      </div>

      {/* ───────── Barra "Armar plan" del Scheduler (mientras construye, antes de enviar) ───────── */}
      {plan && plan.deal_estado === 'esperando_pm' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#f4f8ff', border: '1px solid #d6e4fb', borderRadius: 12, padding: '10px 14px', margin: '2px 0 4px' }}>
          {!plan.propuesta_generada ? (
            <>
              <span style={{ fontSize: 13, color: '#3a4a63', flex: '1 1 220px' }}>
                <b>Armá el plan:</b> elegí el ingeniero, poné las fechas de cada tarea (o usá <b>Proponer fechas</b> para un borrador) y después <b>Generá el plan propuesto</b>.
              </span>
              <CambiarIngeniero proyectoExt={sel} propuesto={propuesto} ingenieros={todosIng} onDone={onRefresh} label={propuesto ? `Ingeniero: ${propuesto}` : 'Elegir ingeniero'} />
              <button onClick={proponerFechas} disabled={actBusy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #c3d4ee', background: '#fff', color: '#3a4a63', borderRadius: 9, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: actBusy ? 'default' : 'pointer' }}>
                {actBusy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Proponer fechas
              </button>
              <button onClick={generarPropuesto} disabled={actBusy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: '#0a6cdf', color: '#fff', borderRadius: 9, padding: '7px 13px', fontSize: 13, fontWeight: 700, cursor: actBusy ? 'default' : 'pointer' }}>
                {actBusy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Generar plan propuesto
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 13, color: '#1a7f4b', flex: '1 1 260px' }}>
                <b>Plan listo.</b> Revisá las fechas y enviáselo a Estimados para que lo mande al cliente.
              </span>
              <button onClick={generarPropuesto} disabled={actBusy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #c3d4ee', background: '#fff', color: '#3a4a63', borderRadius: 9, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: actBusy ? 'default' : 'pointer' }}>
                {actBusy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Regenerar
              </button>
              <button onClick={enviarEstimados} disabled={actBusy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: '#1a7f4b', color: '#fff', borderRadius: 9, padding: '7px 13px', fontSize: 13, fontWeight: 700, cursor: actBusy ? 'default' : 'pointer' }}>
                {actBusy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Enviar a Estimados
              </button>
            </>
          )}
        </div>
      )}

      {/* ───────── Fila de módulos (B1): resumen compacto de Compras/Muestras/Instalación/Depósito ───────── */}
      {plan && (plan.compras.hay || plan.muestras.hay || plan.instalacion.hay || plan.deposito.confirmado_finanzas || tareas.some((t) => t.tipo_clave === 'material_deposit')) && (() => {
        const c = plan.compras, m = plan.muestras, ins = plan.instalacion, dep = plan.deposito
        const hayDeposito = tareas.some((t) => t.tipo_clave === 'material_deposit') && plan.proyecto_estado === 'activo'
        return (
          <div className="cpm-mods">
            <button className="cpm-mods-bar" onClick={() => setModOpen((v) => !v)}>
              <ChevronDown size={14} className="cpm-mods-chev" style={{ transform: modOpen ? 'none' : 'rotate(-90deg)' }} />
              {hayDeposito && <span className="cpm-modchip"><Wallet size={13} /> Depósito: {dep.confirmado_finanzas ? 'confirmado' : dep.override_pm ? 'abierto a mano' : 'pendiente'}</span>}
              {c.hay && <span className="cpm-modchip"><Package size={13} /> Compras {Math.round(c.pct_disponible * 100)}%</span>}
              {m.hay && <span className="cpm-modchip"><FlaskConical size={13} /> Muestras {m.aprobadas}/{m.total}</span>}
              {ins.hay && <span className="cpm-modchip"><Wrench size={13} /> Instalación {Math.round(ins.pct * 100)}%{ins.punch_abiertos > 0 ? ` · ${ins.punch_abiertos} punch` : ''}</span>}
              <span className="cpm-mods-more">{modOpen ? 'ocultar' : 'detalle'}</span>
            </button>
            {modOpen && <div className="cpm-mods-detail">
              {hayDeposito && <div className="cpm-moddet"><Wallet size={14} className="cpm-moddet-ic" /><span><b>Depósito.</b> {dep.confirmado_finanzas ? `Confirmado por Finanzas${dep.fecha_confirmacion ? ' · ' + fmtD(dep.fecha_confirmacion) : ''} · compras habilitadas` : dep.override_pm ? `Gate abierto a mano por ${dep.override_por ?? '—'} · las compras siguen` : 'Finanzas aún no lo confirmó · long leads y materiales frenados'}{(dep.dias_atribuibles_cliente ?? 0) > 0 ? ` · ${dep.dias_atribuibles_cliente} d atribuibles al cliente` : ''}</span>
                {!dep.confirmado_finanzas && (dep.override_pm
                  ? <button className="cpm-modbtn" disabled={depBusy} onClick={() => toggleDeposito(false)}>{depBusy ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />} Cerrar gate</button>
                  : <button className="cpm-modbtn" disabled={depBusy} onClick={() => toggleDeposito(true)}>{depBusy ? <Loader2 size={12} className="animate-spin" /> : <LockOpen size={12} />} Abrir gate igual</button>)}
              </div>}
              {c.hay && <div className="cpm-moddet"><Package size={14} className="cpm-moddet-ic" /><b>Compras.</b> {c.n_materiales} materiales{c.fecha_mto ? ` · MTO ${fmtD(c.fecha_mto)}` : ''} · {c.con_precio} c/precio → {c.en_oc} en OC → {c.recibidos} recibidos{c.en_stock > 0 ? ` (+${c.en_stock} stock)` : ''} · <b>{Math.round(c.pct_disponible * 100)}% disponible</b></div>}
              {m.hay && <div className="cpm-moddet"><FlaskConical size={14} className="cpm-moddet-ic" /><b>Muestras.</b> {m.total} en total · {m.aprobadas} aprobadas{m.pendientes > 0 ? ` · ${m.pendientes} en curso` : ''}{m.rechazadas > 0 ? ` · ${m.rechazadas} rechazadas` : ''}{m.todas_aprobadas ? ' · todas OK ✓' : ''} · <i>no bloquea, corre en paralelo</i></div>}
              {ins.hay && <div className="cpm-moddet"><Wrench size={14} className="cpm-moddet-ic" /><span><b>Instalación.</b> {ins.instalados} de {ins.total} instalados{ins.fecha_ultima ? ` · última ${fmtD(ins.fecha_ultima)}` : ''}{ins.punch_abiertos > 0 ? ` · ${ins.punch_abiertos} punch abierto${ins.punch_abiertos === 1 ? '' : 's'}` : ''}{ins.completa ? ' · lista ✓' : ''} · <b>{Math.round(ins.pct * 100)}%</b></span>
                <button className="cpm-modbtn" onClick={abrirInstalacion}><Wrench size={12} /> Ver detalle (ítem×ítem + punch)</button>
              </div>}
            </div>}
          </div>
        )
      })()}

      {/* ───────── Tarjeta Gantt ───────── */}
      <div className="cpm-card">
        {/* barra de herramientas */}
        <div className="cpm-toolbar">
          <div className="cpm-search">
            <Search size={14} className="cpm-search-ic" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tareas" />
          </div>
          <button className={`cpm-tbtn ${criticalOnly ? 'on-crit' : ''}`} onClick={() => setCriticalOnly((v) => !v)}>
            <i className="cpm-reddot" /> Ruta crítica
          </button>
          <button className={`cpm-tbtn ${showSlack ? 'on-slack' : ''}`} onClick={() => setShowSlack((v) => !v)}>
            <span className="cpm-slackic">┄</span> Holgura
          </button>
          <button className="cpm-tbtn" onClick={() => setTakeoffOpen(true)} title="Lo que cargó Estimados en el take-off">
            <ClipboardList size={14} /> Ver take off
          </button>
          <div className="cpm-spacer" />
          <div className="cpm-seg">
            {([['semana', 'Semana'], ['mes', 'Mes'], ['trimestre', 'Trimestre']] as const).map(([k, l]) => (
              <button key={k} className={zoom === k ? 'on' : ''} onClick={() => setZoom(k)}>{l}</button>
            ))}
          </div>
          <button className="cpm-tbtn" onClick={() => { const el = scrollRef.current; if (el && hoyX != null) el.scrollTo({ left: Math.max(0, hoyX - el.clientWidth * 0.55 + TASKCOL), behavior: 'smooth' }) }}>Hoy</button>
          <button className="cpm-tbtn cpm-primary" disabled={nuevaBusy || !plan} onClick={crearTareaNueva}><Plus size={14} /> {nuevaBusy ? 'Creando…' : 'Nueva tarea'}</button>
        </div>

        {/* rejilla */}
        {planLoading && !plan ? (
          <div className="cpm-loading"><Loader2 className="animate-spin" size={22} /></div>
        ) : nTareas === 0 ? (
          <div className="cpm-empty">Sin tareas en este proyecto.</div>
        ) : (
          <div className="cpm-scroll" ref={scrollRef}>
            <div style={{ position: 'relative', width: TASKCOL + (geo?.width ?? 0), minWidth: '100%' }}>
              {/* encabezado de tiempo (sticky arriba) */}
              <div className="cpm-thead" style={{ height: 44 }}>
                <div className="cpm-thead-task" style={{ width: TASKCOL }}>Tarea</div>
                <div className="cpm-thead-time" style={{ width: geo?.width ?? 0 }}>
                  {headerMarks.months.map((m, i) => m.w >= 40 && (
                    <div key={i} className="cpm-month" style={{ left: m.x, width: m.w }}>{m.w < 90 || zoom === 'trimestre' ? MES3[new Date(geo!.day0.getTime() + Math.round(m.x / px) * DAY).getMonth()] : m.label}</div>
                  ))}
                  {headerMarks.ticks.map((t, i) => (
                    <div key={i} className="cpm-tick" style={{ left: t.x, color: t.weekend ? '#c7c7cc' : '#6e6e73' }}>
                      {zoom === 'semana' ? new Date(geo!.day0.getTime() + Math.round(t.x / px) * DAY).getDate() : ''}
                    </div>
                  ))}
                  {hoyX != null && <div className="cpm-hoy-pill" style={{ left: hoyX }}>Hoy</div>}
                  {entregaX != null && <div className="cpm-entrega-pill" style={{ left: entregaX }}>Pedida</div>}
                </div>
              </div>

              {/* cuerpo: columna de tareas (sticky izq) + timeline */}
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                {/* columna de tareas */}
                <div className="cpm-taskcol" style={{ width: TASKCOL }}>
                  {rows.rows.map((r, i) => r.type === 'phase' ? (
                    <div key={i} className="cpm-phase" style={{ height: PH_H }} onClick={() => setCollapsed((c) => ({ ...c, [r.nombre]: !c[r.nombre] }))}>
                      <span className="cpm-chev">{collapsed[r.nombre] && !buscando ? '▶' : '▼'}</span>
                      <span className="cpm-phase-n">{r.nombre}</span>
                      <span className="cpm-phase-c">{r.count} tareas</span>
                    </div>
                  ) : (() => {
                    const t = r.t, est = estadoInfo(t.estado)
                    const dim = criticalOnly && !t.critico
                    const ava = t.asignado_nombre ? AVA[hashIdx(t.asignado_nombre, AVA.length)] : null
                    const movable = t.estado !== 'hecha' && t.estado !== 'na' && !buscando
                    const dropTop = dropId?.id === t.id && !dropId.after, dropBot = dropId?.id === t.id && dropId.after
                    return (
                      <div key={i} className={`cpm-trow ${selId === t.id ? 'sel' : ''} ${rowDrag === t.id ? 'dragging' : ''} ${dropTop ? 'drop-top' : ''} ${dropBot ? 'drop-bot' : ''}`} style={{ height: RH, opacity: dim ? 0.45 : 1 }}
                        onClick={() => setSelId(t.id)}
                        draggable={movable}
                        onDragStart={() => setRowDrag(t.id)}
                        onDragEnd={() => { setRowDrag(null); setDropId(null) }}
                        onDragOver={(e) => { if (rowDrag == null || rowDrag === t.id) return; e.preventDefault(); const rc = e.currentTarget.getBoundingClientRect(); setDropId({ id: t.id, after: e.clientY > rc.top + rc.height / 2 }) }}
                        onDrop={(e) => { e.preventDefault(); soltarFila() }}>
                        <span className="cpm-tnum" title="N.º de la tarea (para las predecesoras)">{t.fila}</span>
                        <span className="cpm-sdot" style={{ background: est.dot }} title={est.label} />
                        <div className="cpm-tnames">
                          <div className="cpm-tname" title={t.nombre}>{t.nombre}</div>
                          {dosLineas && <div className="cpm-tsub">{barDe(t)?.hito ? `Hito · ${fmtD(t.early_start)}` : `${fmtD(t.early_start || t.fecha_inicio)} – ${fmtD(t.early_finish || t.fecha_fin)} · ${t.dur_dias} d`}</div>}
                        </div>
                        {ava ? <span className="cpm-ava" style={{ background: ava[0], color: ava[1] }}>{iniciales(t.asignado_nombre!)}</span>
                             : <span className="cpm-ava cpm-ava-empty">+</span>}
                      </div>
                    )
                  })())}
                </div>

                {/* timeline */}
                <div className="cpm-timeline" style={{ width: geo?.width ?? 0, height: rows.bodyH, opacity: barDragBusy || rowBusy ? 0.6 : 1, transition: 'opacity .1s' }}>
                  {/* líneas verticales */}
                  {zoom === 'semana' && headerMarks.ticks.map((t, i) => (
                    <div key={`v${i}`} className="cpm-vline" style={{ left: t.x, borderColor: new Date(geo!.day0.getTime() + Math.round(t.x / px) * DAY).getDay() === 1 ? '#e5e5ea' : '#f5f5f7' }} />
                  ))}
                  {zoom !== 'semana' && headerMarks.ticks.map((t, i) => <div key={`v${i}`} className="cpm-vline" style={{ left: t.x, borderColor: '#eef0f3' }} />)}
                  {entregaX != null && <div className="cpm-entrega-line" style={{ left: entregaX }} />}
                  {hoyX != null && <div className="cpm-hoy-line" style={{ left: hoyX }} />}

                  {/* conectores de dependencias: SIEMPRE visibles (tenues); la tarea
                      seleccionada resalta las suyas en azul */}
                  {plan && plan.aristas.length > 0 && (
                    <svg className="cpm-deps" width={geo?.width ?? 0} height={rows.bodyH}>
                      {plan.aristas.map((a, i) => {
                        const pre = tareas.find((t) => t.id === a.depende_de_id), suc = tareas.find((t) => t.id === a.tarea_id)
                        if (!pre || !suc) return null
                        const gp = barDe(pre), gs = barDe(suc)
                        const yp = yDe.get(pre.id), ys = yDe.get(suc.id)
                        if (!gp || !gs || yp == null || ys == null) return null
                        const x1 = gp.x + gp.w, y1 = yp + RH / 2, x2 = gs.x, y2 = ys + RH / 2
                        const mx = Math.max(x1 + 8, x2 - 10)
                        const hot = selId != null && (a.tarea_id === selId || a.depende_de_id === selId)
                        return <path key={i} d={`M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`} fill="none" stroke={hot ? '#0a6cdf' : '#c7c7cc'} strokeWidth={hot ? 2 : 1} opacity={hot ? 0.95 : 0.5} />
                      })}
                    </svg>
                  )}

                  {/* barras */}
                  {rows.rows.map((r, i) => {
                    if (r.type !== 'task') return null
                    const t = r.t, g = barDe(t); if (!g) return null
                    const est = estadoInfo(t.estado)
                    const dim = criticalOnly && !t.critico
                    const crit = criticalOnly && t.critico
                    const track = crit ? '#fde2e3' : est.track
                    const fill = crit ? '#e5484d' : est.fill
                    const ava = Math.min(100, Math.max(0, (t.avance_pct ?? 0) * 100))
                    const topBar = r.y + (RH - barH) / 2
                    const selBar = selId === t.id
                    const vecino = selId != null && depsSel.some((a) => (a.tarea_id === selId && a.depende_de_id === t.id) || (a.depende_de_id === selId && a.tarea_id === t.id))
                    const ring = selBar ? '0 0 0 2px #fff, 0 0 0 4px #0a6cdf' : vecino ? '0 0 0 2px #fff, 0 0 0 3.5px rgba(10,108,223,.4)' : undefined
                    // holgura (línea punteada tras la barra)
                    const slackPx = showSlack && t.late_finish && t.early_finish ? Math.max(0, diffDays(d(t.late_finish), d(t.early_finish)) * px) : 0
                    const movableBar = t.estado !== 'hecha' && t.estado !== 'na' && !!(t.early_start || t.fecha_inicio)
                    const dx = barDrag?.id === t.id && barDrag.deltaDays !== 0 ? barDrag.deltaDays * px : 0
                    const startDrag = (e: RPE) => { e.stopPropagation(); setBarDrag({ id: t.id, startX: e.clientX, origStart: t.early_start || t.fecha_inicio || '', deltaDays: 0, movable: movableBar }) }
                    if (g.hito) {
                      return (
                        <div key={i} style={{ position: 'absolute', left: g.x + dx, top: r.y, height: RH, display: 'flex', alignItems: 'center', opacity: dim ? 0.4 : 1 }}>
                          <span className="cpm-hito" style={{ width: barH * 0.9, height: barH * 0.9, background: fill, boxShadow: ring, cursor: movableBar ? 'grab' : 'pointer' }} title={`${t.nombre} · hito ${fmtD(t.early_start)}`} onPointerDown={startDrag} />
                          {dx !== 0 && <span className="cpm-dragtip" style={{ left: 14 }}>{fmtD(addDaysIso(t.early_start || t.fecha_inicio || '', barDrag!.deltaDays))} ({barDrag!.deltaDays > 0 ? '+' : ''}{barDrag!.deltaDays} d)</span>}
                          <span className="cpm-barlabel">{t.nombre}</span>
                        </div>
                      )
                    }
                    return (
                      <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: topBar, height: barH, opacity: dim ? 0.4 : 1 }}>
                        {/* línea base (MSP): barra fina gris apenas debajo de la tarea */}
                        {geo && t.baseline_inicio && t.baseline_fin && (() => {
                          const bx = geo.x(t.baseline_inicio!); const bw = Math.max((geo.x(t.baseline_fin!) + px) - bx, 4)
                          return <div className="cpm-baseline" style={{ left: bx, width: bw }} title={`Línea base: ${fmtD(t.baseline_inicio)} → ${fmtD(t.baseline_fin)}`} />
                        })()}
                        {slackPx > 0 && <div className="cpm-slackline" style={{ left: g.x + g.w, width: slackPx, top: barH / 2 }}><span>+{diffDays(d(t.late_finish!), d(t.early_finish!))} d</span></div>}
                        <div className="cpm-bar" style={{ left: g.x, width: g.w, height: barH, background: track, boxShadow: ring, transform: dx ? `translateX(${dx}px)` : undefined, cursor: movableBar ? 'grab' : 'pointer' }} title={`${t.nombre}\n${fmtD(t.early_start)} → ${fmtD(t.early_finish)}\n${Math.round(ava)}% · holgura ${t.holgura_dias ?? '—'} d`} onPointerDown={startDrag}>
                          <div className="cpm-barfill" style={{ width: `${ava}%`, background: fill }} />
                        </div>
                        {dx !== 0 && <div className="cpm-dragtip" style={{ left: g.x + dx }}>{fmtD(addDaysIso(t.early_start || t.fecha_inicio || '', barDrag!.deltaDays))} ({barDrag!.deltaDays > 0 ? '+' : ''}{barDrag!.deltaDays} d)</div>}
                        <span className="cpm-barlabel" style={{ left: g.x + g.w + 10, transform: dx ? `translateX(${dx}px)` : undefined }}>{t.nombre}{(est.key === 'prog' || est.key === 'block') && ava > 0 ? ` · ${Math.round(ava)}%` : ''}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ───────── Inspector lateral (Etapa B · edición con guardado) ───────── */}
        {selTarea && <Inspector t={selTarea} tareas={tareas} engineers={todosIng} predecesoras={predecesoras}
          onRefresh={onRefresh} onClose={() => setSelId(null)} goTo={setSelId} />}
      </div>

      {/* Cronograma del cliente (reusa el componente existente) */}
      {cronoOpen && (
        <div className="cpm-modal-back" onClick={() => setCronoOpen(false)}>
          <div className="cpm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cpm-modal-head">
              <CalendarClock size={18} className="cpm-modal-ic" />
              <h3>Cronograma del cliente · {shortProj(sel)}</h3>
              <button className="cpm-insp-x" onClick={() => setCronoOpen(false)}><X size={16} /></button>
            </div>
            <p className="cpm-modal-sub">Es lo que ve el cliente en el portal. Descargalo para adjuntarlo a un email.</p>
            <CronogramaCliente nombre={shortProj(sel)} fechaObjetivo={plan?.fecha_entrega ?? null} gantt={ganttDesdePlan(plan?.tareas ?? [])} />
          </div>
        </div>
      )}

      {/* Detalle de instalación (ítem×ítem + punch) */}
      {instOpen && <InstalacionPanel det={instDet} busy={instBusy} proyecto={sel} onClose={() => setInstOpen(false)} />}

      {/* "Ver take off": lo que cargó Estimados al crear el proyecto */}
      {takeoffOpen && plan && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setTakeoffOpen(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList size={18} className="text-forest-600" />
              <h3 className="font-semibold text-stone-800">Take-off de Estimados</h3>
              <button onClick={() => setTakeoffOpen(false)} className="ml-auto text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <p className="text-[12.5px] text-stone-500 mb-3">Lo que cargó Estimados al crear el proyecto. Es la base para armar el plan.</p>
            <dl className="text-sm divide-y divide-stone-100">
              <div className="flex justify-between gap-3 py-2"><dt className="text-stone-500">Proyecto</dt><dd className="font-mono font-semibold text-forest-700">{plan.proyecto_ext}</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt className="text-stone-500">Nombre</dt><dd className="text-stone-800 text-right">{plan.nombre ?? '—'}</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt className="text-stone-500">Cliente</dt><dd className="text-stone-800 text-right">{plan.cliente ?? '—'}</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt className="text-stone-500">Fecha que pidió el cliente</dt><dd className="text-stone-800">{fmtD(plan.fecha_entrega)}</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt className="text-stone-500">Cantidad de ítems</dt><dd className="text-stone-800">{plan.n_items ?? '—'}</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt className="text-stone-500">Costo millwork</dt><dd className="text-stone-800 tabular-nums">{usd(plan.millwork_total)}</dd></div>
              {(plan.stone_total ?? 0) > 0 && (
                <div className="flex justify-between gap-3 py-2"><dt className="text-stone-500">Costo piedra</dt><dd className="text-stone-800 tabular-nums">{usd(plan.stone_total)}</dd></div>
              )}
              <div className="flex justify-between gap-3 py-2"><dt className="text-stone-600 font-semibold">Costo total del proyecto</dt><dd className="text-stone-900 font-bold tabular-nums">{usd(plan.presupuesto)}</dd></div>
              {plan.intake_comments && (
                <div className="py-2"><dt className="text-stone-500 mb-0.5">Notas</dt><dd className="text-stone-700 text-[13px] whitespace-pre-wrap">{plan.intake_comments}</dd></div>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Inspector lateral — edición con guardado. Edita las decisiones de PLANIFICACIÓN
// del PM (nombre, responsable, %, duración, inicio, predecesoras, comentario).
// El ESTADO queda de solo-lectura: el cumplimiento lo reporta el ingeniero desde
// su escritorio (preserva el reparto a escritorios y los handoffs a Compras/Prod).
// Cada cambio llama al backend y refresca el plan (recalcula fechas/holgura/var).
// ─────────────────────────────────────────────────────────────────────────────
function Inspector({ t, tareas, engineers, predecesoras, onRefresh, onClose, goTo }: {
  t: IngTareaPlan
  tareas: IngTareaPlan[]
  engineers: string[]
  predecesoras: { t: IngTareaPlan; tipo: string }[]
  onRefresh: () => void
  onClose: () => void
  goTo: (id: number) => void
}) {
  const [nombre, setNombre] = useState(t.nombre)
  const [coment, setComent] = useState(t.comentario ?? '')
  const [predTxt, setPredTxt] = useState(t.predecesores_txt)
  const [busy, setBusy] = useState(false)
  const [addSel, setAddSel] = useState('')
  // Re-sincroniza los campos locales al cambiar de tarea (o al recalcular el plan)
  useEffect(() => { setNombre(t.nombre); setComent(t.comentario ?? ''); setAddSel('') }, [t.id])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPredTxt(t.predecesores_txt) }, [t.predecesores_txt])

  const inicio = t.early_start || t.fecha_inicio, fin = t.early_finish || t.fecha_fin
  const alloc = Math.round((t.allocation_pct || 0) * 100)
  const v = t.variance_dias
  const varStyle = v == null || v === 0 ? { background: '#e9e9ee', color: '#6e6e73' } : v > 0 ? { background: '#fde4e4', color: '#c4262c' } : { background: '#dcf1e5', color: '#1a7f4b' }
  const preIds = new Set(predecesoras.map((p) => p.t.id))
  // Candidatas para "+ Añadir": del mismo proyecto, no ella misma, no ya-predecesoras.
  const candidatas = tareas.filter((x) => x.id !== t.id && !preIds.has(x.id)).sort((a, b) => a.fila - b.fila)

  async function save(fn: () => Promise<any>) {
    if (busy) return
    setBusy(true)
    try { await fn(); await onRefresh() }
    catch (e: any) { toast.error(e?.response?.data?.message || 'No se pudo guardar') }
    finally { setBusy(false) }
  }
  const setAlloc = (n: number) => save(() => ingenieriaService.actualizarTarea(t.id, { allocation_pct: Math.max(0, Math.min(100, n)) / 100 }))
  const setDur = (n: number) => save(() => ingenieriaService.actualizarTarea(t.id, { dur_dias: Math.max(0, n) }))
  // Predecesoras estilo MS Project ("5FF+2d, 3SS"): tipos FS/SS/FF/SF + desfases.
  async function savePred() {
    if (predTxt.trim() === (t.predecesores_txt ?? '')) return
    if (busy) return
    setBusy(true)
    try { const r = await ingenieriaService.setPredecesores(t.id, predTxt.trim()); const n = r.data?.diffs?.length ?? 0; toast.success(n ? `Guardado · ${n} tarea${n === 1 ? '' : 's'} recalculada${n === 1 ? '' : 's'}` : 'Guardado'); await onRefresh() }
    catch (e: any) { const errs = e?.response?.data?.errores as { mensaje: string }[] | undefined; toast.error(errs?.[0]?.mensaje || e?.response?.data?.message || 'No se pudo guardar'); setPredTxt(t.predecesores_txt) }
    finally { setBusy(false) }
  }

  return (
    <div className={`cpm-inspector ${busy ? 'busy' : ''}`}>
      <div className="cpm-insp-head">
        <span className="cpm-insp-crumb">{(t.fase || '— Sin fase —')} · #{t.fila}</span>
        {t.critico && <span className="cpm-insp-crit">Ruta crítica</span>}
        <button className="cpm-insp-x" onClick={onClose} title="Cerrar (Esc)">×</button>
      </div>

      {/* nombre editable */}
      <input className="cpm-insp-name-in" value={nombre} onChange={(e) => setNombre(e.target.value)}
        onBlur={() => { const n = nombre.trim(); if (n && n !== t.nombre) save(() => ingenieriaService.actualizarTarea(t.id, { nombre: n })) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />

      {/* estado: SOLO LECTURA (lo marca el ingeniero desde su escritorio) */}
      <div className="cpm-insp-seg ro">
        {([['pendiente', 'Pendiente'], ['en_curso', 'En curso'], ['hecha', 'Hecha']] as const).map(([k, l]) => (
          <span key={k} className={t.estado === k ? 'on' : ''}>{l}</span>
        ))}
      </div>
      <div className="cpm-insp-hint">Estado: lo reporta el ingeniero desde su escritorio{t.estado === 'na' ? ' · (N/A)' : ''}. Avance real: {Math.round((t.avance_pct ?? 0) * 100)}%.</div>

      <div className="cpm-insp-section">Asignación</div>
      <div className="cpm-insp-group">
        <div className="cpm-insp-row"><span>Asignado a</span>
          <select className="cpm-insp-sel" value={t.asignado_nombre ?? ''} disabled={busy}
            onChange={(e) => save(() => ingenieriaService.actualizarTarea(t.id, { asignado_nombre: e.target.value || null }))}>
            <option value="">Sin asignar</option>
            {engineers.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div className="cpm-insp-row"><span>Asignación</span>
          <span className="cpm-step"><button disabled={busy || alloc <= 0} onClick={() => setAlloc(alloc - 25)}>−</button><b>{alloc}%</b><button disabled={busy || alloc >= 100} onClick={() => setAlloc(alloc + 25)}>+</button></span>
        </div>
      </div>

      <div className="cpm-insp-section">Planificación</div>
      <div className="cpm-insp-group">
        <div className="cpm-insp-row"><span>Inicio {t.no_antes_de && <Pin size={11} className="cpm-pinic" />}</span>
          <span className="cpm-insp-datewrap">
            <input className="cpm-insp-date" type="date" value={inicio ?? ''} disabled={busy}
              onChange={(e) => save(() => ingenieriaService.fijarFecha(t.id, 'inicio', e.target.value || null))} />
            {t.no_antes_de && <button className="cpm-unpin" title="Liberar la fecha fijada" disabled={busy} onClick={() => save(() => ingenieriaService.fijarFecha(t.id, 'inicio', null))}><PinOff size={13} /></button>}
          </span>
        </div>
        <div className="cpm-insp-row"><span>Duración</span>
          <span className="cpm-step"><button disabled={busy || t.dur_dias <= 0} onClick={() => setDur(t.dur_dias - 1)}>−</button><b>{t.dur_dias} d{t.dur_dias === 0 ? ' · Hito' : ''}</b><button disabled={busy} onClick={() => setDur(t.dur_dias + 1)}>+</button></span>
        </div>
        <div className="cpm-insp-row"><span>Fin</span><span className="muted">{fmtD(fin)}</span></div>
        <div className="cpm-insp-row col">
          <span>Predecesoras</span>
          <div className="cpm-chips">
            {predecesoras.length === 0 && <span className="muted">Ninguna</span>}
            {predecesoras.map((p, i) => (
              <span key={i} className="cpm-chip">
                <button className="cpm-chip-go" onClick={() => goTo(p.t.id)} title={`Ir a #${p.t.fila}`}>#{p.t.fila} {p.t.nombre}{p.tipo !== 'FS' ? ` · ${p.tipo}` : ''}</button>
                <button className="cpm-chip-x" disabled={busy} title="Quitar" onClick={() => save(() => ingenieriaService.borrarDep(t.id, p.t.id))}>×</button>
              </span>
            ))}
          </div>
          <select className="cpm-insp-sel cpm-addpre" value={addSel} disabled={busy}
            onChange={(e) => { const id = Number(e.target.value); if (id) save(() => ingenieriaService.agregarDep(t.id, id, 0, 'FS')) }}>
            <option value="">+ Añadir predecesora (FS)…</option>
            {candidatas.map((c) => <option key={c.id} value={c.id}>#{c.fila} {c.nombre}</option>)}
          </select>
          {/* Avanzado: texto estilo MS Project con tipos (FS/SS/FF/SF) y desfases (+2d) */}
          <input className="cpm-pred-txt" value={predTxt} disabled={busy} placeholder="Avanzado: 5FF+2d, 3SS"
            title='Número de fila + tipo (FS/SS/FF/SF) + desfase. Ej: "5FF+2d, 3SS"'
            onChange={(e) => setPredTxt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setPredTxt(t.predecesores_txt); (e.target as HTMLInputElement).blur() } }}
            onBlur={savePred} />
        </div>
      </div>

      <div className="cpm-insp-section">Línea base</div>
      <div className="cpm-insp-group">
        <div className="cpm-insp-row"><span>Inicio base</span><span className="muted">{fmtD(t.baseline_inicio)}</span></div>
        <div className="cpm-insp-row"><span>Fin base</span><span className="muted">{fmtD(t.baseline_fin)}</span></div>
        <div className="cpm-insp-row"><span>Variación</span><span className="cpm-var" style={varStyle}>{v == null ? '—' : v > 0 ? `+${v} d` : v < 0 ? `${v} d` : '0 d'}</span></div>
      </div>

      <div className="cpm-insp-section">Comentarios</div>
      <textarea className="cpm-insp-ta" rows={3} placeholder="Añade un comentario…" value={coment} disabled={busy}
        style={{ background: coment ? '#fdf3e4' : '#f5f5f7' }}
        onChange={(e) => setComent(e.target.value)}
        onBlur={() => { if ((coment || '') !== (t.comentario || '')) save(() => ingenieriaService.actualizarTarea(t.id, { comentario: coment || null })) }} />

      <div className="cpm-insp-footer">
        <button className="cpm-del" disabled={busy} onClick={() => { if (window.confirm(`¿Eliminar la tarea "${t.nombre}"?\nSe quita también de las predecesoras de otras tareas. No se puede deshacer.`)) save(async () => { await ingenieriaService.borrarTarea(t.id); onClose() }) }}>
          <Trash2 size={14} /> Eliminar
        </button>
      </div>
    </div>
  )
}

// ── Estilos (tokens del handoff) ──
const CSS = `
.cpm-root{--bg:#f5f5f7;--surf:#fff;--ctrl:#f2f2f5;--ctrl2:#e9e9ee;--tx:#1d1d1f;--tx2:#6e6e73;--tx3:#8e8e93;--div:#e5e5ea;--acc:#0a6cdf;--acc-bg:#e8f0fc;--sel:#eef4fd;
  display:flex;flex-direction:column;gap:14px;height:calc(100vh - 220px);min-height:560px;
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-0.01em;color:var(--tx);font-variant-numeric:tabular-nums;}
.cpm-root *{box-sizing:border-box;}
/* cabecera */
.cpm-head{flex:none;display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px 24px;}
.cpm-head-left{min-width:0;}
.cpm-title-row{display:flex;align-items:center;gap:8px;}
/* selector de proyecto: aspecto de título PERO claramente interactivo (chip + chevron) */
.cpm-proj{appearance:none;border:1px solid var(--div);background:var(--surf);font-size:21px;font-weight:700;letter-spacing:-0.02em;color:var(--tx);cursor:pointer;padding:4px 34px 4px 12px;max-width:560px;border-radius:10px;transition:background .12s,border-color .12s;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%230a6cdf' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;}
.cpm-proj:hover{background-color:var(--acc-bg);border-color:#cfe0f7;}
.cpm-proj:focus{outline:none;border-color:var(--acc);}
.cpm-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:13px;color:var(--tx2);margin-top:2px;}
.cpm-dot-sep{color:#c7c7cc;}
.cpm-sync{display:inline-flex;align-items:center;gap:6px;}
.cpm-greendot{width:7px;height:7px;border-radius:999px;background:#30a46c;display:inline-block;}
/* tarjeta resumen */
.cpm-summary{margin-left:auto;display:flex;align-items:stretch;background:var(--surf);border-radius:16px;box-shadow:0 0 0 .5px rgba(0,0,0,.06),0 1px 3px rgba(0,0,0,.05);}
.cpm-cell{display:flex;flex-direction:column;justify-content:center;gap:3px;padding:7px 16px;border-left:.5px solid var(--div);}
.cpm-cell:first-child{border-left:none;}
.cpm-cell-l{font-size:11px;color:var(--tx2);}
.cpm-cell-v{font-size:15px;font-weight:600;}
.cpm-prog{width:88px;height:6px;border-radius:999px;background:#ececf0;overflow:hidden;margin-top:2px;}
.cpm-prog i{display:block;height:100%;background:var(--acc);border-radius:999px;}
.cpm-cell-pill{justify-content:center;}
.cpm-statuspill{font-size:13px;font-weight:600;padding:5px 12px;border-radius:999px;white-space:nowrap;}
/* tarjeta gantt */
.cpm-card{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;background:var(--surf);border-radius:16px;box-shadow:0 0 0 .5px rgba(0,0,0,.06),0 1px 3px rgba(0,0,0,.05);overflow:hidden;}
/* toolbar */
.cpm-toolbar{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px 14px;border-bottom:.5px solid var(--div);}
.cpm-spacer{flex:1;}
.cpm-tbtn{height:32px;border:none;border-radius:9px;background:var(--ctrl);font-size:13px;font-weight:500;color:var(--tx);padding:0 12px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;}
.cpm-tbtn:hover{background:#ececeff2;}
.cpm-tbtn.cpm-primary{background:var(--acc);color:#fff;font-weight:600;}
.cpm-tbtn.cpm-primary:hover{background:#0857b5;}
.cpm-tbtn.on-crit{background:#fde4e4;color:#c4262c;}
.cpm-tbtn.on-slack{background:#e8f0fc;color:#0a5cc2;}
.cpm-reddot{width:7px;height:7px;border-radius:999px;background:#e5484d;display:inline-block;}
.cpm-slackic{font-weight:700;letter-spacing:-2px;}
.cpm-search{position:relative;width:220px;height:32px;}
.cpm-search-ic{position:absolute;left:10px;top:9px;color:var(--tx3);}
.cpm-search input{width:100%;height:32px;border:none;border-radius:9px;background:var(--ctrl);padding:0 10px 0 30px;font-size:13px;color:var(--tx);}
.cpm-search input:focus{outline:2px solid var(--acc);outline-offset:-1px;}
.cpm-seg{display:inline-flex;background:var(--ctrl);border-radius:9px;padding:2px;}
.cpm-seg button{border:none;background:transparent;font-size:13px;font-weight:500;color:var(--tx2);padding:5px 11px;border-radius:7px;cursor:pointer;}
.cpm-seg button.on{background:#fff;color:var(--tx);box-shadow:0 1px 2px rgba(0,0,0,.12),0 0 0 .5px rgba(0,0,0,.04);}
/* scroll grid */
.cpm-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;}
.cpm-loading,.cpm-empty{flex:1;display:flex;align-items:center;justify-content:center;color:var(--tx3);font-size:14px;}
/* encabezado de tiempo */
.cpm-thead{position:sticky;top:0;z-index:30;display:flex;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:.5px solid var(--div);}
.cpm-thead-task{position:sticky;left:0;z-index:2;display:flex;align-items:flex-end;padding:0 0 8px 16px;font-size:12px;font-weight:500;color:var(--tx3);background:rgba(255,255,255,.96);border-right:.5px solid var(--div);}
.cpm-thead-time{position:relative;}
.cpm-month{position:absolute;top:6px;font-size:14px;font-weight:700;color:var(--tx);padding-left:6px;white-space:nowrap;overflow:hidden;}
.cpm-tick{position:absolute;bottom:4px;font-size:10px;transform:translateX(-50%);}
.cpm-hoy-pill{position:absolute;top:4px;transform:translateX(-50%);background:var(--acc);color:#fff;font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;z-index:3;}
.cpm-entrega-pill{position:absolute;top:4px;transform:translateX(-50%);background:#fde4e4;color:#c4262c;font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;z-index:3;}
/* columna de tareas */
.cpm-taskcol{position:sticky;left:0;z-index:20;background:var(--surf);border-right:.5px solid var(--div);flex:none;}
.cpm-phase{display:flex;align-items:center;gap:6px;padding:0 14px;background:#fafafc;border-bottom:.5px solid var(--div);cursor:pointer;user-select:none;}
.cpm-chev{font-size:9px;color:var(--tx3);width:10px;}
.cpm-phase-n{font-size:12px;font-weight:700;color:var(--tx);}
.cpm-phase-c{font-size:11px;color:var(--tx3);}
.cpm-trow{display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:.5px solid #f0f0f2;cursor:pointer;}
.cpm-trow:hover{background:#f7f9fc;}
.cpm-trow.sel{background:var(--sel);}
.cpm-tnum{flex:none;min-width:18px;text-align:right;font-size:10px;font-weight:600;color:var(--tx3);font-variant-numeric:tabular-nums;}
.cpm-sdot{width:8px;height:8px;border-radius:999px;flex:none;}
.cpm-tnames{min-width:0;flex:1;}
.cpm-tname{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cpm-tsub{font-size:12px;color:var(--tx3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cpm-ava{width:22px;height:22px;border-radius:999px;flex:none;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;}
.cpm-ava-empty{background:transparent;color:#c7c7cc;border:1.5px dashed #c7c7cc;}
/* timeline */
.cpm-timeline{position:relative;flex:none;}
.cpm-vline{position:absolute;top:0;bottom:0;border-left:1px solid;}
.cpm-hoy-line{position:absolute;top:0;bottom:0;border-left:2px solid var(--acc);box-shadow:0 0 0 3px rgba(10,108,223,.12);z-index:1;}
.cpm-entrega-line{position:absolute;top:0;bottom:0;border-left:1.5px dashed #e5484d;opacity:.6;z-index:1;}
.cpm-deps{position:absolute;inset:0;pointer-events:none;z-index:2;}
.cpm-bar{position:absolute;border-radius:8px;overflow:hidden;cursor:pointer;touch-action:none;user-select:none;}
/* línea base (MS Project): barra fina gris apenas debajo de la tarea */
.cpm-baseline{position:absolute;top:100%;margin-top:1px;height:3px;background:#9ca3af;border-radius:2px;pointer-events:none;}
/* tooltip al arrastrar una barra */
.cpm-dragtip{position:absolute;top:-22px;background:#1d1d1f;color:#fff;font-size:11px;font-weight:600;padding:2px 7px;border-radius:7px;white-space:nowrap;z-index:5;pointer-events:none;}
/* drag de filas */
.cpm-trow.dragging{opacity:.4;}
.cpm-trow.drop-top{box-shadow:inset 0 2px 0 0 var(--acc);}
.cpm-trow.drop-bot{box-shadow:inset 0 -2px 0 0 var(--acc);}
.cpm-hito{touch-action:none;user-select:none;}
.cpm-barfill{position:absolute;inset:0;}
.cpm-hito{border-radius:4px;transform:rotate(45deg);cursor:pointer;flex:none;}
.cpm-barlabel{position:absolute;font-size:13px;font-weight:500;color:#3a3a3c;white-space:nowrap;line-height:1;align-self:center;pointer-events:none;top:50%;transform:translateY(-50%);}
.cpm-slackline{position:absolute;height:0;border-top:2px dotted #c7c7cc;}
.cpm-slackline span{position:absolute;left:4px;top:-14px;font-size:10px;color:var(--tx3);}
/* inspector lateral (flotante dentro de la tarjeta) */
.cpm-inspector{position:absolute;top:66px;right:16px;bottom:16px;width:340px;background:var(--surf);border-radius:16px;z-index:40;overflow-y:auto;
  box-shadow:0 0 0 .5px rgba(0,0,0,.08),0 20px 50px rgba(0,0,0,.18);padding-bottom:16px;}
.cpm-insp-head{display:flex;align-items:center;gap:8px;padding:14px 16px 4px;}
.cpm-insp-crumb{font-size:12px;color:var(--tx3);}
.cpm-insp-crit{font-size:11px;font-weight:600;color:#c4262c;background:#fde4e4;padding:2px 8px;border-radius:999px;}
.cpm-insp-x{margin-left:auto;width:28px;height:28px;border:none;border-radius:999px;background:var(--ctrl);color:var(--tx2);font-size:16px;line-height:1;cursor:pointer;}
.cpm-insp-x:hover{background:#e6e6ea;}
.cpm-insp-name{font-size:21px;font-weight:700;letter-spacing:-0.02em;padding:2px 16px 10px;}
.cpm-insp-seg{display:flex;gap:2px;margin:0 16px 4px;background:var(--ctrl);border-radius:9px;padding:2px;}
.cpm-insp-seg span{flex:1;text-align:center;font-size:12px;font-weight:500;color:var(--tx2);padding:5px 4px;border-radius:7px;}
.cpm-insp-seg span.on{background:#fff;color:var(--tx);box-shadow:0 1px 2px rgba(0,0,0,.12),0 0 0 .5px rgba(0,0,0,.04);}
.cpm-insp-section{font-size:12px;font-weight:500;color:var(--tx3);text-transform:uppercase;letter-spacing:.02em;padding:14px 0 6px 34px;}
.cpm-insp-group{background:var(--bg);border-radius:12px;margin:0 20px;overflow:hidden;}
.cpm-insp-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:42px;padding:8px 14px;border-top:.5px solid var(--div);font-size:14px;color:var(--tx2);}
.cpm-insp-row:first-child{border-top:none;}
.cpm-insp-row.col{flex-direction:column;align-items:flex-start;gap:8px;}
.cpm-insp-row .v{color:var(--tx);font-weight:500;}
.cpm-insp-row .muted{color:var(--tx3);}
.cpm-var{font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px;}
.cpm-chips{display:flex;flex-wrap:wrap;gap:6px;width:100%;}
.cpm-chip{border:none;background:var(--acc-bg);color:#0a5cc2;font-size:12px;font-weight:500;padding:4px 9px;border-radius:999px;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cpm-chip:hover{background:#dbe8fb;}
.cpm-insp-note{margin:0 20px;background:#fdf3e4;border-radius:12px;padding:10px 14px;font-size:13px;color:var(--tx);white-space:pre-wrap;}
.cpm-insp-foot{padding:16px 20px 0;font-size:11px;color:var(--tx3);font-style:italic;}
/* inspector — controles editables */
.cpm-inspector.busy{opacity:.75;}
.cpm-insp-name-in{display:block;width:calc(100% - 32px);margin:2px 16px 8px;border:none;background:transparent;font-size:21px;font-weight:700;letter-spacing:-0.02em;color:var(--tx);}
.cpm-insp-name-in:focus{outline:none;}
.cpm-insp-seg.ro span{cursor:default;}
.cpm-insp-hint{padding:4px 20px 0;font-size:11px;color:var(--tx3);}
.cpm-insp-sel{appearance:none;border:none;background:transparent;font-size:14px;font-weight:500;color:var(--acc);text-align:right;cursor:pointer;max-width:170px;padding-right:14px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%230a6cdf' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right center;}
.cpm-insp-sel:focus{outline:none;}
.cpm-addpre{text-align:left;margin-top:8px;background-position:right center;width:100%;color:var(--acc);}
.cpm-step{display:inline-flex;align-items:center;gap:8px;}
.cpm-step button{width:24px;height:24px;border:none;border-radius:7px;background:var(--ctrl2);color:var(--tx);font-size:15px;line-height:1;cursor:pointer;}
.cpm-step button:disabled{opacity:.4;cursor:default;}
.cpm-step b{font-size:14px;font-weight:600;color:var(--tx);min-width:58px;text-align:center;}
.cpm-insp-datewrap{display:inline-flex;align-items:center;gap:6px;}
.cpm-insp-date{border:none;background:var(--ctrl2);border-radius:7px;padding:4px 8px;font-size:13px;color:var(--tx);font-family:inherit;}
.cpm-pinic{color:#e8860c;vertical-align:-1px;}
.cpm-unpin{border:none;background:var(--ctrl);border-radius:6px;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;color:var(--tx2);cursor:pointer;}
.cpm-chip{display:inline-flex;align-items:center;background:var(--acc-bg);border-radius:999px;overflow:hidden;max-width:100%;}
.cpm-chip-go{border:none;background:transparent;color:#0a5cc2;font-size:12px;font-weight:500;padding:4px 4px 4px 9px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cpm-chip-x{border:none;background:transparent;color:#0a5cc2;font-size:14px;line-height:1;padding:4px 8px 4px 4px;cursor:pointer;opacity:.7;}
.cpm-chip-x:hover{opacity:1;}
.cpm-insp-ta{display:block;width:calc(100% - 40px);margin:0 20px;border:none;border-radius:12px;padding:10px 14px;font-size:13px;font-family:inherit;color:var(--tx);resize:vertical;}
.cpm-insp-ta:focus{outline:2px solid var(--acc);outline-offset:-1px;}
.cpm-insp-footer{display:flex;padding:16px 20px 4px;border-top:.5px solid var(--div);margin-top:16px;}
.cpm-del{display:inline-flex;align-items:center;gap:6px;height:36px;border:none;border-radius:10px;background:#fdeceb;color:#d70015;font-size:13px;font-weight:600;padding:0 14px;cursor:pointer;}
.cpm-del:disabled{opacity:.5;cursor:default;}
.cpm-pred-txt{width:100%;margin-top:8px;border:none;background:var(--ctrl);border-radius:8px;padding:6px 10px;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--tx);}
.cpm-pred-txt:focus{outline:2px solid var(--acc);outline-offset:-1px;}
/* menú de acciones (···) */
.cpm-menu-wrap{position:relative;}
.cpm-menu-btn{width:30px;height:30px;border:none;border-radius:8px;background:var(--ctrl);color:var(--tx2);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;}
.cpm-menu-btn:hover{background:#e6e6ea;}
.cpm-menu-backdrop{position:fixed;inset:0;z-index:50;}
.cpm-menu{position:absolute;top:36px;left:0;z-index:51;min-width:220px;background:var(--surf);border-radius:12px;padding:6px;box-shadow:0 0 0 .5px rgba(0,0,0,.08),0 12px 32px rgba(0,0,0,.16);display:flex;flex-direction:column;gap:2px;}
.cpm-menu-item{display:flex;align-items:center;gap:9px;width:100%;border:none;background:transparent;font-size:13px;font-weight:500;color:var(--tx);padding:8px 10px;border-radius:8px;cursor:pointer;text-align:left;}
.cpm-menu-item:hover{background:var(--bg);}
.cpm-menu-item:disabled{opacity:.5;cursor:default;}
.cpm-menu-cambiar{padding:2px;}
.cpm-menu-cambiar>button{width:100%;justify-content:flex-start;}
/* fila de módulos (B1) */
.cpm-mods{flex:none;background:var(--surf);border-radius:12px;box-shadow:0 0 0 .5px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);overflow:hidden;}
.cpm-mods-bar{display:flex;align-items:center;gap:10px;width:100%;border:none;background:transparent;padding:8px 14px;cursor:pointer;flex-wrap:wrap;}
.cpm-mods-chev{color:var(--tx3);transition:transform .15s;}
.cpm-modchip{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:500;color:var(--tx);}
.cpm-modchip svg{color:var(--tx3);}
.cpm-mods-more{margin-left:auto;font-size:11px;color:var(--acc);font-weight:500;}
.cpm-mods-detail{border-top:.5px solid var(--div);padding:8px 14px;display:flex;flex-direction:column;gap:5px;}
.cpm-moddet{font-size:12.5px;color:var(--tx2);display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
.cpm-moddet b{color:var(--tx);font-weight:600;}
.cpm-moddet-ic{color:var(--tx3);flex:none;position:relative;top:2px;}
.cpm-modbtn{display:inline-flex;align-items:center;gap:5px;border:none;background:var(--ctrl);color:var(--tx);font-size:11.5px;font-weight:500;padding:3px 9px;border-radius:7px;cursor:pointer;margin-left:8px;white-space:nowrap;}
.cpm-modbtn:hover{background:#e6e6ea;}
.cpm-modbtn:disabled{opacity:.5;cursor:default;}
/* modal (cronograma cliente) */
.cpm-modal-back{position:fixed;inset:0;background:rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;padding:16px;z-index:60;}
.cpm-modal{background:var(--surf);border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.25);width:100%;max-width:760px;max-height:88vh;overflow-y:auto;padding:18px;}
.cpm-modal-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.cpm-modal-head h3{font-size:14px;font-weight:700;color:var(--tx);margin:0;}
.cpm-modal-ic{color:var(--acc);}
.cpm-modal-sub{font-size:11px;color:var(--tx3);margin:0 0 12px;}
/* ───────── Impresión / PDF (Tabloid 11x17 landscape) ───────── */
@media print {
  @page { size: 11in 17in landscape; margin: 0.4in; }
  body.cpm-printing { background:#fff !important; }
  body.cpm-printing * { visibility:hidden !important; }
  body.cpm-printing .cpm-root, body.cpm-printing .cpm-root * { visibility:visible !important; }
  body.cpm-printing .cpm-root { position:absolute !important; left:0; top:0; width:auto !important; height:auto !important; gap:8px !important; }
  body.cpm-printing .cpm-card { height:auto !important; box-shadow:none !important; border:1px solid #e5e5ea; }
  body.cpm-printing .cpm-scroll { overflow:visible !important; height:auto !important; }
  body.cpm-printing .cpm-thead { position:static !important; }
  body.cpm-printing .cpm-taskcol { position:static !important; }
  /* oculta la interfaz interactiva */
  body.cpm-printing .cpm-toolbar,
  body.cpm-printing .cpm-inspector,
  body.cpm-printing .cpm-menu-wrap,
  body.cpm-printing .cpm-mods-more,
  body.cpm-printing .cpm-mods-chev { display:none !important; }
  body.cpm-printing .cpm-bar, body.cpm-printing .cpm-barfill, body.cpm-printing .cpm-hito { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
}
`
