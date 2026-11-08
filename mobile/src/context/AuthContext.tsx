import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { api, tokenStorage, userStorage, setUnauthorizedHandler } from '../services/api'
import { User } from '../types'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(async () => {
    await tokenStorage.remove()
    await userStorage.remove()
    setUser(null)
  }, [])

  // Un 401 en cualquier request (token vencido/inválido) cierra la sesión y vuelve
  // al login. Se registra una sola vez.
  useEffect(() => {
    setUnauthorizedHandler(() => { logout() })
    return () => setUnauthorizedHandler(null)
  }, [logout])

  // Al iniciar: restaurar la sesión guardada y VALIDAR el token contra el backend.
  // - 200  → sesión válida, se refresca el usuario.
  // - 401  → el interceptor de api.ts ya dispara logout (sesión fantasma resuelta).
  // - error de red (sin señal) → se MANTIENE la sesión guardada (modo offline);
  //   no deslogueamos por falta de conexión.
  useEffect(() => {
    (async () => {
      const savedUser = await userStorage.get()
      if (!savedUser) { setLoading(false); return }
      setUser(savedUser) // optimista, para no parpadear el login
      try {
        const { data } = await api.get('/auth/me') // → { data: user }
        if (data?.data) {
          setUser(data.data)
          await userStorage.save(data.data)
        }
      } catch (err: any) {
        // Solo el 401 cierra sesión (lo hace el interceptor). Sin red, seguimos.
        if (err?.response?.status === 401) setUser(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function login(email: string, password: string) {
    // client:'mobile' → sesión larga (30d) para el modo offline de obra.
    const { data } = await api.post('/auth/login', { email, password, client: 'mobile' })
    await tokenStorage.save(data.token)
    await userStorage.save(data.user)
    setUser(data.user)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
