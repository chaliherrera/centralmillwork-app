import { Request } from 'express'

export interface PaginationOptions {
  page: number
  limit: number
  offset: number
  search: string
  sort: string
  order: 'ASC' | 'DESC'
}

// `sort` es interpolado directo en SQL (`ORDER BY ${opts.sort}`), por eso debe
// validarse contra una whitelist. Si no se pasa allowedSorts, sólo se permite
// defaultSort — cualquier ?sort= con otro valor se ignora silenciosamente.
export function parsePagination(
  req: Request,
  defaultSort = 'created_at',
  allowedSorts?: readonly string[],
): PaginationOptions {
  const page   = Math.max(1, parseInt(String(req.query.page  ?? 1)))
  // Cap subido de 100 → 1000 el 2026-06-08 tras bug RUGBY 8/12 en PRY-2026-577.
  // El frontend usa `allItems` con limit=500 en varias páginas (Materiales,
  // ProyectoDetalle) para no paginar listados internos chicos. El cap previo
  // de 100 truncaba silenciosamente cualquier proyecto con >100 materiales
  // (ej. PRY-2026-577 tiene 147), y los modales secundarios (cotizaciones,
  // captura de precios) contaban sobre el subset truncado. 1000 sigue siendo
  // un techo razonable contra abuso y cubre proyectos grandes reales.
  const limit  = Math.min(1000, Math.max(1, parseInt(String(req.query.limit ?? 20))))
  const offset = (page - 1) * limit
  const search = String(req.query.search ?? '')
  const requestedSort = String(req.query.sort ?? defaultSort)
  const whitelist = allowedSorts ?? [defaultSort]
  const sort = whitelist.includes(requestedSort) ? requestedSort : defaultSort
  const order  = String(req.query.order  ?? 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
  return { page, limit, offset, search, sort, order }
}

export function paginatedResponse<T>(data: T[], total: number, opts: PaginationOptions) {
  return { data, total, page: opts.page, limit: opts.limit }
}
