import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { kioskService } from '@/services/kiosk'
import { KIOSK_TOKEN, KIOSK_DISPOSITIVO } from '@/services/kioskApi'
import type { KioskMe, KioskPersonal } from '@/types/kiosk'

interface KioskAuthContextValue {
  personal: KioskPersonal | null
  status: KioskMe | null
  dispositivo: string
  isLoading: boolean

  login: (pin: string) => Promise<KioskPersonal>
  logout: () => void
  refresh: () => Promise<void>
  setDispositivo: (name: string) => void
}

const KioskAuthContext = createContext<KioskAuthContextValue | null>(null)

export function KioskAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<KioskMe | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dispositivo, setDispositivoState] = useState<string>(KIOSK_DISPOSITIVO.get())

  const refresh = useCallback(async () => {
    if (!KIOSK_TOKEN.get()) { setStatus(null); return }
    try {
      const me = await kioskService.me()
      setStatus(me)
    } catch {
      // 401 ya borra el token via interceptor
      setStatus(null)
    }
  }, [])

  // Boot: si hay token guardado, validarlo
  useEffect(() => {
    if (!KIOSK_TOKEN.get()) { setIsLoading(false); return }
    refresh().finally(() => setIsLoading(false))
  }, [refresh])

  const login = useCallback(async (pin: string) => {
    const res = await kioskService.login(pin, dispositivo || undefined)
    KIOSK_TOKEN.set(res.token)
    // Pre-popular status con la respuesta del login (sin clockin/proyecto/pausa todavía)
    setStatus({
      personal: res.personal,
      dispositivo: res.dispositivo ?? null,
      registro_activo: null,
      proyecto_activo: null,
      pausa_activa: null,
    })
    // Y al toque traer el status real (por si el operario tenía algo abierto)
    refresh()
    return res.personal
  }, [dispositivo, refresh])

  const logout = useCallback(() => {
    KIOSK_TOKEN.clear()
    setStatus(null)
  }, [])

  const setDispositivo = useCallback((name: string) => {
    KIOSK_DISPOSITIVO.set(name)
    setDispositivoState(name)
  }, [])

  return (
    <KioskAuthContext.Provider value={{
      personal: status?.personal ?? null,
      status,
      dispositivo,
      isLoading,
      login,
      logout,
      refresh,
      setDispositivo,
    }}>
      {children}
    </KioskAuthContext.Provider>
  )
}

export function useKioskAuth() {
  const ctx = useContext(KioskAuthContext)
  if (!ctx) throw new Error('useKioskAuth must be used inside KioskAuthProvider')
  return ctx
}
