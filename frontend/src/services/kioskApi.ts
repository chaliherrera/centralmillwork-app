import axios, { AxiosError } from 'axios'
import toast from 'react-hot-toast'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? ''
const KIOSK_TOKEN_KEY = 'cm_kiosk_token'

/**
 * Axios instance separada del sistema (`api.ts`).
 *
 * Razones para tenerla aparte:
 * 1. Token distinto: el kiosko usa `cm_kiosk_token` para no colisionar
 *    con `cm_token` del sistema en la misma tablet.
 * 2. Redirect en 401: cuando expira el token de kiosko, vamos a `/kiosk`
 *    (no a `/login` del sistema).
 * 3. Timeout más generoso: el login del kiosko hace bcrypt × N en el server
 *    (~1.5s peor caso con 13 operarios) — un timeout de 15s es justo.
 */
export const kioskApi = axios.create({
  baseURL: `${BACKEND_URL}/api/kiosk`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
})

kioskApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(KIOSK_TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

kioskApi.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ message?: string }>) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(KIOSK_TOKEN_KEY)
      // No redirigir si ya estamos en la pantalla de login del kiosko
      if (!window.location.pathname.match(/^\/kiosk\/?$/)) {
        window.location.href = '/kiosk'
      }
      return Promise.reject(error)
    }
    const msg = error.response?.data?.message ?? 'Error de conexión con el servidor'
    toast.error(msg)
    return Promise.reject(error)
  }
)

export const KIOSK_TOKEN = {
  get: () => localStorage.getItem(KIOSK_TOKEN_KEY),
  set: (token: string) => localStorage.setItem(KIOSK_TOKEN_KEY, token),
  clear: () => localStorage.removeItem(KIOSK_TOKEN_KEY),
}

const DISPOSITIVO_KEY = 'cm_kiosk_dispositivo'

/**
 * El nombre del dispositivo (ej: "tablet-cnc-01") se configura una vez por
 * tablet y se persiste en localStorage. Se manda en cada login para auditoría.
 */
export const KIOSK_DISPOSITIVO = {
  get: () => localStorage.getItem(DISPOSITIVO_KEY) ?? '',
  set: (name: string) => localStorage.setItem(DISPOSITIVO_KEY, name),
  clear: () => localStorage.removeItem(DISPOSITIVO_KEY),
}
