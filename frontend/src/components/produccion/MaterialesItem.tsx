import { useQuery } from '@tanstack/react-query'
import { Loader2, Package, CheckCircle2, Clock, ShoppingCart, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { proyectosService } from '@/services/proyectos'
import type { EstadoItemReadiness, ItemReadinessMaterial } from '@/services/proyectos'
import { useAuth } from '@/context/AuthContext'

// Panel "Materiales de este item" — consume items-readiness y muestra, para el
// número de item de esta orden, si sus materiales están listos para fabricar.
// Solo visible para SHOP_MANAGER / ADMIN (es quien decide si arrancar la orden).

const ESTADO_ITEM: Record<EstadoItemReadiness, { label: string; cls: string; icon: typeof Package; desc: string }> = {
  LISTO:     { label: 'LISTO para fabricar', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: CheckCircle2, desc: 'Todos los materiales están en el taller' },
  PARCIAL:   { label: 'PARCIAL',             cls: 'bg-amber-100 text-amber-800 border-amber-300',       icon: AlertTriangle, desc: 'Algunos materiales llegaron, faltan otros' },
  ORDENADO:  { label: 'ORDENADO',            cls: 'bg-blue-100 text-blue-800 border-blue-300',          icon: ShoppingCart, desc: 'Todo comprado, esperando recepción' },
  PENDIENTE: { label: 'PENDIENTE de compra', cls: 'bg-red-100 text-red-700 border-red-300',             icon: Clock, desc: 'Hay materiales sin ordenar' },
}

// Estado individual de cada material (estado_cotiz del MTO)
function materialBadge(estado: ItemReadinessMaterial['estado_cotiz']) {
  switch (estado) {
    case 'RECIBIDO':  return { label: 'En taller', cls: 'bg-emerald-100 text-emerald-700' }
    case 'EN_STOCK':  return { label: 'En stock',  cls: 'bg-emerald-100 text-emerald-700' }
    case 'ORDENADO':  return { label: 'Ordenado',  cls: 'bg-blue-100 text-blue-700' }
    case 'COTIZADO':  return { label: 'Cotizado',  cls: 'bg-amber-100 text-amber-700' }
    default:          return { label: 'Pendiente', cls: 'bg-red-100 text-red-700' }
  }
}

export default function MaterialesItem({
  proyectoId, numeroItem,
}: { proyectoId: number | null; numeroItem: string }) {
  const { user } = useAuth()
  const puedeVer = !!user && (user.rol === 'SHOP_MANAGER' || user.rol === 'ADMIN')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['items-readiness', proyectoId],
    queryFn:  () => proyectosService.getItemsReadiness(proyectoId!),
    enabled:  !!proyectoId && puedeVer,
    staleTime: 30_000,
  })

  // Gating: solo SHOP_MANAGER/ADMIN, y solo si la orden tiene proyecto
  if (!puedeVer) return null
  if (!proyectoId) {
    return (
      <div className="card">
        <h3 className="flex items-center gap-2"><Package size={16} /> Materiales del item</h3>
        <p className="text-sm text-gray-400 italic mt-2">
          Esta orden no está vinculada a un proyecto, no hay materiales del MTO para mostrar.
        </p>
      </div>
    )
  }

  const itemKey = numeroItem.trim()
  const item = data?.data.items.find((i) => i.item === itemKey)

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2"><Package size={16} /> Materiales del item {itemKey}</h3>
        {item && (() => {
          const meta = ESTADO_ITEM[item.estado]
          const Icon = meta.icon
          return (
            <span className={clsx('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border', meta.cls)}>
              <Icon size={13} /> {meta.label}
            </span>
          )
        })()}
      </div>

      {isLoading ? (
        <div className="py-6 flex justify-center"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
      ) : isError ? (
        <p className="text-sm text-red-600">Error al cargar el estado de materiales.</p>
      ) : !item ? (
        <p className="text-sm text-gray-400 italic">
          El item "{itemKey}" no tiene materiales registrados en el MTO de este proyecto.
          Verificá que el número de item coincida con el del MTO importado.
        </p>
      ) : (
        <>
          {/* Resumen */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">{ESTADO_ITEM[item.estado].desc}.</span>
            <span className="font-semibold text-gray-800">
              {item.disponibles}/{item.total} en taller
            </span>
          </div>

          {/* Barra de progreso de disponibilidad */}
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={clsx('h-full transition-all',
                item.estado === 'LISTO' ? 'bg-emerald-500'
                : item.estado === 'PARCIAL' ? 'bg-amber-500'
                : item.estado === 'ORDENADO' ? 'bg-blue-500' : 'bg-red-400')}
              style={{ width: `${item.total ? (item.disponibles / item.total) * 100 : 0}%` }}
            />
          </div>

          {/* Contadores */}
          <div className="flex flex-wrap gap-2 text-xs">
            {item.recibidos  > 0 && <Contador label="recibidos"  n={item.recibidos}  cls="text-emerald-700" />}
            {item.en_stock   > 0 && <Contador label="en stock"   n={item.en_stock}   cls="text-emerald-700" />}
            {item.ordenados  > 0 && <Contador label="ordenados"  n={item.ordenados}  cls="text-blue-700" />}
            {item.pendientes > 0 && <Contador label="pendientes" n={item.pendientes} cls="text-red-700" />}
          </div>

          {/* Lista de materiales */}
          <div className="border-t border-gray-100 pt-2">
            <table className="w-full text-sm">
              <tbody>
                {item.materiales.map((m) => {
                  const badge = materialBadge(m.estado_cotiz)
                  return (
                    <tr key={m.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 pr-2">
                        <div className="font-medium text-gray-800">{m.descripcion}</div>
                        <div className="text-xs text-gray-500">{m.codigo}{m.vendor && <> · {m.vendor}</>}</div>
                      </td>
                      <td className="py-1.5 px-2 text-xs text-gray-500 whitespace-nowrap">
                        {m.oc_numero ?? '—'}
                      </td>
                      <td className="py-1.5 pl-2 text-right">
                        <span className={clsx('inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold', badge.cls)}>
                          {badge.label}
                        </span>
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

function Contador({ label, n, cls }: { label: string; n: number; cls: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-50', cls)}>
      <span className="font-bold tabular-nums">{n}</span> {label}
    </span>
  )
}
