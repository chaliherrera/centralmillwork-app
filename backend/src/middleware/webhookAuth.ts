import { Request, Response, NextFunction } from 'express'
import { createError } from './errorHandler'

/**
 * Auth para endpoints de webhook (machine-to-machine).
 *
 * Verifica Bearer token contra process.env.WEBHOOK_API_TOKEN. NO usa JWT
 * porque el caller es un agente Python (Task Agent), no un usuario logueado.
 *
 * Si WEBHOOK_API_TOKEN no está configurado en el entorno, devuelve 503 para
 * señalar que el endpoint está mal configurado (no 401, porque no es culpa
 * del cliente).
 */
export function webhookAuth(req: Request, _res: Response, next: NextFunction) {
  const expected = process.env.WEBHOOK_API_TOKEN
  if (!expected) {
    return next(createError('WEBHOOK_API_TOKEN no configurado en el server', 503))
  }

  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return next(createError('No autorizado', 401))
  }

  const token = auth.slice(7).trim()
  if (token !== expected) {
    return next(createError('Token inválido', 401))
  }

  next()
}
