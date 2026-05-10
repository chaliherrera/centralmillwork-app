import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { createError } from './errorHandler'

// JWT del kiosko: shape diferente al del sistema (`{id, email, rol}`).
// Esto previene que un token de kiosko se use accidentalmente en endpoints
// del sistema y viceversa (ver `authenticate` que descarta `kind === 'kiosk'`).
export interface KioskJwtPayload {
  kind: 'kiosk'
  personal_id: number
  nombre_completo: string
  iniciales: string
  dispositivo?: string
}

declare global {
  namespace Express {
    interface Request {
      kioskUser?: KioskJwtPayload
    }
  }
}

/**
 * Middleware que valida JWT de kiosko y popula `req.kioskUser`.
 * Rechaza tokens del sistema (kind !== 'kiosk').
 */
export function authenticateKiosk(req: Request, _res: Response, next: NextFunction) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return next(createError('No autorizado', 401))
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as Partial<KioskJwtPayload>
    if (payload?.kind !== 'kiosk' || typeof payload.personal_id !== 'number') {
      return next(createError('Token inválido para kiosko', 401))
    }
    req.kioskUser = payload as KioskJwtPayload
    next()
  } catch {
    next(createError('Token inválido o expirado', 401))
  }
}
