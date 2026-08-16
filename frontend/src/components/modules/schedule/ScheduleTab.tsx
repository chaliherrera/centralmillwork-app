import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  CalendarClock, Lock, RefreshCw, Flag, Check,
  Target, User, Handshake, Activity, ChevronRight, Share2, Copy, X,
  ClipboardCheck, AlertTriangle, Zap, Upload, FileText, DollarSign,
} from 'lucide-react'
import { scheduleService, type ScheduleData, type ScheduleHito, type Semaforo } from '@/services/schedule'

// ─── Orden y metadata de las 8 fases (el "recorrido") ─────────────────────────
const FASES = [
  { key: 'CONTRACT',    label: 'Contrato',   owner: 'Estimación',   oc: 'bg-stone-100 text-stone-600' },
  { key: 'ENGINEERING', label: 'Ingeniería', owner: 'Ingeniería',   oc: 'bg-indigo-50 text-indigo-700' },
  { key: 'MATERIALS',   label: 'Materiales', owner: 'Compras',      oc: 'bg-amber-50 text-amber-700' },
  { key: 'PRODUCTION',  label: 'Producción', owner: 'Taller',       oc: 'bg-emerald-50 text-emerald-700' },
  { key: 'QC',          label: 'QC',         owner: 'Taller / QC',  oc: 'bg-teal-50 text-teal-700' },
  { key: 'SHIPPING',    label: 'Despacho',   owner: 'Logística',    oc: 'bg-sky-50 text-sky-700' },
  { key: 'INSTALL',     label: 'Instalación', owner: 'Field',       oc: 'bg-fuchsia-50 text-fuchsia-700' },
  { key: 'COMPLETED',   label: 'Cierre',     owner: 'PM / Finanzas', oc: 'bg-gray-100 text-gray-600' },
] as const

// Hitos clave a destacar en el carril "Hitos" (el resto vive en el detalle)
const KEY_HITOS: Record<string, string[]> = {
  CONTRACT: ['C-03'], ENGINEERING: ['E-05', 'E-07', 'E-10'], MATERIALS: ['M-05', 'M-07'],
  PRODUCTION: ['P-01'], QC: ['QC-02'], SHIPPING: ['S-04'], INSTALL: ['I-03', 'I-07'], COMPLETED: ['X-03'],
}
// Momentos con el cliente (touchpoints del portal), por código de hito
const CLIENT_TP: Record<string, string> = {
  'C-03': 'Firma contrato', 'E-01b': 'Aprueba compra anticipada', 'E-05': 'Aprueba muestras',
  'E-07': 'Aprueba planos', 'I-07': 'Firma / sign-off',
}

type Estado = 'done' | 'curso' | 'riesgo' | 'ajustado' | 'pend'
const ST_COLOR: Record<Estado, string> = {
  done: '#059669', curso: '#3b4233', riesgo: '#e11d48', ajustado: '#d97706', pend: '#a8a29e',
}
const ST_LABEL: Record<Estado, string> = {
  done: 'completada', curso: 'en curso', riesgo: 'en riesgo', ajustado: 'ajustada', pend: 'pendiente',
}
const ST_HEALTH: Record<Estado, number> = { done: 0.9, curso: 0.8, pend: 0.55, ajustado: 0.4, riesgo: 0.18 }
const SEM_DOT: Record<Semaforo, string> = { verde: 'bg-emerald-600', amarillo: 'bg-amber-500', rojo: 'bg-rose-600', gris: 'bg-stone-300' }

// Hitos que aprueba el cliente por el portal (no se registran a mano acá).
const CLIENT_APROBABLES = ['E-05', 'E-07', 'I-07']
const ATRIB_LABEL: Record<string, string> = {
  estimating: 'Estimación', engineering: 'Ingeniería', procurement: 'Compras', production: 'Producción',
  logistics: 'Logística', field: 'Field', finance: 'Finanzas', pm: 'PM', cliente: 'Cliente', gc: 'GC', vendor: 'Vendor',
}
const activoEstado = (e: string) => e === 'pendiente' || e === 'en_riesgo' || e === 'vencido'
const esRegistrable = (h: ScheduleHito) => h.fuente_dato === 'manual_futuro' && !CLIENT_APROBABLES.includes(h.codigo)
const esCliente = (h: ScheduleHito) => CLIENT_APROBABLES.includes(h.codigo)
// Acción específica por hito de Ingeniería. submittal = sube PDF versionado;
// archivo = sube archivo (CNC); registro = completa con fecha/nota (label propio).
const ACCION_HITO: Record<string, { label: string; tipo: 'submittal' | 'archivo' | 'pago' }> = {
  'C-03': { label: 'Subir contrato firmado', tipo: 'archivo' },
  'C-04': { label: 'Registrar pago', tipo: 'pago' },
  'E-06': { label: 'Subir planos', tipo: 'submittal' },
  'E-08': { label: 'Subir planos', tipo: 'submittal' },
  'E-11': { label: 'Subir archivos CNC', tipo: 'archivo' },
}
const REGISTRO_LABEL: Record<string, string> = {
  'C-05': 'Validar MTO', 'C-06': 'Validar budget', 'C-07': 'Enviar announcement',
  'C-08': 'Registrar kickoff', 'C-09': 'Transferir POC',
  'E-09': 'Liberar MTO', 'E-10': 'Release to Production',
}

