export type UserRole = 'ADMIN' | 'PROCUREMENT' | 'PRODUCTION' | 'PROJECT_MANAGEMENT' | 'CONTABILIDAD'

export interface User {
  id: string
  nombre: string
  email: string
  rol: UserRole
}

export interface LoginResponse {
  token: string
  user: User
}
