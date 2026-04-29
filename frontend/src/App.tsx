import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import MainLayout from '@/components/layout/MainLayout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Proyectos from '@/pages/Proyectos'
import OrdenesCompra from '@/pages/OrdenesCompra'
import Materiales from '@/pages/Materiales'
import Recepciones from '@/pages/Recepciones'
import Proveedores from '@/pages/Proveedores'
import Usuarios from '@/pages/Usuarios'
import { Loader2 } from 'lucide-react'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={28} className="animate-spin text-forest-600" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user?.rol !== 'ADMIN') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="proyectos/*"      element={<Proyectos />} />
        <Route path="ordenes-compra/*" element={<OrdenesCompra />} />
        <Route path="materiales/*"     element={<Materiales />} />
        <Route path="recepciones/*"    element={<Recepciones />} />
        <Route path="proveedores/*"    element={<Proveedores />} />
        <Route path="usuarios"         element={<AdminRoute><Usuarios /></AdminRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
