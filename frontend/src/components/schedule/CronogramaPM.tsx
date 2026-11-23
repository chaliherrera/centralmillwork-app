// ─────────────────────────────────────────────────────────────────────────────
// Cronograma de proyecto (vista PM / Dirección de Proyectos) — rediseño Apple-native.
// Handoff: design_handoff_cronograma_pm. Reconstruido sobre el modelo de datos real
// (CPM holgura.ts → IngPlan / IngTareaPlan). ESTA ETAPA (A): layout + cabecera de
// resumen + lista + Gantt de SOLO LECTURA. La edición (inspector) y el drag llegan
// en etapas B/C. El % de avance es SIEMPRE el real calculado (nunca tecleado).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, Loader2 } from 'lucide-react'
import type { IngProyecto, IngTarea, IngPlan, IngTareaPlan } from '@/services/ingenieria'

// ── Helpers de fecha (día-a-día, en px) ──
const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const MES3 = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DAY = 86400000
const d = (iso: string) => new Date(iso + 'T00:00:00')
const diffDays = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY)
const mondayOf = (dt: Date) => { const x = new Date(dt); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); x.setHours(0, 0, 0, 0); return x }
const fmtD = (iso: string | null) => (iso ? `${d(iso).getDate()} ${MES3[d(iso).getMonth()]}` : '—')
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

