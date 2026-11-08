import axios from 'axios'
import * as SecureStore from 'expo-secure-store'

// URL del backend por ENTORNO. EAS inyecta EXPO_PUBLIC_API_URL por perfil de build
// (ver mobile/eas.json): preview/development → staging, production → prod. El fallback
// es prod para que un build sin la variable no apunte por error a staging.
// Antes estaba hardcodeada a prod → probar offline/escritura contra prod era peligroso.
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  'https://centralmillwork-backend-production.up.railway.app/api'

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
})

// Interceptor: adjunta el token JWT a cada request si existe
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('jwt_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Manejo de 401 (sesión vencida / inválida) ───────────────────────────────
// La app restauraba el usuario desde SecureStore sin validar el token → "sesión
// fantasma": parecía logueada y todo daba 401 en silencio. Ahora un 401 dispara el
// handler que registra AuthContext (cierra sesión y vuelve al login).
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401 && onUnauthorized) {
      onUnauthorized()
    }
    return Promise.reject(error)
  }
)

// Base URL efectiva (para debug / mostrar entorno en pantalla si hace falta).
export const apiBaseUrl = API_URL

// Helpers para guardar / leer / borrar token
export const tokenStorage = {
  save: (token: string) => SecureStore.setItemAsync('jwt_token', token),
  get: () => SecureStore.getItemAsync('jwt_token'),
  remove: () => SecureStore.deleteItemAsync('jwt_token'),
}

export const userStorage = {
  save: (user: any) => SecureStore.setItemAsync('user_data', JSON.stringify(user)),
  get: async () => {
    const data = await SecureStore.getItemAsync('user_data')
    return data ? JSON.parse(data) : null
  },
  remove: () => SecureStore.deleteItemAsync('user_data'),
}
