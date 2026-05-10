import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Settings2 } from 'lucide-react'
import { useKioskAuth } from '@/context/KioskAuthContext'
import PinKeypad from '@/components/kiosk/PinKeypad'

export default function KioskLogin() {
  const { login, dispositivo, setDispositivo } = useKioskAuth()
  const navigate = useNavigate()
  const [pin, setPin]         = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [dispositivoEdit, setDispositivoEdit] = useState(dispositivo)

  async function handleSubmit(p: string) {
    setError('')
    setLoading(true)
    try {
      await login(p)
      navigate('/kiosk/home', { replace: true })
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'PIN incorrecto')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  function saveSettings() {
    setDispositivo(dispositivoEdit.trim().slice(0, 50))
    setShowSettings(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-forest-700 to-forest-600 flex items-center justify-center px-4">
      {/* Botón de settings (configurar nombre del dispositivo) */}
      <button
        onClick={() => { setDispositivoEdit(dispositivo); setShowSettings(true) }}
        className="absolute top-4 right-4 p-2 rounded-full text-forest-300 hover:bg-forest-600 hover:text-white transition-colors"
        title="Configurar dispositivo"
      >
        <Settings2 size={20} />
      </button>

      <div className="w-full max-w-md">
        {/* Logo + título */}
        <div className="text-center mb-8">
          <img src="/logo_cm_login.png" alt="Central Millwork" className="h-20 w-auto object-contain mx-auto mb-3" />
          <h1 className="text-white text-2xl font-bold tracking-tight">Producción</h1>
          <p className="text-forest-300 text-sm mt-1">Ingresá tu PIN para entrar</p>
          {dispositivo && (
            <p className="text-forest-400 text-xs mt-2">📍 {dispositivo}</p>
          )}
        </div>

        {/* Card del keypad */}
        <div className="bg-white rounded-3xl px-6 py-8 shadow-2xl">
          <PinKeypad
            pin={pin}
            onChange={(p) => { setPin(p); if (error) setError('') }}
            onSubmit={handleSubmit}
            disabled={loading}
          />

          {/* Estado: error / loading */}
          <div className="mt-6 min-h-[2.5rem] flex items-center justify-center">
            {loading ? (
              <span className="text-forest-600 text-sm flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Verificando…
              </span>
            ) : error ? (
              <span className="text-red-600 text-sm font-medium">{error}</span>
            ) : (
              <span className="text-gray-400 text-sm">Tipeá tu PIN de 4 dígitos</span>
            )}
          </div>
        </div>
      </div>

      {/* Modal de configuración del dispositivo */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-forest-700 mb-1">Nombre del dispositivo</h2>
            <p className="text-sm text-gray-500 mb-4">
              Se manda en cada login para auditoría. Ej: <code>tablet-cnc-01</code>.
            </p>
            <input
              type="text"
              value={dispositivoEdit}
              onChange={(e) => setDispositivoEdit(e.target.value)}
              maxLength={50}
              placeholder="tablet-cnc-01"
              className="input w-full"
              autoFocus
            />
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowSettings(false)} className="btn-ghost flex-1 justify-center">
                Cancelar
              </button>
              <button onClick={saveSettings} className="btn-primary flex-1 justify-center">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
