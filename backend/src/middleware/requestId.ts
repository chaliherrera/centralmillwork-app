import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'

declare global {
  namespace Express {
    interface Request {
      id: string
    }
  }
}

// Asigna un UUID a cada request, lo guarda en req.id y lo expone como
// X-Request-ID en la respuesta. Si el cliente manda X-Request-ID en la
// request lo respeta (útil para tracing distribuido / clientes que
// quieren correlacionar logs con sus propios IDs).
//
// IMPORTANTE: este middleware tiene que ir muy temprano en la cadena
// — antes de cualquier handler que loguee usando req.id.
export function requestId(req: Request, res: Response, next: NextFunction) {
  const supplied = req.header('x-request-id')
  req.id = (supplied && supplied.length <= 100) ? supplied : randomUUID()
  res.setHeader('X-Request-ID', req.id)
  next()
}
