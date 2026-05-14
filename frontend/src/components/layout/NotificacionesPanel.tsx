import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bell, X, BellOff, BellRing, CheckCircle2, ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import { useEventosProduccion } from '@/hooks/useEventosProduccion'
import { useAuth } from '@/context/AuthContext'
import type { EventoProduccion } from '@/types/produccion'

/**
 * Campana de notificaciones en el Header.
 * Solo visible para ADMIN y SHOP_MANAGER — son los roles que necesitan
 * saber cuando un operario completa algo en el taller.
 *
 * Pollea cada 25s vía useEventosProduccion. Por cada evento nuevo:
 *  - Toast in-app
 *  - Browser notification (si granted)
 * Click en la campana → drawer slide-in con feed de las últimas 24h.
 */
export default function NotificacionesPanel() {
  const { user } = useAuth()
  const elegible = user?.rol === 'ADMIN' || user?.rol === 'SHOP_MANAGER'

  const {
    eventos, unreadCount, markAllSeen,
    notificationPermission, requestNotificationPermission,
  } = useEventosProduccion(elegible)

  const [open, setOpen] = useState(false)

  // Al abrir el panel, marcar como vistos
  useEffect(() => {
    if (open && unreadCount > 0) {
      markAllSeen()
    }
  }, [open, unreadCount, markAllSeen])

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!elegible) return null

  const permIsDefault = notificationPermission === 'default'
  const permIsGranted = notificationPermission === 'granted'

  return (
    <>
      {/* Campana */}
      <button
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-lg text-gray-500 hover:text-forest-700 hover:bg-gray-100 transition-colors"
        title="Notificaciones"
        aria-label="Notificaciones"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={clsx(
          'fixed inset-0 bg-black/40 z-40 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        aria-hidden="true"
      />

      {/* Drawer slide-in desde la derecha */}
      <aside
        className={clsx(
          'fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col',
          'transform transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        aria-label="Feed de notificaciones"
      >
        {/* Header del drawer */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-br from-forest-700 to-forest-600 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Bell size={18} />
            </div>
            <div>
              <h2 className="font-bold">Notificaciones</h2>
              <p className="text-xs text-forest-100/90">Últimas 24 horas</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </header>

        {/* Estado del permiso de Browser Notifications */}
        {permIsDefault && (
          <div className="bg-gold-50 border-b border-gold-200 px-5 py-3 flex items-center gap-3">
            <BellRing size={18} className="text-gold-700 shrink-0" />
            <div className="flex-1 text-xs text-gold-900">
              <div className="font-semibold">Activá notificaciones del sistema</div>
              <div className="text-gold-800/80">Te avisamos aunque tengas otra pestaña al frente.</div>
            </div>
            <button
              onClick={() => requestNotificationPermission()}
              className="px-3 py-1.5 rounded-lg bg-gold-600 hover:bg-gold-700 text-white text-xs font-semibold whitespace-nowrap"
            >
              Activar
            </button>
          </div>
        )}
        {notificationPermission === 'denied' && (
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2 text-xs text-gray-600">
            <BellOff size={14} className="shrink-0" />
            Notificaciones del sistema bloqueadas — habilitalas desde el navegador.
          </div>
        )}

        {/* Feed */}
        <div className="flex-1 overflow-y-auto">
          {eventos.length === 0 ? (
            <div className="py-20 px-6 text-center">
              <Bell size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Sin eventos recientes</p>
              <p className="text-sm text-gray-400 mt-1">
                Cuando un operario complete un proceso o termine una orden, aparece acá.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {eventos.map((ev) => (
                <EventoRow key={ev.id} evento={ev} onNavigate={() => setOpen(false)} />
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {permIsGranted && (
          <footer className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500 flex items-center gap-1.5">
            <CheckCircle2 size={12} className="text-emerald-600" />
            Notificaciones del sistema activas
          </footer>
        )}
      </aside>
    </>
  )
}

// ─── Una fila del feed ───────────────────────────────────────────────────────
function EventoRow({ evento: ev, onNavigate }: { evento: EventoProduccion; onNavigate: () => void }) {
  const persona = ev.kiosk_personal_nombre ?? ev.usuario_nombre ?? 'Alguien'
  const iniciales = ev.kiosk_personal_iniciales ?? '·'
  const esCompletada = ev.accion === 'completar'
  const tiempoRel = formatRelativeTime(ev.timestamp)

  return (
    <li>
      <Link
        to={`/produccion/ordenes/${ev.orden_id}`}
        onClick={onNavigate}
        className="flex items-start gap-3 px-5 py-3 hover:bg-gold-50 transition-colors"
      >
        <div className={clsx(
          'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
          esCompletada
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-forest-100 text-forest-700'
        )}>
          {iniciales}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm">
            <span className="font-semibold text-gray-900">{persona}</span>{' '}
            {esCompletada ? (
              <>completó <span className="font-bold text-emerald-700">{ev.numero_orden}</span></>
            ) : (
              <>completó <span className="font-medium uppercase text-xs">{ev.estacion_origen?.replace('_', ' ')}</span> en{' '}
              <span className="font-bold text-forest-700">{ev.numero_orden}</span></>
            )}
          </div>

          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            {!esCompletada && (
              <>
                <ArrowRight size={11} />
                <span className="uppercase font-medium">{ev.estacion_destino.replace('_', ' ')}</span>
                <span>·</span>
              </>
            )}
            <span>{tiempoRel}</span>
            {ev.dispositivo && <><span>·</span><span>{ev.dispositivo}</span></>}
          </div>
        </div>
      </Link>
    </li>
  )
}

function formatRelativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000  // seconds
  if (diff < 60)   return 'recién'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
