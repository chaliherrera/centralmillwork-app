import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import clsx from 'clsx'

interface StatCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  trend?: number
  color?: 'gold' | 'forest' | 'blue' | 'red'
}

const colorMap = {
  gold:   'bg-gold-50  text-gold-600',
  forest: 'bg-forest-50 text-forest-600',
  blue:   'bg-blue-50  text-blue-600',
  red:    'bg-red-50   text-red-600',
}

export default function StatCard({ label, value, icon: Icon, trend, color = 'gold' }: StatCardProps) {
  const TrendIcon = trend === undefined || trend === 0 ? Minus : trend > 0 ? TrendingUp : TrendingDown
  const trendColor = trend === undefined || trend === 0 ? 'text-gray-400' : trend > 0 ? 'text-green-600' : 'text-red-500'

  return (
    <div className="card flex items-start justify-between">
      <div>
        <p className="text-sm text-gray-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {trend !== undefined && (
          <div className={clsx('flex items-center gap-1 mt-2 text-xs', trendColor)}>
            <TrendIcon size={13} />
            <span>{Math.abs(trend)}% vs mes anterior</span>
          </div>
        )}
      </div>
      <div className={clsx('p-3 rounded-xl', colorMap[color])}>
        <Icon size={22} />
      </div>
    </div>
  )
}