export default function CronogramaPM({ proyectos, plan, planLoading, sel, setSel, onEdit }: Props) {
  const [zoom, setZoom] = useState<'semana' | 'mes' | 'trimestre'>('mes')
  const [query, setQuery] = useState('')
  const [criticalOnly, setCriticalOnly] = useState(false)
  const [showSlack, setShowSlack] = useState(false)
  const [selId, setSelId] = useState<number | null>(null)          // selección (resalta; inspector = etapa B)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

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

  const pill = { ok: { bg: '#dcf1e5', fg: '#1a7f4b', t: 'En fecha' }, ajustado: { bg: '#fdf0dc', fg: '#a65f00', t: 'Ajustado' }, tarde: { bg: '#fde4e4', fg: '#c4262c', t: 'Retrasado' } }[resumen.nivel]
  const holgColor = resumen.nivel === 'tarde' ? '#d70015' : resumen.nivel === 'ajustado' ? '#c46a00' : '#1d1d1f'

  // ── Dependencias del seleccionado (predecesoras → sel → sucesoras) ──
  const depsSel = useMemo(() => {
    if (selId == null || !plan) return []
    return plan.aristas.filter((a) => a.tarea_id === selId || a.depende_de_id === selId)
  }, [selId, plan])

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

        {/* tarjeta de resumen */}
        {plan && <div className="cpm-summary">
          <div className="cpm-cell"><span className="cpm-cell-l">Entrega fija</span><span className="cpm-cell-v">{fmtD(plan.fecha_entrega)}</span></div>
          <div className="cpm-cell"><span className="cpm-cell-l">Termina</span><span className="cpm-cell-v">{fmtD(plan.fin_proyectado)}</span></div>
          <div className="cpm-cell"><span className="cpm-cell-l">Holgura</span><span className="cpm-cell-v" style={{ color: holgColor }}>{Math.abs(resumen.holg)} d</span></div>
          <div className="cpm-cell">
            <span className="cpm-cell-l">Avance · {Math.round(resumen.avance * 100)}%</span>
            <span className="cpm-prog"><i style={{ width: `${Math.round(resumen.avance * 100)}%` }} /></span>
          </div>
          <div className="cpm-cell cpm-cell-pill"><span className="cpm-statuspill" style={{ background: pill.bg, color: pill.fg }}>{pill.t}</span></div>
        </div>}
      </div>

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
          <div className="cpm-spacer" />
          <div className="cpm-seg">
            {([['semana', 'Semana'], ['mes', 'Mes'], ['trimestre', 'Trimestre']] as const).map(([k, l]) => (
              <button key={k} className={zoom === k ? 'on' : ''} onClick={() => setZoom(k)}>{l}</button>
            ))}
          </div>
          <button className="cpm-tbtn" onClick={() => { const el = scrollRef.current; if (el && hoyX != null) el.scrollTo({ left: Math.max(0, hoyX - el.clientWidth * 0.55 + TASKCOL), behavior: 'smooth' }) }}>Hoy</button>
          <button className="cpm-tbtn cpm-primary" onClick={() => onEdit('new')}><Plus size={14} /> Nueva tarea</button>
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
                  {entregaX != null && <div className="cpm-entrega-pill" style={{ left: entregaX }}>Entrega</div>}
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
                    return (
                      <div key={i} className={`cpm-trow ${selId === t.id ? 'sel' : ''}`} style={{ height: RH, opacity: dim ? 0.45 : 1 }} onClick={() => setSelId(t.id)}>
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
                <div className="cpm-timeline" style={{ width: geo?.width ?? 0, height: rows.bodyH }}>
                  {/* líneas verticales */}
                  {zoom === 'semana' && headerMarks.ticks.map((t, i) => (
                    <div key={`v${i}`} className="cpm-vline" style={{ left: t.x, borderColor: new Date(geo!.day0.getTime() + Math.round(t.x / px) * DAY).getDay() === 1 ? '#e5e5ea' : '#f5f5f7' }} />
                  ))}
                  {zoom !== 'semana' && headerMarks.ticks.map((t, i) => <div key={`v${i}`} className="cpm-vline" style={{ left: t.x, borderColor: '#eef0f3' }} />)}
                  {entregaX != null && <div className="cpm-entrega-line" style={{ left: entregaX }} />}
                  {hoyX != null && <div className="cpm-hoy-line" style={{ left: hoyX }} />}

                  {/* conectores de dependencias (solo del seleccionado) */}
                  {selId != null && depsSel.length > 0 && (
                    <svg className="cpm-deps" width={geo?.width ?? 0} height={rows.bodyH}>
                      {depsSel.map((a, i) => {
                        const pre = tareas.find((t) => t.id === a.depende_de_id), suc = tareas.find((t) => t.id === a.tarea_id)
                        if (!pre || !suc) return null
                        const gp = barDe(pre), gs = barDe(suc)
                        const yp = yDe.get(pre.id), ys = yDe.get(suc.id)
                        if (!gp || !gs || yp == null || ys == null) return null
                        const x1 = gp.x + gp.w, y1 = yp + RH / 2, x2 = gs.x, y2 = ys + RH / 2
                        const mx = Math.max(x1 + 8, x2 - 10)
                        return <path key={i} d={`M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`} fill="none" stroke="#0a6cdf" strokeWidth={2} opacity={0.7} />
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
                    if (g.hito) {
                      return (
                        <div key={i} style={{ position: 'absolute', left: g.x, top: r.y, height: RH, display: 'flex', alignItems: 'center', opacity: dim ? 0.4 : 1 }}>
                          <span className="cpm-hito" style={{ width: barH * 0.9, height: barH * 0.9, background: fill, boxShadow: ring }} title={`${t.nombre} · hito ${fmtD(t.early_start)}`} onClick={() => setSelId(t.id)} />
                          <span className="cpm-barlabel">{t.nombre}</span>
                        </div>
                      )
                    }
                    return (
                      <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: topBar, height: barH, opacity: dim ? 0.4 : 1 }}>
                        {slackPx > 0 && <div className="cpm-slackline" style={{ left: g.x + g.w, width: slackPx, top: barH / 2 }}><span>+{diffDays(d(t.late_finish!), d(t.early_finish!))} d</span></div>}
                        <div className="cpm-bar" style={{ left: g.x, width: g.w, height: barH, background: track, boxShadow: ring }} title={`${t.nombre}\n${fmtD(t.early_start)} → ${fmtD(t.early_finish)}\n${Math.round(ava)}% · holgura ${t.holgura_dias ?? '—'} d`} onClick={() => setSelId(t.id)}>
                          <div className="cpm-barfill" style={{ width: `${ava}%`, background: fill }} />
                        </div>
                        <span className="cpm-barlabel" style={{ left: g.x + g.w + 10 }}>{t.nombre}{(est.key === 'prog' || est.key === 'block') && ava > 0 ? ` · ${Math.round(ava)}%` : ''}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
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
.cpm-proj{appearance:none;border:none;background:transparent;font-size:21px;font-weight:700;letter-spacing:-0.02em;color:var(--tx);cursor:pointer;padding:0 20px 0 0;max-width:520px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238e8e93' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right center;}
.cpm-proj:focus{outline:none;}
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
.cpm-card{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--surf);border-radius:16px;box-shadow:0 0 0 .5px rgba(0,0,0,.06),0 1px 3px rgba(0,0,0,.05);overflow:hidden;}
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
.cpm-bar{position:absolute;border-radius:8px;overflow:hidden;cursor:pointer;}
.cpm-barfill{position:absolute;inset:0;}
.cpm-hito{border-radius:4px;transform:rotate(45deg);cursor:pointer;flex:none;}
.cpm-barlabel{position:absolute;font-size:13px;font-weight:500;color:#3a3a3c;white-space:nowrap;line-height:1;align-self:center;pointer-events:none;top:50%;transform:translateY(-50%);}
.cpm-slackline{position:absolute;height:0;border-top:2px dotted #c7c7cc;}
.cpm-slackline span{position:absolute;left:4px;top:-14px;font-size:10px;color:var(--tx3);}
`
