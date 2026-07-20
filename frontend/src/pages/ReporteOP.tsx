// Página /reportes/op/:numero — wrapper del reporte HTML de una OP.
// Mismo patrón que ReporteComprasJunJul: fetch con axios (JWT auto),
// renderiza HTML en iframe (srcDoc). Se puede descargar o abrir en
// nueva ventana para mostrar al CEO o compartir.

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, AlertCircle, Download, ExternalLink } from 'lucide-react'
import api from '@/services/api'

export default function ReporteOP() {
  const { numero } = useParams<{ numero: string }>()
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!numero) return
    let mounted = true
    setLoading(true)
    setError(null)
    setHtml(null)
    api.get<string>(`/reportes/op/${encodeURIComponent(numero)}`, {
      responseType: 'text',
      transformResponse: [(data) => data],
    })
      .then((resp) => { if (mounted) setHtml(resp.data) })
      .catch((err) => {
        if (!mounted) return
        setError(err?.response?.status === 404
          ? `OP ${numero} no encontrada`
          : (err?.response?.data?.message || err?.message || 'Error al cargar el reporte'))
      })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [numero])

  const descargarHtml = () => {
    if (!html || !numero) return
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte-${numero.toLowerCase()}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const abrirNuevaVentana = () => {
    if (!html) return
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link to="/produccion/ordenes" className="text-forest-600 hover:text-forest-800 flex items-center gap-1 text-sm">
            <ArrowLeft size={14} /> Órdenes
          </Link>
          <h1 className="text-lg font-bold text-forest-900">Reporte de OP — {numero}</h1>
        </div>
        {html && (
          <div className="flex items-center gap-2">
            <button onClick={abrirNuevaVentana} className="btn-ghost text-xs flex items-center gap-1">
              <ExternalLink size={13} /> Abrir en nueva ventana
            </button>
            <button onClick={descargarHtml} className="btn-primary text-xs flex items-center gap-1">
              <Download size={13} /> Descargar HTML
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="card text-center py-16">
          <Loader2 size={32} className="mx-auto animate-spin text-forest-500 mb-3" />
          <p className="text-gray-500 text-sm">Generando reporte de {numero}…</p>
          <p className="text-gray-400 text-xs mt-1 italic">Cargando procesos, historial y firmando fotos</p>
        </div>
      )}

      {error && (
        <div className="card border-red-200 bg-red-50">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-800">Error al cargar el reporte</div>
              <div className="text-sm text-red-700 mt-1">{error}</div>
            </div>
          </div>
        </div>
      )}

      {html && (
        <iframe
          srcDoc={html}
          className="w-full rounded-lg border border-gray-200 shadow-sm"
          style={{ height: 'calc(100vh - 140px)', minHeight: 600 }}
          title={`Reporte OP ${numero}`}
          sandbox="allow-same-origin allow-popups"
        />
      )}
    </div>
  )
}
