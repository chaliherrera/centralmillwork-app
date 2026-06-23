import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { X, ExternalLink, Ban, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { materialesService } from '@/services/materiales'
import type { DailyBriefingBucket, DailyBriefingItem } from '@/services/dashboard'

/**
 * BriefingDrawer — slide-in lateral derecho que despliega la lista completa
 * de un bucket del Daily Briefing y permite tomar acción inline.
 *
 * Walking skeleton (Fase 1): solo soporta el bucket 'rezagados' con acción
 * "Marcar como NO cotizar" (que setea cotizar='NO' en el material) +
 * "Abrir en MTO" (link al material en la página /materiales).
 *
 * Cuando este patrón valide, se extiende a los otros 4 buckets en Fase 2:
 *   - vencidas       → "Pedir tracking" + "Cancelar OC"
 *   - estancadas     → "Completar recepción rápido"
 *   - vencePronto    → "Marcar preparado"
 *   - importadosAyer → "Cotizar ahora"
 */

export type BucketKey = 'rezagados' | 'vencidas' | 'estancadas' | 'vencePronto' | 'importadosAyer' | 'cotizadosSinOC'

const BUCKET_META: Record<BucketKey, { title: string; emoji: string; subtitle: string }> = {
  rezagados:      { title: 'Materiales rezagados', emoji: '🟡', subtitle: '>14 días en PENDIENTE — verificá si todavía aplican antes de cotizar' },
  vencidas:       { title: 'OCs vencidas',         emoji: '🔴', subtitle: 'ETA pasada y no recibidas — pedir tracking al proveedor' },
  estancadas:     { title: 'Recepciones estancadas', emoji: '🟠', subtitle: 'Pendientes >5 días sin cerrar — ¿llegó el material?' },
  vencePronto:    { title: 'OCs que vencen pronto', emoji: '📅', subtitle: 'Llegan hoy o mañana — preparar espacio en taller' },
  importadosAyer: { title: 'Materiales importados ayer', emoji: '🆕', subtitle: 'Nuevos en MTO — cotizá con sus vendors' },
  cotizadosSinOC: { title: 'Cotizados sin OC',     emoji: '💰', subtitle: 'Tienen precio cargado pero falta emitir la OC — no perder el hilo' },
}

interface Props {
  open: boolean
  onClose: () => void
  bucketKey: BucketKey
  bucket: DailyBriefingBucket | null
}

export default function BriefingDrawer({ open, onClose, bucketKey, bucket }: Props) {
  const meta = BUCKET_META[bucketKey]
  const items = bucket?.items ?? []

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 bg-black/40 z-40 transition-opacity',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={clsx(
          'fixed top-0 right-0 h-full w-full max-w-3xl bg-white shadow-2xl z-50 flex flex-col transition-transform',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-forest-700">
              <span className="text-lg leading-none">{meta.emoji}</span>
              {meta.title}
              <span className="text-sm font-normal text-gray-400">({items.length})</span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{meta.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">
              No hay items en este bucket.
            </div>
          ) : bucketKey === 'rezagados' ? (
            <RezagadosTable items={items} onClose={onClose} />
          ) : (
            <ComingSoonPlaceholder bucketKey={bucketKey} items={items} />
          )}
        </div>
      </div>
    </>
  )
}

// ─── Rezagados — Fase 1, único bucket con acción inline ─────────────────────

