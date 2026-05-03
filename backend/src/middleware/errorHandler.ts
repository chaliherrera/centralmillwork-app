import { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'

export interface AppError extends Error {
  statusCode?: number
}

export function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction) {
  const status = err.statusCode ?? 500
  const message = status === 500 ? 'Error interno del servidor' : err.message
  if (status === 500) {
    logger.error('unhandled error', {
      requestId: req.id,
      method: req.method,
      path: req.path,
      err,
    })
  }
  res.status(status).json({ message })
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ message: 'Recurso no encontrado' })
}

export function createError(message: string, statusCode: number): AppError {
  const err: AppError = new Error(message)
  err.statusCode = statusCode
  return err
}
