import { useEffect, useMemo, useState } from 'react'
import { Loader2, X, Layers, Printer } from 'lucide-react'
import { ingenieriaService, type IngCargaEtapas, type IngProyectoEtapa, type IngLookahead, type IngLookaheadProyecto } from '@/services/ingenieria'

// ─────────────────────────────────────────────────────────────────────────────
// Lookahead del portafolio — rediseño Apple-native (mismo look que el Cronograma PM).
//  · "Por etapas · cada semana": cuántos proyectos hay en cada etapa (heatmap).
//  · "Día a día": una etapa + rango → qué proyectos trabajan cada día.
// Mantiene toda la lógica/datos; solo cambia la presentación + agrega el click
// de detalle en el día a día (las tareas de ese día ya vienen en los datos).
// ─────────────────────────────────────────────────────────────────────────────

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DAY = 86400000
const d = (iso: string) => new Date(iso + 'T00:00:00')
const FOREST = '#0a6cdf'   // acento (overlay del proyecto sugerido)

// ── Lookahead día a día: una etapa + rango de semanas → qué proyectos cada día ──
function LookaheadPanel({ etapas, semanas }: { etapas: IngCargaEtapas['etapas']; semanas: string[] }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [etapa, setEtapa] = useState(etapas.find((e) => e.clave === 'fabrication')?.clave ?? etapas[0]?.clave ?? '')
  const [desde, setDesde] = useState(() => semanas.find((w) => w >= hoy) ?? semanas[0] ?? '')
  const [sem, setSem] = useState(4)
  const [data, setData] = useState<IngLookahead | null>(null)
  const [loading, setLoading] = useState(false)
  const [selDia, setSelDia] = useState<{ i: number; p?: IngLookaheadProyecto } | null>(null)
  useEffect(() => {
    if (!etapa || !desde) { setData(null); return }
    setLoading(true); setSelDia(null)
    ingenieriaService.getLookahead(etapa, desde, sem).then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false))
  }, [etapa, desde, sem])

  const celC = (n: number) => n <= 0 ? 'transparent' : n <= 2 ? '#d6efe1' : n <= 4 ? '#fdf0dc' : '#fde4e4'
  const celT = (n: number) => n > 4 ? '#c4262c' : n > 2 ? '#a65f00' : n > 0 ? '#1a7f4b' : '#aeaeb2'
  const DW = 26   // ancho de columna por día

  // Proyectos/tareas activos en el día i (ya están en los datos, sin pedir al backend)
  const activosDia = (i: number) => (data?.proyectos ?? []).filter((p) => p.dias[i])
  // Borde de inicio de semana (día hábil 0 de cada semana) — más grueso y visible.
  const wkBorder = (i: number) => (i % 5 === 0 ? '2px solid var(--acc)' : undefined)
  function imprimir() {
    document.body.classList.add('lk-printing')
    const cleanup = () => { document.body.classList.remove('lk-printing'); window.removeEventListener('afterprint', cleanup) }
    window.addEventListener('afterprint', cleanup)
    setTimeout(() => window.print(), 120)
  }

  return (
    <div className="lk-card lk-print-area">
      <div className="lk-head">
        <Layers size={16} className="lk-head-ic" />
        <h2>Lookahead · día a día</h2>
        <div className="lk-controls">
          <select className="lk-sel" value={etapa} onChange={(e) => setEtapa(e.target.value)}>
            {etapas.map((e) => <option key={e.clave} value={e.clave}>{e.nombre}</option>)}
          </select>
          <select className="lk-sel" value={desde} onChange={(e) => setDesde(e.target.value)}>
            {semanas.map((w) => <option key={w} value={w}>sem. {d(w).getDate()} {MES[d(w).getMonth()]}</option>)}
          </select>
          <div className="lk-seg">
            {[2, 4, 6, 8].map((n) => <button key={n} className={sem === n ? 'on' : ''} onClick={() => setSem(n)}>{n} sem</button>)}
          </div>
          <button className="lk-print" onClick={imprimir} title="Imprimir / PDF"><Printer size={14} /> Imprimir</button>
        </div>
      </div>

      {loading ? <div className="lk-empty"><Loader2 className="animate-spin" size={18} /></div>
        : !data || !data.proyectos.length ? <div className="lk-empty">Ningún proyecto en <b>&nbsp;{data?.etapa?.nombre ?? 'esa etapa'}&nbsp;</b> en el rango elegido.</div>
        : (
        <div className="lk-scroll">
          <div style={{ minWidth: 240 + data.dias.length * DW }}>
            {/* meses */}
            {(() => {
              const grupos: { label: string; span: number }[] = []
              data.dias.forEach((dia) => {
                const dt = d(dia); const lbl = `${MES[dt.getMonth()]} ${dt.getFullYear()}`
                const last = grupos[grupos.length - 1]
                if (last && last.label === lbl) last.span++; else grupos.push({ label: lbl, span: 1 })
              })
              return (
                <div className="lk-row lk-months">
                  <div className="lk-gut" style={{ width: 240 }} />
                  {grupos.map((g, i) => <div key={i} className="lk-month" style={{ width: g.span * DW }} title={g.label}>{g.label}</div>)}
                </div>
              )
            })()}
            {/* semanas laborales (Sem N + fecha de inicio) — para diferenciar de un vistazo cuántas son */}
            <div className="lk-row lk-weeks">
              <div className="lk-gut" style={{ width: 240 }} />
              {Array.from({ length: Math.ceil(data.dias.length / 5) }, (_, w) => {
                const start = w * 5; const span = Math.min(5, data.dias.length - start); const dia0 = data.dias[start]
                return <div key={w} className={`lk-week ${w % 2 ? 'alt' : ''}`} style={{ width: span * DW }}>Sem {w + 1} · {d(dia0).getDate()} {MES[d(dia0).getMonth()]}</div>
              })}
            </div>
            {/* días */}
            <div className="lk-row lk-days">
              <div className="lk-gut lk-colh" style={{ width: 180 }}>Proyecto</div>
              <div className="lk-gut lk-colh" style={{ width: 60, textAlign: 'right' }}>Ítems</div>
              {data.dias.map((dia, i) => <div key={i} className="lk-dc" style={{ width: DW, borderLeft: wkBorder(i), fontWeight: i % 5 === 0 ? 700 : 400, color: i % 5 === 0 ? 'var(--acc)' : undefined }} title={dia}>{d(dia).getDate()}</div>)}
            </div>
            {/* simultáneos (clickeable: tareas de ese día) */}
            <div className="lk-row lk-sim">
              <div className="lk-gut lk-simlbl" style={{ width: 240 }}>Simultáneos</div>
              {data.simultaneos.map((n, i) => (
                <button key={i} className="lk-simcell" disabled={n <= 0} onClick={() => n > 0 && setSelDia({ i })}
                  style={{ width: DW, background: celC(n), color: celT(n), cursor: n > 0 ? 'pointer' : 'default', borderLeft: wkBorder(i) }}
                  title={n > 0 ? `${n} proyecto${n === 1 ? '' : 's'} el ${data.dias[i]} — click para ver` : undefined}>{n || ''}</button>
              ))}
            </div>
            {/* proyectos */}
            {data.proyectos.map((p, pi) => (
              <div key={pi} className="lk-row lk-proj">
                <div className="lk-gut lk-projname" style={{ width: 180 }}>
                  <div className="lk-pn" title={p.proyecto_ext ?? p.nombre}>{p.proyecto_ext ?? p.nombre}</div>
                  <div className="lk-pa">{p.asignado_nombre ?? 'sin asignar'}</div>
                </div>
                <div className="lk-gut lk-pitems" style={{ width: 60 }}>{p.n_items ?? '—'}</div>
                {p.dias.map((on, i) => (
                  <button key={i} className="lk-pcell" disabled={!on} onClick={() => on && setSelDia({ i, p })}
                    style={{ width: DW, borderLeft: wkBorder(i), background: on ? FOREST : 'transparent', cursor: on ? 'pointer' : 'default' }}
                    title={on ? `${p.proyecto_ext} trabaja el ${data.dias[i]} — click para ver` : undefined} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="lk-foot">La barra azul = días en que ese proyecto trabaja esa etapa. "Simultáneos" = cuántos proyectos coinciden cada día. <b>Click en una celda</b> para ver las tareas de ese día.</div>

      {/* Detalle del día (tareas agendadas) — reusa los datos ya cargados */}
      {selDia && data && (
        <div className="lk-modal-back" onClick={() => setSelDia(null)}>
          <div className="lk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lk-modal-head">
              <Layers size={16} className="lk-head-ic" />
              <div>
                <div className="lk-modal-title">{data.etapa?.nombre ?? 'Etapa'} · {d(data.dias[selDia.i]).getDate()} {MES[d(data.dias[selDia.i]).getMonth()]}</div>
                <div className="lk-modal-sub">{activosDia(selDia.i).length} proyecto{activosDia(selDia.i).length === 1 ? '' : 's'} ese día</div>
              </div>
              <button className="lk-x" onClick={() => setSelDia(null)}><X size={18} /></button>
            </div>
            <div className="lk-modal-body">
              {activosDia(selDia.i).length === 0 ? <div className="lk-empty">Sin tareas ese día.</div>
                : activosDia(selDia.i).map((p, i) => {
                  const esSel = selDia.p && p.proyecto_ext === selDia.p.proyecto_ext && p.nombre === selDia.p.nombre
                  return (
                    <div key={i} className={`lk-trow ${esSel ? 'sel' : ''}`}>
                      <div className="lk-trow-top">
                        <span className="lk-trow-proj">{p.proyecto_ext ?? '—'}</span>
                        <span className="lk-trow-eng">{p.asignado_nombre ?? 'sin asignar'}</span>
                      </div>
                      <div className="lk-trow-sub">{p.nombre} · {p.inicio ? `${d(p.inicio).getDate()} ${MES[d(p.inicio).getMonth()]}` : '?'} → {p.fin ? `${d(p.fin).getDate()} ${MES[d(p.fin).getMonth()]}` : '?'}{p.n_items != null ? ` · ${p.n_items} ítems` : ''}</div>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}
      <style>{LK_CSS}</style>
    </div>
  )
}

export default function MapaEtapas({ sugerenciaExt }: { sugerenciaExt?: string } = {}) {
  const [carga, setCarga] = useState<IngCargaEtapas | null>(null)
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<{ etapa: string; nombre: string; sem: string } | null>(null)
  const [detail, setDetail] = useState<IngProyectoEtapa[] | null>(null)
  const [loadingDet, setLoadingDet] = useState(false)

  useEffect(() => {
    setLoading(true)
    ingenieriaService.getCargaEtapas(sugerenciaExt).then((r) => setCarga(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [sugerenciaExt])

  const hayOverlay = !!sugerenciaExt && !!carga?.etapas.some((e) => (e.overlay ?? []).some((v) => v > 0))

  const g = useMemo(() => {
    if (!carga || !carga.semanas.length || !carga.etapas.length) return null
    const semanas = carga.semanas, nWeeks = semanas.length
    const months: { label: string; startPct: number }[] = []
    semanas.forEach((w, i) => { const wd = d(w); const label = `${MES[wd.getMonth()]} ${String(wd.getFullYear()).slice(2)}`; const last = months[months.length - 1]; if (!last || last.label !== label) months.push({ label, startPct: (i / nWeeks) * 100 }) })
    const today = new Date(); today.setHours(0, 0, 0, 0)
    let hoyIdx = -1
    for (let i = 0; i < nWeeks; i++) { const ws = d(semanas[i]).getTime(); if (today.getTime() >= ws && today.getTime() < ws + 7 * DAY) { hoyIdx = i; break } }
    const hoyPct = hoyIdx >= 0 ? ((hoyIdx + (today.getTime() - d(semanas[hoyIdx]).getTime()) / (7 * DAY)) / nWeeks) * 100 : null
    return { semanas, nWeeks, months, hoyPct, etapas: carga.etapas }
  }, [carga])

  const abrir = async (etapa: string, nombre: string, sem: string) => {
    setSel({ etapa, nombre, sem }); setDetail(null); setLoadingDet(true)
    try { const r = await ingenieriaService.getEtapaDetalle(etapa, sem); setDetail(r.data ?? []) }
    catch { setDetail([]) } finally { setLoadingDet(false) }
  }

  if (loading) return <div className="lk-root"><style>{LK_CSS}</style><div className="lk-empty" style={{ height: 160 }}><Loader2 className="animate-spin" size={20} /></div></div>
  if (!g) return <div className="lk-root"><style>{LK_CSS}</style><div className="lk-empty" style={{ height: 120 }}>Sin datos de etapas todavía.</div></div>

  // color por CANTIDAD de proyectos (semáforo de congestión) con tonos Apple
  const cell = (n: number): { bg: string; txt: string } => {
    if (n <= 0) return { bg: 'transparent', txt: '' }
    if (n <= 2) return { bg: '#d6efe1', txt: '#1a7f4b' }
    if (n <= 4) return { bg: '#fdf0dc', txt: '#a65f00' }
    return { bg: '#fde4e4', txt: '#c4262c' }
  }
  const fmtW = (w: string) => `${d(w).getDate()} ${MES[d(w).getMonth()]}`
  const GUT = 220

  return (
    <div className="lk-root">
      <style>{LK_CSS}</style>
      <div className="lk-card">
        <div className="lk-head">
          <Layers size={16} className="lk-head-ic" />
          <h2>Lookahead por etapas · cada semana</h2>
          <span className="lk-head-note">{hayOverlay ? <>el <b>borde azul</b> = dónde caería este proyecto</> : 'cuántos proyectos hay en cada etapa · click para verlos'}</span>
        </div>
        <div className="lk-scroll"><div style={{ minWidth: 880 }}>
          <div className="lk-row lk-days">
            <div className="lk-gut lk-colh" style={{ width: GUT }}>Etapa</div>
            <div className="lk-hm-months">
              {g.months.map((m, i) => <div key={i} className="lk-hm-month" style={{ left: `${m.startPct}%` }}>{m.label}</div>)}
              {g.hoyPct !== null && <div className="lk-hm-hoy" style={{ left: `${g.hoyPct}%` }}><span>hoy</span></div>}
            </div>
          </div>
          {g.etapas.map((e) => (
            <div key={e.clave} className="lk-row lk-etapa">
              <div className="lk-gut lk-etapaname" style={{ width: GUT }}>
                <span className="lk-en">{e.nombre}</span>
                {e.hito && <span className="lk-eh">{e.hito}</span>}
              </div>
              <div className="lk-hm-cells">
                {g.semanas.map((wk, i) => { const n = e.counts[i] ?? 0; const ov = e.overlay?.[i] ?? 0; const c = cell(n); return (
                  <button key={i} onClick={() => n > 0 && abrir(e.clave, e.nombre, wk)} disabled={n <= 0}
                    title={ov > 0
                      ? `${e.nombre} · ${fmtW(wk)}: este proyecto caería acá${n > 0 ? ` — encima de ${n} ya comprometido${n === 1 ? '' : 's'}` : ' (semana libre)'}`
                      : `${e.nombre} · ${fmtW(wk)}: ${n} proyecto${n === 1 ? '' : 's'}${n > 0 ? ' — click para ver' : ''}`}
                    className="lk-hm-cell" style={{ background: c.bg, color: c.txt, cursor: n > 0 ? 'pointer' : 'default', boxShadow: ov > 0 ? `inset 0 0 0 2px ${FOREST}` : undefined }}>
                    {n > 0 ? n : ''}
                    {ov > 0 && <span className="lk-hm-dot" style={{ background: FOREST }} />}
                  </button>
                ) })}
              </div>
            </div>
          ))}
        </div></div>
        <div className="lk-legend">
          <span><i style={{ background: '#f0f0f2' }} /> libre</span>
          <span><i style={{ background: '#d6efe1' }} /> 1-2</span>
          <span><i style={{ background: '#fdf0dc' }} /> 3-4</span>
          <span><i style={{ background: '#fde4e4' }} /> 5+ (congestión)</span>
          {hayOverlay && <span><i style={{ background: '#fff', boxShadow: `inset 0 0 0 2px ${FOREST}` }} /> este proyecto</span>}
          <span className="lk-legend-note">El número es cuántos proyectos están en esa etapa esa semana.</span>
        </div>

        {sel && (
          <div className="lk-modal-back" onClick={() => setSel(null)}>
            <div className="lk-modal" onClick={(ev) => ev.stopPropagation()}>
              <div className="lk-modal-head">
                <Layers size={16} className="lk-head-ic" />
                <div>
                  <div className="lk-modal-title">{sel.nombre}</div>
                  <div className="lk-modal-sub">semana del {fmtW(sel.sem)}{detail ? ` · ${detail.length} proyecto${detail.length === 1 ? '' : 's'}` : ''}</div>
                </div>
                <button className="lk-x" onClick={() => setSel(null)}><X size={18} /></button>
              </div>
              <div className="lk-modal-body">
                {loadingDet ? <div className="lk-empty"><Loader2 className="animate-spin" size={18} /></div>
                  : !detail || !detail.length ? <div className="lk-empty">Sin proyectos.</div>
                  : detail.map((t, i) => (
                    <div key={i} className="lk-trow">
                      <div className="lk-trow-top"><span className="lk-trow-proj">{t.proyecto_ext ?? '—'}</span><span className="lk-trow-eng">{t.asignado_nombre ?? 'sin asignar'}</span></div>
                      <div className="lk-trow-sub">{t.nombre} · {t.fecha_inicio ? fmtW(t.fecha_inicio) : '?'} → {t.fecha_fin ? fmtW(t.fecha_fin) : '?'}</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <LookaheadPanel etapas={g.etapas} semanas={g.semanas} />
    </div>
  )
}

// ── Estilos Apple (mismos tokens que el Cronograma PM) ──
const LK_CSS = `
.lk-root{--surf:#fff;--bg:#f5f5f7;--ctrl:#f2f2f5;--tx:#1d1d1f;--tx2:#6e6e73;--tx3:#8e8e93;--div:#e5e5ea;--acc:#0a6cdf;--acc-bg:#e8f0fc;
  display:flex;flex-direction:column;gap:14px;width:100%;min-width:0;
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:-0.01em;color:var(--tx);font-variant-numeric:tabular-nums;}
.lk-root *{box-sizing:border-box;}
.lk-card{position:relative;background:var(--surf);border-radius:16px;box-shadow:0 0 0 .5px rgba(0,0,0,.06),0 1px 3px rgba(0,0,0,.05);overflow:hidden;width:100%;min-width:0;}
.lk-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:.5px solid var(--div);flex-wrap:wrap;}
.lk-head-ic{color:var(--acc);}
.lk-head h2{font-size:15px;font-weight:700;margin:0;}
.lk-head-note{margin-left:auto;font-size:12px;color:var(--tx3);}
.lk-head-note b{color:var(--acc);}
.lk-controls{display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap;}
.lk-sel{appearance:none;border:1px solid var(--div);background:var(--surf);border-radius:8px;padding:5px 26px 5px 10px;font-size:13px;color:var(--tx);cursor:pointer;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238e8e93' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;}
.lk-sel:focus{outline:none;border-color:var(--acc);}
.lk-seg{display:inline-flex;background:var(--ctrl);border-radius:9px;padding:2px;}
.lk-seg button{border:none;background:transparent;font-size:12px;font-weight:600;color:var(--tx2);padding:5px 10px;border-radius:7px;cursor:pointer;}
.lk-seg button.on{background:#fff;color:var(--tx);box-shadow:0 1px 2px rgba(0,0,0,.12),0 0 0 .5px rgba(0,0,0,.04);}
.lk-empty{display:flex;align-items:center;justify-content:center;color:var(--tx3);font-size:14px;padding:40px 10px;}
.lk-scroll{overflow-x:auto;}
.lk-row{display:flex;align-items:stretch;}
.lk-gut{flex:none;}
.lk-months{border-bottom:.5px solid var(--div);background:#fff;}
.lk-month{flex:none;padding:4px 8px;font-size:12px;font-weight:700;color:var(--acc);border-left:1px solid var(--div);white-space:nowrap;overflow:hidden;text-transform:capitalize;}
.lk-days{border-bottom:.5px solid var(--div);background:#fafafc;}
.lk-colh{padding:6px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--tx3);font-weight:600;}
.lk-dc{flex:none;text-align:center;font-size:10px;color:var(--tx2);padding:6px 0;}
.lk-sim{border-bottom:.5px solid var(--div);background:var(--acc-bg);}
.lk-simlbl{padding:5px 12px;font-size:11px;font-weight:700;color:var(--acc);display:flex;align-items:center;}
.lk-simcell{flex:none;border:none;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0;}
.lk-proj{border-bottom:.5px solid #f0f0f2;}
.lk-proj:hover{background:#f7f9fc;}
.lk-projname{padding:6px 12px;min-width:0;}
.lk-pn{font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lk-pa{font-size:10px;color:var(--tx3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lk-pitems{padding:6px 10px;font-size:11px;color:var(--tx2);text-align:right;display:flex;align-items:center;justify-content:flex-end;}
.lk-pcell{flex:none;border:none;padding:0;}
.lk-foot{padding:8px 16px;font-size:11px;color:var(--tx3);border-top:.5px solid var(--div);}
.lk-foot b{color:var(--tx2);}
/* heatmap por etapas */
.lk-hm-months{position:relative;flex:1;height:28px;}
.lk-hm-month{position:absolute;top:0;bottom:0;border-left:1px solid var(--div);display:flex;align-items:center;padding-left:6px;font-size:10.5px;font-weight:600;color:var(--acc);}
.lk-hm-hoy{position:absolute;top:0;bottom:0;border-left:2px solid #e5484d;z-index:1;}
.lk-hm-hoy span{position:absolute;top:0;left:3px;font-size:9px;font-weight:700;color:#e5484d;}
.lk-etapa{border-bottom:.5px solid #f0f0f2;align-items:center;}
.lk-etapa:hover{background:#f7f9fc;}
.lk-etapaname{padding:6px 12px;display:flex;align-items:center;gap:8px;}
.lk-en{font-size:12.5px;font-weight:600;color:var(--tx);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lk-eh{font-size:9px;font-family:ui-monospace,monospace;color:var(--tx3);}
.lk-hm-cells{flex:1;display:flex;gap:1px;padding:4px 0;}
.lk-hm-cell{position:relative;flex:1;height:24px;border:none;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;}
.lk-hm-cell:hover:not(:disabled){box-shadow:0 0 0 2px rgba(10,108,223,.4);}
.lk-hm-dot{position:absolute;top:-2px;right:-2px;width:9px;height:9px;border-radius:999px;box-shadow:0 0 0 2px #fff;}
.lk-legend{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:8px 16px;font-size:11px;color:var(--tx2);border-top:.5px solid var(--div);}
.lk-legend span{display:inline-flex;align-items:center;gap:6px;}
.lk-legend i{width:13px;height:13px;border-radius:4px;display:inline-block;}
.lk-legend-note{font-style:italic;color:var(--tx3);}
/* modal detalle */
.lk-modal-back{position:fixed;inset:0;background:rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;padding:16px;z-index:60;}
.lk-modal{background:var(--surf);border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.25);width:100%;max-width:520px;max-height:82vh;overflow:hidden;display:flex;flex-direction:column;}
.lk-modal-head{display:flex;align-items:center;gap:9px;padding:14px 16px;border-bottom:.5px solid var(--div);}
.lk-modal-title{font-size:14px;font-weight:700;}
.lk-modal-sub{font-size:12px;color:var(--tx3);}
.lk-x{margin-left:auto;border:none;background:var(--ctrl);width:28px;height:28px;border-radius:999px;color:var(--tx2);display:flex;align-items:center;justify-content:center;cursor:pointer;}
.lk-x:hover{background:#e6e6ea;}
.lk-modal-body{overflow-y:auto;}
.lk-trow{padding:10px 16px;border-top:.5px solid #f0f0f2;}
.lk-trow:first-child{border-top:none;}
.lk-trow.sel{background:var(--acc-bg);}
.lk-trow-top{display:flex;align-items:center;gap:8px;}
.lk-trow-proj{font-size:13px;font-weight:600;flex:1;}
.lk-trow-eng{font-size:11px;color:var(--tx2);}
.lk-trow-sub{font-size:11px;color:var(--tx3);margin-top:2px;}
/* fila de semanas laborales */
.lk-weeks{border-bottom:.5px solid var(--div);background:var(--surf);}
.lk-week{flex:none;border-left:2px solid var(--acc);padding:3px 6px;font-size:11px;font-weight:700;color:var(--acc);white-space:nowrap;overflow:hidden;}
.lk-week.alt{background:var(--acc-bg);}
.lk-print{height:32px;border:none;border-radius:9px;background:var(--ctrl);font-size:13px;font-weight:600;color:var(--tx);padding:0 12px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;}
.lk-print:hover{background:#e6e6ea;}
/* impresión del lookahead (landscape) */
@media print {
  @page { size: landscape; margin: 0.4in; }
  body.lk-printing * { visibility:hidden !important; }
  body.lk-printing .lk-print-area, body.lk-printing .lk-print-area * { visibility:visible !important; }
  body.lk-printing .lk-print-area { position:absolute !important; left:0; top:0; box-shadow:none !important; }
  body.lk-printing .lk-scroll { overflow:visible !important; }
  body.lk-printing .lk-controls, body.lk-printing .lk-print { display:none !important; }
  body.lk-printing .lk-week, body.lk-printing .lk-simcell, body.lk-printing .lk-pcell { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
}
`
