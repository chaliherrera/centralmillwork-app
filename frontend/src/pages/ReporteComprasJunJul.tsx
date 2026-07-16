// Página /reportes/compras-jun-jul — wrapper del reporte HTML backend.
//
// El endpoint /api/reportes/compras-2026-06-07 devuelve HTML self-contained
// pero requiere JWT — no se puede abrir directo en el navegador. Esta página
// hace el fetch con axios (JWT auto via interceptor) y renderiza el HTML
// dentro de un iframe (srcDoc) para aislar estilos.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, AlertCircle, Download, ExternalLink } from 'lucide-react'
import api from '@/services/api'

export default function ReporteComprasJunJul() {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    // El endpoint devuelve HTML, no JSON — le decimos a axios que trate como texto
    api.get<string>('/reportes/compras-2026-06-07', {
      responseType: 'text',
      transformResponse: [(data) => data], // evita que axios intente parsear JSON
    })
      .then((resp) => { if (mounted) setHtml(resp.data) })
      .catch((err) => {
        if (!mounted) return
        setError(err?.response?.data?.message || err?.message || 'Error al cargar el reporte')
      })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  // Descarga el HTML como archivo local
  const descargarHtml = () => {
    if (!html) return
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte-compras-jun-jul-2026.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Abre el HTML en nueva ventana (para imprimir/compartir link con más facilidad)
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
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-forest-600 hover:text-forest-800 flex items-center gap-1 text-sm">
            <ArrowLeft size={14} /> Dashboard
          </Link>
          <h1 className="text-lg font-bold text-forest-900">Reporte de Compras — Junio + Julio 2026</h1>
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

      {/* Estados */}
      {loading && (
        <div className="card text-center py-16">
          <Loader2 size={32} className="mx-auto animate-spin text-forest-500 mb-3" />
          <p className="text-gray-500 text-sm">Generando reporte…</p>
          <p className="text-gray-400 text-xs mt-1 italic">Consultando 6 queries agregadas del período</p>
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

      {/* Iframe con el HTML del reporte
          srcDoc aísla los estilos del reporte de la app (no colisionan).
          Height suficiente para el contenido completo — scrolling interno. */}
      {html && (
        <iframe
          srcDoc={html}
          className="w-full rounded-lg border border-gray-200 shadow-sm"
          style={{ height: 'calc(100vh - 140px)', minHeight: 600 }}
          title="Reporte de compras junio-julio 2026"
          sandbox="allow-same-origin allow-popups"
        />
      )}
    </div>
  )
}
