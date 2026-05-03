import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api, tokenStorage, userStorage } from '../services/api'
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

  // Al iniciar la app, recuperar sesión guardada
  useEffect(() => {
    (async () => {
      const savedUser = await userStorage.get()
      if (savedUser) setUser(savedUser)
      setLoading(false)
    })()
  }, [])

  async function login(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password })
    await tokenStorage.save(data.token)
    await userStorage.save(data.user)
    setUser(data.user)
  }

  async function logout() {
    await tokenStorage.remove()
    await userStorage.remove()
    setUser(null)
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
