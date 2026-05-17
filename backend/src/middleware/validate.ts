import { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError } from 'zod'
import { createError } from './errorHandler'

// Middleware genérico de validación. Recibe un schema zod y valida req.body.
// Si pasa, reemplaza req.body con el parseado (con coerciones aplicadas).
// Si falla, devuelve 400 con el listado de errores legible.
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const issues = (result.error as ZodError).issues.map((i) =>
        `${i.path.join('.') || '(root)'}: ${i.message}`
      ).join('; ')
      return next(createError(`Validación fallida — ${issues}`, 400))
    }
    req.body = result.data
    next()
  }
}
