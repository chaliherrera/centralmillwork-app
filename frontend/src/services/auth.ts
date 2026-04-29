import api from './api'
import type { User } from '@/types'

export const authService = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/login', { email, password }).then((r) => r.data),

  me: () =>
    api.get<{ data: User }>('/auth/me').then((r) => r.data.data),

  logout: () =>
    api.post('/auth/logout').then((r) => r.data),
}
