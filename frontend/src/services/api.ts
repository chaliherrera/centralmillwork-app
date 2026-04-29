import axios, { AxiosError } from 'axios'
import toast from 'react-hot-toast'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// Attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cm_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Global error handling
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ message?: string }>) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('cm_token')
      window.location.href = '/login'
      return
    }
    const msg = error.response?.data?.message ?? 'Error de conexión con el servidor'
    toast.error(msg)
    return Promise.reject(error)
  }
)

export default api
