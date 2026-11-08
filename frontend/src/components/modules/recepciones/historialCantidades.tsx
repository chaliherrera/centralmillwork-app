// Vista compartida de "recepción por CANTIDADES" para el historial de una OC.
// La usan tanto la pantalla de Recepciones como el panel de Órdenes de Compra, para que
// las dos muestren EXACTAMENTE la misma información (saldo corriente por entrega + avance).
import { useMemo } from 'react'
import clsx from 'clsx'
import type { RecepcionConMateriales } from '@/services/recepciones'

// Feature flag F2. Apagado => se muestra el conteo de materiales de siempre.
export const RECEPCION_CANTIDADES = import.meta.env.VITE_RECEPCION_CANTIDADES === 'true'

// Cantidad sin decimales inútiles (3 vs 3.000).
export const fmtQty = (n: number) => String(Math.round(n * 1000) / 1000)

// Contexto de cada entrega: cuánto faltaba ANTES de esa entrega (saldo corriente), para
// mostrar "+10 de 15" (llegaron 10 de los 15 que faltaban) y marcar cuándo se completó.
export type EntregaCtx = { llegaron: number; pendienteAntes: number; ordenado: number; completo: boolean }
export function computeEntregasContexto(historial: RecepcionConMateriales[]): Map<string, EntregaCtx> {
  // El historial viene nuevo→viejo; procesamos viejo→nuevo para acumular.
  const asc = [...historial].reverse()
  const acum = new Map<number, number>()  // material -> acumulado ANTES de la entrega en curso
  const out = new Map<string, EntregaCtx>()
  for (const rec of asc) {
    for (const m of rec.materiales) {
      if (m.id_material == null || m.cantidad_recibida == null) continue
      const ordenado = m.cantidad_ordenada != null ? Number(m.cantidad_ordenada) : NaN
      const antes = acum.get(m.id_material) ?? 0
      const llegaron = Number(m.cantidad_recibida)
      const despues = antes + llegaron
      acum.set(m.id_material, despues)
      out.set(`${rec.id}:${m.id}`, {
        llegaron,
        pendienteAntes: Number.isFinite(ordenado) ? Math.max(0, ordenado - antes) : NaN,
        ordenado,
        completo: Number.isFinite(ordenado) && despues >= ordenado,
      })
    }
  }
  return out
}

// Resumen total por material a lo largo de TODAS las entregas (ordenado vs recibido).
export type ResumenMat = { id: number; etiqueta: string; ordenado: number; recibido: number }
export function computeResumenPorMaterial(historial: RecepcionConMateriales[]): ResumenMat[] {
  const map = new Map<number, ResumenMat>()
  for (const rec of historial) {
    for (const m of rec.materiales) {
      if (m.id_material == null || m.cantidad_recibida == null) continue
      const cur = map.get(m.id_material) ?? {
        id: m.id_material,
        etiqueta: m.cm_code || m.descripcion || `#${m.id_material}`,
        ordenado: m.cantidad_ordenada != null ? Number(m.cantidad_ordenada) : NaN,
        recibido: 0,
      }
      cur.recibido += Number(m.cantidad_recibida)
      if (m.cm_code) cur.etiqueta = m.cm_code
      if (m.cantidad_ordenada != null) cur.ordenado = Number(m.cantidad_ordenada)
      map.set(m.id_material, cur)
    }
  }
  return [...map.values()]
}

// Resumen de lo recibido en UNA recepción. En modo cantidades muestra cuánto llegó de
// cada material contra lo que faltaba ("+N de M u."); si no, el conteo de siempre.
export function RecepcionMaterialesResumen({ rec, ctx }: { rec: RecepcionConMateriales; ctx: Map<string, EntregaCtx> }) {
  const materiales = rec.materiales
  if (materiales.length === 0) return null
  const conCant = RECEPCION_CANTIDADES && materiales.some((m) => m.cantidad_recibida != null)
  if (!conCant) {
    return (
      <p className="text-xs text-gray-400 mt-1">
        {materiales.filter((m) => m.recibido).length}/{materiales.length} materiales recibidos
      </p>
    )
  }
  return (
    <div className="mt-1.5 space-y-0.5">
      {materiales.filter((m) => m.cantidad_recibida != null).map((m) => {
        const c = ctx.get(`${rec.id}:${m.id}`)
        return (
          <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-gray-600 truncate">{m.cm_code || m.descripcion}</span>
            <span className="font-medium text-gray-700 tabular-nums flex-shrink-0">
              +{fmtQty(Number(m.cantidad_recibida))}
              {c && Number.isFinite(c.pendienteAntes) && <span className="text-gray-400"> de {fmtQty(c.pendienteAntes)} u.</span>}
              {c?.completo && <span className="text-green-600 font-semibold"> ✓ completo</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Bloque "Avance del pedido" (ordenado vs recibido total) con barrita de progreso.
export function ResumenRecepcionOC({ historial }: { historial: RecepcionConMateriales[] }) {
  const resumen = useMemo(() => computeResumenPorMaterial(historial), [historial])
  if (!RECEPCION_CANTIDADES || resumen.length === 0) return null
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5 mb-3 space-y-2">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Avance del pedido</p>
      {resumen.map((r) => {
        const ordenadoOk = Number.isFinite(r.ordenado) && r.ordenado > 0
        const pct = ordenadoOk ? Math.min(100, Math.round((r.recibido / r.ordenado) * 100)) : 0
        const completo = ordenadoOk && r.recibido >= r.ordenado
        const faltan = ordenadoOk ? Math.max(0, r.ordenado - r.recibido) : 0
        return (
          <div key={r.id}>
            <div className="flex items-center justify-between gap-2 text-xs mb-0.5">
              <span className="text-gray-700 truncate">{r.etiqueta}</span>
              <span className="tabular-nums flex-shrink-0">
                <span className={clsx('font-semibold', completo ? 'text-green-700' : 'text-gray-700')}>
                  {fmtQty(r.recibido)}
                </span>
                {ordenadoOk && <span className="text-gray-400"> de {fmtQty(r.ordenado)} u.</span>}
                {completo
                  ? <span className="text-green-600 font-semibold"> · completo ✓</span>
                  : ordenadoOk && <span className="text-amber-600"> · faltan {fmtQty(faltan)}</span>}
              </span>
            </div>
            {ordenadoOk && (
              <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                <div className={clsx('h-full rounded-full', completo ? 'bg-green-500' : 'bg-blue-400')} style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
