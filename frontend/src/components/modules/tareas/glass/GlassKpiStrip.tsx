import type { TareasStats } from '@/types'
import { AREA_META } from '../constants'

interface Props {
  stats?: TareasStats
}

interface CellProps {
  label: string
  value: number
  accent?: string
}

function GlassCell({ label, value, accent }: CellProps) {
  return (
    <div
      className="relative flex-1 min-w-[120px] px-4 py-3 rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(255,255,250,0.06)',
        backdropFilter: 'blur(22px) saturate(180%)',
        WebkitBackdropFilter: 'blur(22px) saturate(180%)',
        border: '0.5px solid rgba(255,255,250,0.12)',
        boxShadow: 'inset 1px 1.5px 1px rgba(255,255,255,0.18), 0 8px 22px -8px rgba(0,0,0,0.35)',
      }}
    >
      {/* Under-glow orb */}
      {accent && (
        <span
          aria-hidden
          className="absolute pointer-events-none rounded-full"
          style={{
            left: -30,
            top: -30,
            width: 120,
            height: 120,
            background: accent,
            opacity: 0.18,
            filter: 'blur(28px)',
          }}
        />
      )}
      {/* Vertical accent line */}
      {accent && (
        <span
          aria-hidden
          className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full"
          style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
        />
      )}

      <p
        className="text-2xl font-semibold tabular-nums leading-none relative"
        style={{ color: '#FFFFFA' }}
      >
        {value}
      </p>
      <p
        className="text-[11px] uppercase tracking-wider mt-1.5 relative"
        style={{ color: 'rgba(255,255,250,0.55)' }}
      >
        {label}
      </p>
    </div>
  )
}

export default function GlassKpiStrip({ stats }: Props) {
  const t = stats?.totals
  return (
    <div className="flex flex-wrap gap-3">
      <GlassCell label="Activas"        value={t?.activas ?? 0} />
      <GlassCell label="Hoy"            value={t?.hoy ?? 0} />
      <GlassCell label="Hechas hoy"     value={t?.completadas_hoy ?? 0} />
      <GlassCell label="Procurement"    value={stats?.by_area?.procurement ?? 0}    accent={AREA_META.procurement.color} />
      <GlassCell label="Shop Manager"   value={stats?.by_area?.shop_manager ?? 0}   accent={AREA_META.shop_manager.color} />
      <GlassCell label="Administración" value={stats?.by_area?.administracion ?? 0} accent={AREA_META.administracion.color} />
      <GlassCell label="Recepción"      value={stats?.by_area?.recepcion ?? 0}      accent={AREA_META.recepcion.color} />
      <GlassCell label="Despachos"      value={stats?.by_area?.despachos ?? 0}      accent={AREA_META.despachos.color} />
    </div>
  )
}
