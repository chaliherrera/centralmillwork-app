import type { TareasStats } from '@/types'
import { AREA_META } from './constants'

interface Props {
  stats?: TareasStats
}

interface StatCellProps {
  label: string
  value: number
  accent?: string
  muted?: boolean
}

function StatCell({ label, value, accent, muted }: StatCellProps) {
  return (
    <div className="relative bg-white border border-gray-200 rounded-xl px-4 py-3 flex-1 min-w-[120px]">
      {accent && (
        <span
          aria-hidden
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
          style={{ background: accent }}
        />
      )}
      <p className={`text-2xl font-semibold tabular-nums leading-none ${muted ? 'text-gray-400' : 'text-gray-900'}`}>
        {value}
      </p>
      <p className="text-[11px] uppercase tracking-wider text-gray-500 mt-1.5">{label}</p>
    </div>
  )
}

export default function KpiStrip({ stats }: Props) {
  const t = stats?.totals
  return (
    <div className="flex flex-wrap gap-3">
      <StatCell label="Activas"          value={t?.activas ?? 0} />
      <StatCell label="Hoy"              value={t?.hoy ?? 0} />
      <StatCell label="Hechas hoy"       value={t?.completadas_hoy ?? 0} muted />
      <StatCell label="Procurement"      value={stats?.by_area?.procurement ?? 0}    accent={AREA_META.procurement.color} />
      <StatCell label="Administración"   value={stats?.by_area?.administracion ?? 0} accent={AREA_META.administracion.color} />
      <StatCell label="Recepción"        value={stats?.by_area?.recepcion ?? 0}      accent={AREA_META.recepcion.color} />
      <StatCell label="Despachos"        value={stats?.by_area?.despachos ?? 0}      accent={AREA_META.despachos.color} />
    </div>
  )
}
