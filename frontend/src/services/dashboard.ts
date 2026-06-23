import api from './api'
import type { DashboardFullStats, DashboardKpis, DashboardCharts, DashboardResumenRow, DashboardProyecto, ApiResponse } from '@/types'

// ─── Daily Briefing ──────────────────────────────────────────────────────────
export interface DailyBriefingItem {
  id: number
  // material o oc o recepcion según el bucket — campos que pueden venir:
  codigo?: string | null
  descripcion?: string | null
  vendor?: string | null
  qty?: number | null
  numero?: string | null
  folio?: string | null
  total?: number | null
  estado?: string | null
  fecha_importacion?: string | null
  fecha_entrega_estimada?: string | null
  dias_pendiente?: number | null
  dias_vencida?: number | null
  dias_estancada?: number | null
  created_at?: string | null
  oc_numero?: string | null
  proyecto_codigo?: string | null
  proyecto_nombre?: string | null
  proveedor_nombre?: string | null
}

export interface DailyBriefingBucket {
  count: number
  top: DailyBriefingItem[]
}

export interface DailyBriefing {
  rezagados: DailyBriefingBucket
  vencidas: DailyBriefingBucket
  estancadas: DailyBriefingBucket
  vencePronto: DailyBriefingBucket
  importadosAyer: DailyBriefingBucket
  fecha_servidor: string
}

export interface DashboardFilters {
  fecha_desde?: string
  fecha_hasta?: string
  proyecto_estado?: string
  vendor?: string
  categoria?: string
}

export const dashboardService = {
  getStats: () =>
    api.get<ApiResponse<DashboardFullStats>>('/dashboard/stats').then((r) => r.data),

  getGastoPorMes: () =>
    api.get<ApiResponse<{ mes: string; total: number }[]>>('/dashboard/gasto-por-mes').then((r) => r.data),

  getOrdenesRecientes: () =>
    api.get('/dashboard/ordenes-recientes').then((r) => r.data),

  getKpis: (filters?: DashboardFilters) =>
    api.get<ApiResponse<DashboardKpis>>('/dashboard/kpis', { params: filters }).then((r) => r.data),

  getCharts: (filters?: DashboardFilters) =>
    api.get<ApiResponse<DashboardCharts>>('/dashboard/charts', { params: filters }).then((r) => r.data),

  getResumenEstados: (filters?: DashboardFilters) =>
    api.get<ApiResponse<DashboardResumenRow[]>>('/dashboard/resumen-estados', { params: filters }).then((r) => r.data),

  getProyectosRecientes: (page = 1, limit = 8, filters?: DashboardFilters) =>
    api.get<ApiResponse<DashboardProyecto[]>>('/dashboard/proyectos-recientes', {
      params: { page, limit, ...filters },
    }).then((r) => r.data),

  getDailyBriefing: () =>
    api.get<ApiResponse<DailyBriefing>>('/dashboard/daily-briefing').then((r) => r.data),
}
