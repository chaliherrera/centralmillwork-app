import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Package, CheckCircle2, Clock, ShoppingCart, AlertTriangle, X, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { proyectosService } from '@/services/proyectos'
import type { EstadoItemReadiness, ItemReadinessMaterial } from '@/services/proyectos'
import { useAuth } from '@/context/AuthContext'

// Panel "Materiales de este item" — chip compacto + drawer lateral.
// Consume items-readiness y muestra, para el número de item, si sus materiales
// están listos para fabricar, con ETA de los que faltan.
// Solo visible para SHOP_MANAGER / ADMIN.

const ESTADO_ITEM: Record<EstadoItemReadiness, { label: string; chip: string; badge: string; bar: string; icon: typeof Package; desc: string }> = {
  LISTO:     { label: 'LISTO',     chip: 'bg-emerald-100 text-emerald-800 border-emerald-300', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300', bar: 'bg-emerald-500', icon: CheckCircle2,  desc: 'Todos los materiales están en el taller' },
  PARCIAL:   { label: 'PARCIAL',   chip: 'bg-amber-100 text-amber-800 border-amber-300',       badge: 'bg-amber-100 text-amber-800 border-amber-300',       bar: 'bg-amber-500',   icon: AlertTriangle, desc: 'Algunos materiales llegaron, faltan otros' },
  ORDENADO:  { label: 'ORDENADO',  chip: 'bg-blue-100 text-blue-800 border-blue-300',          badge: 'bg-blue-100 text-blue-800 border-blue-300',          bar: 'bg-blue-500',    icon: ShoppingCart,  desc: 'Todo comprado, esperando recepción' },
  PENDIENTE: { label: 'PENDIENTE', chip: 'bg-red-100 text-red-700 border-red-300',             badge: 'bg-red-100 text-red-700 border-red-300',             bar: 'bg-red-400',     icon: Clock,         desc: 'Hay materiales sin ordenar' },
}

export default function MaterialesItem({
  proyectoId, numeroItem,
}: { proyectoId: number | null; numeroItem: string }) {
  const { user } = useAuth()
  const puedeVer = !!user && (user.rol === 'SHOP_MANAGER' || user.rol === 'ADMIN')
  const [open, setOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['items-readiness', proyectoId],
    queryFn:  () => proyectosService.getItemsReadiness(proyectoId!),
    enabled:  !!proyectoId && puedeVer,
    staleTime: 30_000,
  })

  // Cerrar el drawer con Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!puedeVer) return null

  const itemKey = numeroItem.trim()
  const item = data?.data.items.find((i) => i.item === itemKey)
  const meta = item ? ESTADO_ITEM[item.estado] : null

  return (
    <>
      {/* ── Chip compacto (siempre visible) ── */}
      <button
        type="button"
        onClick={() => item && setOpen(true)}
        disabled={!item}
        className={clsx(
          'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all',
          item ? 'hover:shadow-sm cursor-pointer' : 'cursor-default',
          meta ? meta.chip : 'bg-gray-50 text-gray-500 border-gray-200'
        )}
      >
        <Package size={15} className="shrink-0" />
        {isLoading ? (
          <span className="text-sm flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Cargando materiales…</span>
        ) : isError ? (
          <span className="text-sm">Error al cargar materiales</span>
        ) : !item ? (
          <span className="text-sm italic">Item {itemKey || '—'}: sin materiales en el MTO</span>
        ) : (
          <>
            {meta && <meta.icon size={14} className="shrink-0" />}
            <span className="text-sm font-semibold">Item {itemKey}: {meta?.label}</span>
            <span className="text-xs opacity-80">· {item.disponibles}/{item.total} en taller</span>
            <span className="ml-auto flex items-center gap-0.5 text-xs font-medium">Ver materiales <ChevronRight size={13} /></span>
          </>
        )}
      </button>

      {/* ── Drawer lateral (detalle) ── */}
      {open && item && meta && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40 transition-opacity"
            onClick={() => setOpen(false)}
          />
          {/* Panel */}
          <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white z-50 shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]">
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-gray-100">
              <div>
                <div className="flex items-center gap-2">
                  <Package size={18} className="text-forest-700" />
                  <h3 className="!text-lg">Materiales del item {itemKey}</h3>
                </div>
                <span className={clsx('inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-bold border', meta.badge)}>
                  <meta.icon size={13} /> {meta.label}
                </span>
                <p className="text-sm text-gray-500 mt-1.5">{meta.desc}</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>

            {/* Cuerpo scrolleable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Resumen + barra */}
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-600">Disponibles en taller</span>
                  <span className="font-bold text-gray-800">{item.disponibles}/{item.total}</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={clsx('h-full transition-all', meta.bar)}
                       style={{ width: `${item.total ? (item.disponibles / item.total) * 100 : 0}%` }} />
                </div>
                <div className="flex flex-wrap gap-2 text-xs mt-2">
                  {item.recibidos  > 0 && <Contador label="recibidos"  n={item.recibidos}  cls="text-emerald-700" />}
                  {item.en_stock   > 0 && <Contador label="en stock"   n={item.en_stock}   cls="text-emerald-700" />}
                  {item.ordenados  > 0 && <Contador label="ordenados"  n={item.ordenados}  cls="text-blue-700" />}
                  {item.pendientes > 0 && <Contador label="pendientes" n={item.pendientes} cls="text-red-700" />}
                </div>
              </div>

              {/* Lista de materiales */}
              <div className="space-y-1.5">
                {item.materiales.map((m) => (
                  <MaterialRow key={m.id} m={m} />
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100">
              <button onClick={() => setOpen(false)} className="btn-ghost w-full justify-center">Cerrar</button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── Fila de material con estado + ETA ──
function MaterialRow({ m }: { m: ItemReadinessMaterial }) {
  const eta = etaInfo(m)
  return (
    <div className="flex items-start gap-3 p-2.5 rounded-lg border border-gray-100">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-gray-800">{m.descripcion}</div>
        <div className="text-xs text-gray-500">{m.codigo}{m.vendor && <> · {m.vendor}</>}</div>
        {m.oc_numero && <div className="text-xs text-gray-400 mt-0.5">{m.oc_numero}</div>}
      </div>
      <div className="text-right shrink-0">
        <span className={clsx('inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold', eta.badgeCls)}>
          {eta.estadoLabel}
        </span>
        {eta.etaLabel && (
          <div className={clsx('text-[11px] mt-0.5 font-medium', eta.etaCls)}>{eta.etaLabel}</div>
        )}
      </div>
    </div>
  )
}

// Calcula la info de estado + ETA de un material
function etaInfo(m: ItemReadinessMaterial): { estadoLabel: string; badgeCls: string; etaLabel: string | null; etaCls: string } {
  if (m.estado_cotiz === 'RECIBIDO')  return { estadoLabel: 'En taller', badgeCls: 'bg-emerald-100 text-emerald-700', etaLabel: null, etaCls: '' }
  if (m.estado_cotiz === 'EN_STOCK')  return { estadoLabel: 'En stock',  badgeCls: 'bg-emerald-100 text-emerald-700', etaLabel: null, etaCls: '' }

  if (m.estado_cotiz === 'ORDENADO') {
    if (!m.oc_fecha_entrega) return { estadoLabel: 'Ordenado', badgeCls: 'bg-blue-100 text-blue-700', etaLabel: 'sin ETA', etaCls: 'text-gray-400' }
    const eta = new Date(m.oc_fecha_entrega + 'T00:00:00')
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const venc = eta.getTime() < hoy.getTime()
    const fecha = eta.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
    return venc
      ? { estadoLabel: 'Ordenado', badgeCls: 'bg-blue-100 text-blue-700', etaLabel: `⚠ ETA vencida (${fecha})`, etaCls: 'text-red-600' }
      : { estadoLabel: 'Ordenado', badgeCls: 'bg-blue-100 text-blue-700', etaLabel: `ETA: ${fecha}`, etaCls: 'text-blue-600' }
  }

  // PENDIENTE / COTIZADO
  return { estadoLabel: 'Sin orden', badgeCls: 'bg-red-100 text-red-700', etaLabel: 'sin comprar', etaCls: 'text-gray-400' }
}

function Contador({ label, n, cls }: { label: string; n: number; cls: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-50', cls)}>
      <span className="font-bold tabular-nums">{n}</span> {label}
    </span>
  )
}
