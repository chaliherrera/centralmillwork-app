import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// ErrorBoundary — Audit Fix A6
// ─────────────────────────────────────────────────────────────────────────────
// Antes: cualquier exception runtime en React (response con shape inesperada,
// null deref, error en mutation onSuccess) tiraba la app entera a pantalla
// blanca. Sin telemetría no había forma de saber qué pasó — soporte por
// WhatsApp.
//
// Ahora: este boundary captura el error, muestra un fallback amigable con
// botones de "Recargar" y "Volver al inicio", y loggea a Sentry si está
// configurado (sentryClient.ts hace passthrough si no hay DSN).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode
  /** Nombre del boundary para identificar dónde se rompió (ej: "Root", "Route:/produccion"). */
  name?: string
  /** Si true, muestra el error técnico en el fallback (útil en dev). */
  showStack?: boolean
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })

    // Log estructurado a consola (siempre, aunque Sentry esté off)
    console.error(`[ErrorBoundary:${this.props.name ?? 'unnamed'}]`, error, errorInfo)

    // Sentry (passthrough si no hay DSN configurado)
    void import('@/utils/sentryClient').then(({ captureException }) => {
      captureException(error, {
        tags: { boundary: this.props.name ?? 'unnamed' },
        extra: { componentStack: errorInfo.componentStack },
      })
    }).catch(() => { /* sentry opcional */ })
  }

  private handleReload = () => window.location.reload()
  private handleHome = () => { window.location.href = '/' }
  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const isDev = import.meta.env.DEV || this.props.showStack
    const error = this.state.error

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 sm:p-8 border border-red-100">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center shrink-0">
              <AlertTriangle size={24} className="text-red-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-forest-700">Algo salió mal</h1>
              <p className="text-sm text-gray-600 mt-1">
                Hubo un error inesperado en la aplicación. Ya quedó registrado para investigar.
              </p>
            </div>
          </div>

          {isDev && error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-xs font-mono overflow-auto max-h-40">
              <div className="font-bold text-red-800 mb-1">{error.name}: {error.message}</div>
              {error.stack && (
                <pre className="text-red-700 whitespace-pre-wrap text-[10px]">{error.stack.split('\n').slice(0, 6).join('\n')}</pre>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 mt-6">
            <button
              onClick={this.handleReload}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-forest-700 hover:bg-forest-600 text-white rounded-lg font-semibold transition-colors"
            >
              <RefreshCw size={16} />
              Recargar página
            </button>
            <button
              onClick={this.handleHome}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-semibold transition-colors"
            >
              <Home size={16} />
              Ir al inicio
            </button>
          </div>

          {isDev && (
            <button
              onClick={this.handleReset}
              className="mt-3 w-full text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Intentar recuperar sin recargar (solo dev)
            </button>
          )}

          <p className="text-[11px] text-gray-400 mt-4 text-center">
            Boundary: <code>{this.props.name ?? 'unnamed'}</code>
          </p>
        </div>
      </div>
    )
  }
}
