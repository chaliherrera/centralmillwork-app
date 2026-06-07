import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'
import { initSentry } from './utils/sentryClient'
import App from './App'
import './index.css'

// Audit Fix A6: inicializar Sentry antes de renderizar (passthrough si no hay DSN)
initSentry().catch(() => { /* Sentry opcional, no debe bloquear arranque */ })

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Audit Fix A6: ErrorBoundary root captura cualquier excepción no manejada
        y muestra fallback amigable + reporta a Sentry. Sin esto, un null deref
        en cualquier componente tira la app entera a pantalla blanca. */}
    <ErrorBoundary name="Root">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ThemeProvider>
          <AuthProvider>
            <App />
            <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#4A5240',
                color: '#fff',
                borderLeft: '4px solid #9B7200',
              },
            }}
            />
          </AuthProvider>
          </ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