function fmt(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-'); return `${day}/${m}/${y.slice(2)}`
}
function diasHasta(d: string): number {
  const [y, m, day] = d.split('-').map(Number)
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.round((new Date(y, m - 1, day).getTime() - t.getTime()) / 86400000)
}
// path suave (curva de Bézier) para la línea de salud
function smoothPath(xs: number[], ys: number[]): string {
  let d = `M ${xs[0]} ${ys[0]}`
  for (let i = 1; i < xs.length; i++) {
    const cx = (xs[i - 1] + xs[i]) / 2
    d += ` C ${cx} ${ys[i - 1]} ${cx} ${ys[i]} ${xs[i]} ${ys[i]}`
  }
  return d
}

interface FaseAgg {
  key: string; total: number; cumplidos: number; worst: Semaforo; estado: Estado
  keyHitos: ScheduleHito[]; clientTPs: string[]; hitos: ScheduleHito[]
}

export default function ScheduleTab({ proyectoId }: { proyectoId: number }) {
  const [data, setData] = useState<ScheduleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fechaObjetivo, setFechaObjetivo] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [portal, setPortal] = useState<{ open: boolean; nombre: string; link: string | null }>({ open: false, nombre: '', link: null })
  const [registro, setRegistro] = useState<{ codigo: string; nombre: string } | null>(null)
  const [regFecha, setRegFecha] = useState('')
  const [regNota, setRegNota] = useState('')
  const [submittal, setSubmittal] = useState<{ codigo: string; nombre: string } | null>(null)
  const [subFile, setSubFile] = useState<File | null>(null)
  const [archivoHito, setArchivoHito] = useState<{ codigo: string; nombre: string } | null>(null)
  const [arcFile, setArcFile] = useState<File | null>(null)
  const [pago, setPago] = useState<{ codigo: string; nombre: string } | null>(null)
  const [pagoImporte, setPagoImporte] = useState('')
  const [pagoFecha, setPagoFecha] = useState('')

  async function load() {
    setLoading(true)
    try { setData((await scheduleService.getPlan(proyectoId)).data) }
    catch { /* toast */ } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [proyectoId])

  async function generar() {
    if (!fechaObjetivo) { toast.error('Elegí la fecha de entrega objetivo'); return }
    setBusy(true)
    try { await scheduleService.generar(proyectoId, fechaObjetivo); toast.success('Schedule generado'); await load() }
    catch { /* toast */ } finally { setBusy(false) }
  }
  async function recalcular() {
    setBusy(true)
    try { await scheduleService.recalcular(proyectoId); toast.success('Schedule recalculado'); await load() }
    catch { /* toast */ } finally { setBusy(false) }
  }
  async function generarLink() {
    setBusy(true)
    try {
      const r = await scheduleService.crearPortalToken(proyectoId, portal.nombre.trim() || undefined)
      setPortal((p) => ({ ...p, link: `${window.location.origin}/portal/${r.data.token}` }))
    } catch { /* toast */ } finally { setBusy(false) }
  }
  function abrirRegistro(h: ScheduleHito) {
    setRegistro({ codigo: h.codigo, nombre: h.nombre })
    setRegFecha(new Date().toISOString().slice(0, 10)); setRegNota('')
  }
  async function confirmarRegistro() {
    if (!registro || !regFecha) { toast.error('Elegí la fecha'); return }
    setBusy(true)
    try {
      await scheduleService.registrarHito(proyectoId, registro.codigo, regFecha, regNota || undefined)
      toast.success('Hito registrado'); setRegistro(null); await load()
    } catch { /* toast */ } finally { setBusy(false) }
  }
  async function confirmarSubmittal() {
    if (!subFile) { toast.error('Elegí el PDF de los planos'); return }
    setBusy(true)
    try {
      const r = await scheduleService.uploadSubmittal(proyectoId, subFile)
      toast.success(`Submittal ${r.data.version_label} emitido`); setSubmittal(null); setSubFile(null); await load()
    } catch { /* toast */ } finally { setBusy(false) }
  }
  async function confirmarArchivo() {
    if (!archivoHito || !arcFile) { toast.error('Elegí un archivo'); return }
    setBusy(true)
    try {
      await scheduleService.uploadArchivoHito(proyectoId, archivoHito.codigo, arcFile)
      toast.success('Archivo adjuntado'); setArchivoHito(null); setArcFile(null); await load()
    } catch { /* toast */ } finally { setBusy(false) }
  }
  async function confirmarPago() {
    if (!pago || !pagoFecha) { toast.error('Elegí la fecha del pago'); return }
    const importe = pagoImporte ? Number(pagoImporte) : undefined
    setBusy(true)
    try {
      await scheduleService.registrarHito(proyectoId, pago.codigo, pagoFecha, undefined, importe)
      toast.success('Pago registrado'); setPago(null); await load()
    } catch { /* toast */ } finally { setBusy(false) }
  }
  const accionHito = (h: ScheduleHito, small = false) => {
    const cls = clsx('shrink-0 inline-flex items-center gap-1.5 font-medium rounded-lg',
      small ? 'text-[11px] text-forest-700 hover:text-white hover:bg-forest-600 border border-forest-200 px-2 py-1 transition-colors'
            : 'text-xs text-white bg-forest-600 hover:bg-forest-700 px-3 py-1.5')
    const ico = small ? 12 : 14
    const cfg = ACCION_HITO[h.codigo]
    if (cfg?.tipo === 'submittal') return (
      <button onClick={() => { setSubmittal({ codigo: h.codigo, nombre: h.nombre }); setSubFile(null) }} className={cls}>
        <Upload size={ico} /> {cfg.label}
      </button>
    )
    if (cfg?.tipo === 'archivo') return (
      <button onClick={() => { setArchivoHito({ codigo: h.codigo, nombre: h.nombre }); setArcFile(null) }} className={cls}>
        <Upload size={ico} /> {cfg.label}
      </button>
    )
    if (cfg?.tipo === 'pago') return (
      <button onClick={() => { setPago({ codigo: h.codigo, nombre: h.nombre }); setPagoImporte(''); setPagoFecha(new Date().toISOString().slice(0, 10)) }} className={cls}>
        <DollarSign size={ico} /> {cfg.label}
      </button>
    )
    return (
      <button onClick={() => abrirRegistro(h)} className={cls}>
        <ClipboardCheck size={ico} /> {REGISTRO_LABEL[h.codigo] ?? 'Registrar'}
      </button>
    )
  }

  const { fases, totalHitos, totalCumplidos } = useMemo(() => {
    const rank: Record<Semaforo, number> = { gris: 0, verde: 1, amarillo: 2, rojo: 3 }
    const byC = new Map<string, ScheduleHito>()
    for (const h of data?.hitos ?? []) byC.set(h.codigo, h)
    let tot = 0, cum = 0
    const out: FaseAgg[] = FASES.map((f) => {
      const all = (data?.hitos ?? []).filter((h) => h.fase === f.key).sort((a, b) => a.orden - b.orden)
      const principales = all.filter((h) => !h.parent_codigo)
      let worst: Semaforo = 'gris'; let c = 0
      for (const h of principales) {
        if (h.estado === 'cumplido') c++
        else if (h.semaforo !== 'gris' && rank[h.semaforo] > rank[worst]) worst = h.semaforo
      }
      tot += principales.length; cum += c
      let estado: Estado
      if (principales.length > 0 && c === principales.length) estado = 'done'
      else if (c > 0) estado = 'curso'
      else if (worst === 'rojo') estado = 'riesgo'
      else if (worst === 'amarillo') estado = 'ajustado'
      else estado = 'pend'
      const keyHitos = (KEY_HITOS[f.key] ?? []).map((cod) => byC.get(cod)).filter(Boolean) as ScheduleHito[]
      const clientTPs = principales.concat(all.filter((h) => h.parent_codigo))
        .filter((h) => CLIENT_TP[h.codigo]).map((h) => CLIENT_TP[h.codigo])
      return { key: f.key, total: principales.length, cumplidos: c, worst, estado, keyHitos, clientTPs, hitos: all }
    })
    return { fases: out, byCodigo: byC, totalHitos: tot, totalCumplidos: cum }
  }, [data])

  // Frontera activa: qué le toca a cada uno ahora (predecesores cumplidos, sin completar)
  const frontier = useMemo(() => {
    const activos = (data?.hitos ?? []).filter((h) => !h.parent_codigo && activoEstado(h.estado))
    return {
      accionables: activos.filter(esRegistrable).sort((a, b) => a.orden - b.orden),
      cliente: activos.filter(esCliente).sort((a, b) => a.orden - b.orden),
    }
  }, [data])

  // fase seleccionada por defecto: la que está "en curso", o la primera no completada
  useEffect(() => {
    if (selected || !fases.length) return
    const curso = fases.find((f) => f.estado === 'curso') ?? fases.find((f) => f.estado !== 'done')
    if (curso) setSelected(curso.key)
  }, [fases, selected])

  if (loading) return <div className="py-16 text-center text-stone-400 text-sm">Cargando schedule…</div>

  if (!data?.plan) {
    return (
      <div className="max-w-md mx-auto py-14 text-center">
        <div className="w-16 h-16 rounded-2xl bg-forest-50 flex items-center justify-center mx-auto">
          <CalendarClock className="text-forest-500" size={30} />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-stone-800">Este proyecto todavía no tiene schedule</h3>
        <p className="mt-1.5 text-sm text-stone-500 leading-relaxed">
          Elegí la fecha de entrega comprometida con el cliente. El sistema calcula hacia atrás
          la fecha límite de cada hito y lo mantiene vivo con lo que pasa en la operación.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <input type="date" value={fechaObjetivo} onChange={(e) => setFechaObjetivo(e.target.value)} className="input w-44" />
          <button onClick={generar} disabled={busy} className="btn-primary"><CalendarClock size={16} /> Generar schedule</button>
        </div>
      </div>
    )
  }

  const plan = data.plan
  const dias = diasHasta(plan.fecha_objetivo)
  const pct = totalHitos ? Math.round((totalCumplidos / totalHitos) * 100) : 0
  const heroSem = plan.semaforo
  const heroBg = heroSem === 'rojo' ? 'bg-rose-50 border-rose-200 text-rose-700'
    : heroSem === 'amarillo' ? 'bg-amber-50 border-amber-200 text-amber-700'
    : heroSem === 'verde' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
    : 'bg-stone-50 border-stone-200 text-stone-600'

  // geometría de la curva de salud (viewBox 0..1000 x 0..100)
  const N = FASES.length
  const xs = fases.map((_, i) => ((i + 0.5) / N) * 1000)
  const ys = fases.map((f) => 82 - (82 - 14) * ST_HEALTH[f.estado])
  const curve = smoothPath(xs, ys)
  const sel = fases.find((f) => f.key === selected)
  const selMeta = FASES.find((f) => f.key === selected)
  const gridCols = { gridTemplateColumns: `132px repeat(${N}, minmax(116px, 1fr))` }

  return (
    <div className="space-y-4">
      {/* ── HERO ── */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-1">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-stone-400 font-medium">Entrega objetivo</div>
          <div className="text-2xl font-bold text-stone-900 tabular-nums">{fmt(plan.fecha_objetivo)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-stone-400 font-medium">{dias < 0 ? 'Atraso' : 'Faltan'}</div>
          <div className={clsx('text-2xl font-bold tabular-nums', dias < 0 ? 'text-rose-600' : 'text-stone-900')}>
            {Math.abs(dias)} <span className="text-sm font-medium text-stone-500">días</span>
          </div>
        </div>
        <div className="min-w-[160px]">
          <div className="flex items-center justify-between text-[11px] text-stone-400 font-medium">
            <span>AVANCE</span><span className="text-stone-600 font-semibold">{totalCumplidos}/{totalHitos} · {pct}%</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-stone-100 overflow-hidden">
            <div className="h-full rounded-full bg-forest-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className={clsx('rounded-xl border px-4 py-2 text-center', heroBg)}>
          <div className="text-[10px] uppercase tracking-wider font-semibold opacity-80">Estado</div>
          <div className="text-base font-bold flex items-center gap-1.5 justify-center">
            <span className={clsx('w-2.5 h-2.5 rounded-full', SEM_DOT[heroSem])} />
            {heroSem === 'rojo' ? 'En riesgo' : heroSem === 'amarillo' ? 'Ajustado' : heroSem === 'verde' ? 'En fecha' : 'En espera'}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => setPortal({ open: true, nombre: '', link: null })}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-forest-600 hover:text-forest-800">
            <Share2 size={14} /> Compartir con cliente
          </button>
          <button onClick={recalcular} disabled={busy}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-800">
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Recalcular
          </button>
        </div>
      </div>

      {/* modal compartir portal */}
      {portal.open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => setPortal({ open: false, nombre: '', link: null })}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Share2 size={18} className="text-forest-600" />
              <h3 className="font-semibold text-stone-800">Compartir seguimiento con el cliente</h3>
              <button onClick={() => setPortal({ open: false, nombre: '', link: null })} className="ml-auto text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            {!portal.link ? (
              <>
                <p className="text-sm text-stone-500 mt-2">Se genera un link privado (sin cuenta) donde el cliente ve el estado de su proyecto y aprueba lo que depende de él. No ve costos ni información interna.</p>
                <label className="block mt-3 text-xs font-medium text-stone-500">Nombre del contacto (opcional)</label>
                <input value={portal.nombre} onChange={(e) => setPortal((p) => ({ ...p, nombre: e.target.value }))}
                       placeholder="Ej: Ana, Rivera Hotels" className="input w-full mt-1" />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setPortal({ open: false, nombre: '', link: null })} className="px-3 py-2 text-sm text-stone-500">Cancelar</button>
                  <button onClick={generarLink} disabled={busy} className="btn-primary"><Share2 size={15} /> Generar link</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-stone-500 mt-2">Link listo. Copialo y envialo al cliente:</p>
                <div className="mt-3 flex gap-2">
                  <input readOnly value={portal.link} className="input w-full text-xs" onFocus={(e) => e.target.select()} />
                  <button onClick={() => { navigator.clipboard?.writeText(portal.link!); toast.success('Link copiado') }}
                          className="btn-primary shrink-0"><Copy size={15} /> Copiar</button>
                </div>
                <div className="mt-4 flex justify-end">
                  <button onClick={() => setPortal({ open: false, nombre: '', link: null })} className="px-3 py-2 text-sm font-medium text-stone-600">Listo</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── QUÉ PASA AHORA (frontera activa) ── */}
      {(frontier.accionables.length > 0 || frontier.cliente.length > 0) && (
        <div className="rounded-2xl border border-card-border bg-white overflow-hidden"
             style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 bg-forest-50/50">
            <Zap size={16} className="text-forest-600" />
            <h3 className="font-semibold text-forest-800 text-sm">Qué pasa ahora</h3>
            <span className="ml-auto text-xs text-stone-400">lo que le toca a cada uno</span>
          </div>
          <div className="divide-y divide-stone-50">
            {frontier.accionables.map((h) => {
              const s = SEM_DOT[h.semaforo] ?? 'bg-stone-300'
              return (
                <div key={h.codigo} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={clsx('w-2.5 h-2.5 rounded-full shrink-0', s)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-stone-800 truncate">
                      {h.nombre}{h.es_gate && <Lock size={11} className="inline ml-1 -mt-0.5 text-stone-400" />}
                    </div>
                    <div className="text-[11px] text-stone-400">
                      <span className="font-medium text-stone-500">{h.rol_responsable || '—'}</span> · límite {fmt(h.fecha_planeada)}
                      {h.estado === 'vencido' && h.atribucion_atraso && (
                        <span className="text-rose-600 font-medium"> · atraso {ATRIB_LABEL[h.atribucion_atraso] ?? h.atribucion_atraso}</span>
                      )}
                    </div>
                  </div>
                  {h.holgura_dias !== null && (
                    <span className={clsx('text-[10px] font-medium rounded-full px-1.5 py-0.5 shrink-0 tabular-nums',
                      h.holgura_dias < 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700')}>
                      {h.holgura_dias < 0 ? '' : '+'}{h.holgura_dias}d
                    </span>
                  )}
                  {accionHito(h)}
                </div>
              )
            })}
            {frontier.cliente.map((h) => (
              <div key={h.codigo} className="flex items-center gap-3 px-4 py-2.5 bg-stone-50/40">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-blue-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-stone-700 truncate">{h.nombre}</div>
                  <div className="text-[11px] text-stone-400">Esperando aprobación del cliente · límite {fmt(h.fecha_planeada)}</div>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 rounded-full px-2 py-1">
                  <Handshake size={12} /> en el portal
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── JOURNEY MAP ── */}
      <div className="overflow-x-auto rounded-2xl border border-card-border bg-white"
           style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 10px 30px rgba(0,0,0,0.04)' }}>
        <div style={{ minWidth: 132 + N * 116 }}>
          {/* header de fases */}
          <div className="grid bg-[#faf8f2] rounded-t-2xl" style={gridCols}>
            <div className="p-3 text-[10px] uppercase tracking-wider text-stone-400 font-bold flex items-end">Recorrido →</div>
            {fases.map((f) => {
              const meta = FASES.find((x) => x.key === f.key)!; const c = ST_COLOR[f.estado]
              const isSel = f.key === selected
              return (
                <button key={f.key} onClick={() => setSelected(f.key)}
                        className={clsx('p-2.5 text-center border-l border-[#eee7db] transition-colors', isSel ? 'bg-white' : 'hover:bg-white/60')}>
                  <div className="h-1 rounded-full mx-2 mb-1.5" style={{ background: c }} />
                  <div className="text-[12.5px] font-semibold text-stone-800 leading-tight">{meta.label}</div>
                  <div className="text-[10.5px] mt-0.5" style={{ color: c }}>{f.cumplidos}/{f.total}</div>
                </button>
              )
            })}
          </div>

          {/* carril salud */}
          <div className="grid border-t border-[#eee7db]" style={gridCols}>
            <LaneLabel icon={<Activity size={14} />} text="Salud del proyecto" />
            <div className="relative" style={{ gridColumn: `span ${N}` }}>
              <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="w-full h-[92px] block">
                <rect x="0" y="74" width="1000" height="26" fill="#fef2f2" />
                <line x1="0" y1="74" x2="1000" y2="74" stroke="#fecaca" strokeWidth="1" strokeDasharray="4 4" />
                <path d={`${curve} L ${xs[N - 1]} 100 L ${xs[0]} 100 Z`} fill="#3b423311" />
                <path d={curve} fill="none" stroke="#3b4233" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                {fases.map((f, i) => (
                  <circle key={f.key} cx={xs[i]} cy={ys[i]} r="5" fill="#fff" stroke={ST_COLOR[f.estado]} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
            </div>
          </div>

          {/* carril hitos clave */}
          <div className="grid border-t border-[#eee7db]" style={gridCols}>
            <LaneLabel icon={<Target size={14} />} text="Hitos clave" />
            {fases.map((f) => (
              <div key={f.key} className="p-2 border-l border-[#f3efe6] min-h-[74px]">
                {f.keyHitos.map((h) => (
                  <div key={h.codigo} className="flex gap-1.5 items-start mb-1">
                    <span className={clsx('w-2 h-2 rounded-full mt-1 shrink-0', SEM_DOT[h.semaforo])} />
                    <span className="text-[10.5px] text-stone-600 leading-tight">
                      {h.nombre}
                      {h.es_gate && <Lock size={9} className="inline ml-0.5 -mt-0.5 text-stone-400" />}
                      {h.estado === 'cumplido' && <Check size={10} className="inline ml-0.5 text-emerald-600" />}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* carril quién responde */}
          <div className="grid border-t border-[#eee7db] bg-[#fdfcf9]" style={gridCols}>
            <LaneLabel icon={<User size={14} />} text="Quién responde" />
            {fases.map((f) => {
              const meta = FASES.find((x) => x.key === f.key)!
              return (
                <div key={f.key} className="p-2 border-l border-[#f3efe6]">
                  <div className={clsx('rounded-lg px-2 py-1.5 text-center text-[11px] font-semibold', meta.oc)}>{meta.owner}</div>
                </div>
              )
            })}
          </div>

          {/* carril cliente */}
          <div className="grid border-t border-[#eee7db] rounded-b-2xl" style={gridCols}>
            <LaneLabel icon={<Handshake size={14} />} text="Cliente" />
            {fases.map((f) => (
              <div key={f.key} className="p-2 border-l border-[#f3efe6] min-h-[42px]">
                {f.clientTPs.length ? f.clientTPs.map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5 mb-1">
                    <span className="w-4 h-4 rounded-full bg-blue-900 text-white text-[8px] font-bold flex items-center justify-center shrink-0">C</span>
                    <span className="text-[10px] text-blue-900 font-medium leading-tight">{t}</span>
                  </div>
                )) : <div className="text-center text-stone-200 text-lg leading-6">·</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* leyenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-500 px-1">
        <Leg dot="bg-emerald-600" t="En fecha" /><Leg dot="bg-amber-500" t="Ajustado" />
        <Leg dot="bg-rose-600" t="En riesgo" /><Leg dot="bg-stone-300" t="Pendiente" />
        <span className="inline-flex items-center gap-1"><Lock size={11} /> Gate (bloqueo)</span>
        <span className="inline-flex items-center gap-1"><span className="w-3.5 h-3.5 rounded-full bg-blue-900 text-white text-[8px] font-bold flex items-center justify-center">C</span> Momento con el cliente</span>
      </div>

      {/* ── DETALLE DE LA FASE SELECCIONADA ── */}
      {sel && selMeta && (
        <div className="rounded-2xl border border-card-border bg-white overflow-hidden"
             style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100">
            <div className="w-1.5 h-8 rounded-full" style={{ background: ST_COLOR[sel.estado] }} />
            <div>
              <h4 className="font-semibold text-stone-800">{selMeta.label}</h4>
              <div className="text-xs text-stone-500">{ST_LABEL[sel.estado]} · {sel.cumplidos} de {sel.total} hitos · responsable: {selMeta.owner}</div>
            </div>
            <span className="ml-auto text-xs text-stone-400 inline-flex items-center gap-1"><ChevronRight size={13} /> detalle de la fase</span>
          </div>
          <ol className="relative ml-6 my-1 border-l border-stone-200">
            {sel.hitos.map((h) => {
              const isSub = !!h.parent_codigo; const cumplido = h.estado === 'cumplido'
              return (
                <li key={h.codigo} className="relative py-2 pl-4 pr-4">
                  <span className={clsx('absolute -left-[7px] top-3.5 rounded-full ring-2 ring-white', isSub ? 'w-2 h-2' : 'w-3 h-3', SEM_DOT[h.semaforo])} />
                  <div className="flex items-center gap-2">
                    <span className={clsx('font-mono text-[10px] shrink-0 w-11', cumplido ? 'text-emerald-600' : 'text-stone-300')}>{h.codigo}</span>
                    <span className={clsx('flex-1 min-w-0 truncate', isSub ? 'text-[13px] text-stone-500' : 'text-sm text-stone-800')}>
                      {h.nombre}
                      {h.es_gate && <span className="inline-flex items-center gap-0.5 ml-1.5 align-middle text-[10px] text-stone-400 bg-stone-100 rounded px-1"><Lock size={9} /> gate</span>}
                      {h.es_ancla && <span className="inline-flex items-center gap-0.5 ml-1.5 align-middle text-[10px] font-semibold text-forest-600 bg-forest-50 rounded px-1"><Flag size={9} /> entrega</span>}
                    </span>
                    {cumplido ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 shrink-0"><Check size={11} /> {fmt(h.fecha_real)}</span>
                    ) : (
                      <>
                        {h.estado === 'vencido' && h.atribucion_atraso && (
                          <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-medium text-rose-700 bg-rose-50 rounded px-1.5 py-0.5 shrink-0">
                            <AlertTriangle size={9} /> {ATRIB_LABEL[h.atribucion_atraso] ?? h.atribucion_atraso}
                          </span>
                        )}
                        <span className="text-[11px] text-stone-400 shrink-0 tabular-nums w-14 text-right">{fmt(h.fecha_planeada)}</span>
                        {h.semaforo !== 'gris' && h.holgura_dias !== null && (
                          <span className={clsx('text-[10px] font-medium rounded-full px-1.5 py-0.5 shrink-0 tabular-nums',
                            h.holgura_dias < 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700')}>
                            {h.holgura_dias < 0 ? '' : '+'}{h.holgura_dias}d
                          </span>
                        )}
                        {activoEstado(h.estado) && esRegistrable(h) && accionHito(h, true)}
                        {activoEstado(h.estado) && esCliente(h) && (
                          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-50 rounded px-1.5 py-0.5"><Handshake size={11} /> portal</span>
                        )}
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {/* modal registrar hito */}
      {registro && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => !busy && setRegistro(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <ClipboardCheck size={18} className="text-forest-600" />
              <h3 className="font-semibold text-stone-800">Registrar hito</h3>
              <button onClick={() => setRegistro(null)} className="ml-auto text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <p className="text-sm text-stone-500 mt-1.5">
              <b className="text-stone-700">{registro.nombre}</b>. Registrás que ocurrió de verdad — queda con tu nombre y la fecha.
            </p>
            <label className="block mt-3 text-xs font-medium text-stone-500">¿Cuándo ocurrió?</label>
            <input type="date" value={regFecha} onChange={(e) => setRegFecha(e.target.value)} className="input w-full mt-1" />
            <label className="block mt-3 text-xs font-medium text-stone-500">Nota (opcional)</label>
            <textarea value={regNota} onChange={(e) => setRegNota(e.target.value)} rows={2}
                      placeholder="Ej: submittal Rev A enviado, N° de factura…" className="input w-full mt-1 resize-none" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRegistro(null)} disabled={busy} className="px-3 py-2 text-sm text-stone-500">Cancelar</button>
              <button onClick={confirmarRegistro} disabled={busy} className="btn-primary"><ClipboardCheck size={15} /> Registrar</button>
            </div>
          </div>
        </div>
      )}

      {/* modal subir submittal (planos) */}
      {submittal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => !busy && setSubmittal(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Upload size={18} className="text-forest-600" />
              <h3 className="font-semibold text-stone-800">Emitir planos al cliente</h3>
              <button onClick={() => setSubmittal(null)} className="ml-auto text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <p className="text-sm text-stone-500 mt-1.5">
              Subí el PDF de los shop drawings. Se registra como una nueva revisión y el cliente lo verá en su portal para aprobar.
            </p>
            <label className="mt-4 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-8 cursor-pointer hover:border-forest-400 transition-colors">
              <FileText size={26} className="text-stone-300" />
              <span className="text-sm text-stone-500">{subFile ? subFile.name : 'Elegí un archivo PDF'}</span>
              <input type="file" accept="application/pdf" className="hidden"
                     onChange={(e) => setSubFile(e.target.files?.[0] ?? null)} />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSubmittal(null)} disabled={busy} className="px-3 py-2 text-sm text-stone-500">Cancelar</button>
              <button onClick={confirmarSubmittal} disabled={busy || !subFile} className="btn-primary">
                <Upload size={15} /> {busy ? 'Subiendo…' : 'Emitir planos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* modal subir archivo (CNC / entregable) */}
      {archivoHito && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => !busy && setArchivoHito(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Upload size={18} className="text-forest-600" />
              <h3 className="font-semibold text-stone-800">{archivoHito.nombre}</h3>
              <button onClick={() => setArchivoHito(null)} className="ml-auto text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <p className="text-sm text-stone-500 mt-1.5">
              Subí el archivo. Queda adjunto al hito y lo completa (con tu nombre y la fecha).
            </p>
            <label className="mt-4 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-8 cursor-pointer hover:border-forest-400 transition-colors">
              <FileText size={26} className="text-stone-300" />
              <span className="text-sm text-stone-500">{arcFile ? arcFile.name : 'Elegí un archivo'}</span>
              <input type="file" className="hidden" onChange={(e) => setArcFile(e.target.files?.[0] ?? null)} />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setArchivoHito(null)} disabled={busy} className="px-3 py-2 text-sm text-stone-500">Cancelar</button>
              <button onClick={confirmarArchivo} disabled={busy || !arcFile} className="btn-primary">
                <Upload size={15} /> {busy ? 'Subiendo…' : 'Subir archivo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* modal registrar pago */}
      {pago && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={() => !busy && setPago(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <DollarSign size={18} className="text-forest-600" />
              <h3 className="font-semibold text-stone-800">{pago.nombre}</h3>
              <button onClick={() => setPago(null)} className="ml-auto text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <p className="text-sm text-stone-500 mt-1.5">Registrá el pago recibido. Queda con tu nombre y la fecha.</p>
            <label className="block mt-3 text-xs font-medium text-stone-500">Importe recibido (USD)</label>
            <input type="number" min="0" step="0.01" value={pagoImporte} onChange={(e) => setPagoImporte(e.target.value)}
                   placeholder="Ej: 25000" className="input w-full mt-1" />
            <label className="block mt-3 text-xs font-medium text-stone-500">¿Cuándo se recibió?</label>
            <input type="date" value={pagoFecha} onChange={(e) => setPagoFecha(e.target.value)} className="input w-full mt-1" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPago(null)} disabled={busy} className="px-3 py-2 text-sm text-stone-500">Cancelar</button>
              <button onClick={confirmarPago} disabled={busy} className="btn-primary"><DollarSign size={15} /> Registrar pago</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LaneLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="p-3 flex items-center gap-2">
      <span className="text-stone-400">{icon}</span>
      <span className="text-[12px] font-bold text-stone-600 leading-tight">{text}</span>
    </div>
  )
}
function Leg({ dot, t }: { dot: string; t: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={clsx('w-2.5 h-2.5 rounded-full', dot)} /> {t}</span>
}
