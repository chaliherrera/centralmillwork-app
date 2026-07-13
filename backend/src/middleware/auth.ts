import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { createError } from './errorHandler'

export type Role = 'ADMIN' | 'PROCUREMENT' | 'PRODUCTION' | 'PROJECT_MANAGEMENT' | 'CONTABILIDAD' | 'SHOP_MANAGER' | 'ENGINEERING' | 'VIEWER'

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; rol: Role }
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return next(createError('No autorizado', 401))
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as { id: string; email: string; rol: Role; kind?: string }
    // Rechazar tokens emitidos para el kiosko de producción (ver kioskAuth.ts).
    // Mismo JWT_SECRET, distinto shape — prevenimos cross-use entre sistemas.
    if (payload.kind === 'kiosk') return next(createError('Token de kiosko no válido para el sistema', 401))
    req.user = payload
    next()
  } catch {
    next(createError('Token inválido o expirado', 401))
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return next(createError('No autorizado', 401))
    if (!roles.includes(req.user.rol)) return next(createError('Sin permisos suficientes', 403))
    next()
  }
}
