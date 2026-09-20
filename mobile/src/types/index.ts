// Debe coincidir con `Role` del backend (backend/src/middleware/auth.ts). FIELD y
// LOGISTICA faltaban acá: un usuario field@ entraba con un rol que el tipo no conocía.
export type UserRole =
  | 'ADMIN'
  | 'PROCUREMENT'
  | 'PRODUCTION'
  | 'PROJECT_MANAGEMENT'
  | 'CONTABILIDAD'
  | 'SHOP_MANAGER'
  | 'ENGINEERING'
  | 'LOGISTICA'
  | 'FIELD'
  | 'VIEWER'

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