function RezagadosTable({ items, onClose }: { items: DailyBriefingItem[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [pendingId, setPendingId] = useState<number | null>(null)

  const marcarNoCotizar = useMutation({
    mutationFn: (id: number) => materialesService.update(id, { cotizar: 'NO' }),
    onMutate: (id) => setPendingId(id),
    onSuccess: () => {
      toast.success('Material marcado como NO cotizar')
      // Refrescamos briefing y vistas dependientes
      qc.invalidateQueries({ queryKey: ['dashboard-daily-briefing'] })
      qc.invalidateQueries({ queryKey: ['materiales'] })
      qc.invalidateQueries({ queryKey: ['materiales-kpis'] })
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'No se pudo actualizar'),
    onSettled: () => setPendingId(null),
  })

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
        <tr className="text-[10px] uppercase tracking-wider text-gray-500">
          <th className="px-4 py-2 text-left font-semibold">Material</th>
          <th className="px-3 py-2 text-left font-semibold">Proyecto · Vendor</th>
          <th className="px-3 py-2 text-right font-semibold w-16">Días</th>
          <th className="px-3 py-2 text-right font-semibold w-32">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {items.map((m) => {
          const isPending = pendingId === m.id
          return (
            <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50/60">
              <td className="px-4 py-2.5">
                <div className="flex items-start gap-1.5">
                  {m.codigo && (
                    <span className="font-mono text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded shrink-0">
                      {m.codigo}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{m.descripcion ?? '—'}</p>
                    {m.qty != null && (
                      <p className="text-[10px] text-gray-400">qty {m.qty}</p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5 text-xs text-gray-600">
                <p className="truncate"><span className="font-mono text-gray-500">{m.proyecto_codigo}</span> {m.proyecto_nombre}</p>
                <p className="text-[10px] text-gray-400 truncate">{m.vendor}</p>
              </td>
              <td className="px-3 py-2.5 text-right">
                <span className={clsx(
                  'inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded',
                  (m.dias_pendiente ?? 0) >= 30 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                )}>
                  {m.dias_pendiente}d
                </span>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => marcarNoCotizar.mutate(m.id)}
                    disabled={isPending}
                    title="Setea cotizar='NO'. Desaparece del briefing y del panel Capturar Precios."
                    className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    {isPending
                      ? <Loader2 size={10} className="animate-spin" />
                      : <Ban size={10} />}
                    NO cotizar
                  </button>
                  <Link
                    to={`/materiales?material_id=${m.id}`}
                    onClick={onClose}
                    title="Abrir en /materiales para más contexto"
                    className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <ExternalLink size={10} />
                    MTO
                  </Link>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── Placeholder para los 4 buckets que aún no tienen acciones inline ───────

function ComingSoonPlaceholder({ bucketKey, items }: { bucketKey: BucketKey; items: DailyBriefingItem[] }) {
  const fallbackLink: Record<BucketKey, string> = {
    rezagados:      '/materiales?estado_cotiz=PENDIENTE',
    vencidas:       '/ordenes-compra?flag=vencidas',
    estancadas:     '/recepciones?estado=pendiente',
    vencePronto:    '/ordenes-compra?flag=2dias',
    importadosAyer: '/materiales?estado_cotiz=PENDIENTE',
    cotizadosSinOC: '/materiales?estado_cotiz=COTIZADO',
  }
  return (
    <div className="px-6 py-6 space-y-3">
      <ul className="space-y-1.5 text-xs">
        {items.slice(0, 20).map((it) => (
          <li key={it.id} className="flex items-center justify-between border-b border-gray-50 pb-1.5">
            <span className="truncate text-gray-700">
              {it.numero || it.folio || it.codigo} · {it.proyecto_codigo} · {it.proveedor_nombre || it.vendor}
            </span>
            <span className="text-gray-400 whitespace-nowrap">
              {it.dias_vencida != null && `${it.dias_vencida}d vencida`}
              {it.dias_estancada != null && `${it.dias_estancada}d estancada`}
              {it.fecha_entrega_estimada && !it.dias_vencida && `→ ${it.fecha_entrega_estimada}`}
            </span>
          </li>
        ))}
        {items.length > 20 && (
          <li className="text-[10px] text-gray-400 italic">y {items.length - 20} más…</li>
        )}
      </ul>
      <Link
        to={fallbackLink[bucketKey]}
        className="block text-center text-xs font-medium text-blue-700 hover:underline pt-2"
      >
        Abrir vista completa →
      </Link>
      <p className="text-[10px] text-gray-400 italic text-center">
        Acciones inline en este bucket — próximamente (Fase 2)
      </p>
    </div>
  )
}
