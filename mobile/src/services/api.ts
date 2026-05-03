import axios from 'axios'
import * as SecureStore from 'expo-secure-store'

const API_URL = 'https://centralmillwork-backend-production.up.railway.app/api'

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
