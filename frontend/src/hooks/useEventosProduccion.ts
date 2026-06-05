import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { produccionService } from '@/services/produccion'
import type { EventoProduccion } from '@/types/produccion'

const LS_LAST_SEEN     = 'cm_eventos_last_seen'
const LS_TOASTED_IDS   = 'cm_eventos_toasted_ids'   // de-dup: cada id toastea 1 sola vez
const POLL_MS = 25_000  // 25s — balance entre frescura y carga del backend

// ─── Helpers para persistir el set de IDs ya toastedos ──────────────────────
function loadToastedIds(): Set<number> {
  try {
    const raw = localStorage.getItem(LS_TOASTED_IDS)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x) => typeof x === 'number'))
  } catch {
    return new Set()
  }
}
function saveToastedIds(set: Set<number>) {
  try {
    localStorage.setItem(LS_TOASTED_IDS, JSON.stringify([...set]))
  } catch { /* quota o disabled storage */ }
}

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
  // Set de IDs que YA dispararon toast. Persistido en localStorage para
  // sobrevivir a refresh de página: si volvés a entrar, los toasts ya vistos
  // NO se repiten. El conteo de la campana (unreadCount) sigue funcionando
  // contra lastSeen, independiente de este set.
  const toastedIdsRef = useRef<Set<number>>(loadToastedIds())
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

  // Cuando llegan datos nuevos, comparar contra lastSeen y disparar
  // notificaciones SOLO para eventos que no fueron toasteados antes.
  useEffect(() => {
    if (!data?.eventos) return
    const lastSeen = lastSeenRef.current
    const nuevos = data.eventos.filter((e) => e.timestamp > lastSeen)
    // Fix #7: el badge no debe bajar solo cuando los eventos viejos salen
    // de la ventana de 24h del feed. Usamos Math.max para que sea monotónico
    // hasta que el usuario haga markAllSeen (que resetea a 0).
    setUnreadCount((prev) => Math.max(prev, nuevos.length))
    if (nuevos.length === 0) return

    // Filtrar los que YA mostraron toast en una iteración anterior. Estos
    // siguen contando para el badge (unreadCount arriba), solo NO disparan
    // toast ni browser notification de nuevo.
    const aMostrar = nuevos.filter((e) => !toastedIdsRef.current.has(e.id))
    if (aMostrar.length === 0) return

    // Marcar como ya toasteados ANTES de disparar (evita re-fire si el
    // useEffect se re-ejecuta en el mismo poll por algún motivo).
    aMostrar.forEach((e) => toastedIdsRef.current.add(e.id))

    // Auto-prune: el feed del servidor está limitado a 24h. Solo guardamos
    // IDs que sigan apareciendo en la ventana actual; el resto se descarta
    // para que el set no crezca sin límite.
    const idsEnVentana = new Set(data.eventos.map((e) => e.id))
    toastedIdsRef.current = new Set(
      [...toastedIdsRef.current].filter((id) => idsEnVentana.has(id))
    )
    saveToastedIds(toastedIdsRef.current)

    // Si hay muchos eventos nuevos (>3) agrupamos en un solo toast para no
    // spammear. El más reciente primero.
    if (aMostrar.length > 3) {
      toast.success(
        `${aMostrar.length} eventos nuevos en producción`,
        { duration: 5000, icon: '🏭' }
      )
      tryBrowserNotification(`${aMostrar.length} eventos nuevos`, 'Click para ver el feed', '/produccion')
    } else {
      for (const ev of aMostrar) {
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
