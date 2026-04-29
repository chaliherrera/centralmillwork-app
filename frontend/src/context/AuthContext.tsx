import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authService } from '@/services/auth'
import type { User } from '@/types'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('cm_token')
    if (!token) { setIsLoading(false); return }
    authService.me()
      .then((u) => setUser(u))
      .catch(() => localStorage.removeItem('cm_token'))
      .finally(() => setIsLoading(false))
  }, [])

  async function login(email: string, password: string) {
    const { token, user } = await authService.login(email, password)
    localStorage.setItem('cm_token', token)
    setUser(user)
  }

  function logout() {
    localStorage.removeItem('cm_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
