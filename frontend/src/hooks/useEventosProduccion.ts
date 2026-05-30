import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { produccionService } from '@/services/produccion'
import type { EventoProduccion } from '@/types/produccion'

const LS_LAST_SEEN = 'cm_eventos_last_seen'
const POLL_MS = 25_000  // 25s — balance entre frescura y carga del backend

/**
 * Hook que polla el backend cada 25s buscando eventos nuevos (operario
 * completó proceso, orden avanzó/finalizó). Por cada evento nuevo:
 *  - Toast in-app (react-hot-toast)
 *  - Browser Notification (si el usuario otorgó permiso)
 *
 * Devuelve:
 *  - eventos: lista completa de las últimas 24h para mostrar en el feed
 *  - unreadCount: cuántos eventos hay desde el último "marcar como visto"
 *  - markAllSeen: marca todos como vistos (resetea el contador)
 *  - requestNotificationPermission: dispara el prompt del browser
 *  - notificationPermission: estado actual ('granted' | 'denied' | 'default' | 'unsupported')
 */
export function useEventosProduccion(enabled: boolean = true) {
  const qc = useQueryClient()
  const lastSeenRef = useRef<string>(localStorage.getItem(LS_LAST_SEEN) ?? new Date().toISOString())
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  )

  const { data } = useQuery({
    queryKey: ['eventos-recientes'],
    queryFn:  () => produccionService.eventosRecientes(),
    enabled,
    refetchInterval: POLL_MS,
    staleTime: POLL_MS,
  })

  // Cuando llegan datos nuevos, comparar contra lastSeen y disparar notificaciones
  useEffect(() => {
    if (!data?.eventos) return
    const lastSeen = lastSeenRef.current
    const nuevos = data.eventos.filter((e) => e.timestamp > lastSeen)
    if (nuevos.length === 0) {
      setUnreadCount(0)
      return
    }

    setUnreadCount(nuevos.length)

    // Sólo disparamos toast y browser notif si el hook está enabled (evita
    // duplicados si se monta en varios lugares). El más reciente primero.
    // Si hay muchos (>3) agrupamos en un solo toast para no spammear.
    if (nuevos.length > 3) {
      toast.success(
        `${nuevos.length} eventos nuevos en producción`,
        { duration: 5000, icon: '🏭' }
      )
      tryBrowserNotification(`${nuevos.length} eventos nuevos`, 'Click para ver el feed', '/produccion')
    } else {
      for (const ev of nuevos) {
        const { title, body } = formatEvento(ev)
        toast.success(`${title}\n${body}`, { duration: 6000, icon: '🏭' })
        tryBrowserNotification(title, body, `/produccion/ordenes/${ev.orden_id}`)
      }
    }
    // No actualizamos lastSeenRef acá — eso lo hace markAllSeen()
    // para que el badge persista hasta que el usuario abra el panel.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.ahora])  // sólo cuando llega un response nuevo

  const markAllSeen = useCallback(() => {
    const now = new Date().toISOString()
    lastSeenRef.current = now
    localStorage.setItem(LS_LAST_SEEN, now)
    setUnreadCount(0)
  }, [])

  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported')
      return 'unsupported' as const
    }
    if (Notification.permission === 'granted') {
      setNotificationPermission('granted')
      return 'granted' as const
    }
    const result = await Notification.requestPermission()
    setNotificationPermission(result)
    return result
  }, [])

  // Invalidar queries afectadas por cada evento nuevo, así el resto de la UI
  // (Mapa, Ordenes, DetalleOrden) refresca solo.
  useEffect(() => {
    if (!data?.eventos?.length) return
    qc.invalidateQueries({ queryKey: ['ordenes-produccion'] })
    qc.invalidateQueries({ queryKey: ['ordenes-produccion-kpis'] })
    qc.invalidateQueries({ queryKey: ['estaciones'] })
    qc.invalidateQueries({ queryKey: ['tt-activos'] })
  }, [data?.ahora, qc])

  return {
    eventos: data?.eventos ?? [],
    unreadCount,
    markAllSeen,
    notificationPermission,
    requestNotificationPermission,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEvento(ev: EventoProduccion): { title: string; body: string } {
  const persona = ev.kiosk_personal_nombre ?? ev.usuario_nombre ?? 'Alguien'
  const orden = ev.numero_orden
  const dispositivo = ev.dispositivo ? ` (${ev.dispositivo})` : ''

  if (ev.accion === 'completar') {
    // Orden completada (último proceso)
    return {
      title: `🎉 ${orden} completada`,
      body: `${persona} terminó el último proceso${dispositivo}`,
    }
  }
  if (ev.accion === 'mover') {
    const origen = ev.estacion_origen?.replace('_', ' ').toUpperCase() ?? '?'
    const destino = ev.estacion_destino?.replace('_', ' ').toUpperCase() ?? '?'
    return {
      title: `${persona} completó ${origen}`,
      body: `${orden} → ${destino}${dispositivo}`,
    }
  }
  return {
    title: `${ev.accion} · ${orden}`,
    body: persona,
  }
}

function tryBrowserNotification(title: string, body: string, url?: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    const notif = new Notification(title, {
      body,
      icon: '/logo_cm_sidebar.png',
      tag: title,  // colapsar duplicados del mismo título
    })
    if (url) {
      notif.onclick = () => {
        window.focus()
        window.location.href = url
        notif.close()
      }
    }
  } catch {
    // Algunos navegadores rechazan si la pestaña está en background — no es crítico
  }
}
