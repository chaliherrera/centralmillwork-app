import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CheckCircle2, Sparkles, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { dashboardService } from '@/services/dashboard'
import { useAuth } from '@/context/AuthContext'

/**
 * Daily Briefing — "Buenos días" panel para Procurement / ADMIN.
 *
 * Filosofía: NO es un reporte que se genere. Está siempre arriba del
 * dashboard cuando entrás. Es el primer ritual de la mañana — escaneás
 * 5 buckets accionables en 10 segundos y sabés qué necesita atención hoy.
 *
 * Inspiración:
 *   - Morning briefing del NYT (resumen scaneable, no lectura)
 *   - Apple Health "Today" view (números grandes + frase corta)
 *   - Notion "Today" templates (acción sobre información)
 *
 * Sin fricción: la query se ejecuta sola, cache 5 min, refetch en focus.
 * Si todos los buckets están en 0 → mensaje verde "al día".
 */
export default function DailyBriefing() {
  const { user } = useAuth()
  const allowed = user?.rol === 'ADMIN' || user?.rol === 'PROCUREMENT'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard-daily-briefing'],
    queryFn: () => dashboardService.getDailyBriefing(),
    enabled: allowed,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  })

  if (!allowed) return null

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (isError || !data) return null

  const briefing = data.data
  if (!briefing) return null

  const totalIssues =
    briefing.rezagados.count +
    briefing.vencidas.count +
    briefing.estancadas.count +
    briefing.vencePronto.count

  const greeting = saludoSegunHora()
  const fecha = new Date(briefing.fecha_servidor).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  const nombre = user?.nombre || user?.email?.split('@')[0] || ''

  return (
    <div className="card border-l-4 border-l-gold-500 bg-gradient-to-br from-white to-gold-50/30">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-forest-700">
            <Sparkles size={14} className="text-gold-500" />
            {greeting}{nombre ? `, ${nombre}` : ''}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 capitalize">{fecha}</p>
        </div>
        {totalIssues === 0 && briefing.importadosAyer.count === 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
            <CheckCircle2 size={12} /> al día
          </span>
        )}
      </div>

      {/* Grid de buckets */}
      {totalIssues === 0 && briefing.importadosAyer.count === 0 ? (
        <p className="text-sm text-gray-600 py-4">
          Procurement está al día — no hay materiales rezagados, OCs vencidas, recepciones estancadas ni
          ETAs cercanas. Buen trabajo. ✨
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <BucketCard
            emoji="🟡"
            color="amber"
            count={briefing.rezagados.count}
            title="Rezagados"
            subtitle="materiales pendientes >14d"
            to="/materiales?estado_cotiz=PENDIENTE"
            action="revisar"
          />
          <BucketCard
            emoji="🔴"
            color="red"
            count={briefing.vencidas.count}
            title="OCs vencidas"
            subtitle="ETA pasada, no recibidas"
            to="/ordenes-compra?flag=vencidas"
            action="pedir tracking"
          />
          <BucketCard
            emoji="🟠"
            color="orange"
            count={briefing.estancadas.count}
            title="Recepciones"
            subtitle="estancadas >5 días"
            to="/recepciones?estado=pendiente"
            action="cerrar"
          />
          <BucketCard
            emoji="📅"
            color="blue"
            count={briefing.vencePronto.count}
            title="Vence pronto"
            subtitle="OCs llegan hoy/mañana"
            to="/ordenes-compra?flag=2dias"
            action="preparar"
          />
          <BucketCard
            emoji="🆕"
            color="emerald"
            count={briefing.importadosAyer.count}
            title="Importados ayer"
            subtitle="materiales nuevos a cotizar"
            to="/materiales?estado_cotiz=PENDIENTE"
            action="cotizar"
          />
        </div>
      )}

      {/* Highlights — top 3 más urgentes (rezagados con más días) */}
      {briefing.rezagados.top.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Más rezagados
          </p>
          <ul className="space-y-1 text-xs">
            {briefing.rezagados.top.slice(0, 3).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 text-gray-600">
                <span className="truncate">
                  <span className="font-mono text-[10px] bg-gray-100 px-1 rounded mr-1">{m.codigo ?? '—'}</span>
                  {m.descripcion} · <span className="text-gray-400">{m.proyecto_codigo} · {m.vendor}</span>
                </span>
                <span className="text-amber-700 font-semibold whitespace-nowrap">{m.dias_pendiente}d</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {briefing.vencidas.top.length > 0 && briefing.rezagados.top.length === 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Más urgentes (vencidas)
          </p>
          <ul className="space-y-1 text-xs">
            {briefing.vencidas.top.slice(0, 3).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 text-gray-600">
                <span className="truncate">
                  <span className="font-mono text-[10px] bg-gray-100 px-1 rounded mr-1">{o.numero}</span>
                  {o.proveedor_nombre} · <span className="text-gray-400">{o.proyecto_codigo}</span>
                </span>
                <span className="text-red-700 font-semibold whitespace-nowrap">{o.dias_vencida}d tarde</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── BucketCard ─────────────────────────────────────────────────────────────

interface BucketCardProps {
  emoji: string
  color: 'amber' | 'red' | 'orange' | 'blue' | 'emerald'
  count: number
  title: string
  subtitle: string
  to: string
  action: string
}

function BucketCard({ emoji, color, count, title, subtitle, to, action }: BucketCardProps) {
  const isZero = count === 0
  const colorMap: Record<BucketCardProps['color'], { ring: string; text: string; bg: string }> = {
    amber:   { ring: 'ring-amber-200',   text: 'text-amber-800',   bg: 'bg-amber-50' },
    red:     { ring: 'ring-red-200',     text: 'text-red-700',     bg: 'bg-red-50' },
    orange:  { ring: 'ring-orange-200',  text: 'text-orange-700',  bg: 'bg-orange-50' },
    blue:    { ring: 'ring-blue-200',    text: 'text-blue-700',    bg: 'bg-blue-50' },
    emerald: { ring: 'ring-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  }
  const c = colorMap[color]

  const Wrapper = isZero ? 'div' : Link

  return (
    <Wrapper
      {...(isZero ? {} : { to } as any)}
      className={clsx(
        'p-3 rounded-lg ring-1 transition-all flex flex-col gap-1',
        isZero
          ? 'bg-gray-50 ring-gray-100 opacity-60'
          : `${c.bg} ${c.ring} hover:ring-2 cursor-pointer hover:shadow-sm`
      )}
    >
      <div className="flex items-center gap-1">
        <span className="text-base leading-none">{emoji}</span>
        <span className={clsx(
          'text-2xl font-bold tabular-nums leading-none',
          isZero ? 'text-gray-300' : c.text
        )}>
          {count}
        </span>
      </div>
      <p className={clsx('text-xs font-semibold', isZero ? 'text-gray-400' : 'text-gray-800')}>{title}</p>
      <p className="text-[10px] text-gray-500 leading-tight">{subtitle}</p>
      {!isZero && (
        <p className={clsx('text-[10px] font-medium mt-0.5', c.text)}>→ {action}</p>
      )}
    </Wrapper>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function saludoSegunHora(): string {
  // No usamos Date.now() porque puede entrar en sleep/wake del navegador.
  // new Date() trae la hora local del navegador → consistente con el usuario.
  const h = new Date().getHours()
  if (h < 6) return 'Buenas noches'
  if (h < 13) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}
