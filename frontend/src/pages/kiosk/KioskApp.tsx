import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { KioskAuthProvider, useKioskAuth } from '@/context/KioskAuthContext'
import KioskLogin from './KioskLogin'
import KioskHome  from './KioskHome'

function KioskRoutes() {
  const { personal, isLoading } = useKioskAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-forest-700">
        <Loader2 size={32} className="animate-spin text-gold-400" />
      </div>
    )
  }

  return (
    <Routes>
      <Route index element={personal ? <Navigate to="home" replace /> : <KioskLogin />} />
      <Route path="home" element={personal ? <KioskHome /> : <Navigate to="/kiosk" replace />} />
      <Route path="*"    element={<Navigate to="/kiosk" replace />} />
    </Routes>
  )
}

export default function KioskApp() {
  return (
    <KioskAuthProvider>
      <KioskRoutes />
    </KioskAuthProvider>
  )
}
