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
  const limit  = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 20))))
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
