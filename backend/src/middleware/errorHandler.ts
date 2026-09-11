import { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'
import { captureException } from '../utils/sentry'

export interface AppError extends Error {
  statusCode?: number
}

export function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction) {
  const status = err.statusCode ?? 500
  const message = status === 500 ? 'Error interno del servidor' : err.message

  if (status === 500) {
    // Log estructurado a Winston (existente)
    logger.error('unhandled error', {
      requestId: req.id,
      method: req.method,
      path: req.path,
      err,
    })

    // Audit roadmap "ahora #1": reporte a Sentry con tags correlables.
    // Solo errores 500 — los 4xx esperados (validación, no encontrado, no autorizado)
    // ya los maneja beforeSend del Sentry init.
    captureException(err, {
      tags: {
        method: req.method,
        // route es más útil que path porque agrupa /api/x/:id en vez de /api/x/42
        route: (req.route as { path?: string } | undefined)?.path || req.path,
        statusCode: status,
      },
      extra: {
        body: req.body,
        params: req.params,
        query: req.query,
      },
      requestId: req.id,
      user: req.user
        ? { id: req.user.id, email: req.user.email, rol: req.user.rol }
        : req.kioskUser
          ? { id: String(req.kioskUser.personal_id), email: req.kioskUser.nombre_completo }
          : undefined,
    })
  }

  // En 500 devolvemos requestId (para cruzar con Sentry/logs) pero NO el mensaje
  // interno del error por defecto: err.message suele traer texto crudo de Postgres
  // (nombres de constraint/columna, fragmentos de query) → fuga del esquema a
  // cualquier cliente, incluido el portal público. El detalle se puede habilitar
  // puntualmente para debugging con EXPOSE_ERROR_DETAIL=true.
  const body: { message: string; detail?: string; requestId?: string } = { message }
  if (status === 500) {
    body.requestId = req.id
    if (process.env.EXPOSE_ERROR_DETAIL === 'true') body.detail = err?.message || String(err)
  }
  res.status(status).json(body)
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ message: 'Recurso no encontrado' })
}

export function createError(message: string, statusCode: number): AppError {
  const err: AppError = new Error(message)
  err.statusCode = statusCode
  return err
}
