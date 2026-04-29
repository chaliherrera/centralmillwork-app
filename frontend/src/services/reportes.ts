import api from './api'

async function downloadReporte(tipo: 'compras' | 'produccion') {
  const res = await api.get(`/reportes/${tipo}`, { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/html' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `reporte_${tipo}.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function compartirReporte(tipo: 'compras' | 'produccion'): Promise<string> {
  const res = await api.post<{ url: string }>('/reportes/compartir', { tipo })
  return res.data.url
}

export const reportesService = {
  downloadCompras:    () => downloadReporte('compras'),
  downloadProduccion: () => downloadReporte('produccion'),
  compartirCompras:   () => compartirReporte('compras'),
  compartirProduccion: () => compartirReporte('produccion'),
}
