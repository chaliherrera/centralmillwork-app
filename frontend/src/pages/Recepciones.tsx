import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, ShoppingCart, DollarSign, Clock,
  AlertTriangle, FileText, X, ImageIcon,
  CheckCircle2, Calendar, Package, ChevronDown, ChevronUp,
  Truck, History, Warehouse,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { ordenesCompraService } from '@/services/ordenesCompra'
import DynamicImageGrid from '@/components/ui/DynamicImageGrid'
import { recepcionesService } from '@/services/recepciones'
import ReporteModal from '@/components/ui/ReporteModal'
import type { OrdenCompra, Material } from '@/types'
import {
  RECEPCION_CANTIDADES, fmtQty, computeEntregasContexto,
  RecepcionMaterialesResumen, ResumenRecepcionOC,
} from '@/components/modules/recepciones/historialCantidades'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${m}/${day}/${y}`
}

// ─── Timeline ─────────────────────────────────────────────────────────────────
function Timeline({ oc }: { oc: OrdenCompra }) {
  const steps = [
    { label: 'MTO',      date: oc.fecha_mto,             color: 'bg-forest-500' },
    { label: 'Orden',    date: oc.fecha_emision,          color: 'bg-gold-500'   },
    { label: 'ETA',      date: oc.fecha_entrega_estimada, color: oc.flag_vencida ? 'bg-red-500' : 'bg-amber-400' },
    { label: 'Recibido', date: oc.fecha_entrega_real ?? null, color: 'bg-green-500'  },
  ]
  return (
    <div className="flex items-start gap-1 w-full">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center flex-1 min-w-0">
          <div className="flex flex-col items-center flex-shrink-0">
            <div className={clsx('w-2.5 h-2.5 rounded-full', s.date ? s.color : 'bg-gray-200')} />
            <p className="text-[9px] text-gray-400 mt-0.5 whitespace-nowrap">{s.label}</p>
            <p className="text-[9px] font-medium text-gray-600 whitespace-nowrap">{s.date ? fmtDate(s.date) : '—'}</p>
          </div>
          {i < steps.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-1 mt-[-10px]" />}
        </div>
      ))}
    </div>
  )
}

// ─── Recepcion Panel (drawer content) ─────────────────────────────────────────
function RecepcionPanel({
  oc, onClose, onSuccess,
}: {
  oc: OrdenCompra; onClose: () => void; onSuccess: () => void
}) {
  const [matChecks, setMatChecks]     = useState<Record<number, boolean>>({})
  const [matQty, setMatQty]           = useState<Record<number, string>>({})  // F2: cantidad recibida por material
  const [matNotes, setMatNotes]       = useState<Record<number, string>>({})
  const [expandNotes, setExpandNotes] = useState<Record<number, boolean>>({})
  const [recibio, setRecibio]         = useState('')
  const [notasOc, setNotasOc]         = useState('')
  const [tipo, setTipo]               = useState<'total' | 'parcial'>('total')
  const [forzarTotal, setForzarTotal] = useState(false)  // F2: cerrar la OC aunque falte material

  // Fire-and-forget: ensure recepcion_materiales are pre-populated for this OC
  const initMutation = useMutation({
    mutationFn: () => recepcionesService.inicializar(oc.id),
  })
  useEffect(() => { initMutation.mutate() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: matsData, isLoading: matsLoading } = useQuery({
    queryKey: ['oc-materiales-lote', oc.id],
    queryFn: () => ordenesCompraService.getMaterialesLote(oc.id),
    staleTime: 30_000,
  })
  const mats: Material[] = matsData?.data ?? []

  const { data: historialData, isLoading: historialLoading } = useQuery({
    queryKey: ['recepcion-historial', oc.id],
    queryFn: () => recepcionesService.getHistorial(oc.id),
    staleTime: 10_000,
  })
  const historial = historialData?.data ?? []
  const histCtx = useMemo(() => computeEntregasContexto(historial), [historial])

  // IDs of materials already received in a previous (partial) reception
  const receivedIds = useMemo(() => {
    const s = new Set<number>()
    for (const rec of historial) {
      for (const rm of rec.materiales) {
        if (rm.recibido && rm.id_material != null) s.add(rm.id_material)
      }
    }
    return s
  }, [historial])

  // F2: cuánto se recibió ya de cada material (suma de cantidad_recibida de entregas previas).
  const recibidoAcum = useMemo(() => {
    const map = new Map<number, number>()
    for (const rec of historial) {
      for (const rm of rec.materiales) {
        if (rm.id_material != null && rm.cantidad_recibida != null) {
          map.set(rm.id_material, (map.get(rm.id_material) ?? 0) + Number(rm.cantidad_recibida))
        }
      }
    }
    return map
  }, [historial])

  // Helpers de cantidad (F2). El "ordenado" es m.qty (= items_orden_compra.cantidad).
  // Redondeo a 3 decimales (numeric(12,3)) para que coincida con el backend y no haya
  // falsos "excesos" por coma flotante.
  const r3         = (x: number) => Math.round(x * 1000) / 1000
  const orderedOf  = (m: Material) => r3(Number(m.qty) || 0)
  const acumOf     = (m: Material) => r3(recibidoAcum.get(m.id) ?? 0)
  const faltanteOf = (m: Material) => Math.max(0, r3(orderedOf(m) - acumOf(m)))
  const qtyNum     = (id: number) => { const n = Number(matQty[id]); return Number.isFinite(n) && n >= 0 ? r3(n) : 0 }

  // Firma de lo ya recibido por material: cambia cuando se registra una entrega.
  const acumSig = useMemo(
    () => mats.map((m) => `${m.id}:${acumOf(m)}:${receivedIds.has(m.id) ? 1 : 0}`).join('|'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mats, recibidoAcum, receivedIds]
  )

  // (Re)inicializa checks y cantidades cada vez que cambia lo recibido (primera carga o
  // tras registrar una entrega) → el casillero siempre muestra el FALTANTE actualizado.
  useEffect(() => {
    if (matsLoading || historialLoading || mats.length === 0) return
    const init: Record<number, boolean> = {}
    const initQty: Record<number, string> = {}
    mats.forEach((m) => {
      init[m.id] = receivedIds.has(m.id)
      initQty[m.id] = fmtQty(faltanteOf(m))
    })
    setMatChecks(init)
    if (RECEPCION_CANTIDADES) setMatQty(initQty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acumSig, matsLoading, historialLoading])

  const activeMats  = mats.filter((m) => !receivedIds.has(m.id))
  const checkedCount = activeMats.filter((m) => matChecks[m.id]).length
  const allChecked   = activeMats.length > 0 && checkedCount === activeMats.length
  const isEnTransito = oc.estado === 'en_transito'

  // ── Derivados F2 (recepción por cantidades) ──
  // Materiales que efectivamente se reciben en esta entrega (cantidad > 0).
  const activeConQty = activeMats.filter((m) => qtyNum(m.id) > 0)
  // ¿Alguna cantidad se pasa de lo ordenado? (bloquea el submit)
  const hayExceso = activeMats.some((m) => r3(acumOf(m) + qtyNum(m.id)) > orderedOf(m))
  // ¿Esta entrega deja TODO completo? (todos los activos llegan a lo ordenado)
  const todoCubierto = activeMats.length > 0 && activeMats.every((m) => r3(acumOf(m) + qtyNum(m.id)) >= orderedOf(m))
  // Tipo efectivo: en F2 lo dictan las cantidades (o el "forzar total"); si no, el toggle manual.
  const tipoEfectivo: 'total' | 'parcial' = RECEPCION_CANTIDADES
    ? ((todoCubierto || forzarTotal) ? 'total' : 'parcial')
    : tipo
  // ¿Quedan faltantes aunque se cierre total? (para avisar en el "forzar total")
  const quedanFaltantes = activeMats.some((m) => r3(acumOf(m) + qtyNum(m.id)) < orderedOf(m))

  const toggleAll = () => {
    const newVal = !allChecked
    setMatChecks((prev) => {
      const next = { ...prev }
      activeMats.forEach((m) => { next[m.id] = newVal })
      return next
    })
  }
  // F2: llenar/vaciar el faltante en todos los materiales de una.
  const fillAll = (fill: boolean) => {
    setMatQty((prev) => {
      const next = { ...prev }
      activeMats.forEach((m) => { next[m.id] = fill ? fmtQty(faltanteOf(m)) : '0' })
      return next
    })
  }

  const qc = useQueryClient()
  const submitMutation = useMutation({
    mutationFn: () => recepcionesService.createCompleta({
      orden_compra_id: oc.id,
      fecha_recepcion: new Date().toISOString().slice(0, 10),
      tipo: tipoEfectivo,
      recibio: recibio || undefined,
      notas:   notasOc || undefined,
      // Only send active (not previously received) materials
      materiales: RECEPCION_CANTIDADES
        ? activeConQty.map((m) => ({
            id_material: m.id,
            cm_code:     m.codigo ?? undefined,
            descripcion: m.descripcion,
            recibido:    acumOf(m) + qtyNum(m.id) >= orderedOf(m),
            nota:        matNotes[m.id] || undefined,
            cantidad_recibida: qtyNum(m.id),
            cantidad_ordenada: orderedOf(m),
          }))
        : mats
            .filter((m) => !receivedIds.has(m.id))
            .map((m) => ({
              id_material: m.id,
              cm_code:     m.codigo ?? undefined,
              descripcion: m.descripcion,
              recibido:    matChecks[m.id] ?? false,
              nota:        matNotes[m.id]  || undefined,
            })),
    }),
    onSuccess: (res) => {
      toast.success(res.message ?? 'Recepción registrada')
      if (res.advertencias?.length) {
        toast(res.advertencias.join('\n'), { icon: '⚠️', duration: 6000 })
      }
      // refetchType: 'all' fuerza refetch incluso de queries inactivas (ej. la
      // página Materiales cuando no está montada). Sin esto, el badge ORDENADO
      // queda visible hasta refrescar manualmente al volver a la página.
      qc.invalidateQueries({ queryKey: ['recepciones-ocs'],         refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['recepciones-ocs-transito'], refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['oc-kpis-recepciones'],      refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['ordenes-compra'],           refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['ordenes-compra-kanban'],    refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['oc-kpis'],                  refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['materiales'],               refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['materiales-all'],           refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['materiales-kpis'],          refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['oc-materiales-lote'],       refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['recepcion-historial'],      refetchType: 'all' })
      onSuccess()
    },
    onError: () => toast.error('Error al registrar recepción'),
  })

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="bg-forest-700 text-white px-5 py-4 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm font-bold">{oc.numero}</span>
              {isEnTransito ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-400/20 text-blue-200 border border-blue-400/30">
                  <Truck size={10} /> EN TRÁNSITO
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-400/20 text-amber-200 border border-amber-400/30">
                  <ShoppingCart size={10} /> ORDENADO
                </span>
              )}
            </div>
            <p className="text-xs text-white/70 truncate">{oc.proyecto?.codigo} · {oc.proyecto?.nombre}</p>
            <p className="text-xs text-white/60 truncate">{oc.proveedor?.nombre ?? '—'}</p>
            {oc.items_cubiertos && (
              <p className="text-xs text-blue-200 mt-0.5 truncate" title={`Ítems del proyecto cubiertos: ${oc.items_cubiertos}`}>
                Ítems: {oc.items_cubiertos}
              </p>
            )}
            <p className="text-lg font-bold text-gold-300 mt-0.5">{fmt(Number(oc.total))}</p>
          </div>
          <button onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0 mt-0.5">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 min-h-0">

        {/* Timeline */}
        <div className="bg-gray-50 rounded-xl px-4 py-3">
          <Timeline oc={oc} />
        </div>

        {/* ETA alert */}
        {oc.flag_vencida && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
            <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-red-700">ETA vencida — recibir con urgencia</span>
          </div>
        )}

        {/* ── Historial de recepciones previas ── */}
        {historial.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <History size={13} className="text-gray-400" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Historial de recepciones
              </p>
            </div>
            <div className="space-y-2">
              {historial.map((rec) => {
                const esTot = rec.estado === 'completa'
                return (
                  <div key={rec.id} className={clsx(
                    'rounded-xl border px-4 py-3',
                    esTot ? 'border-green-100 bg-green-50' : 'border-blue-100 bg-blue-50'
                  )}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-mono text-gray-600">{rec.folio}</span>
                      <span className={clsx(
                        'text-xs font-bold px-2 py-0.5 rounded-full',
                        esTot ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      )}>
                        {esTot ? 'TOTAL' : 'PARCIAL'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">
                      {fmtDate(rec.fecha_recepcion)}
                      {rec.recibio && <> · <strong>{rec.recibio}</strong></>}
                    </p>
                    {rec.notas && (
                      <p className="text-xs text-gray-500 italic mt-0.5">"{rec.notas}"</p>
                    )}
                    <RecepcionMaterialesResumen rec={rec} ctx={histCtx} />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Tipo de recepción ── */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tipo de recepción</p>

          {!RECEPCION_CANTIDADES ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(['total', 'parcial'] as const).map((t) => (
                  <button key={t} onClick={() => setTipo(t)}
                    className={clsx(
                      'px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all',
                      tipo === t
                        ? t === 'total'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-400 hover:border-gray-300'
                    )}>
                    {t === 'total' ? '✓ TOTAL' : '⟳ PARCIAL'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {tipo === 'total'
                  ? 'OC pasa a EN EL TALLER — recepción completa.'
                  : 'OC pasa a EN TRÁNSITO — quedan materiales pendientes.'}
              </p>
            </>
          ) : (
            <>
              {/* F2: el tipo lo dictan las cantidades cargadas. */}
              <div className={clsx(
                'rounded-xl border-2 px-3 py-2.5 text-sm font-semibold flex items-center gap-2',
                tipoEfectivo === 'total'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-blue-400 bg-blue-50 text-blue-700'
              )}>
                {tipoEfectivo === 'total'
                  ? <><CheckCircle2 size={14} /> TOTAL — la OC se cierra (pasa a EN EL TALLER)</>
                  : <><Truck size={14} /> PARCIAL — quedan faltantes (OC sigue EN TRÁNSITO)</>}
              </div>
              {/* Forzar total con faltantes (caso "llegó incompleto pero cerramos igual"). */}
              {quedanFaltantes && (
                <label className="flex items-start gap-2 mt-2 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={forzarTotal}
                    onChange={(e) => setForzarTotal(e.target.checked)}
                    className="mt-0.5 w-3.5 h-3.5 rounded accent-amber-600" />
                  <span>Cerrar igual como <b>TOTAL</b> aunque falte material (quedará registrado el faltante).</span>
                </label>
              )}
            </>
          )}
        </div>

        {/* ── Material checklist ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {RECEPCION_CANTIDADES ? 'Cantidades recibidas' : 'Materiales del lote'}
              {mats.length > 0 && (
                <span className="ml-1 text-forest-600">
                  {RECEPCION_CANTIDADES ? activeConQty.length : checkedCount}/{activeMats.length}
                  {receivedIds.size > 0 && (
                    <span className="text-green-600 ml-1">({receivedIds.size} ya completos)</span>
                  )}
                </span>
              )}
            </p>
            {activeMats.length > 0 && (
              RECEPCION_CANTIDADES ? (
                <div className="flex items-center gap-2 text-xs">
                  <button onClick={() => fillAll(true)} className="text-forest-600 hover:underline">Llenar faltante</button>
                  <span className="text-gray-300">·</span>
                  <button onClick={() => fillAll(false)} className="text-gray-400 hover:underline">Vaciar</button>
                </div>
              ) : (
                <button onClick={toggleAll} className="text-xs text-forest-600 hover:underline">
                  {allChecked ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              )
            )}
          </div>

          {(matsLoading || historialLoading) && (
            <div className="space-y-1.5">
              {[1,2,3].map((i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
            </div>
          )}

          {!matsLoading && !historialLoading && mats.length === 0 && (
            <p className="text-xs text-gray-300 italic py-2">Sin materiales registrados en este lote</p>
          )}

          {!matsLoading && !historialLoading && mats.length > 0 && (
            <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
              {mats.map((m) => {
                const alreadyReceived = receivedIds.has(m.id)
                return (
                  <div key={m.id} className={clsx(
                    'px-3 py-2.5 transition-colors',
                    alreadyReceived
                      ? 'bg-green-50'
                      : matChecks[m.id]
                        ? 'bg-green-50/60'
                        : 'hover:bg-gray-50/60'
                  )}>
                    <div className="flex items-start gap-2.5">
                      {RECEPCION_CANTIDADES ? (
                        <input
                          type="number" min={0} step="any" inputMode="decimal"
                          value={alreadyReceived ? '' : (matQty[m.id] ?? '')}
                          disabled={alreadyReceived}
                          onChange={(e) => setMatQty((prev) => ({ ...prev, [m.id]: e.target.value }))}
                          className={clsx(
                            'mt-0.5 w-16 text-sm text-center border rounded px-1 py-1 flex-shrink-0 focus:outline-none disabled:opacity-40 disabled:bg-gray-50',
                            acumOf(m) + qtyNum(m.id) > orderedOf(m)
                              ? 'border-red-400 text-red-600'
                              : 'border-gray-200 focus:border-forest-400'
                          )}
                        />
                      ) : (
                        <input
                          type="checkbox"
                          checked={matChecks[m.id] ?? false}
                          disabled={alreadyReceived}
                          onChange={(e) => setMatChecks((prev) => ({ ...prev, [m.id]: e.target.checked }))}
                          className="mt-0.5 w-4 h-4 rounded flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed accent-forest-600"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {m.codigo && (
                            <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded flex-shrink-0">
                              {m.codigo}
                            </span>
                          )}
                          <span className={clsx(
                            'text-xs font-medium',
                            alreadyReceived ? 'text-green-700' : 'text-gray-700'
                          )}>{m.descripcion}</span>
                          {RECEPCION_CANTIDADES ? (
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              de {fmtQty(orderedOf(m))} {m.unidad}
                              {acumOf(m) > 0 && <span className="text-green-600"> · ya {fmtQty(acumOf(m))}</span>}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 flex-shrink-0">{Number(m.qty)} {m.unidad}</span>
                          )}
                          {alreadyReceived && (
                            <span className="flex items-center gap-0.5 text-xs text-green-600 font-semibold flex-shrink-0">
                              <CheckCircle2 size={10} /> {RECEPCION_CANTIDADES ? 'Completo' : 'Ya recibido'}
                            </span>
                          )}
                        </div>
                        {!alreadyReceived && RECEPCION_CANTIDADES && (
                          acumOf(m) + qtyNum(m.id) > orderedOf(m)
                            ? <p className="text-[11px] text-red-600 mt-0.5">Se pasa de lo ordenado (máximo {fmtQty(faltanteOf(m))}).</p>
                            : <p className="text-[11px] text-gray-400 mt-0.5">
                                Faltaban {fmtQty(faltanteOf(m))} · con esto quedan {fmtQty(Math.max(0, orderedOf(m) - acumOf(m) - qtyNum(m.id)))}
                              </p>
                        )}
                        {!alreadyReceived && (
                          <>
                            <button
                              onClick={() => setExpandNotes((prev) => ({ ...prev, [m.id]: !prev[m.id] }))}
                              className="flex items-center gap-1 text-xs text-gray-300 hover:text-gray-500 mt-1 transition-colors">
                              {expandNotes[m.id] ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                              {matNotes[m.id] ? 'Nota' : 'Agregar nota'}
                            </button>
                            {expandNotes[m.id] && (
                              <input
                                type="text"
                                value={matNotes[m.id] ?? ''}
                                onChange={(e) => setMatNotes((prev) => ({ ...prev, [m.id]: e.target.value }))}
                                placeholder="Back order, retraso, daño…"
                                className="mt-1 w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-forest-400"
                              />
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Images ── */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ImageIcon size={13} className="text-gray-400" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Imágenes</p>
          </div>
          <DynamicImageGrid ocId={oc.id} />
        </div>

        {/* ── Receptor + Observaciones ── */}
        <div className="space-y-2">
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Recibió</label>
            <input type="text" value={recibio} onChange={(e) => setRecibio(e.target.value)}
              placeholder="Nombre de quien recibió…" className="input w-full text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Observaciones generales</label>
            <textarea value={notasOc} onChange={(e) => setNotasOc(e.target.value)}
              placeholder="Observaciones de la recepción…" rows={2}
              className="input w-full text-sm resize-none" />
          </div>
        </div>

        {/* ── Submit ── */}
        {RECEPCION_CANTIDADES && hayExceso && (
          <p className="text-xs text-red-600 text-center -mb-2">
            Hay cantidades que superan lo ordenado. Corregilas para registrar.
          </p>
        )}
        <button
          onClick={() => submitMutation.mutate()}
          disabled={
            submitMutation.isPending ||
            (RECEPCION_CANTIDADES && (hayExceso || activeConQty.length === 0))
          }
          className={clsx(
            'w-full justify-center py-3 flex items-center gap-2 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            tipoEfectivo === 'total'
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          )}>
          {submitMutation.isPending
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : tipoEfectivo === 'total'
              ? <><CheckCircle2 size={16} /> Registrar Recepción TOTAL</>
              : <><Truck size={16} /> Registrar Recepción PARCIAL</>}
        </button>
      </div>
    </div>
  )
}

// ─── Historial Panel (read-only, for EN_EL_TALLER OCs) ───────────────────────
function HistorialPanel({ oc, onClose }: { oc: OrdenCompra; onClose: () => void }) {
  const { data: historialData, isLoading } = useQuery({
    queryKey: ['recepcion-historial', oc.id],
    queryFn: () => recepcionesService.getHistorial(oc.id),
    staleTime: 10_000,
  })
  const historial = historialData?.data ?? []
  const ctx = useMemo(() => computeEntregasContexto(historial), [historial])

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="bg-green-700 text-white px-4 py-3 flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono text-sm font-bold">{oc.numero}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-400/20 text-green-100 border border-green-400/30">
                <Warehouse size={10} /> EN EL TALLER
              </span>
            </div>
            <p className="text-xs text-white/70 truncate">{oc.proyecto?.nombre} · {oc.proveedor?.nombre}</p>
            {oc.items_cubiertos && (
              <p className="text-xs text-blue-200 mt-0.5 truncate" title={`Ítems del proyecto cubiertos: ${oc.items_cubiertos}`}>
                Ítems: {oc.items_cubiertos}
              </p>
            )}
            {oc.fecha_entrega_real && (
              <p className="text-xs text-green-200 mt-0.5">Recibido: {fmtDate(oc.fecha_entrega_real)}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded transition-colors flex-shrink-0">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {/* Images */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ImageIcon size={13} className="text-gray-400" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Imágenes</p>
          </div>
          <DynamicImageGrid ocId={oc.id} />
        </div>

        {/* Recepcion historial */}
        <div>
          {!isLoading && <ResumenRecepcionOC historial={historial} />}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Historial de recepciones
            {!isLoading && historial.length > 0 && (
              <span className="ml-1 text-forest-600 normal-case">
                · {historial.length} {historial.length === 1 ? 'entrega' : 'entregas'}
              </span>
            )}
          </p>
          {isLoading && (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          )}
          {!isLoading && historial.length === 0 && (
            <p className="text-xs text-gray-300 italic">Sin recepciones registradas</p>
          )}
          {!isLoading && historial.map((rec) => {
            const esTot = rec.estado === 'completa'
            return (
              <div key={rec.id} className={clsx(
                'rounded-xl border px-4 py-3 mb-2',
                esTot ? 'border-green-100 bg-green-50' : 'border-amber-100 bg-amber-50'
              )}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-bold text-gray-700">{rec.folio}</span>
                  <span className={clsx(
                    'text-xs font-bold px-2 py-0.5 rounded-full',
                    esTot ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  )}>
                    {esTot ? 'TOTAL' : 'PARCIAL'}
                  </span>
                </div>
                <p className="text-xs text-gray-600">
                  {fmtDate(rec.fecha_recepcion)}
                  {rec.recibio && <> · <strong>{rec.recibio}</strong></>}
                </p>
                {rec.notas && (
                  <p className="text-xs text-gray-500 italic mt-1 bg-white/70 rounded px-2 py-1">"{rec.notas}"</p>
                )}
                <RecepcionMaterialesResumen rec={rec} ctx={ctx} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────
function OcCard({ oc, selected, onClick }: { oc: OrdenCompra; selected: boolean; onClick: () => void }) {
  const isTransito = oc.estado === 'en_transito'
  return (
    <div onClick={onClick}
      className={clsx(
        'bg-white rounded-xl border cursor-pointer transition-all duration-150 p-3 space-y-2',
        'hover:shadow-md hover:-translate-y-0.5',
        selected
          ? 'border-gold-400 shadow-md ring-2 ring-gold-300/50'
          : oc.flag_vencida
            ? 'border-red-200 hover:border-red-300 bg-red-50/20'
            : isTransito
              ? 'border-blue-200 hover:border-blue-300 bg-blue-50/10'
              : 'border-orange-200 hover:border-orange-300 bg-orange-50/10'
      )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-xs font-bold text-forest-700">{oc.numero}</span>
          {oc.origen === 'DIRECTA' && (
            <span className="text-[10px] px-1.5 py-0 rounded font-bold tracking-wide bg-cyan-100 text-cyan-700">DIRECTA</span>
          )}
          {oc.origen === 'URGENTE' && (
            <span className="text-[10px] px-1.5 py-0 rounded font-bold tracking-wide bg-red-100 text-red-700 inline-flex items-center gap-0.5">
              <AlertTriangle size={9} /> URGENTE
            </span>
          )}
          {oc.origen === 'OPERATIVA' && (
            <span className="text-[10px] px-1.5 py-0 rounded font-bold tracking-wide bg-orange-100 text-orange-700">OPERATIVA</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {oc.flag_vencida && <span className="w-2 h-2 rounded-full bg-red-500" title="ETA vencida" />}
          {oc.flag_2dias && !oc.flag_vencida && <span className="w-2 h-2 rounded-full bg-orange-400" title="Vence en 2 días" />}
          {isTransito && <Truck size={12} className="text-blue-500" />}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-700 truncate">{oc.proyecto?.nombre ?? '—'}</p>
        <p className="text-xs text-gray-400 truncate">{oc.proveedor?.nombre ?? '—'}</p>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {oc.categoria && (
          <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{oc.categoria}</span>
        )}
        {oc.items_cubiertos && (
          <span
            className="inline-block text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium truncate max-w-[140px]"
            title={`Ítems del proyecto cubiertos: ${oc.items_cubiertos}`}
          >
            ítems {oc.items_cubiertos}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between pt-1 border-t border-gray-50">
        <span className="text-sm font-bold text-gray-800">{fmt(Number(oc.total))}</span>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Calendar size={10} />
          <span className="tabular-nums">{fmtDate(oc.fecha_entrega_estimada)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Kanban Column ────────────────────────────────────────────────────────────
function KanbanColumn({ title, color, icon, ocs, selectedOc, isLoading, onSelect }: {
  title: string; color: string; icon: React.ReactNode
  ocs: OrdenCompra[]; selectedOc?: OrdenCompra; isLoading: boolean
  onSelect: (oc: OrdenCompra) => void
}) {
  return (
    <div className="w-[300px] shrink-0">
      <div className="flex items-center gap-2 mb-3">
        <div className={clsx('w-3 h-3 rounded-full', color)} />
        {icon}
        <h3 className="text-sm font-bold text-gray-700">{title}</h3>
        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          {isLoading ? '…' : ocs.length}
        </span>
        {!isLoading && ocs.length > 0 && (
          <span className="text-xs text-gray-400 ml-auto tabular-nums">
            {fmt(ocs.reduce((s, o) => s + Number(o.total), 0))}
          </span>
        )}
      </div>
      <div className="space-y-2.5">
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-3 animate-pulse space-y-2">
            <div className="h-3 bg-gray-100 rounded w-24" />
            <div className="h-3 bg-gray-100 rounded w-40" />
          </div>
        ))}
        {!isLoading && ocs.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 py-10 text-center">
            <Clock size={22} className="mx-auto text-gray-200 mb-2" />
            <p className="text-xs text-gray-300">Sin OCs en esta columna</p>
          </div>
        )}
        {!isLoading && ocs.map((oc) => (
          <OcCard key={oc.id} oc={oc} selected={selectedOc?.id === oc.id} onClick={() => onSelect(oc)} />
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Recepciones() {
  const [search, setSearch]             = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [fechaDesde, setFechaDesde]     = useState('')
  const [fechaHasta, setFechaHasta]     = useState('')
  const [selectedOc, setSelectedOc]     = useState<OrdenCompra | undefined>()
  const [reporteOpen, setReporteOpen]   = useState(false)

  const { data: kpisData } = useQuery({
    queryKey: ['oc-kpis-recepciones'],
    queryFn: () => ordenesCompraService.getKpis(),
    staleTime: 15_000,
  })
  const kpis = kpisData?.data

  const { data: ordenadosData, isLoading: loadingOrdenados } = useQuery({
    queryKey: ['recepciones-ocs', search, vendorFilter],
    queryFn: () => ordenesCompraService.getAll({ limit: 300, search: search || undefined, vendor: vendorFilter || undefined, estado_display: 'ORDENADO' }),
    staleTime: 15_000,
  })

  const { data: transitoData, isLoading: loadingTransito } = useQuery({
    queryKey: ['recepciones-ocs-transito', search, vendorFilter],
    queryFn: () => ordenesCompraService.getAll({ limit: 300, search: search || undefined, vendor: vendorFilter || undefined, estado_display: 'EN_TRANSITO' }),
    staleTime: 15_000,
  })

  const { data: tallerData, isLoading: loadingTaller } = useQuery({
    queryKey: ['recepciones-ocs-taller', search, vendorFilter],
    queryFn: () => ordenesCompraService.getAll({ limit: 100, search: search || undefined, vendor: vendorFilter || undefined, estado_display: 'EN_EL_TALLER' }),
    staleTime: 15_000,
  })

  const allOrdenados = ordenadosData?.data ?? []
  const allTransito  = transitoData?.data  ?? []
  const allTaller    = tallerData?.data    ?? []

  const vendors = useMemo(() => {
    const all = [...allOrdenados, ...allTransito, ...allTaller]
    return [...new Set(all.map((o) => o.proveedor?.nombre).filter(Boolean) as string[])].sort()
  }, [allOrdenados, allTransito, allTaller])

  const applyDateFilter = (list: OrdenCompra[]) => {
    let l = list
    if (fechaDesde) l = l.filter((o) => (o.fecha_emision ?? '') >= fechaDesde)
    if (fechaHasta) l = l.filter((o) => (o.fecha_emision ?? '') <= fechaHasta)
    return l
  }

  // Sort de prioridad para Recepciones:
  // 1) Las URGENTE siempre arriba (origen='URGENTE') — visibilidad crítica
  //    sin importar la fecha, decisión del usuario
  // 2) Después, por fecha_entrega_estimada ASC con NULLs al final:
  //    - Vencidas (fechas pasadas) → arriba dentro de su grupo
  //    - Próximas: de más cerca a más lejos
  //    - Sin ETA: al final (no estorban)
  // Aplica a las columnas ORDENADO y EN TRÁNSITO. EN_EL_TALLER no se sortea
  // por ETA porque ya está recibida — se mantiene el orden default (fecha_emision desc).
  const sortByEta = (list: OrdenCompra[]) =>
    [...list].sort((a, b) => {
      // URGENTE arriba siempre
      const aUrg = a.origen === 'URGENTE'
      const bUrg = b.origen === 'URGENTE'
      if (aUrg && !bUrg) return -1
      if (!aUrg && bUrg) return 1

      // Dentro de su grupo, sort por ETA ASC con NULLs al final
      const aEta = a.fecha_entrega_estimada
      const bEta = b.fecha_entrega_estimada
      if (!aEta && !bEta) return 0
      if (!aEta) return 1
      if (!bEta) return -1
      return aEta.localeCompare(bEta)
    })

  const ordenados  = useMemo(() => sortByEta(applyDateFilter(allOrdenados)), [allOrdenados, fechaDesde, fechaHasta])
  const enTransito = useMemo(() => sortByEta(applyDateFilter(allTransito)),  [allTransito,  fechaDesde, fechaHasta])
  const enTaller   = useMemo(() => applyDateFilter(allTaller),               [allTaller,    fechaDesde, fechaHasta])

  const clearFilters = () => { setSearch(''); setVendorFilter(''); setFechaDesde(''); setFechaHasta(''); setSelectedOc(undefined) }
  const hasFilters   = !!(search || vendorFilter || fechaDesde || fechaHasta)
  const montoOrdenado = kpis ? parseFloat(kpis.monto_ordenado) : 0

  const handleSelect = (oc: OrdenCompra) =>
    setSelectedOc((prev) => prev?.id === oc.id ? undefined : oc)

  return (
    <div className="space-y-4">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card">
          <div className="p-2.5 bg-amber-50 rounded-lg shrink-0"><ShoppingCart size={20} className="text-amber-600" /></div>
          <div><p className="kpi-label">Por Recibir</p><p className="kpi-value text-amber-700">{kpis ? parseInt(kpis.pendientes_recepcion) : '—'}</p></div>
        </div>
        <div className="kpi-card">
          <div className="p-2.5 bg-gold-50 rounded-lg shrink-0"><DollarSign size={20} className="text-gold-600" /></div>
          <div className="min-w-0"><p className="kpi-label">Monto Ordenado</p><p className="kpi-value text-gold-700 text-[22px]">{kpis ? fmt(montoOrdenado) : '—'}</p></div>
        </div>
        <div className="kpi-card">
          <div className="p-2.5 bg-forest-50 rounded-lg shrink-0"><Package size={20} className="text-forest-600" /></div>
          <div><p className="kpi-label">OCs en pantalla</p><p className="kpi-value text-gray-900">{loadingOrdenados ? '…' : ordenados.length + enTransito.length + enTaller.length}</p></div>
        </div>
        <div className={clsx('kpi-card', kpis && parseInt(kpis.con_retraso) > 0 ? 'border-red-200' : '')}>
          <div className={clsx('p-2.5 rounded-lg shrink-0', kpis && parseInt(kpis.con_retraso) > 0 ? 'bg-red-50' : 'bg-gray-50')}>
            <AlertTriangle size={20} className={kpis && parseInt(kpis.con_retraso) > 0 ? 'text-red-500' : 'text-gray-400'} />
          </div>
          <div>
            <p className="kpi-label">Retrasadas</p>
            <p className={clsx('kpi-value', kpis && parseInt(kpis.con_retraso) > 0 ? 'text-red-600' : 'text-gray-800')}>
              {kpis ? parseInt(kpis.con_retraso) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="search" placeholder="Buscar OC, proyecto…" value={search}
                onChange={(e) => setSearch(e.target.value)} className="input pl-9 w-48 text-sm" />
            </div>
            <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}
              className={clsx('input text-sm w-40', vendorFilter && 'border-forest-400 text-forest-700 bg-forest-50')}>
              <option value="">Todos vendors</option>
              {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <div className="flex items-center gap-1.5">
              <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)}
                className={clsx('input text-xs w-32', fechaDesde && 'border-gold-400')} title="Fecha OC desde" />
              <span className="text-gray-300 text-xs">—</span>
              <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)}
                className={clsx('input text-xs w-32', fechaHasta && 'border-gold-400')} title="Fecha OC hasta" />
            </div>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-red-500 underline transition-colors">
                Limpiar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setReporteOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              <FileText size={15} /> Generar Reporte
            </button>
          </div>
        </div>
      </div>

      {/* ── Kanban columns ── */}
      <div className="flex gap-4 items-start">
        <KanbanColumn title="ORDENADO" color="bg-amber-400"
          icon={<ShoppingCart size={14} className="text-amber-600" />}
          ocs={ordenados} selectedOc={selectedOc} isLoading={loadingOrdenados} onSelect={handleSelect} />
        <KanbanColumn title="EN TRÁNSITO" color="bg-blue-400"
          icon={<Truck size={14} className="text-blue-600" />}
          ocs={enTransito} selectedOc={selectedOc} isLoading={loadingTransito} onSelect={handleSelect} />
        <KanbanColumn title="EN EL TALLER" color="bg-green-500"
          icon={<Warehouse size={14} className="text-green-600" />}
          ocs={enTaller} selectedOc={selectedOc} isLoading={loadingTaller} onSelect={handleSelect} />
      </div>

      <ReporteModal open={reporteOpen} onClose={() => setReporteOpen(false)} />

      {/* ── Fixed right drawer + overlay ── */}
      {selectedOc && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[1px]"
            onClick={() => setSelectedOc(undefined)}
          />
          {/* Drawer — desktop: right side 460px; mobile: bottom full width */}
          <div className={clsx(
            'fixed z-50 bg-white shadow-2xl flex flex-col',
            'sm:right-0 sm:top-0 sm:h-screen sm:w-[460px]',
            'max-sm:left-0 max-sm:right-0 max-sm:bottom-0 max-sm:h-[92vh] max-sm:rounded-t-2xl',
          )}>
            {selectedOc.estado_display === 'EN_EL_TALLER' ? (
              <HistorialPanel
                key={selectedOc.id}
                oc={selectedOc}
                onClose={() => setSelectedOc(undefined)}
              />
            ) : (
              <RecepcionPanel
                key={selectedOc.id}
                oc={selectedOc}
                onClose={() => setSelectedOc(undefined)}
                onSuccess={() => setSelectedOc(undefined)}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
