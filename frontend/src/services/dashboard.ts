import api from './api'
import type { DashboardFullStats, DashboardKpis, DashboardCharts, DashboardResumenRow, DashboardProyecto, ApiResponse } from '@/types'

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
}
